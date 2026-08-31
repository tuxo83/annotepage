/* -- 7. Etat, memoire du navigateur, portee ------------------------------ */

let hote = null;            // l'unique element ajoute au site
let racine = null;          // son shadow root
let ui = null;              // les elements de l'interface, une fois batie
let mode = false;           // mode annotation actif ?
let notes = [];             // notes de la page, telles que le serveur les dit
let ancrees = [];           // { element, notes[] } : les notes retrouvees
let orphelines = [];        // notes dont l'element n'a pas ete retrouve
let historiqueOuvert = false;   // les notes corrigees ET deployees sont repliees
let cible = null;           // element en cours d'annotation
let survole = null;         // element sous le pointeur
let panneEnCours = null;    // { titre, detail } affiche dans le panneau
let auteur = '';            // lu au demarrage : voir 90-demarrage
let minuterie = null;
let rafDemande = false;

/* Ce qu'on n'a PAS su lire au dernier chargement. On le compte pour pouvoir
   le dire : une note sautee en silence est une remarque qui disparait. */
let sautees = { recentes: 0, illisibles: 0, inconnues: 0 };

/* Le sel de ce projet, et ce qui en descend. « cles » reste null tant que le
   sel n'est pas connu : aucune requete, aucun dechiffrement ne part avant. */
let selTexte = '';
let cles = null;            // { identifiant, cleChiffre, cleIndex }
let INDEX_PAGE = '';        // index aveugle de la page courante

const dansOutil = (n) => !!(hote && n && (n === hote || hote.contains(n)));

/* -- La memoire du navigateur --------------------------------------------
   Les try/catch n'entourent QUE l'acces au stockage, parce que c'est la seule
   chose qui ait le droit d'echouer ici : navigation privee, ou stockage
   refuse par une politique du navigateur. Tout elargir serait transformer une
   faute de programmation en panne muette, et donc introuvable. */

// Confort par navigateur, pas une identite : personne n'est authentifie, et
// le nom sert a savoir a qui parler, pas a prouver qui l'on est.
const CLE_AUTEUR = 'annotepage/auteur';

/* Le sel est range SOUS L'IDENTIFIANT DU PROJET. Ce nommage n'est pas
   cosmetique : deux projets relus depuis le meme navigateur ne doivent pas
   s'ecraser l'un l'autre.

   Consequence desagreable, a dire : localStorage est PAR ORIGINE. Le jour ou
   la preproduction devient la production, chaque relecteur doit recoller le
   sel une fois sur le nouveau domaine. Les notes, elles, ne bougent pas — et
   c'est exactement ce que la regle « le domaine n'entre pas dans la cle »
   achete. */
const cleSel = (projet) => 'annotepage/sel/' + projet;

const lireSel = (projet) => {
    try {
        return String(window.localStorage.getItem(cleSel(projet)) || '').trim();
    } catch (e) {
        // Sans stockage, le sel sera redemande a chaque visite : c'est moins
        // confortable, ce n'est pas une panne.
        return '';
    }
};

const ecrireSel = (projet, texte) => {
    try {
        window.localStorage.setItem(cleSel(projet), texte);
        return true;
    } catch (e) {
        // On rend faux pour que l'ecran puisse le DIRE : un sel qui n'est pas
        // retenu se recollera a chaque page, et il vaut mieux le savoir tout
        // de suite qu'a la troisieme fois.
        return false;
    }
};

const oublierSel = (projet) => {
    try {
        window.localStorage.removeItem(cleSel(projet));
    } catch (e) {
        // Rien a faire : il n'y avait deja pas de stockage.
    }
};

function lireAuteur() {
    let brut = '';
    try {
        brut = window.localStorage.getItem(CLE_AUTEUR) || '';
    } catch (e) {
        return '';
    }
    return normaliser(brut);
}

function ecrireAuteur(valeur) {
    auteur = valeur;
    try {
        window.localStorage.setItem(CLE_AUTEUR, valeur);
    } catch (e) {
        // Sans consequence : seule la memoire du nom est perdue.
    }
}

/* -- La portee -----------------------------------------------------------
   Deux verifications, et aucune des deux n'est une securite. Elles evitent
   qu'une balise laissee dans un gabarit commun recolte des notes la ou le
   projet ne va pas, et qu'un client parle a un serveur qui va dire non. La
   frontiere, la vraie, est le verrou de domaine du serveur (FORMAT.md §6.2),
   qui n'est lui-meme qu'une mesure anti-abus. */

const dansLaPortee = () => {
    if (DOMAINES.length && DOMAINES.indexOf(location.origin) === -1) return false;
    if (PREFIXE_CHEMIN && cheminDePage().indexOf(PREFIXE_CHEMIN) !== 0) return false;
    return true;
};
