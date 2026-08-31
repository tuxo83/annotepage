#!/usr/bin/env node
/* verifier-bout-en-bout.mjs — LES DEUX EXECUTABLES, POUR DE VRAI.
 *
 * Le fichier voisin verifie les pieces ; celui-ci verifie qu'elles marchent
 * ensemble, en lancant les deux commandes du paquet contre un faux serveur
 * qui parle comme api.php.
 *
 * LE FAUX SERVEUR NE FAIT PAS SEMBLANT DE DECHIFFRER. Il tient une liste de
 * lignes, emet l'export dans la grammaire des quatre marges, accepte un
 * « ajout » et un « resoudre » en x-www-form-urlencoded, et ne comprend rien a
 * ce qu'il stocke — exactement comme le vrai. C'est ce qui rend le test utile :
 * si le paquet se trompait d'AAD, ce serveur-ci ne s'en apercevrait pas, et
 * c'est le dechiffrement de l'etape suivante qui echouerait.
 *
 * Aucun acces au reseau : le serveur ecoute sur 127.0.0.1, sur un port que le
 * systeme choisit.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { b64url } from '../source/format.mjs';
import { deriver, selDepuisTexte, sceller, indexDeChemin } from '../source/chiffrement.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..');

let reussis = 0;
const echecs = [];

const verifier = async (nom, corps) => {
    try {
        await corps();
        reussis += 1;
    } catch (e) {
        echecs.push(nom + '\n    ' + ((e && e.message) || String(e)).replace(/\n/g, '\n    '));
    }
};

const vrai = (condition, quoi) => { if (!condition) throw new Error(quoi); };
const contient = (texte, morceau, quoi) => {
    if (texte.indexOf(morceau) === -1) {
        throw new Error((quoi || 'contenu') + '\n  cherche : ' + JSON.stringify(morceau)
            + '\n  dans    :\n' + texte.replace(/^/gm, '      '));
    }
};

/* -- Le faux serveur ------------------------------------------------------ */

const construireServeur = (etat) => createServer((requete, reponse) => {
    const url = new URL(requete.url, 'http://127.0.0.1');
    const action = url.searchParams.get('action');

    const texte = (code, corps) => {
        reponse.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
        reponse.end(corps);
    };
    const json = (objet) => {
        reponse.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        reponse.end(JSON.stringify(objet));
    };

    if (action === 'texte') {
        if (url.searchParams.get('projet') !== etat.projet) {
            return json({ ok: false, actif: false, message: 'Projet inconnu.' });
        }
        let sortie = 'outil annotepage\nformat 2\nversion 2.0.0\nprojet ' + etat.projet
            + '\nchiffrement oui\nexport 2026-08-31T09:14:22+00:00\nnotes '
            + etat.lignes.length + '\n\n';
        let premiere = true;
        for (const ligne of etat.lignes) {
            if (ligne.reponse_a === null) {
                if (!premiere) sortie += '\n';
                sortie += 'note ' + ligne.id + '\nindex-page ' + ligne.index_page + '\n';
            } else {
                sortie += '\n  reponse ' + ligne.id + '\n  a la note ' + ligne.reponse_a + '\n';
            }
            const marge = ligne.reponse_a === null ? '' : '  ';
            sortie += marge + 'mode chiffre\n' + marge + 'date ' + ligne.cree_le + '\n';
            sortie += ligne.resolue_le
                ? marge + 'corrigee ' + ligne.resolue_le + '\n'
                : marge + 'etat ouverte\n';
            sortie += marge + 'charge ' + ligne.charge + '\n';
            if (ligne.charge_resolution) {
                sortie += marge + 'charge-resolution ' + ligne.charge_resolution + '\n';
            }
            premiere = false;
        }
        return texte(200, sortie + '\n');
    }

    if (action === 'diagnostic') {
        return texte(200, 'outil annotepage\nformat 2\nphp.version 8.2.0 (faux serveur)\n');
    }

    if (action === 'ajout' || action === 'resoudre') {
        if (requete.method !== 'POST') return texte(405, 'POST attendu.');
        let corps = '';
        requete.on('data', (m) => { corps += m; });
        requete.on('end', () => {
            const champs = new URLSearchParams(corps);
            etat.recu.push({ action, champs });
            if (champs.get('projet') !== etat.projet) return texte(404, 'Projet inconnu.');

            if (action === 'ajout') {
                const mere = etat.lignes.find(
                    (l) => String(l.id) === champs.get('reponse_a'));
                const ligne = {
                    id: etat.prochain++,
                    reponse_a: mere ? mere.id : null,
                    index_page: mere ? mere.index_page : champs.get('index'),
                    cree_le: '2026-08-31T10:00:00+00:00',
                    resolue_le: null,
                    charge: champs.get('charge') || '',
                    charge_resolution: '',
                };
                // Une reponse suit sa mere : c'est l'ordre de l'export.
                const rang = mere ? etat.lignes.indexOf(mere) + 1 : etat.lignes.length;
                etat.lignes.splice(rang, 0, ligne);
                return json({ ok: true, outil: 'annotepage', format: 2, note: ligne });
            }

            const ligne = etat.lignes.find((l) => String(l.id) === champs.get('id'));
            if (!ligne) return texte(404, 'Note introuvable.');
            if (champs.get('resolue') === '0') {
                ligne.resolue_le = null;
                ligne.charge_resolution = '';
            } else {
                ligne.resolue_le = '2026-08-31T11:00:00+00:00';
                ligne.charge_resolution = champs.get('charge_resolution') || '';
            }
            return json({ ok: true, outil: 'annotepage', format: 2, note: ligne });
        });
        return undefined;
    }

    return texte(400, 'Action inconnue.');
});

