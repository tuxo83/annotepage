#!/usr/bin/env node
/* annotepage.mjs — L'UTILITAIRE EN LIGNE DE COMMANDE.
 *
 * IL EXISTE POUR QUE LE MCP NE SOIT PAS OBLIGATOIRE.
 *
 * En mode clair, la lecture a distance se fait deja sans rien installer :
 *
 *     curl 'https://site/notes/api.php?action=texte&projet=<id>'
 *
 * C'est le chemin simple, et il ne doit jamais casser : c'est lui qui rend
 * l'outil utilisable par n'importe quel assistant, sans integration, sans
 * paquet, sans declaration. En mode CHIFFRE, cette meme adresse ne rend plus
 * que la structure — le serveur n'a ni les chemins, ni les noms, ni les
 * textes. Il manque une etape, et une seule : le dechiffrement.
 *
 * Cet utilitaire est cette etape, en une commande :
 *
 *     annotepage texte
 *
 * Il ecrit sur la sortie standard exactement ce que « curl » aurait rendu si
 * le projet n'etait pas chiffre — meme grammaire, memes marges, memes cles.
 * On peut le rediriger dans un fichier, le passer a un assistant, le lire.
 * FORMAT.md §5.3 appelle cela « le second producteur » ; le voici.
 *
 * TOUT SORT SUR STDOUT, LES ERREURS SUR STDERR, et le code de retour vaut
 * zero ou non-zero. C'est ce qu'attend un tuyau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { chargerConfiguration, choisirProjet, ErreurConfiguration } from './source/configuration.mjs';
import {
    recuperer, exportRempli, trouverNote, estOuverte,
    repondre, marquerCorrigee, rouvrir, ErreurUsage,
} from './source/notes.mjs';
import { ecrireExport } from './source/export-texte.mjs';
import { lireDiagnostic, lireExportBrut, ErreurApi } from './source/api.mjs';

const ici = dirname(fileURLToPath(import.meta.url));

const version = () => {
    try {
        return JSON.parse(readFileSync(join(ici, 'package.json'), 'utf8')).version;
    } catch (e) {
        return 'inconnue';
    }
};

const AIDE = `annotepage ` + version() + ` — lire et repondre aux notes de relecture.

  annotepage texte              l'export complet, dechiffre, sur la sortie standard
  annotepage ouvertes           les seules notes qui restent a corriger
  annotepage note <id>          une note et son fil
  annotepage repondre <id> <texte>
  annotepage corrigee <id> <version>     version vide : ecrire ""
  annotepage rouvrir <id>
  annotepage identifiant        l'identifiant de projet derive du sel
  annotepage brut               ce que le serveur envoie, sans dechiffrer
  annotepage diagnostic         l'etat du serveur
  annotepage projets            ce que la configuration declare

Options :
  --projet <nom>    quand la configuration en declare plusieurs
  --page <chemin>   avec « ouvertes » : ne garder qu'une page
  --config <fichier>  a defaut : $ANNOTEPAGE_CONFIG, ./.annotepage.json,
                      ~/.config/annotepage/annotepage.json

Le fichier de configuration porte le SEL du projet. Il ne se versionne pas :
qui le lit lit toutes les notes, et il n'existe aucune rotation de sel.

En mode clair, cet utilitaire n'est pas necessaire :
  curl '<api>?action=texte&projet=<id>'
rend deja le meme document. Le MCP et cet utilitaire sont des ajouts.
`;

/* Un analyseur d'arguments de vingt lignes plutot qu'une dependance. Ce
   paquet detient le sel : chaque dependance est du code tiers dans le meme
   processus, et la decision de securite du projet dit que le vrai risque est
   la chaine d'approvisionnement. */
const analyser = (argv) => {
    const options = {};
    const positions = [];
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const egal = a.indexOf('=');
            if (egal !== -1) {
                options[a.slice(2, egal)] = a.slice(egal + 1);
            } else {
                options[a.slice(2)] = argv[i + 1] !== undefined
                    && !argv[i + 1].startsWith('--') ? argv[++i] : true;
            }
        } else {
            positions.push(a);
        }
    }
    return { options, positions };
};

const entier = (valeur, quoi) => {
    const n = parseInt(valeur, 10);
    if (!Number.isFinite(n)) {
        throw new ErreurUsage('Le champ « ' + quoi + ' » attend un numero de note. Recu : '
            + String(valeur));
    }
    return n;
};

const filtrer = (etat, projet, notes) =>
    ecrireExport({
        format: etat.entete.format,
        version: etat.entete.version,
        projet: etat.entete.projet || projet.identifiant,
        chiffrement: etat.entete.chiffrement,
    }, notes, etat.pied);

