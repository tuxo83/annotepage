/* -- 6. Le sel, les trois derivations, l'enveloppe -----------------------

   Tout ce fichier implante FORMAT.md §1, §3 et §4, et rien d'autre. Quand une
   ligne d'ici contredit FORMAT.md, c'est cette ligne qui a tort.

   LE SEL NE QUITTE JAMAIS LE NAVIGATEUR. Il n'est envoye au serveur sous
   aucune forme, dans aucun mode, y compris derivee. Le seul chemin par lequel
   il sort d'ici est l'ecran d'installation, qui le montre a la personne qui
   vient de l'engendrer pour qu'elle le range. */

const CHAINE_HKDF = 'annotepage/1';
const LONGUEUR_SEL = 43;        // 32 octets en base64url sans remplissage
const LONGUEUR_NONCE = 16;      // 12 octets en base64url sans remplissage

/* WebCrypto n'existe que dans un contexte SUR : https, ou localhost. Sur une
   preproduction servie en http nu, subtle est absent et l'outil ne peut RIEN
   faire — pas meme calculer l'index de page, qui est un HMAC dans les deux
   modes. On le constate ici, une fois, pour pouvoir le dire a l'ecran au lieu
   de lever une erreur illisible au premier clic. */
const CRYPTO = window.crypto && window.crypto.subtle ? window.crypto : null;

/** 32 octets tires du generateur du navigateur, et de nulle part ailleurs. */
const engendrerSel = () => {
    const octets = new Uint8Array(32);
    CRYPTO.getRandomValues(octets);
    return b64url(octets);
};

/**
 * Le texte d'un sel -> ses 32 octets, ou null.
 *
 * On refuse ce qui n'a pas exactement la bonne forme au lieu de « nettoyer »
 * les espaces ou les tirets : un sel presque juste rend un identifiant de
 * projet faux, et le message « ce sel n'est pas celui de ce projet » ferait
 * alors chercher au mauvais endroit.
 */
const selDepuisTexte = (texte) => {
    const t = String(texte == null ? '' : texte).trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(t)) return null;
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
 * deviennent illisibles a la premiere reimplantation.
 */