/* -- Lancer une commande et lire ce qu'elle ecrit -------------------------- */

const lancer = (script, args, entree) => new Promise((resoudreP) => {
    const fils = spawn(process.execPath, [join(racine, script)].concat(args),
                       { stdio: ['pipe', 'pipe', 'pipe'] });
    let sortie = '';
    let erreurs = '';
    fils.stdout.on('data', (m) => { sortie += m; });
    fils.stderr.on('data', (m) => { erreurs += m; });
    if (entree !== undefined) fils.stdin.write(entree);
    fils.stdin.end();
    fils.on('close', (code) => resoudreP({ code, sortie, erreurs }));
});

/* -- Le decor ------------------------------------------------------------- */

const SEL = b64url(new Uint8Array(32).map((v, i) => (i * 11 + 5) & 0xff));
const cles = await deriver(selDepuisTexte(SEL));
const index = await indexDeChemin(cles.cleIndex, '/fr/contact.html');

const etat = {
    projet: cles.identifiant,
    prochain: 5,
    recu: [],
    lignes: [{
        id: 4, reponse_a: null, index_page: index,
        cree_le: '2026-08-30T14:02:11+00:00', resolue_le: null,
        charge: await sceller(cles.cleChiffre, cles.identifiant, index, 'note', {
            page: '/fr/contact.html',
            selecteur: 'main:nth-of-type(1) > h2:nth-of-type(3)',
            extrait: 'Contactez-nous', auteur: 'Camille',
            texte: 'Le lien pointe encore vers l\'ancien formulaire.\n\nDeuxieme paragraphe.',
            version: '1.4.12', environnement: 'preprod', fenetre: '1280x800',
        }),
        charge_resolution: '',
    }],
};

const serveur = construireServeur(etat);
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;

const dossier = mkdtempSync(join(tmpdir(), 'annotepage-'));
const fichierConfig = join(dossier, 'annotepage.json');
writeFileSync(fichierConfig, JSON.stringify({
    projets: {
        recette: {
            api: 'http://127.0.0.1:' + port + '/api.php',
            sel: SEL,
            mode: 'chiffre',
            auteur: 'Assistante',
        },
    },
}), { mode: 0o600 });

const cli = (...args) => lancer('annotepage.mjs', args.concat(['--config', fichierConfig]));

/* -- Les verifications ---------------------------------------------------- */

await verifier('cli : « annotepage texte » rend un export REMPLI', async () => {
    const { code, sortie } = await cli('texte');
    vrai(code === 0, 'code de retour ' + code);
    contient(sortie, 'outil annotepage', 'en-tete');
    contient(sortie, 'note 4', 'numero de note');
    contient(sortie, 'page /fr/contact.html', 'la page etait chiffree');
    contient(sortie, 'element main:nth-of-type(1) > h2:nth-of-type(3)', 'le selecteur aussi');
    contient(sortie, 'auteur Camille', "l'auteur aussi");
    contient(sortie, "    Le lien pointe encore vers l'ancien formulaire.", 'texte, marge 4');
    contient(sortie, '\n\n    Deuxieme paragraphe.', 'le paragraphe vide est conserve');
    contient(sortie, 'mode chiffre', 'la note dit qu\'elle etait chiffree');
    vrai(sortie.indexOf('charge ap2.') === -1,
        "l'enveloppe n'est pas recopiee a cote de son contenu en clair");
});

await verifier('cli : « brut » rend ce que le serveur envoie, sans dechiffrer', async () => {
    const { sortie } = await cli('brut');
    contient(sortie, 'charge ap2.', 'les enveloppes sont la');
    vrai(sortie.indexOf('/fr/contact.html') === -1, 'et rien n\'est lisible');
});

await verifier('cli : « identifiant » rend de quoi construire une URL curl', async () => {
    const { sortie } = await cli('identifiant');
    vrai(sortie.trim() === cles.identifiant, 'identifiant derive du sel');
    vrai(sortie.indexOf(SEL) === -1, 'et jamais le sel');
});

