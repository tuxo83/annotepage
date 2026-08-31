/* pont-client.mjs — FAIT TOURNER LE VRAI CODE DU CLIENT SOUS NODE.
 *
 * Ce fichier ne reimplante RIEN, et c'est tout son interet : le jour ou l'on
 * recopie ici une derivation « equivalente » pour se simplifier la vie, le
 * test cesse de comparer deux implantations et se met a se comparer a
 * lui-meme — c'est-a-dire a ne plus rien proteger.
 *
 * Il lit donc client/source/*.js TELS QUELS et les evalue dans un bac a sable
 * (node:vm) ou l'on pose ce que le navigateur fournit et que Node ne fournit
 * pas sous le meme nom : window, document, location, localStorage.
 *
 * POURQUOI LES SOURCES ET NON dist/annotepage.js : le fichier construit est
 * une fonction anonyme immediatement appelee qui n'exporte rien. Ses
 * fonctions de chiffrement n'y sont atteignables d'aucune facon depuis
 * l'exterieur. Les sections sont mises bout a bout par outils/construire.mjs
 * dans UNE seule portee ; on refait ici la meme mise bout a bout, avec les
 * memes valeurs injectees (VERSION_OUTIL, FORMAT, STYLES), pour les sections
 * qui portent le protocole. Le texte des sections n'est pas touche, et rien
 * n'y est ajoute qu'une expression finale — voir EPILOGUE plus bas.
 *
 * CE QUI EST CHARGE, ET POURQUOI CE DECOUPAGE :
 *
 *   00-preambule    ce que la balise declare : projet, mode, adresse d'API
 *   10-outils       base64url, utf8 — les octets du format
 *   15-libelles     les textes, dont dependent les messages de 40
 *   20-chiffrement  les trois derivations, l'index aveugle, l'enveloppe
 *   30-etat         le sel, les cles, l'index de la page courante
 *   40-api          les cinq adresses, et surtout la CONSTRUCTION DU CORPS
 *
 * Les sections 50 a 90 sont ecartees : elles batissent une interface, elles
 * ne portent aucune decision de protocole, et il faudrait un vrai DOM pour
 * les charger. La consequence est a dire franchement : ce test exerce le
 * client A PARTIR de « voici les champs d'une note », pas a partir d'un clic.
 * Ce qu'il y a entre le clic et les champs — le releve du selecteur, de
 * l'empreinte et de l'extrait — n'est pas couvert ici.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE = join(ICI, '..');
const SOURCE_CLIENT = join(RACINE, 'client', 'source');

/* Le meme ordre que construire.mjs. Si le client venait a deplacer une
   fonction de protocole dans une autre section, ce tableau doit suivre — et
   le test echouera bruyamment en attendant, ce qui est le bon sens de
   l'echec : mieux vaut un test qui refuse de demarrer qu'un test qui
   verifie une moitie du client sans le dire. */
const SECTIONS = [
    '00-preambule.js',
    '10-outils.js',
    '15-libelles.js',
    '20-chiffrement.js',
    '30-etat.js',
    '40-api.js',
];

/**
 * La SEULE ligne de code ajoutee au client.
 *
 * Les sections declarent tout en « const » et « let » de portee de bloc :
 * rien ne devient une propriete de l'objet global, et il n'y a donc aucun
 * moyen d'atteindre ces fonctions depuis l'exterieur. Cette expression finale
 * les ressort — et, pour « cles » et « INDEX_PAGE » qui sont des « let » que
 * l'interface pose normalement au demarrage, elle expose l'affectation
 * plutot que la valeur : une fonction definie DANS la portee peut ecrire
 * dans ces variables, ce qu'un objet de valeurs ne pourrait pas.
 */
const EPILOGUE = `
({
    /* Ce que la balise a produit — on le RELIT plutot que de le supposer. */
    lu: () => ({ API, PROJET, MODE, VERSION_SITE, ENVIRONNEMENT,
                 PREFIXE_CHEMIN, INDEX_PAGE }),

    /* Le demarrage (section 90, non chargee) fait exactement ceci : il derive
       les cles du sel, calcule l'index de la page, et les pose. */
    installer: (nouvellesCles, index) => { cles = nouvellesCles; INDEX_PAGE = index; },

    /* Le protocole, tel que le client l'ecrit. */
    deriver, indexDeChemin, cheminDePage, sceller, ouvrir,
    engendrerSel, selDepuisTexte, b64url, deB64url, utf8, deUtf8,

    /* Les cinq adresses, telles que le client les appelle. corpsDeNote et
       corpsDeResolution sont le point sensible : c'est la que se decide ce
       qui part en clair et ce qui part dans l'enveloppe. */
    appeler, corpsDeNote, corpsDeResolution, lireListe, ouvrirNote, ouvrirFil,
    sautees: () => sautees,

    dansLaPortee,
});
`;

