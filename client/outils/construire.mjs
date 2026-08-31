/* ============================================================================
   construire.mjs — ASSEMBLE LE FICHIER SERVI, ET IMPRIME SON EMPREINTE.

   Aucune dependance : ni empaqueteur, ni minificateur, ni greffon. La
   construction consiste a mettre bout a bout des SECTIONS — pas des modules —
   dans une seule fonction anonyme, exactement comme l'outil d'origine tenait
   en un seul fichier. Elles partagent donc une seule portee : c'est ce qui
   permet de porter le client sans le reecrire en modules.

   POURQUOI PAS DE MINIFICATION : elle demanderait une dependance, donc une
   chaine d'approvisionnement de plus a surveiller — or c'est precisement le
   risque principal de cette architecture (le fichier part en CDN, dans la
   page de quelqu'un d'autre). Le fichier reste lisible, se compresse tres
   bien en transport, et une empreinte SRI se verifie sur ce qu'on peut lire.

   L'EMPREINTE sha384 est imprimee a la fin, avec la balise complete a coller.
   Elle est aussi ajoutee a dist/EMPREINTES.txt, une ligne par version : c'est
   ce fichier qu'on publie a cote du paquet.
   ============================================================================ */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
const SOURCE = join(RACINE, 'source');
const DIST = join(RACINE, 'dist');

/* L'ordre est le sommaire du fichier engendre. Il n'est pas alphabetique par
   hasard : les numeros SONT l'ordre, pour qu'un ajout ne se glisse pas au
   milieu sans qu'on s'en apercoive. */
const SECTIONS = [
    '00-preambule.js',
    '10-outils.js',
    '15-libelles.js',
    '20-chiffrement.js',
    '30-etat.js',
    '40-api.js',
    '50-reperes.js',
    '60-interface.js',
    '70-installation.js',
    '90-demarrage.js'
];

const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
const VERSION = paquet.version;

/* Le numero de FORMAT est celui de FORMAT.md. Il ne suit pas la version du
   paquet et ne doit jamais la suivre : une correction du client n'est pas un
   changement de format, et un changement de format ne se deduit pas d'un
   numero de paquet. */
const FORMAT = 2;

const styles = readFileSync(join(SOURCE, 'styles.css'), 'utf8');

const indenter = (texte) => texte
    .split('\n')
    .map((l) => (l.trim() === '' ? '' : '    ' + l))
    .join('\n');

const entete = [
    '/* ============================================================================',
    '   annotepage — la couche d\'annotation, cote navigateur.',
    '',
    '   Version du paquet : ' + VERSION,
    '   Version de format : ' + FORMAT + '   (voir FORMAT.md)',
    '   Licence : ' + paquet.license,
    '',
    '   FICHIER ENGENDRE — ne pas le modifier a la main. Les sources sont dans',
    '   source/, et « npm run build » refait ce fichier. Une correction portee ici',
    '   serait perdue a la construction suivante, et l\'empreinte SRI publiee ne',
    '   correspondrait plus a rien.',
    '   ============================================================================ */',
    ''
].join('\n');

const corps = SECTIONS
    .map((nom) => {
        const brut = readFileSync(join(SOURCE, nom), 'utf8').replace(/\s*$/, '');
        return indenter('/* ==== ' + nom + ' ==== */\n\n' + brut);
    })
    .join('\n\n');

const fichier = [
    entete,
    '(function () {',
    '    \'use strict\';',
    '',
    '    /* Injectes par la construction : ils viennent de package.json et de',
    '       source/styles.css, pour qu\'aucune valeur ne soit ecrite a deux',
    '       endroits et ne puisse donc diverger. */',
    '    const VERSION_OUTIL = ' + JSON.stringify(VERSION) + ';',
    '    const FORMAT = ' + FORMAT + ';',
    '    const STYLES = ' + JSON.stringify(styles) + ';',
    '',
    corps,
    '}());',
    ''
].join('\n');

if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

const cible = join(DIST, 'annotepage.js');
writeFileSync(cible, fichier, 'utf8');

/* L'empreinte est calculee sur les OCTETS ECRITS, jamais sur la chaine en
   memoire : c'est le fichier servi que le navigateur verifiera, et lui seul. */
const octets = readFileSync(cible);
const empreinte = 'sha384-' + createHash('sha384').update(octets).digest('base64');

const balise = [
    '<script src="https://<votre-cdn>/@annotepage/client@' + VERSION + '/dist/annotepage.js"',
    '        integrity="' + empreinte + '"',
    '        crossorigin="anonymous"',
    '        data-serveur="https://<votre-serveur>/annotepage/api.php"',
    '        data-projet="<22 caracteres>"',
    '        defer></' + 'script>'
].join('\n');

const journal = join(DIST, 'EMPREINTES.txt');
const anciennes = existsSync(journal) ? readFileSync(journal, 'utf8').split('\n') : [];
const gardees = anciennes.filter((l) => l.trim() !== '' && l.indexOf(VERSION + '  ') !== 0);
writeFileSync(journal,
    [VERSION + '  ' + empreinte + '  ' + octets.length + ' octets'].concat(gardees).join('\n') + '\n',
    'utf8');

process.stdout.write(
    'annotepage/client ' + VERSION + ' — format ' + FORMAT + '\n'
    + '  ' + cible + '\n'
    + '  ' + octets.length + ' octets\n'
    + '  ' + empreinte + '\n\n'
    + balise + '\n'
);