await verifier('cli : repondre scelle sous l\'index de la note mere', async () => {
    const { code, erreurs } = await cli('repondre', '4', 'Corrige : le lien pointe '
        + 'maintenant vers /fr/formulaire.html');
    vrai(code === 0, 'code de retour ' + code + '\n' + erreurs);

    const envoi = etat.recu[etat.recu.length - 1];
    vrai(envoi.action === 'ajout', 'action ajout');
    vrai(envoi.champs.get('mode') === 'chiffre', 'mode herite de la note mere');
    vrai(envoi.champs.get('reponse_a') === '4', 'reponse_a');
    vrai(envoi.champs.get('index') === null, "une reponse n'envoie pas d'index : elle herite");
    vrai(envoi.champs.get('texte') === null, 'aucun texte en clair');
    vrai(envoi.champs.get('auteur') === null, 'aucun auteur en clair');
    vrai(envoi.champs.get('charge').startsWith('ap2.'), 'une enveloppe');

    // Et c'est le point : la reponse doit se relire, donc son AAD est la bonne.
    const { sortie } = await cli('note', '4');
    contient(sortie, '  reponse 5', 'la reponse est dans le fil');
    contient(sortie, '  auteur Assistante', 'signee du nom de la configuration');
    contient(sortie, '      Corrige : le lien pointe maintenant vers /fr/formulaire.html',
        'texte de la reponse, marge 6');
});

await verifier('cli : marquer corrigee estampille la version', async () => {
    const { code, erreurs } = await cli('corrigee', '4', '1.4.13');
    vrai(code === 0, 'code de retour ' + code + '\n' + erreurs);

    const envoi = etat.recu[etat.recu.length - 1];
    vrai(envoi.action === 'resoudre', 'action resoudre');
    vrai(envoi.champs.get('par') === null, 'le nom du correcteur ne voyage pas en clair');
    vrai(envoi.champs.get('version') === null, 'la version non plus');
    vrai(envoi.champs.get('charge_resolution').startsWith('ap2.'), 'seconde enveloppe');
    vrai(envoi.champs.get('charge_resolution') !== etat.lignes[0].charge,
        'son propre nonce, son propre role');

    const { sortie } = await cli('texte');
    contient(sortie, 'corrigee 2026-08-31T11:00:00+00:00 par Assistante en 1.4.13',
        'la resolution se relit, nom et version compris');

    const ouvertes = await cli('ouvertes');
    vrai(ouvertes.sortie.indexOf('note 4') === -1, 'la note quitte la liste des ouvertes');
    contient(ouvertes.sortie, 'notes 0', "il ne reste rien d'ouvert");
});

await verifier('cli : rouvrir remet la note sous les yeux, fil intact', async () => {
    vrai((await cli('rouvrir', '4')).code === 0, 'reouverture');
    const { sortie } = await cli('ouvertes');
    contient(sortie, 'note 4', 'la note est revenue');
    contient(sortie, '  reponse 5', 'et son fil avec elle');
    vrai(sortie.indexOf('corrigee ') === -1, 'la marque de correction a disparu');
});

await verifier('cli : une reponse a une reponse est refusee, en nommant la mere', async () => {
    const { code, erreurs } = await cli('repondre', '5', 'et ceci ?');
    vrai(code !== 0, 'la commande echoue');
    contient(erreurs, 'deja une reponse a la note 4', 'le message nomme la note mere');
});

await verifier('cli : lecture seule coupe toute ecriture', async () => {
    const seul = join(dossier, 'lecture-seule.json');
    writeFileSync(seul, JSON.stringify({
        projets: { r: { api: 'http://127.0.0.1:' + port + '/api.php',
                        sel: SEL, auteur: 'Assistante', lecture_seule: true } },
    }), { mode: 0o600 });
    const { code, erreurs } = await lancer('annotepage.mjs',
        ['repondre', '4', 'non', '--config', seul]);
    vrai(code !== 0, 'la commande echoue');
    contient(erreurs, 'lecture seule', 'le message dit pourquoi');
    contient(erreurs, "Rien n'a ete ecrit", 'et ce qui n\'a pas eu lieu');
});

await verifier('cli : un sel qui ne correspond pas a l\'identifiant est refuse', async () => {
    const faux = join(dossier, 'faux.json');
    writeFileSync(faux, JSON.stringify({
        projets: { r: { api: 'http://127.0.0.1:' + port + '/api.php',
                        sel: SEL, identifiant: 'AAAAAAAAAAAAAAAAAAAAAA' } },
    }), { mode: 0o600 });
    const { code, erreurs } = await lancer('annotepage.mjs', ['texte', '--config', faux]);
    vrai(code !== 0, 'la commande echoue');
    contient(erreurs, "Ce sel n'est pas celui de ce projet", 'le message du format §1.2');
    contient(erreurs, "Aucune requete n'a ete faite", 'et il le dit avant tout reseau');
});

