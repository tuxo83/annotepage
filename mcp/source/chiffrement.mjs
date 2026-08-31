/* chiffrement.mjs — LE SEL, LES TROIS DERIVATIONS, L'ENVELOPPE.
 *
 * C'est le jumeau, cote assistant, de client/source/20-chiffrement.js. Les
 * deux implantent FORMAT.md §1, §3 et §4 ; si l'une des deux devient plus
 * maligne que l'autre, les notes du navigateur cessent de se lire ici, et
 * personne ne s'en apercoit avant d'en avoir besoin.
 *
 * LA DIFFERENCE AVEC LE CLIENT EST ENTIEREMENT ICI : le navigateur garde son
 * sel dans le localStorage, cette machine le garde dans un fichier de
 * configuration. C'est le meme secret, avec la meme consequence — qui lit le
 * fichier lit toutes les notes du projet — et le fichier n'est donc jamais
 * versionne. Voir configuration.mjs, qui refuse un fichier lisible par tout
 * le monde.
 *
 * On emploie webcrypto de Node, et non le module « crypto » classique : c'est
 * la meme API que dans le navigateur, donc le meme code a relire quand un
 * doute survient sur une derivation. Un HKDF ecrit deux fois de deux facons
 * differentes est un HKDF qu'on ne compare plus.
 */

import { webcrypto } from 'node:crypto';
import {
    FORMAT, CHAINE_HKDF, LONGUEUR_SEL, LONGUEUR_NONCE,
    utf8, deUtf8, b64url, deB64url,
} from './format.mjs';

const sousCrypto = webcrypto.subtle;

/**
 * Le texte d'un sel -> ses 32 octets, ou null.
 *
 * On refuse ce qui n'a pas exactement la bonne forme au lieu de « nettoyer »
 * les espaces ou les tirets : un sel presque juste rend un identifiant de
 * projet faux, et le message « ce sel n'est pas celui de ce projet » ferait
 * alors chercher au mauvais endroit.
 */