const deriver = (selOctets) => {
    const params = (etiquette) => ({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: utf8(CHAINE_HKDF),   // PAS le sel : voir ci-dessus
        info: utf8(etiquette)
    });

    return CRYPTO.subtle
        .importKey('raw', selOctets, 'HKDF', false, ['deriveBits', 'deriveKey'])
        .then((maitresse) => Promise.all([
            CRYPTO.subtle.deriveBits(params('id'), maitresse, 256),
            // La cle de chiffrement est engendree NON EXTRACTIBLE. C'est de
            // l'hygiene, pas une barriere : le sel dort dans le localStorage
            // juste a cote, et qui lit l'un refait l'autre en trois lignes.
            // On l'ecrit pour que personne ne prenne ce « false » pour une
            // protection qu'il n'est pas.
            CRYPTO.subtle.deriveKey(params('chiffre'), maitresse,
                { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
            CRYPTO.subtle.deriveBits(params('index'), maitresse, 256)
        ]))
        .then((trois) => CRYPTO.subtle
            .importKey('raw', trois[2], { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
            .then((cleIndex) => ({
                // 16 octets et non 32 : cette valeur voyage dans une chaine de
                // requete, un attribut de balise, un fichier de configuration
                // et une colonne indexee. 128 bits sont indevinables, et 22
                // caracteres se recopient — 43 ne se recopient pas.
                identifiant: b64url(new Uint8Array(trois[0]).subarray(0, 16)),
                cleChiffre: trois[1],
                cleIndex: cleIndex
            })));
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
 * Le calcul a lieu DANS LES DEUX MODES : un seul chemin de code, une seule
 * facon de grouper. Deux auraient diverge a la deuxieme correction.
 */
const cheminDePage = () => {
    let c = String(location.pathname || '/');
    if (c.charAt(0) !== '/') c = '/' + c;
    c = c.replace(/^\/+/, '/');
    if (c.indexOf('/../') !== -1 || /\/\.\.$/.test(c)) {
        c = c.split('/').filter((s) => s !== '..').join('/') || '/';
        if (c.charAt(0) !== '/') c = '/' + c;
    }
    return c;
};

const indexDeChemin = (cleIndex, chemin) =>
    CRYPTO.subtle.sign('HMAC', cleIndex, utf8(chemin))
        .then((signature) => b64url(new Uint8Array(signature).subarray(0, 16)));

/* -- L'enveloppe ---------------------------------------------------------
   AES-256-GCM, sans exception et sans repli. Pas de choix d'algorithme, pas
   de negociation, pas de « suite » : un format qui negocie est un format
   qu'on fait retomber sur son option la plus faible. */

/**
 * L'AAD lie l'enveloppe a sa place. Sans elle, un serveur malveillant peut
 * deplacer une note d'une page a l'autre, ou d'un projet a l'autre : le
 * dechiffrement reussirait et la remarque apparaitrait sous un element
 * qu'elle ne visait pas.
 */
const aad = (projet, indexPage, role) =>
    utf8(FORMAT + '\n' + projet + '\n' + indexPage + '\n' + role);

const erreurEnveloppe = (raison) => {
    const e = new Error('enveloppe ' + raison);
    e.raison = raison;
    return e;
};

/** Un champ vide est ABSENT de l'objet, il n'est pas ecrit a "". Meme regle
    que dans l'export texte, et pour la meme raison : ne pas ecrire une cle
    pour dire qu'il n'y a rien. */
const compacter = (objet) => {
    const net = {};
    Object.keys(objet).forEach((cle) => {
        const v = objet[cle];
        if (v !== undefined && v !== null && String(v) !== '') net[cle] = String(v);
    });
    return net;
};

const sceller = (cleChiffre, projet, indexPage, role, objet) => {
    // Nonce de 12 octets tire a CHAQUE chiffrement. Jamais un compteur,
    // jamais derive du contenu, jamais reutilise : un nonce repete avec la
    // meme cle en GCM ne fait pas fuir une note, il fait fuir la cle
    // d'authentification.
    const nonce = new Uint8Array(12);
    CRYPTO.getRandomValues(nonce);
    const clair = utf8(JSON.stringify(compacter(objet)));
    return CRYPTO.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(projet, indexPage, role), tagLength: 128 },
        cleChiffre, clair
    ).then((chiffre) => 'ap' + FORMAT + '.' + b64url(nonce) + '.' + b64url(chiffre));
};

/**
 * Rend l'objet JSON de l'enveloppe.
 *
 * Rejette avec une raison :
 *   'recente'   l'enveloppe porte un numero de format superieur au notre. On
 *               ne devine pas une cryptographie : refus net, la note est
 *               sautee et comptee, et l'outil DIT qu'elle existe.
 *   'illisible' forme invalide, ou dechiffrement echoue — mauvais sel, note
 *               deplacee par le serveur, octets abimes. Les trois se valent
 *               du point de vue du lecteur : il n'a pas de quoi lire.
 */
const ouvrir = (cleChiffre, projet, indexPage, role, enveloppe) => {
    const parts = String(enveloppe == null ? '' : enveloppe).split('.');
    if (parts.length !== 3) return Promise.reject(erreurEnveloppe('illisible'));

    const marque = /^ap(\d+)$/.exec(parts[0]);
    if (!marque) return Promise.reject(erreurEnveloppe('illisible'));
    const numero = parseInt(marque[1], 10);
    if (numero > FORMAT) return Promise.reject(erreurEnveloppe('recente'));
    if (numero !== FORMAT) return Promise.reject(erreurEnveloppe('illisible'));

    // Un lecteur qui compte un nonce d'une autre longueur refuse la ligne au
    // lieu de deviner.
    if (parts[1].length !== LONGUEUR_NONCE) return Promise.reject(erreurEnveloppe('illisible'));
    const nonce = deB64url(parts[1]);
    const chiffre = deB64url(parts[2]);
    if (!nonce || nonce.length !== 12 || !chiffre) {
        return Promise.reject(erreurEnveloppe('illisible'));
    }

    return CRYPTO.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(projet, indexPage, role), tagLength: 128 },
        cleChiffre, chiffre
    ).then((clair) => {
        let objet = null;
        try {
            objet = JSON.parse(deUtf8(new Uint8Array(clair)));
        } catch (e) {
            throw erreurEnveloppe('illisible');
        }
        if (!objet || typeof objet !== 'object' || Array.isArray(objet)) {
            throw erreurEnveloppe('illisible');
        }
        return objet;
    }, () => {
        // GCM ne dit pas POURQUOI il refuse, et c'est voulu : mauvaise cle,
        // AAD differente, octet modifie, tout tombe ici.
        throw erreurEnveloppe('illisible');
    });
};
