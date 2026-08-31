/* format.mjs — LES CONSTANTES DU FORMAT, ET RIEN D'AUTRE.
 *
 * Ce fichier implante FORMAT.md et rien d'autre. Quand une ligne d'ici
 * contredit FORMAT.md, c'est cette ligne qui a tort.
 *
 * Il est le seul endroit du paquet ou le numero de format est ecrit. Ce
 * numero apparait a trois endroits dans le format — la colonne d'une ligne,
 * le prefixe d'une enveloppe, l'en-tete d'un export — et les trois doivent
 * s'accorder : une seule declaration est la seule facon que ce soit vrai.
 */

/** Le numero de format, entier, sans point. FORMAT.md §7. */
export const FORMAT = 2;

/* La chaine de separation de HKDF. GELEE par le numero de format : la
   changer rend illisible chaque note deja ecrite. FORMAT.md §1.3. */
export const CHAINE_HKDF = 'annotepage/1';

/** 32 octets en base64url sans remplissage. */
export const LONGUEUR_SEL = 43;

/* 12 octets en base64url sans remplissage. Un lecteur qui en compte un autre
   refuse la ligne au lieu de deviner. FORMAT.md §3.3. */
export const LONGUEUR_NONCE = 16;

/* 16 octets en base64url sans remplissage : l'identifiant de projet et
   l'index de page ont la meme longueur, et ce n'est pas un hasard — c'est la
   meme troncature, prise pour la meme raison. FORMAT.md §1.3. */
export const LONGUEUR_IDENTIFIANT = 22;

const encodeur = new TextEncoder();
const decodeur = new TextDecoder('utf-8', { fatal: false });

export const utf8 = (t) => encodeur.encode(String(t));
export const deUtf8 = (octets) => decodeur.decode(octets);

export const b64url = (source) =>
    Buffer.from(source instanceof Uint8Array ? source : new Uint8Array(source))
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Rend un Uint8Array, ou null si la chaine n'est pas du base64url.
 *
 * Rendre null plutot que lever : l'appelant est toujours en train de lire une
 * ligne venue du reseau, et une ligne illisible se compte, elle n'arrete pas
 * la lecture des autres.
 *
 * Buffer.from() accepte en silence ce qui n'est pas du base64 — il le saute.
 * On verifie donc l'alphabet ET la longueur attendue, sans quoi une enveloppe
 * abimee se decoderait « presque » et echouerait plus loin, avec un message
 * qui ne designe pas la cause.
 */
export const deB64url = (texte) => {
    const t = String(texte);
    if (!/^[A-Za-z0-9_-]*$/.test(t)) return null;
    // Un reste de 1 caractere n'existe pas en base64 : 4 caracteres rendent
    // 3 octets, 3 en rendent 2, 2 en rendent 1.
    const reste = t.length % 4;
    if (reste === 1) return null;
    const attendue = Math.floor(t.length / 4) * 3 + (reste === 0 ? 0 : reste - 1);
    const octets = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (octets.length !== attendue) return null;
    return new Uint8Array(octets);
};

/**
 * Ramene a \n toutes les fins de ligne, quelles qu'elles soient, et retire
 * les caracteres de controle qui ne sont ni \n ni \t.
 *
 * C'est la liste du serveur, mot pour mot, et pour la meme raison : un
 * caractere qu'un lecteur compte pour une fin de ligne et que nous laissons
 * passer fabrique, DANS l'export, une ligne de structure la ou il n'y a que
 * du texte — donc une note entiere qui n'a jamais ete ecrite.
 *
 * En mode chiffre, le serveur n'a RIEN vu du texte : il dormait dans
 * l'enveloppe, et son nettoyage a lui n'a rien eu a nettoyer. Celui-ci est
 * donc le premier et le seul. C'est ce que FORMAT.md §5.1 appelle « apres le
 * dechiffrement, chez le producteur de l'export », et ce paquet est ce
 * producteur.
 */
export const lignesNormalisees = (texte) =>
    String(texte == null ? '' : texte)
        .replace(/\r\n|\r|\u0085|\u2028|\u2029/g, '\n')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

/** Valeur ecrite sur une ligne « cle valeur » : elle ne peut pas contenir de
    fin de ligne, sous peine d'en fabriquer une seconde, non indentee. */
export const valeurSure = (valeur) =>
    lignesNormalisees(valeur).replace(/\n/g, ' ').trim();

/**
 * Indente chaque ligne d'un bloc de texte.
 *
 * Une ligne vide reste VIDE, sans espaces : des espaces en fin de ligne sont
 * exactement ce qu'un outil de recuperation supprime, et le bloc paraitrait
 * alors incoherent. C'est aussi ce qui permet a l'analyseur de reconnaitre
 * une ligne vide DANS un texte — voir l'en-tete de export-texte.mjs.
 */
export const indenter = (texte, marge) =>
    lignesNormalisees(texte)
        .split('\n')
        .map((ligne) => (ligne === '' ? '' : marge + ligne) + '\n')
        .join('');

/** Une date en ISO 8601 avec decalage explicite. Une date sans fuseau n'est
    pas une date. */
export const dateIso = (quand) =>
    new Date(quand === undefined ? Date.now() : quand)
        .toISOString().replace(/\.\d{3}Z$/, '+00:00');