const principal = async () => {
    const { options, positions } = analyser(process.argv.slice(2));
    const commande = positions[0];

    if (!commande || options.aide || options.help || commande === 'aide') {
        process.stdout.write(AIDE);
        return 0;
    }

    const configuration = await chargerConfiguration(
        typeof options.config === 'string' ? options.config : null);

    /* Les avertissements vont sur STDERR : « annotepage texte > notes.txt »
       doit rendre un fichier qui ne contient que l'export. Un avertissement
       melange a l'export en ferait une note de plus, avec une marge que
       personne n'attend. */
    for (const mot of configuration.avertissements) {
        process.stderr.write('avertissement : ' + mot + '\n');
    }

    if (commande === 'projets') {
        process.stdout.write('configuration ' + configuration.chemin + '\n');
        for (const [nom, p] of configuration.projets) {
            process.stdout.write('\nprojet ' + nom + '\n');
            process.stdout.write('  identifiant ' + p.identifiant + '\n');
            process.stdout.write('  api ' + p.api + '\n');
            process.stdout.write('  mode ' + p.mode + '\n');
            process.stdout.write('  sel ' + (p.cles ? 'present' : 'absent') + '\n');
            process.stdout.write('  auteur ' + (p.auteur || '(aucun)') + '\n');
            process.stdout.write('  ecriture ' + (p.lecture_seule ? 'lecture seule'
                : (p.auteur ? 'permise' : 'refusee, faute de nom')) + '\n');
            if (p.origine) process.stdout.write('  origine ' + p.origine + '\n');
            if (configuration.defaut === nom) process.stdout.write('  par defaut oui\n');
        }
        return 0;
    }

    const projet = choisirProjet(configuration,
        typeof options.projet === 'string' ? options.projet : null);

    if (commande === 'identifiant') {
        /* Ce qu'il faut pour construire une URL « curl » a la main. C'est
           l'identifiant, jamais le sel : l'un est un jeton porteur public,
           l'autre est la totalite des notes. */
        process.stdout.write(projet.identifiant + '\n');
        return 0;
    }

    if (commande === 'diagnostic') {
        process.stdout.write(await lireDiagnostic(projet));
        return 0;
    }

    if (commande === 'brut') {
        // Ce que le serveur envoie, sans dechiffrer : utile pour comparer avec
        // ce que « curl » rend, et pour verifier qu'on parle bien au meme
        // serveur que le navigateur.
        process.stdout.write(await lireExportBrut(projet));
        return 0;
    }

    const etat = await recuperer(projet);

    switch (commande) {
        case 'texte':
            process.stdout.write(exportRempli(etat, projet));
            return 0;

        case 'ouvertes': {
            let notes = etat.notes.filter(estOuverte);
            if (typeof options.page === 'string') {
                notes = notes.filter((n) => n.page === options.page);
            }
            process.stdout.write(filtrer(etat, projet, notes));
            return 0;
        }

        case 'note': {
            const id = entier(positions[1], 'id');
            const trouve = trouverNote(etat, id);
            if (!trouve) {
                process.stderr.write('Aucune note ' + id + ' dans ce projet.\n');
                return 1;
            }
            process.stdout.write(filtrer(etat, projet, [trouve.mere || trouve.note]));
            return 0;
        }

        case 'repondre': {
            const id = entier(positions[1], 'id');
            const texte = positions.slice(2).join(' ');
            await repondre(projet, etat, id, texte);
            process.stdout.write('Reponse ecrite dans le fil de la note ' + id
                + ', signee « ' + projet.auteur + ' ».\n');
            return 0;
        }

        case 'corrigee': {
            const id = entier(positions[1], 'id');
            if (positions[2] === undefined) {
                throw new ErreurUsage(
                    'La version manque. Ecrivez-la, ou "" si elle n\'est pas connue :\n'
                    + '  annotepage corrigee ' + id + ' 1.4.13\n'
                    + '  annotepage corrigee ' + id + ' ""\n'
                    + "Sans version, le correctif est tenu pour non deploye et la note "
                    + 'reste visible sur la page. C\'est un choix, pas un oubli.');
            }
            await marquerCorrigee(projet, etat, id, positions[2]);
            process.stdout.write('Note ' + id + ' marquee corrigee par « '
                + projet.auteur + ' »'
                + (positions[2] ? ', en version ' + positions[2]
                                : ', sans version declaree') + '.\n');
            return 0;
        }

        case 'rouvrir': {
            const id = entier(positions[1], 'id');
            await rouvrir(projet, etat, id);
            process.stdout.write('Note ' + id + ' rouverte. Son fil est intact.\n');
            return 0;
        }

        default:
            process.stderr.write('Commande inconnue : ' + commande + '\n\n' + AIDE);
            return 2;
    }
};

principal()
    .then((code) => { process.exitCode = code; })
    .catch((e) => {
        if (e instanceof ErreurConfiguration || e instanceof ErreurUsage
            || e instanceof ErreurApi) {
            process.stderr.write('\n' + e.message + '\n\n');
            process.exitCode = 1;
            return;
        }
        process.stderr.write('\n' + ((e && e.stack) || String(e)) + '\n\n');
        process.exitCode = 1;
    });