export const selDepuisTexte = (texte) => {
    const t = String(texte == null ? '' : texte).trim();
    if (t.length !== LONGUEUR_SEL || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
    const octets = deB64url(t);
    return octets && octets.length === 32 ? octets : null;
};

/**
 * Les trois derivations, en une fois.
 *
 * PIEGE, nomme parce qu'il se paie cher : le parametre « salt » de HKDF n'est
 * PAS notre sel. Notre sel est le materiau d'entree (IKM) ; le salt de HKDF
 * est la chaine fixe et publique « annotepage/1 », qui separe cet outil de
 * tout autre logiciel a qui l'on confierait un jour le meme secret. Les
 * inverser produit un systeme qui marche, qui chiffre, et dont les notes
 * deviennent illisibles a la premiere reimplantation — celle-ci, par exemple.
 */
export const deriver = async (selOctets) => {
    const params = (etiquette) => ({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: utf8(CHAINE_HKDF),   // PAS le sel : voir ci-dessus
        info: utf8(etiquette),
    });

    const maitresse = await sousCrypto.importKey(
        'raw', selOctets, 'HKDF', false, ['deriveBits', 'deriveKey']);

    const [octetsId, cleChiffre, octetsIndex] = await Promise.all([
        sousCrypto.deriveBits(params('id'), maitresse, 256),
        /* Non extractible, comme dans le navigateur. C'est de l'hygiene, pas
           une barriere : le sel dort dans un fichier juste a cote, et qui lit
           l'un refait l'autre en trois lignes. On l'ecrit pour que personne ne
           prenne ce « false » pour une protection qu'il n'est pas. */
        sousCrypto.deriveKey(params('chiffre'), maitresse,
            { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
        sousCrypto.deriveBits(params('index'), maitresse, 256),
    ]);

    const cleIndex = await sousCrypto.importKey(
        'raw', octetsIndex, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

    return {
        /* 16 octets et non 32 : cette valeur voyage dans une chaine de
           requete, un attribut de balise, un fichier de configuration et une
           colonne indexee. 128 bits sont indevinables, et 22 caracteres se
           recopient — 43 ne se recopient pas. */
        identifiant: b64url(new Uint8Array(octetsId).subarray(0, 16)),
        cleChiffre,
        cleIndex,
    };
};

/**
 * index_page = HMAC(cle_index, chemin), 16 premiers octets, base64url.
 *
 * AUCUNE normalisation autre que celle du format 1 (une seule barre initiale,
 * pas de segment « .. ») : ni minuscules, ni suppression d'une barre finale,
 * ni decodage des %xx. « /Contact » et « /contact » sont deux pages ; « /a/ »
 * et « /a » sont deux pages. C'est ce que le navigateur donne, c'est ce qu'on
 * indexe — et c'est la seule facon que deux implantations tombent d'accord.
 *
 * Ce paquet en a besoin pour une seule chose, mais elle compte : ecrire une
 * reponse a une note dont on ne connait le chemin que parce qu'on vient de le
 * DECHIFFRER. Il refait alors le meme calcul que le navigateur, et retrouve
 * le meme index — sinon l'AAD ne colle pas et la reponse serait illisible par
 * celui a qui elle s'adresse.
 */
export const cheminNormalise = (chemin) => {
    let c = String(chemin == null ? '/' : chemin) || '/';
    if (c.charAt(0) !== '/') c = '/' + c;
    c = c.replace(/^\/+/, '/');
    if (c.indexOf('/../') !== -1 || /\/\.\.$/.test(c)) {
        c = c.split('/').filter((s) => s !== '..').join('/') || '/';
        if (c.charAt(0) !== '/') c = '/' + c;
    }
    return c;
};

export const indexDeChemin = async (cleIndex, chemin) => {
    const signature = await sousCrypto.sign('HMAC', cleIndex, utf8(chemin));
    return b64url(new Uint8Array(signature).subarray(0, 16));
};

/* -- L'enveloppe ---------------------------------------------------------
   AES-256-GCM, sans exception et sans repli. Pas de choix d'algorithme, pas
   de negociation, pas de « suite » : un format qui negocie est un format
   qu'on fait retomber sur son option la plus faible. */

/**
 * L'AAD lie l'enveloppe a sa place. Sans elle, un serveur malveillant peut
 * deplacer une note d'une page a l'autre, ou d'un projet a l'autre : le
 * dechiffrement reussirait et la remarque apparaitrait sous un element
 * qu'elle ne visait pas.
 *
 * Consequence pour ce paquet, qui n'a jamais vu la page : l'index employe
 * ici est celui que le serveur a ECRIT sur la ligne. C'est une confiance
 * qu'on ne peut pas eviter en lecture — nous n'avons pas d'autre source — et
 * elle est sans danger : un index change ne fait pas lire une note ailleurs,
 * il fait echouer le dechiffrement. L'AAD a exactement ce role.
 *
 * En ECRITURE, en revanche, l'index est recalcule a partir du chemin
 * dechiffre de la note mere (voir notes.mjs). Une reponse scellee sous
 * l'index qu'un serveur nous souffle serait une reponse qu'il pourrait
 * accrocher ailleurs.
 */
const aad = (projet, indexPage, role) =>
    utf8(FORMAT + '\n' + projet + '\n' + indexPage + '\n' + role);

export class ErreurEnveloppe extends Error {
    constructor(raison, message) {
        super(message);
        this.raison = raison;
    }
}

/** Un champ vide est ABSENT de l'objet, il n'est pas ecrit a "". Meme regle
    que dans l'export texte, et pour la meme raison : ne pas ecrire une cle
    pour dire qu'il n'y a rien. */
const compacter = (objet) => {
    const net = {};
    for (const cle of Object.keys(objet)) {
        const v = objet[cle];
        if (v !== undefined && v !== null && String(v) !== '') net[cle] = String(v);
    }
    return net;
};

export const sceller = async (cleChiffre, projet, indexPage, role, objet) => {
    /* Nonce de 12 octets tire a CHAQUE chiffrement. Jamais un compteur,
       jamais derive du contenu, jamais reutilise : un nonce repete avec la
       meme cle en GCM ne fait pas fuir une note, il fait fuir la cle
       d'authentification. */
    const nonce = webcrypto.getRandomValues(new Uint8Array(12));
    const clair = utf8(JSON.stringify(compacter(objet)));
    const chiffre = await sousCrypto.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(projet, indexPage, role), tagLength: 128 },
        cleChiffre, clair);
    return 'ap' + FORMAT + '.' + b64url(nonce) + '.' + b64url(new Uint8Array(chiffre));
};

/**
 * Rend l'objet JSON de l'enveloppe.
 *
 * Leve une ErreurEnveloppe dont la raison vaut :
 *   'recente'   l'enveloppe porte un numero de format superieur au notre. On
 *               ne devine pas une cryptographie : refus net, la note est
 *               sautee et COMPTEE, et l'outil dit qu'elle existe.
 *   'illisible' forme invalide, ou dechiffrement echoue — mauvais sel, note
 *               deplacee par le serveur, octets abimes. Les trois se valent
 *               du point de vue du lecteur : il n'a pas de quoi lire.
 */
export const ouvrir = async (cleChiffre, projet, indexPage, role, enveloppe) => {
    const morceaux = String(enveloppe == null ? '' : enveloppe).split('.');
    const refus = () => { throw new ErreurEnveloppe('illisible', 'enveloppe illisible'); };

    if (morceaux.length !== 3) refus();

    const marque = /^ap(\d+)$/.exec(morceaux[0]);
    if (!marque) refus();
    const numero = parseInt(marque[1], 10);
    if (numero > FORMAT) {
        throw new ErreurEnveloppe('recente',
            'cette note a ete ecrite par une version plus recente d\'annotepage');
    }
    if (numero !== FORMAT) refus();

    // Un lecteur qui compte un nonce d'une autre longueur refuse la ligne au
    // lieu de deviner.
    if (morceaux[1].length !== LONGUEUR_NONCE) refus();
    const nonce = deB64url(morceaux[1]);
    const chiffre = deB64url(morceaux[2]);
    if (!nonce || nonce.length !== 12 || !chiffre) refus();

    let clair;
    try {
        clair = await sousCrypto.decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: aad(projet, indexPage, role), tagLength: 128 },
            cleChiffre, chiffre);
    } catch (e) {
        /* GCM ne dit pas POURQUOI il refuse, et c'est voulu : mauvaise cle,
           AAD differente, octet modifie, tout tombe ici. Le message qu'on
           remonte ne doit donc rien affirmer de plus que ce qu'on sait. */
        refus();
    }

    let objet = null;
    try {
        objet = JSON.parse(deUtf8(new Uint8Array(clair)));
    } catch (e) {
        refus();
    }
    if (!objet || typeof objet !== 'object' || Array.isArray(objet)) refus();
    return objet;
};
