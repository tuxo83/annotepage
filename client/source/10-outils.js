/* -- 1. Libelles --------------------------------------------------------
   Aucun texte destine a l'ecran n'est ecrit ailleurs que dans 15-libelles.
   Voir l'en-tete de ce fichier pour les deux facons de les remplacer. */

const espace = (window.Annotepage = window.Annotepage || {});

/* La version du paquet, posee la ou une console peut la lire. C'est le seul
   renseignement que l'outil publie sur lui-meme : quand une equipe dit « ca ne
   marche plus depuis ce matin », la premiere question est laquelle tourne. */
espace.version = VERSION_OUTIL;
espace.format = FORMAT;

const T = (cle, valeurs) => {
    const locaux = espace.libelles || {};
    const defauts = espace.libellesParDefaut || {};
    // Un libelle absent retombe sur le francais ; a defaut de francais, sur
    // la cle — qui ne devrait jamais atteindre l'ecran, mais vaut mieux
    // qu'un trou.
    let texte = locaux[cle];
    if (typeof texte !== 'string') texte = defauts[cle];
    if (typeof texte !== 'string') texte = cle;
    if (!valeurs) return texte;
    return texte.replace(/\{([a-z]+)\}/g, (brut, nom) =>
        Object.prototype.hasOwnProperty.call(valeurs, nom) ? String(valeurs[nom]) : brut
    );
};

/** « 0 note », « 1 note », « n notes » — le pluriel est un libelle. */
const compteLisible = (n, zero, une, plusieurs) =>
    n === 0 ? T(zero) : n === 1 ? T(une) : T(plusieurs, { n: n });

/* -- 2. Petits outils ---------------------------------------------------- */

const creer = (balise, classe, texte) => {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    // textContent partout, innerHTML nulle part : le texte d'une note est
    // saisi par un humain et ne doit jamais etre interprete comme du
    // balisage, quoi qu'il contienne. Cette regle ne connait pas d'exception
    // dans ce paquet, pas meme pour l'ecran d'installation.
    if (texte !== undefined && texte !== null) e.textContent = texte;
    return e;
};

const vider = (e) => {
    while (e.firstChild) e.removeChild(e.firstChild);
};

const normaliser = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

const couper = (t, max) => (t.length > max ? t.slice(0, max) : t);

/* -- 3. Octets, texte, base64url ----------------------------------------
   base64url SANS remplissage : c'est la seule forme du format (FORMAT.md
   §1.1 et §3.3). Elle traverse une chaine de requete, un corps urlencode et
   une colonne SQL sans echappement, et se recopie a la main sans qu'un « = »
   final se perde dans un courriel. */

const encodeurUtf8 = new TextEncoder();
const decodeurUtf8 = new TextDecoder();

const utf8 = (t) => encodeurUtf8.encode(String(t));
const deUtf8 = (octets) => decodeurUtf8.decode(octets);

const b64url = (source) => {
    const u = new Uint8Array(source);
    let brut = '';
    // Par paquets : String.fromCharCode.apply sur un tableau de 24000 octets
    // depasse la pile d'appels de certains navigateurs.
    for (let i = 0; i < u.length; i += 4096) {
        brut += String.fromCharCode.apply(null, u.subarray(i, i + 4096));
    }
    return btoa(brut).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Rend un Uint8Array, ou null si la chaine n'est pas du base64url.
 *
 * Rendre null plutot que lever : l'appelant est toujours en train de lire une
 * ligne venue du reseau, et une ligne illisible se compte, elle n'arrete pas
 * la lecture des autres.
 */
const deB64url = (texte) => {
    const t = String(texte).replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*$/.test(t)) return null;
    let brut = '';
    try {
        brut = atob(t + '==='.slice((t.length + 3) % 4));
    } catch (e) {
        return null;
    }
    const u = new Uint8Array(brut.length);
    for (let i = 0; i < brut.length; i += 1) u[i] = brut.charCodeAt(i);
    return u;
};

/* -- 4. Versions ---------------------------------------------------------
   Le correctif d'une note est-il DEJA EN LIGNE ?
   On compare les trois nombres de tete de la version (1.0.69-rc.abc1234) :
   ils croissent a chaque construction. Une note corrigee dans une version
   plus recente que celle servie est corrigee mais pas encore deployee, et il
   faut le dire — sinon on la masque alors que le defaut est toujours la.
   Version illisible ou absente : on considere le correctif NON deploye,
   parce qu'afficher une note de trop coute moins cher que d'en cacher une
   qui vaut encore. */

const chiffresVersion = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
    return m ? [+m[1], +m[2], +m[3]] : null;
};

const dejaDeploye = (versionCorrection) => {
    const a = chiffresVersion(versionCorrection);
    const b = chiffresVersion(VERSION_SITE);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i += 1) {
        if (b[i] !== a[i]) return b[i] > a[i];
    }
    return true;
};

/**
 * Date ISO du serveur -> heure LOCALE DU LECTEUR.
 *
 * Le serveur ecrit en UTC avec le decalage explicite ; la conversion se fait
 * ici, une seule fois, et personne n'a a se demander de quel fuseau il
 * s'agit.
 *
 * La langue est celle DU DOCUMENT (attribut lang de <html>), et a defaut
 * celle du navigateur : sur une page francaise lue depuis un navigateur
 * anglais, « 20 aout 2026 » est plus juste que « Aug 20, 2026 ».
 */
const dateLisible = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return T('date.inconnue');
    const langue = (document.documentElement.getAttribute('lang') || '').trim();
    try {
        return d.toLocaleString(langue || undefined,
            { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
        try {
            return d.toLocaleString();
        } catch (e2) {
            return iso;
        }
    }
};
