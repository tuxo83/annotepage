#!/usr/bin/env node
/* verifier.mjs — LES VERIFICATIONS, SANS RESEAU ET SANS BASE.
 *
 * Ce qui est verifie ici est ce qui, s'il se trompait, se tromperait EN
 * SILENCE : une derivation qui ne rend pas la meme chose que dans le
 * navigateur, une enveloppe qui s'ouvre sous une AAD qui n'est pas la sienne,
 * un analyseur d'export qui coupe une note en deux au premier paragraphe
 * vide. Aucune de ces trois pannes ne leve d'exception ; toutes rendent des
 * notes fausses ou perdues.
 *
 * LES DERIVATIONS SONT COMPAREES A UNE SECONDE IMPLANTATION, ecrite ici a la
 * main avec createHmac, et non a une valeur recopiee. Une valeur recopiee
 * atteste que le code fait aujourd'hui ce qu'il faisait hier ; une seconde
 * implantation atteste qu'il fait ce que dit la RFC — et c'est exactement le
 * piege que FORMAT.md §1.3 nomme, ou l'on prend notre sel pour le « salt » de
 * HKDF au lieu du materiau d'entree. Les deux versions marchent, chiffrent, et
 * ne se lisent pas l'une l'autre.
 */

import { createHmac } from 'node:crypto';

import { b64url, deB64url, lignesNormalisees, indenter, valeurSure } from '../source/format.mjs';
import { deriver, selDepuisTexte, sceller, ouvrir, indexDeChemin, cheminNormalise } from '../source/chiffrement.mjs';
import { lireExport, ecrireExport } from '../source/export-texte.mjs';

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

const egal = (obtenu, attendu, quoi) => {
    if (obtenu !== attendu) {
        throw new Error((quoi || 'valeur') + '\n  attendu : ' + JSON.stringify(attendu)
            + '\n  obtenu  : ' + JSON.stringify(obtenu));
    }
};

const vrai = (condition, quoi) => {
    if (!condition) throw new Error(quoi || 'condition fausse');
};

/* -- HKDF-SHA-256 (RFC 5869), ecrit a la main ---------------------------- */

const hkdf = (ikm, sel, info, longueur) => {
    const prk = createHmac('sha256', sel).update(ikm).digest();
    let precedent = Buffer.alloc(0);
    let sortie = Buffer.alloc(0);
    for (let n = 1; sortie.length < longueur; n += 1) {
        precedent = createHmac('sha256', prk)
            .update(Buffer.concat([precedent, Buffer.from(info), Buffer.from([n])]))
            .digest();
        sortie = Buffer.concat([sortie, precedent]);
    }
    return sortie.subarray(0, longueur);
};

const SEL_TEXTE = b64url(new Uint8Array(32).map((v, i) => (i * 7 + 3) & 0xff));

/* -- 1. Le socle --------------------------------------------------------- */

await verifier('base64url : aller-retour', () => {
    for (let n = 0; n < 40; n += 1) {
        const octets = new Uint8Array(n).map((v, i) => (i * 31 + n) & 0xff);
        const decode = deB64url(b64url(octets));
        vrai(decode !== null, 'decodage de ' + n + ' octets');
        egal(Buffer.from(decode).toString('hex'), Buffer.from(octets).toString('hex'),
            'aller-retour sur ' + n + ' octets');
    }
});

await verifier('base64url : refus de ce qui n\'en est pas', () => {
    egal(deB64url('abc+def'), null, 'le + n\'est pas du base64url');
    egal(deB64url('abc/def'), null, 'le / n\'est pas du base64url');
    egal(deB64url('ab=='), null, 'le remplissage n\'est pas accepte');
    egal(deB64url('a'), null, 'un reste de 1 caractere n\'existe pas');
    egal(deB64url('ab cd'), null, 'une espace n\'est pas du base64url');
});

await verifier('sel : la forme est exigee, jamais nettoyee', () => {
    egal(selDepuisTexte('trop-court'), null, 'un sel court est refuse');
    egal(selDepuisTexte(SEL_TEXTE + 'x'), null, 'un sel long est refuse');
    egal(selDepuisTexte(SEL_TEXTE.slice(0, 42) + '+'), null, 'alphabet');
    vrai(selDepuisTexte(' ' + SEL_TEXTE + ' ') !== null, 'les espaces de bord sont admis');
    vrai(selDepuisTexte(SEL_TEXTE).length === 32, '32 octets');
});

/* -- 2. Les trois derivations -------------------------------------------- */

