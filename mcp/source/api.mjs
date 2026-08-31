/* api.mjs — LES CINQ ADRESSES, VUES DE CE COTE-CI.
 *
 * Le serveur PHP est le meme code deploye a deux endroits, et ce fichier ne
 * fait pas la difference : c'est une URL, cinq actions, et un contrat de
 * reponse. Toute la connaissance du deploiement tient dans un entete Origin
 * facultatif.
 *
 * DEUX CHOSES A NE PAS DEFAIRE :
 *
 *  1. LE CORPS DES ECRITURES RESTE EN x-www-form-urlencoded. Passer au JSON
 *     serait plus propre a lire et transformerait chaque ecriture en requete
 *     preliminaire OPTIONS cote navigateur. Le client et ce paquet parlent au
 *     MEME point d'entree : un corps JSON accepte ici finirait par etre
 *     accepte la-bas, et le relais y gagnerait une machinerie de OPTIONS pour
 *     rien.
 *
 *  2. LE MESSAGE D'ERREUR DU SERVEUR EST REMONTE TEL QUEL. Il est redige pour
 *     un humain — « la base est injoignable », « l'enveloppe fait 24 512
 *     caracteres, la limite est de 24 000 ». Le remplacer par « erreur 400 »
 *     jette la seule information utile. C'est deja la regle du client.
 */

export class ErreurApi extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

const adresse = (api, parametres) => {
    const url = new URL(api);
    for (const [cle, valeur] of Object.entries(parametres)) {
        if (valeur !== undefined && valeur !== null && valeur !== '') {
            url.searchParams.set(cle, String(valeur));
        }
    }
    return url.toString();
};

const entetes = (projet, supplement) => {
    const tous = Object.assign({
        /* L'agent nomme l'outil et sa version, sans jamais nommer le projet.
           Un operateur de relais qui lit ses journaux doit pouvoir distinguer
           un assistant d'un navigateur : c'est son quota et sa bande
           passante. */
        'User-Agent': 'annotepage-mcp',
        'Accept': 'text/plain, application/json',
    }, supplement || {});
    if (projet.origine) tous.Origin = projet.origine;
    return tous;
};

/**
 * Une requete, et la lecture de son resultat.
 *
 * Le contrat de reponse est celui de api.php : 200 + JSON, 200 + JSON avec
 * actif=false, 4xx/5xx + text/plain redige pour un humain, ou tout le reste
 * quand PHP n'est pas execute.
 */
const demander = async (projet, url, options) => {
    let reponse;
    try {
        reponse = await fetch(url, options);
    } catch (e) {
        throw new ErreurApi(
            'Le serveur ' + new URL(projet.api).origin + " n'a pas repondu : "
            + (e && e.message ? e.message : String(e)), 0);
    }

    const type = String(reponse.headers.get('content-type') || '');
    const corps = await reponse.text();

    if (!reponse.ok) {
        /* 429 porte Retry-After ; le recopier evite a l'assistant de
           redemander tout de suite et d'user le quota qu'on vient de heurter. */
        const attente = reponse.headers.get('retry-after');
        throw new ErreurApi(
            (corps.trim() !== '' ? corps.trim()
                : 'Le serveur a repondu ' + reponse.status + ' sans rien expliquer.')
            + (attente ? '\nReessayez dans ' + attente + ' secondes.' : ''),
            reponse.status);
    }

    if (type.includes('application/json')) {
        let objet;
        try {
            objet = JSON.parse(corps);
        } catch (e) {
            throw new ErreurApi(
                "Le serveur a annonce du JSON et n'en a pas envoye. "
                + "PHP n'est peut-etre pas execute a cette adresse.", 200);
        }
        if (objet && objet.ok === false && objet.actif === false) {
            /* Le silence du contrat : l'outil est depose mais pas configure,
               ou le projet n'est pas declare. Le client se retire sans un mot ;
               nous, on parle — personne n'appelle ce paquet par accident. */
            throw new ErreurApi(
                (objet.message ? objet.message + '\n' : '')
                + "Ce serveur ne connait pas ce projet, ou annotepage n'y est pas "
                + 'configure.\nIdentifiant demande : ' + projet.identifiant
                + '\nVerifiez ?action=diagnostic sur le serveur.', 200);
        }
        return { json: objet, texte: corps };
    }

    return { json: null, texte: corps };
};

/** GET ?action=texte — l'export. C'est notre unique source de lecture. */
export const lireExportBrut = async (projet, signal) => {
    const url = adresse(projet.api, { action: 'texte', projet: projet.identifiant });
    const { texte } = await demander(projet, url, {
        method: 'GET', headers: entetes(projet), signal,
        redirect: 'error',
    });
    return texte;
};

/** GET ?action=diagnostic — l'etat du serveur. Aucun projet, aucune note. */
export const lireDiagnostic = async (projet, signal) => {
    const url = adresse(projet.api, { action: 'diagnostic' });
    const { texte } = await demander(projet, url, {
        method: 'GET', headers: entetes(projet), signal, redirect: 'error',
    });
    return texte;
};

const poster = async (projet, action, champs, signal) => {
    const corps = new URLSearchParams();
    corps.set('projet', projet.identifiant);
    for (const [cle, valeur] of Object.entries(champs)) {
        if (valeur !== undefined && valeur !== null) corps.set(cle, String(valeur));
    }
    const url = adresse(projet.api, { action });
    const { json } = await demander(projet, url, {
        method: 'POST',
        headers: entetes(projet, { 'Content-Type': 'application/x-www-form-urlencoded' }),
        body: corps.toString(),
        signal,
        /* Une redirection sur une ecriture perd le corps en POST et la rejoue
           en GET : le serveur refuserait, ou pire, l'accepterait ailleurs. */
        redirect: 'error',
    });
    if (!json || json.ok !== true) {
        throw new ErreurApi(
            "Le serveur a accepte la requete sans confirmer l'ecriture. "
            + "La note n'a peut-etre pas ete enregistree.", 200);
    }
    return json;
};

/** POST ?action=ajout — une note nouvelle, ou une reponse. */
export const ajouter = (projet, champs, signal) => poster(projet, 'ajout', champs, signal);

/** POST ?action=resoudre — marquer corrigee, ou rouvrir. */
export const resoudre = (projet, champs, signal) => poster(projet, 'resoudre', champs, signal);

/**
 * Un cache de quelques secondes sur l'export, par projet.
 *
 * FORMAT.md §8.5 laisse ouverte la pagination de ?action=texte : l'adresse
 * rend TOUT. Un assistant qui liste les notes ouvertes puis en lit trois
 * ferait quatre exports complets d'affilee, pour un contenu identique.
 *
 * La duree est courte EXPRES, et toute ecriture le vide : une note qu'on
 * vient d'ecrire doit reparaitre immediatement, sans quoi l'assistant la
 * reecrit en croyant avoir echoue — et rien ne s'efface dans cet outil.
 */
const cache = new Map();
export const DUREE_CACHE = 10 * 1000;

export const lireExportCache = async (projet, signal) => {
    const range = cache.get(projet.identifiant);
    if (range && Date.now() - range.quand < DUREE_CACHE) return range.texte;
    const texte = await lireExportBrut(projet, signal);
    cache.set(projet.identifiant, { quand: Date.now(), texte });
    return texte;
};

export const oublierCache = (projet) => { cache.delete(projet.identifiant); };

export const dureeCacheLisible = () => Math.round(DUREE_CACHE / 1000) + ' secondes';

