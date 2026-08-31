/* ============================================================================
   verifier.mjs — LES VECTEURS DU FORMAT, VERIFIES A CHAQUE CONSTRUCTION.

   Ce n'est pas une suite de tests d'interface : rien ici ne touche au DOM. On
   verifie la seule partie du client qu'une AUTRE implantation doit retrouver
   au bit pres — les derivations, l'index aveugle, l'enveloppe. Le serveur PHP
   et le paquet MCP peuvent recopier les vecteurs ci-dessous pour s'assurer
   qu'ils parlent bien du meme format.

   Les sections de crypto sont chargees TELLES QUELLES depuis source/ : il n'y
   a pas de seconde implantation a maintenir, donc pas de seconde
   implantation qui derive.

   Les deux valeurs attendues ci-dessous ont ete recoupees avec une seconde
   implantation de HKDF-SHA-256 ecrite a la main d'apres la RFC 5869, et non
   recopiees de la sortie du code teste : sans ce recoupement, un test qui
   gele sa propre erreur passe pour toujours. C'est notamment ainsi qu'on
   verifie que le sel est bien l'IKM et « annotepage/1 » le salt, et non
   l'inverse — les deux « marchent », un seul est le format.

   Aucune dependance. « node outils/verifier.mjs ».
   ============================================================================ */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, '..', 'source');

const lire = (nom) => readFileSync(join(SOURCE, nom), 'utf8');

/* Le meme assemblage que la construction, reduit aux deux sections qui ne
   dependent d'aucun DOM. « window » est reduit a ce que ces sections lisent :
   si l'une d'elles se met un jour a toucher au document, ce fichier tombera,
   et c'est le but. */
const window = { crypto: webcrypto };
const code = [
    lire('10-outils.js'),
    lire('20-chiffrement.js'),
    'return { b64url, deB64url, engendrerSel, selDepuisTexte, deriver,',
    '         indexDeChemin, sceller, ouvrir, compacter };'
].join('\n');

/* Les memes valeurs que la construction injecte, et pour la meme raison :
   ces sections ne les declarent pas, elles les recoivent. */
const FORMAT = 2;
const VERSION_OUTIL = JSON.parse(readFileSync(join(ICI, '..', 'package.json'), 'utf8')).version;
const VERSION_SITE = '';
const module = new Function('window', 'FORMAT', 'VERSION_OUTIL', 'VERSION_SITE', code)(
    window, FORMAT, VERSION_OUTIL, VERSION_SITE);

let echecs = 0;
const verifier = (nom, obtenu, attendu) => {
    const ok = obtenu === attendu;
    if (!ok) echecs += 1;
    process.stdout.write((ok ? '  ok    ' : '  ECHEC ') + nom + '\n');
    if (!ok) {
        process.stdout.write('        obtenu  : ' + obtenu + '\n');
        process.stdout.write('        attendu : ' + attendu + '\n');
    }
};

/* Le sel du vecteur : les octets 0 a 31, dans l'ordre. Choisi pour qu'une
   autre implantation puisse le reproduire sans recopier une chaine. */
const octetsVecteur = new Uint8Array(32);
for (let i = 0; i < 32; i += 1) octetsVecteur[i] = i;
const SEL_VECTEUR = module.b64url(octetsVecteur);

const principal = async () => {
    process.stdout.write('base64url\n');
    verifier('sel du vecteur (43 caracteres)', SEL_VECTEUR,
        'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
    verifier('aller-retour', module.b64url(module.deB64url(SEL_VECTEUR)), SEL_VECTEUR);
    verifier('refus d\'un sel mal forme', module.selDepuisTexte(SEL_VECTEUR + 'X'), null);
    verifier('refus d\'un sel espace', module.selDepuisTexte('AAEC AwQF'), null);

    process.stdout.write('derivations HKDF-SHA-256, salt "annotepage/1"\n');
    const cles = await module.deriver(octetsVecteur);
    verifier('identifiant de projet (22 caracteres)', cles.identifiant, 'Up4tgMk-kJmJl1MUMuC5yA');

    process.stdout.write('index aveugle HMAC-SHA-256\n');
    verifier('index de /fr/contact.html',
        await module.indexDeChemin(cles.cleIndex, '/fr/contact.html'),
        'q4DHRWupkdur4kJu11zQWA');
    verifier('la casse compte', await module.indexDeChemin(cles.cleIndex, '/Contact')
        === await module.indexDeChemin(cles.cleIndex, '/contact'), false);
    verifier('la barre finale compte', await module.indexDeChemin(cles.cleIndex, '/a/')
        === await module.indexDeChemin(cles.cleIndex, '/a'), false);

    process.stdout.write('enveloppe AES-256-GCM\n');
    const projet = cles.identifiant;
    const index = await module.indexDeChemin(cles.cleIndex, '/fr/contact.html');
    const note = { page: '/fr/contact.html', auteur: 'Camille', texte: 'Le lien pointe ailleurs.', vide: '' };

    const enveloppe = await module.sceller(cles.cleChiffre, projet, index, 'note', note);
    verifier('prefixe de format', enveloppe.slice(0, 4), 'ap2.');
    verifier('longueur du nonce', enveloppe.split('.')[1].length, 16);

    const ouverte = await module.ouvrir(cles.cleChiffre, projet, index, 'note', enveloppe);
    verifier('aller-retour du texte', ouverte.texte, note.texte);
    verifier('un champ vide est ABSENT', Object.prototype.hasOwnProperty.call(ouverte, 'vide'), false);

    const deuxieme = await module.sceller(cles.cleChiffre, projet, index, 'note', note);
    verifier('deux chiffrements, deux nonces', enveloppe === deuxieme, false);

    const raison = async (promesse) => {
        try {
            await promesse;
            return 'aucune';
        } catch (e) {
            return e && e.raison ? e.raison : 'inattendue';
        }
    };
    verifier('note deplacee sur une autre page : refus',
        await raison(module.ouvrir(cles.cleChiffre, projet, 'AAAAAAAAAAAAAAAAAAAAAA', 'note', enveloppe)),
        'illisible');
    verifier('role echange : refus',
        await raison(module.ouvrir(cles.cleChiffre, projet, index, 'resolution', enveloppe)),
        'illisible');
    verifier('autre projet : refus',
        await raison(module.ouvrir(cles.cleChiffre, 'AAAAAAAAAAAAAAAAAAAAAA', index, 'note', enveloppe)),
        'illisible');
    verifier('format plus recent : refus NET, et distinct',
        await raison(module.ouvrir(cles.cleChiffre, projet, index, 'note', 'ap9' + enveloppe.slice(3))),
        'recente');
    verifier('nonce d\'une autre longueur : refus',
        await raison(module.ouvrir(cles.cleChiffre, projet, index, 'note', 'ap2.AAAA.' + enveloppe.split('.')[2])),
        'illisible');

    process.stdout.write(echecs ? '\n' + echecs + ' echec(s)\n' : '\ntout est conforme\n');
    process.exit(echecs ? 1 : 0);
};

principal().catch((e) => {
    process.stdout.write('erreur : ' + (e && e.stack ? e.stack : e) + '\n');
    process.exit(1);
});