await verifier('derivation : identique a une seconde implantation de HKDF', async () => {
    const octets = selDepuisTexte(SEL_TEXTE);
    const cles = await deriver(octets);

    const attenduId = hkdf(Buffer.from(octets), Buffer.from('annotepage/1'),
                           Buffer.from('id'), 32);
    egal(cles.identifiant, b64url(new Uint8Array(attenduId).subarray(0, 16)),
        'identifiant de projet');
    egal(cles.identifiant.length, 22, 'longueur de l\'identifiant');

    /* Le piege de FORMAT.md §1.3, verifie plutot que decrit : intervertir le
       sel et la chaine fixe rend un identifiant DIFFERENT. Les deux systemes
       marchent ; ils ne se lisent pas l'un l'autre. */
    const inverse = hkdf(Buffer.from('annotepage/1'), Buffer.from(octets),
                         Buffer.from('id'), 32);
    vrai(b64url(new Uint8Array(inverse).subarray(0, 16)) !== cles.identifiant,
        'le sel et le salt de HKDF ne sont pas interchangeables');
});

await verifier('index de page : HMAC de la sous-cle « index »', async () => {
    const octets = selDepuisTexte(SEL_TEXTE);
    const cles = await deriver(octets);
    const cleIndex = hkdf(Buffer.from(octets), Buffer.from('annotepage/1'),
                          Buffer.from('index'), 32);
    const attendu = createHmac('sha256', cleIndex).update('/fr/contact.html').digest();
    egal(await indexDeChemin(cles.cleIndex, '/fr/contact.html'),
        b64url(new Uint8Array(attendu).subarray(0, 16)), 'index_page');
});

await verifier('index de page : aucune normalisation au-dela du format 1', async () => {
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const de = (c) => indexDeChemin(cles.cleIndex, cheminNormalise(c));
    vrai(await de('/a') !== await de('/a/'), '« /a » et « /a/ » sont deux pages');
    vrai(await de('/Contact') !== await de('/contact'), 'la casse compte');
    egal(cheminNormalise('//fr//x'), '/fr//x', 'une seule barre INITIALE, pas plus');
    egal(cheminNormalise('sans-barre'), '/sans-barre', 'barre initiale ajoutee');
    egal(cheminNormalise('/a/../b'), '/a/b', 'les segments .. sont retires');
});

/* -- 3. L'enveloppe ------------------------------------------------------ */

const PROJET = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const INDEX = '9dLpEqKf2Zt8ArC1vXbGhQ';

await verifier('enveloppe : aller-retour et forme serialisee', async () => {
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const objet = { auteur: 'Camille', texte: 'Le lien pointe encore ailleurs.', vide: '' };
    const enveloppe = await sceller(cles.cleChiffre, PROJET, INDEX, 'note', objet);

    const morceaux = enveloppe.split('.');
    egal(morceaux.length, 3, 'trois champs separes par des points');
    egal(morceaux[0], 'ap2', 'le prefixe EST le numero de format');
    egal(morceaux[1].length, 16, 'nonce de 12 octets');
    vrai(/^[A-Za-z0-9_.-]+$/.test(enveloppe), 'ASCII, base64url, sans remplissage');

    const lu = await ouvrir(cles.cleChiffre, PROJET, INDEX, 'note', enveloppe);
    egal(lu.auteur, 'Camille', 'auteur');
    egal(lu.texte, objet.texte, 'texte');
    egal(Object.prototype.hasOwnProperty.call(lu, 'vide'), false,
        'un champ vide est ABSENT, il n\'est pas ecrit a ""');
});

await verifier('enveloppe : deux scellements donnent deux nonces', async () => {
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const a = await sceller(cles.cleChiffre, PROJET, INDEX, 'note', { texte: 'x' });
    const b = await sceller(cles.cleChiffre, PROJET, INDEX, 'note', { texte: 'x' });
    vrai(a.split('.')[1] !== b.split('.')[1], 'nonce tire a chaque chiffrement');
    vrai(a !== b, 'deux chiffres identiques ne se ressemblent pas');
});

await verifier('enveloppe : l\'AAD refuse une note deplacee', async () => {
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const enveloppe = await sceller(cles.cleChiffre, PROJET, INDEX, 'note', { texte: 'x' });

    const refuse = async (quoi, promesse) => {
        try {
            await promesse;
        } catch (e) {
            egal(e.raison, 'illisible', quoi);
            return;
        }
        throw new Error(quoi + ' : le dechiffrement aurait du echouer');
    };

    await refuse('autre page',
        ouvrir(cles.cleChiffre, PROJET, 'AUTRE_INDEX_AAAAAAAAAA', 'note', enveloppe));
    await refuse('autre projet',
        ouvrir(cles.cleChiffre, 'AUTREPROJETAAAAAAAAAAA', INDEX, 'note', enveloppe));
    await refuse('autre role',
        ouvrir(cles.cleChiffre, PROJET, INDEX, 'resolution', enveloppe));

    const autre = await deriver(selDepuisTexte(b64url(new Uint8Array(32).fill(9))));
    await refuse('autre sel', ouvrir(autre.cleChiffre, PROJET, INDEX, 'note', enveloppe));
});