await verifier('cli : un mauvais sel se compte, il ne se tait pas', async () => {
    const autre = join(dossier, 'autre-sel.json');
    writeFileSync(autre, JSON.stringify({
        projets: { r: { api: 'http://127.0.0.1:' + port + '/api.php?forcer=' + etat.projet,
                        sel: b64url(new Uint8Array(32).fill(3)) } },
    }), { mode: 0o600 });
    // Le faux serveur repond « projet inconnu » : c'est le bon comportement, et
    // c'est ce que verifie ce cas — on ne rend pas une liste vide en silence.
    const { code, erreurs } = await lancer('annotepage.mjs', ['texte', '--config', autre]);
    vrai(code !== 0, 'la commande echoue');
    contient(erreurs, 'projet', 'le message parle du projet');
});

/* -- Le serveur MCP, par son protocole ------------------------------------ */

const dialogue = async (messages) => {
    const entree = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    const { sortie, erreurs } = await lancer('serveur-mcp.mjs',
        ['--config', fichierConfig], entree);
    const lues = sortie.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { reponses: lues, erreurs };
};

await verifier('mcp : initialisation et liste des outils', async () => {
    const { reponses } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {},
                    clientInfo: { name: 'test', version: '0' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    vrai(reponses.length === 2, 'deux reponses, la notification n\'en attend pas');
    vrai(reponses[0].result.protocolVersion === '2025-06-18',
        'la version du client est reprise');
    vrai(reponses[0].result.serverInfo.name === 'annotepage', 'nom du serveur');

    const noms = reponses[1].result.tools.map((o) => o.name);
    for (const attendu of ['annotepage_notes_ouvertes', 'annotepage_lire_note',
                           'annotepage_repondre', 'annotepage_marquer_corrigee',
                           'annotepage_rouvrir', 'annotepage_export',
                           'annotepage_projets']) {
        vrai(noms.includes(attendu), 'outil ' + attendu);
    }
    for (const outil of reponses[1].result.tools) {
        vrai(outil.inputSchema && outil.inputSchema.type === 'object',
            'schema de ' + outil.name);
        vrai(typeof outil.description === 'string' && outil.description.length > 80,
            'description de ' + outil.name);
    }
});

await verifier('mcp : lister les notes ouvertes rend la grammaire, dechiffree', async () => {
    const { reponses } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'annotepage_notes_ouvertes', arguments: {} } },
    ]);
    const contenu = reponses[1].result.content[0].text;
    vrai(!reponses[1].result.isError, 'pas d\'erreur');
    contient(contenu, 'note 4', 'la note ouverte');
    contient(contenu, 'page /fr/contact.html', 'sa page, dechiffree');
    contient(contenu, '  reponse 5', 'et son fil');
});

await verifier('mcp : un outil qui echoue rend isError, pas une erreur JSON-RPC', async () => {
    const { reponses } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'annotepage_repondre', arguments: { id: 5, texte: 'non' } } },
    ]);
    vrai(reponses[1].error === undefined, 'pas une erreur de protocole');
    vrai(reponses[1].result.isError === true, 'un resultat marque en erreur');
    contient(reponses[1].result.content[0].text, 'deja une reponse a la note 4',
        'le message est redige pour etre lu et corrige');
});

await verifier('mcp : une methode inconnue ne casse pas la conversation', async () => {
    const { reponses } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
        { jsonrpc: '2.0', id: 2, method: 'resources/list' },
        { jsonrpc: '2.0', id: 3, method: 'ping' },
    ]);
    vrai(reponses[0].result.protocolVersion === '2024-11-05', 'version ancienne acceptee');
    vrai(reponses[1].error.code === -32601, 'methode non implantee');
    vrai(reponses[2].result !== undefined, 'la conversation continue');
});

await verifier('mcp : rien d\'autre que du JSON-RPC ne sort sur stdout', async () => {
    const { reponses, erreurs } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    ]);
    vrai(reponses.length === 1, 'une seule ligne sur stdout');
    contient(erreurs, '[annotepage-mcp]', 'les messages pour un humain vont sur stderr');
});

/* -- Verdict -------------------------------------------------------------- */

serveur.close();
rmSync(dossier, { recursive: true, force: true });

if (echecs.length === 0) {
    process.stdout.write(reussis + ' verifications de bout en bout, toutes passees.\n');
} else {
    process.stdout.write(reussis + ' passees, ' + echecs.length + ' ECHOUEES :\n\n');
    for (const echec of echecs) process.stdout.write('  ' + echec + '\n\n');
    process.exitCode = 1;
}
