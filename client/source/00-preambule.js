/* -- 0. Ou suis-je, quel projet, et donc ou est l'API --------------------
   Rien de ce qui suit n'est devine. Tout est DECLARE sur la balise, parce
   qu'un client servi par un CDN ne peut plus rien deduire de sa propre
   adresse : elle ne parle pas du site relu. */

const script = document.currentScript;
if (!script || !script.src) {
    /* Charge autrement qu'en <script src> : on ne devine pas une adresse
       d'API, on s'abstient. Attention, cela couvre aussi le cas
       type="module" — document.currentScript y vaut null. La balise doit
       rester une balise classique, et le LISEZMOI le dit. */
    return;
}

const donnees = script.dataset || {};
const lire = (nom) => String((donnees[nom] === undefined ? '' : donnees[nom])).trim();

/* L'adresse du serveur.

   En auto-heberge, le client est servi par le site lui-meme et l'ancienne
   deduction « ../api.php » suffit encore : elle a fonctionne pendant toute la
   vie du format 1, on ne la retire pas.

   Des que le client part en CDN, elle devient fausse — l'API n'est pas chez
   le CDN — et il faut la declarer. On ne cherche pas a rattraper : une
   adresse d'API devinee de travers enverrait les remarques nulle part. */
const ADRESSE_DECLAREE = lire('serveur');
let API = '';
if (ADRESSE_DECLAREE) {
    API = new URL(ADRESSE_DECLAREE, document.baseURI).href;
} else if (new URL(script.src).origin === location.origin) {
    API = new URL('../api.php', script.src).href;
}

/* L'identifiant du projet, engendre a l'installation (voir 70-installation).
   22 caracteres de base64url : la forme est verifiee ici, parce qu'un
   identifiant tronque par un copier-coller produirait sinon un projet vide
   cote serveur, et une page qui ne montre jamais aucune note. */
const PROJET_DECLARE = lire('projet');
const PROJET_BIEN_FORME = /^[A-Za-z0-9_-]{22}$/.test(PROJET_DECLARE);
const PROJET = PROJET_BIEN_FORME ? PROJET_DECLARE : '';

/* Le mode d'ecriture des notes A VENIR. Chiffre par defaut : c'est le seul
   defaut qui ne demande pas a l'installateur de comprendre le modele de
   menace avant d'ecrire sa premiere remarque.

   Le serveur reste l'autorite : en relais il REFUSE « clair » en 400, et
   c'est son message qui s'affiche. On ne duplique pas ici une regle qu'on ne
   peut pas verifier — le client ne sait pas s'il parle a un relais. */
const MODE = lire('mode').toLowerCase() === 'clair' ? 'clair' : 'chiffre';

/* La portee : quelles pages appartiennent au projet.

   Le prefixe de chemin est verifie ICI, avant tout, et c'est le seul endroit
   ou il puisse l'etre : le serveur ne voit pas les chemins (index aveugle,
   FORMAT.md §4). C'est donc du RANGEMENT — la balise peut rester en pied de
   toutes les pages du site sans que la documentation en ligne recolte les
   notes de la preproduction — et PAS une frontiere de securite : qui a
   l'identifiant de projet et le sel ecrit ou il veut. */
const PREFIXE_CHEMIN = lire('chemin');

/* Les origines du projet. Le vrai verrou est celui du serveur (FORMAT.md
   §6.2) ; celui-ci evite seulement de parler a un serveur qui va dire non,
   par exemple quand la balise a ete recopiee sur un autre site avec le reste
   du gabarit. Il ne protege rien : un client fabrique ne le lit pas. */
const DOMAINES = lire('domaines').split(',').map((d) => d.trim()).filter(Boolean);

/* Ecran d'installation. Il ne s'ouvre QUE si on le demande par un attribut :
   sans lui, une balise sans projet ne fait strictement rien, comme un dossier
   recopie par erreur. C'est la regle du silence, appliquee a l'installation. */
const INSTALLATION_DEMANDEE = Object.prototype.hasOwnProperty.call(donnees, 'installation');

/* Contexte de prise de note, DECLARE par le site hote, jamais devine. Un
   outil autonome ne peut pas savoir comment le site nomme sa version ; le
   site, lui, le sait. Sans ces attributs les champs restent vides : une
   version inventee enverrait chercher un defaut sur une construction qui n'a
   jamais existe.

   La taille de la fenetre est relevee A L'ENVOI et non ici : la personne a pu
   redimensionner, ou basculer son telephone, entre le chargement et la
   remarque. C'est la taille qu'elle avait sous les yeux qui compte. */
const VERSION_SITE = lire('version');
const ENVIRONNEMENT = lire('environnement');
const fenetreCourante = () =>
    String(window.innerWidth || 0) + 'x' + String(window.innerHeight || 0);

/* Fichier de libelles propre au site : DECLARE, et resolu par rapport au
   DOCUMENT et non a ce fichier-ci. Un fichier de traduction appartient au
   site relu, pas au CDN qui sert le client. */
const URL_LIBELLES_LOCAUX = lire('libelles')
    ? new URL(lire('libelles'), document.baseURI).href
    : null;

/* -- Bornes ------------------------------------------------------------
   Le SERVEUR est l'autorite : il applique les siennes et refuse en les
   nommant, et c'est SON message qui s'affiche alors. Celles-ci ne servent
   qu'a prevenir avant l'envoi et a ne pas expedier une chaine absurde.

   A ecrire franchement : en mode chiffre, le serveur ne voit plus de champs,
   seulement une enveloppe (FORMAT.md §3.6). Ces bornes-la deviennent donc une
   CONVENTION DU CLIENT, que rien ne fait respecter a un client modifie. C'est
   le prix du chiffrement de bout en bout, et il est paye volontiers : l'outil
   s'adresse a une equipe de recette, pas a un public hostile. */

const MAX_TEXTE = 4000;
const MAX_AUTEUR = 80;
const MAX_SELECTEUR = 500;
const MAX_EMPREINTE = 255;
const MAX_EXTRAIT = 160;