await verifier('enveloppe : un format plus recent est un refus NET', async () => {
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const enveloppe = await sceller(cles.cleChiffre, PROJET, INDEX, 'note', { texte: 'x' });
    try {
        await ouvrir(cles.cleChiffre, PROJET, INDEX, 'note',
                     enveloppe.replace(/^ap2\./, 'ap3.'));
    } catch (e) {
        egal(e.raison, 'recente', 'on ne devine pas une cryptographie');
        return;
    }
    throw new Error('une enveloppe ap3 aurait du etre refusee');
});

await verifier('enveloppe : formes invalides', async () => {
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const mauvaises = ['', 'x', 'ap2.trop-court.abcd', 'ap2..', 'ap.a.b',
                       'ap2.AAAAAAAAAAAAAAAA.@@@'];
    for (const forme of mauvaises) {
        try {
            await ouvrir(cles.cleChiffre, PROJET, INDEX, 'note', forme);
        } catch (e) {
            egal(e.raison, 'illisible', 'forme ' + JSON.stringify(forme));
            continue;
        }
        throw new Error('forme acceptee a tort : ' + JSON.stringify(forme));
    }
});

/* -- 4. La grammaire des quatre marges ----------------------------------- */

/* Cet export est ecrit A LA MAIN, octet pour octet comme le PHP l'emet. Le
   produire avec notre propre ecrivain ne prouverait que notre accord avec
   nous-memes. */
const EXPORT_SERVEUR = [
    'outil annotepage',
    'format 2',
    'version 2.0.0',
    'projet ' + PROJET,
    'chiffrement non',
    'export 2026-08-31T09:14:22+00:00',
    'notes 3',
    '',
    'note 4',
    'page /fr/contact.html',
    'index-page ' + INDEX,
    'element main:nth-of-type(1) > h2:nth-of-type(3)',
    'extrait Contactez-nous',
    'auteur Camille',
    'date 2026-08-30T14:02:11+00:00',
    'version 1.4.12',
    'environnement preprod',
    'fenetre 1280x800',
    'etat ouverte',
    'texte',
    '    Le lien pointe encore vers l\'ancien formulaire.',
    '',
    '    Deuxieme paragraphe, apres une ligne vide.',
    '      cite du code indente',
    '',
    '  reponse 7',
    '  a la note 4',
    '  auteur Dominique',
    '  date 2026-08-30T15:00:00+00:00',
    '  etat ouverte',
    '  texte',
    '      Vu, je regarde.',
    '',
    'note 9',
    'page /fr/index.html',
    'index-page AUTREINDEXAAAAAAAAAAAA',
    'auteur Camille',
    'date 2026-08-30T16:00:00+00:00',
    'corrigee 2026-08-31T08:00:00+00:00 par Dominique en 1.4.13',
    'texte',
    '    Le titre deborde en 320 pixels.',
    '',
].join('\n');

await verifier('export : analyse d\'un document ecrit par le serveur', () => {
    const lu = lireExport(EXPORT_SERVEUR);
    egal(lu.entete.outil, 'annotepage', 'en-tete outil');
    egal(lu.entete.format, '2', 'en-tete format');
    egal(lu.entete.notes, '3', '« notes 3 » n\'est pas lu comme la cle « note »');
    egal(lu.entete.projet, PROJET, 'en-tete projet');
    egal(lu.notes.length, 2, 'deux notes meres');

    const note = lu.notes[0];
    egal(note.id, 4, 'numero');
    egal(note.page, '/fr/contact.html', 'page');
    egal(note.index_page, INDEX, 'index-page');
    egal(note.selecteur, 'main:nth-of-type(1) > h2:nth-of-type(3)', 'element');
    egal(note.extrait, 'Contactez-nous', 'extrait');
    egal(note.version, '1.4.12', 'version DE LA NOTE, pas celle de l\'en-tete');
    egal(note.resolue_le, null, 'etat ouverte');
    egal(note.reponses.length, 1, 'une reponse');
    egal(note.reponses[0].id, 7, 'numero de la reponse');
    egal(note.reponses[0].reponse_a, 4, '« a la note » compte trois mots');
    egal(note.reponses[0].texte, 'Vu, je regarde.', 'texte de la reponse');

    egal(lu.notes[1].resolue_le, '2026-08-31T08:00:00+00:00', 'date de correction');
    egal(lu.notes[1].resolue_par, 'Dominique', 'correcteur');
    egal(lu.notes[1].resolue_version, '1.4.13', 'version du correctif');
});