/* Ce que le navigateur fournit et que le fichier construit obtient
   gratuitement. Aucune de ces valeurs n'appartient au protocole : ce sont les
   dependances d'environnement du client, et rien d'autre. */
const fabriquerBacASable = (options) => {
    const memoire = new Map();
    const localStorage = {
        getItem: (c) => (memoire.has(c) ? memoire.get(c) : null),
        setItem: (c, v) => { memoire.set(c, String(v)); },
        removeItem: (c) => { memoire.delete(c); },
    };

    const dataset = {};
    if (options.serveur) dataset.serveur = options.serveur;
    if (options.projet) dataset.projet = options.projet;
    if (options.mode) dataset.mode = options.mode;
    if (options.version) dataset.version = options.version;
    if (options.environnement) dataset.environnement = options.environnement;
    if (options.chemin_prefixe) dataset.chemin = options.chemin_prefixe;
    if (options.domaines) dataset.domaines = options.domaines;

    const origine = options.origine || 'https://exemple.invalid';
    const document = {
        /* Le client refuse de deviner une adresse d'API : sans balise, il se
           retire en silence. On lui en donne donc une, exactement comme le
           ferait une page annotee. */
        currentScript: { src: origine + '/annotepage.js', dataset },
        baseURI: origine + '/',
        documentElement: { getAttribute: () => 'fr' },
        createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, appendChild() {} }),
    };

    const fenetre = {
        crypto: webcrypto,
        localStorage,
        document,
        innerWidth: 1280,
        innerHeight: 800,
        Annotepage: undefined,
    };
    fenetre.window = fenetre;

    const bac = {
        window: fenetre,
        self: fenetre,
        document,
        localStorage,
        crypto: webcrypto,
        /* location.pathname est LU par cheminDePage(). Il reste modifiable
           pour que le test puisse jouer plusieurs pages sans recharger tout
           le client. */
        location: { pathname: options.chemin || '/', origin: origine, href: origine + (options.chemin || '/') },
        TextEncoder,
        TextDecoder,
        URL,
        URLSearchParams,
        btoa,
        atob,
        fetch,
        console,
        setTimeout,
        clearTimeout,
    };
    fenetre.location = bac.location;
    return bac;
};

/** Le numero de format tel que la CONSTRUCTION du client l'injecte. */
const formatDuClient = () => {
    const construire = readFileSync(join(RACINE, 'client', 'outils', 'construire.mjs'), 'utf8');
    const trouve = /^const FORMAT = (\d+);$/m.exec(construire);
    if (!trouve) {
        throw new Error(
            "Le numero de format n'a pas ete trouve dans client/outils/construire.mjs "
            + "(ligne « const FORMAT = <n>; »). Le pont ne peut pas le deviner, et ne "
            + "doit pas : deux endroits qui declarent le meme numero finissent par "
            + 'diverger.');
    }
    return Number(trouve[1]);
};

/**
 * Charge le vrai client et rend ses fonctions de protocole.
 *
 * @param {object} options  ce que declarerait la balise, plus le chemin de
 *                          la page courante.
 */
export const chargerClient = (options = {}) => {
    const paquet = JSON.parse(
        readFileSync(join(RACINE, 'client', 'package.json'), 'utf8'));
    const format = formatDuClient();
    const styles = readFileSync(join(SOURCE_CLIENT, 'styles.css'), 'utf8');

    const corps = SECTIONS
        .map((nom) => readFileSync(join(SOURCE_CLIENT, nom), 'utf8'))
        .join('\n\n');

    /* Le tout dans une fonction, comme dans le fichier construit : la
       section 00 se termine par un « return » de sortie anticipee, qui n'a de
       sens que la. */
    const programme = [
        '(function () {',
        "'use strict';",
        'const VERSION_OUTIL = ' + JSON.stringify(paquet.version) + ';',
        'const FORMAT = ' + format + ';',
        'const STYLES = ' + JSON.stringify(styles) + ';',
        corps,
        /* trimStart() n'est pas cosmetique : « return » suivi d'un saut de
           ligne se termine tout seul et rend undefined. Le pont a commence sa
           vie ainsi, et le client avait l'air de se retirer au chargement. */
        'return ' + EPILOGUE.trimStart(),
        '}())',
    ].join('\n');

    const bac = fabriquerBacASable(options);
    const contexte = createContext(bac);
    const sorties = runInContext(programme, contexte,
        { filename: 'client/source (assemble par le pont)' });

    if (!sorties) {
        throw new Error(
            'Le client s\'est retire au chargement : il n\'a pas trouve de balise '
            + 'exploitable. Verifiez les options passees a chargerClient().');
    }

    return Object.assign({ format, version: paquet.version, bac }, sorties);
};