await verifier('export : une ligne vide dans un texte ne coupe pas la note', () => {
    const note = lireExport(EXPORT_SERVEUR).notes[0];
    egal(note.texte,
        "Le lien pointe encore vers l'ancien formulaire.\n"
        + '\n'
        + 'Deuxieme paragraphe, apres une ligne vide.\n'
        + '  cite du code indente',
        'le paragraphe vide et l\'indentation du bloc de code sont conserves');
});

await verifier('export : une cle inconnue et un format plus recent se lisent', () => {
    const plusRecent = EXPORT_SERVEUR
        .replace('format 2', 'format 3')
        .replace('note 4\n', 'note 4\ncle-de-demain une valeur\n');
    const lu = lireExport(plusRecent);
    egal(lu.notes.length, 2, 'un export plus recent se lit quand meme');
    egal(lu.notes[0].page, '/fr/contact.html', 'la cle inconnue est ignoree en silence');
});

await verifier('export : la cle est le plus long prefixe connu', () => {
    const lu = lireExport([
        'notes 1', '',
        'note 1',
        'charge-resolution ap2.AAAAAAAAAAAAAAAA.BBBB',
        'charge ap2.CCCCCCCCCCCCCCCC.DDDD',
        'etat ouverte', 'texte', '    x', '',
    ].join('\n'));
    egal(lu.notes[0].charge, 'ap2.CCCCCCCCCCCCCCCC.DDDD', '« charge »');
    egal(lu.notes[0].charge_resolution, 'ap2.AAAAAAAAAAAAAAAA.BBBB',
        '« charge-resolution » et non « charge » suivi de « -resolution ... »');
});

await verifier('export : le pied n\'est pas un champ de la derniere note', () => {
    const lu = lireExport(EXPORT_SERVEUR + '\nignorees 2\nignorees-raison mode inconnu\n');
    egal(lu.pied.ignorees, '2', 'compte des lignes ignorees');
    egal(lu.notes.length, 2, 'aucune note fabriquee par le pied');
});

/* -- 5. L'ecriture, et l'aller-retour ------------------------------------ */

await verifier('export : ecrire puis relire rend les memes notes', () => {
    const lu = lireExport(EXPORT_SERVEUR);
    const ecrit = ecrireExport(
        { format: 2, version: '2.0.0', projet: PROJET, chiffrement: 'non' },
        lu.notes, {});
    const relu = lireExport(ecrit);

    egal(relu.notes.length, lu.notes.length, 'meme nombre de notes');
    for (let i = 0; i < lu.notes.length; i += 1) {
        for (const cle of ['id', 'page', 'index_page', 'selecteur', 'extrait', 'auteur',
                           'texte', 'cree_le', 'version', 'environnement', 'fenetre',
                           'resolue_le', 'resolue_par', 'resolue_version']) {
            egal(relu.notes[i][cle], lu.notes[i][cle], 'note ' + i + ' / ' + cle);
        }
        egal(relu.notes[i].reponses.length, lu.notes[i].reponses.length,
            'note ' + i + ' / nombre de reponses');
    }
    egal(relu.notes[0].reponses[0].texte, 'Vu, je regarde.', 'texte de la reponse');
});

await verifier('export : une note ne peut pas en fabriquer une autre', () => {
    /* Le cas qui a motive la regle. Une remarque qui contient, elle-meme, ce
       qui ressemble a une ligne de structure — y compris derriere un U+2028,
       que beaucoup de lecteurs comptent pour une fin de ligne et qui n'est PAS
       un caractere de controle. */
    const piege = 'Regardez ceci :\n\nnote 999\npage /interdit\nauteur Faux\ntexte\n'
        + 'ligne\u2028note 998\npage /aussi-interdit';
    const ecrit = ecrireExport({ format: 2, projet: PROJET }, [{
        id: 1, reponse_a: null, mode: 'clair', page: '/x', index_page: '', selecteur: '',
        extrait: '', auteur: 'Camille', texte: piege, cree_le: '2026-01-01T00:00:00+00:00',
        version: '', environnement: '', fenetre: '', resolue_le: null, resolue_par: '',
        resolue_version: '', charge: '', charge_resolution: '', reponses: [],
    }], {});
    const relu = lireExport(ecrit);
    egal(relu.notes.length, 1, 'une seule note, malgre le piege');
    egal(relu.notes[0].id, 1, 'et c\'est la bonne');
    vrai(relu.notes[0].texte.indexOf('note 999') !== -1,
        'le texte du piege est conserve, il est simplement indente');
    vrai(relu.notes[0].texte.indexOf('\u2028') === -1,
        'U+2028 est ramene a un simple saut de ligne');
});

await verifier('valeurs : une fin de ligne ne traverse pas une ligne « cle valeur »', () => {
    egal(valeurSure('Camille\nnote 999'), 'Camille note 999', 'saut de ligne remplace');
    egal(valeurSure('a\u0085b'), 'a b', 'U+0085');
    egal(lignesNormalisees('a\u0000b'), 'ab', 'les caracteres de controle sont retires');
    egal(indenter('a\n\nb', '    '), '    a\n\n    b\n',
        'une ligne vide reste VIDE, sans espaces de fin');
});

/* -- 6. Le chemin de bout en bout ---------------------------------------- */

await verifier('bout en bout : un export chiffre se relit rempli', async () => {
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const index = await indexDeChemin(cles.cleIndex, '/fr/contact.html');

    const charge = await sceller(cles.cleChiffre, cles.identifiant, index, 'note', {
        page: '/fr/contact.html', selecteur: 'h2', extrait: 'Contactez-nous',
        auteur: 'Camille', texte: 'Le lien pointe ailleurs.', version: '1.4.12',
    });
    const resolution = await sceller(cles.cleChiffre, cles.identifiant, index,
                                     'resolution', { par: 'Dominique', version: '1.4.13' });

    // Ce que le serveur emettrait : la structure, plus les enveloppes.
    const structurel = [
        'outil annotepage', 'format 2', 'version 2.0.0',
        'projet ' + cles.identifiant, 'chiffrement oui',
        'export 2026-08-31T09:14:22+00:00', 'notes 1', '',
        'note 4', 'index-page ' + index, 'mode chiffre',
        'date 2026-08-30T14:02:11+00:00',
        'corrigee 2026-08-31T08:00:00+00:00',
        'charge ' + charge,
        'charge-resolution ' + resolution,
        '',
    ].join('\n');

    const lu = lireExport(structurel);
    egal(lu.notes.length, 1, 'une note');
    egal(lu.notes[0].mode, 'chiffre', 'mode');
    egal(lu.notes[0].texte, '', 'le serveur n\'emet aucune ligne « texte »');
    egal(lu.notes[0].resolue_le, '2026-08-31T08:00:00+00:00',
        'la date de correction est en clair');
    egal(lu.notes[0].resolue_par, '', 'le nom du correcteur ne l\'est pas');

    const objet = await ouvrir(cles.cleChiffre, cles.identifiant, lu.notes[0].index_page,
                               'note', lu.notes[0].charge);
    egal(objet.texte, 'Le lien pointe ailleurs.', 'texte dechiffre');
    egal(objet.page, '/fr/contact.html', 'la page etait dans l\'enveloppe, elle aussi');

    const fin = await ouvrir(cles.cleChiffre, cles.identifiant, lu.notes[0].index_page,
                             'resolution', lu.notes[0].charge_resolution);
    egal(fin.par, 'Dominique', 'correcteur dechiffre');
});

await verifier('bout en bout : le chemin dechiffre redonne l\'index annonce', async () => {
    /* C'est la verification que fait notes.mjs avant d'ecrire une reponse : le
       chemin qui sort de l'enveloppe doit redonner l'index sous lequel la note
       est rangee. Sans elle, une reponse pourrait etre scellee sous un index
       souffle par le serveur, et personne ne pourrait la lire. */
    const cles = await deriver(selDepuisTexte(SEL_TEXTE));
    const chemin = '/fr/contact.html';
    const index = await indexDeChemin(cles.cleIndex, chemin);
    const charge = await sceller(cles.cleChiffre, cles.identifiant, index, 'note',
                                 { page: chemin, texte: 'x' });
    const objet = await ouvrir(cles.cleChiffre, cles.identifiant, index, 'note', charge);
    egal(await indexDeChemin(cles.cleIndex, cheminNormalise(objet.page)), index,
        'l\'index recalcule est celui sous lequel la note est rangee');
});

/* -- Verdict ------------------------------------------------------------- */

if (echecs.length === 0) {
    process.stdout.write(reussis + ' verifications, toutes passees.\n');
} else {
    process.stdout.write(reussis + ' passees, ' + echecs.length + ' ECHOUEES :\n\n');
    for (const echec of echecs) process.stdout.write('  ' + echec + '\n\n');
    process.exitCode = 1;
}
