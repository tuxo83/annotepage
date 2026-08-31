/* ============================================================================
   annotepage — la couche d'annotation, cote navigateur.

   Version du paquet : 2.0.0
   Version de format : 2   (voir FORMAT.md)
   Licence : MIT

   FICHIER ENGENDRE — ne pas le modifier a la main. Les sources sont dans
   source/, et « npm run build » refait ce fichier. Une correction portee ici
   serait perdue a la construction suivante, et l'empreinte SRI publiee ne
   correspondrait plus a rien.
   ============================================================================ */

(function () {
    'use strict';

    /* Injectes par la construction : ils viennent de package.json et de
       source/styles.css, pour qu'aucune valeur ne soit ecrite a deux
       endroits et ne puisse donc diverger. */
    const VERSION_OUTIL = "2.0.0";
    const FORMAT = 2;
    const STYLES = "/* ============================================================================\n   styles.css — STYLES DE L'OUTIL, ET D'AUCUN AUTRE ELEMENT.\n\n   Cette feuille est INLINE dans le fichier servi par la construction, puis\n   posee dans le shadow root de l'outil — en feuille construite quand le\n   navigateur sait le faire, en <style> sinon. Elle etait chargee par un\n   <link> dans l'outil d'origine ; le passage au CDN sous SRI l'a fait rentrer\n   dans le fichier, pour n'avoir qu'une seule empreinte a tenir a jour. Le\n   confinement, lui, n'a pas change et reste double :\n\n     - de l'outil vers le site : aucune regle d'ici ne peut atteindre un\n       element du site hote, le navigateur s'en charge. C'est ce qui rend\n       l'affirmation « la couche ne touche a rien » verifiable plutot que\n       promise ;\n     - du site vers l'outil : aucune regle du site ne peut atteindre un\n       element d'ici. Une refonte de la feuille de style du site ne peut donc\n       pas deformer l'outil, ni l'inverse.\n\n   Le prefixe « ap- » sur toutes les classes est la troisieme securite : le\n   jour ou quelqu'un chargerait ces styles SANS shadow root — par erreur, ou\n   pour deboguer — rien ne repondrait a un selecteur du site.\n\n   AUCUNE REGLE NE CIBLE html, body, * NI UN SELECTEUR DU SITE. C'est la\n   seule interdiction absolue de ce fichier.\n\n   COULEURS : l'outil a sa PROPRE palette, definie sur la racine du shadow.\n   Il ne lit ni les variables du site, ni son attribut de theme : il n'a\n   aucune raison de savoir comment le site nomme ses couleurs, et il doit\n   rester lisible sur un site clair comme sur un site sombre. La bascule se\n   fait sur la preference du systeme, seule information dont l'outil dispose\n   sans rien demander a personne.\n   ============================================================================ */\n\n\n:host {\n    --ap-fond: #ffffff;\n    --ap-fond-doux: #f4f6f8;\n    --ap-fond-appui: #e9edf2;\n    --ap-texte: #1a1d21;\n    --ap-texte-doux: #5b6570;\n    --ap-bord: #d5dbe2;\n    --ap-accent: #2f6fed;\n    --ap-accent-sombre: #1d55c8;\n    --ap-accent-texte: #ffffff;\n    --ap-accent-voile: rgba(47, 111, 237, 0.14);\n    --ap-alerte-fond: #fdeceb;\n    --ap-alerte-bord: #e3a9a4;\n    --ap-alerte-texte: #8a1f16;\n    --ap-ombre: 0 6px 24px rgba(16, 24, 40, 0.18);\n    --ap-rayon: 10px;\n    --ap-police: system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\",\n                  Arial, sans-serif;\n}\n\n@media (prefers-color-scheme: dark) {\n    :host {\n        --ap-fond: #1d2126;\n        --ap-fond-doux: #262b32;\n        --ap-fond-appui: #323942;\n        --ap-texte: #e9ecf0;\n        --ap-texte-doux: #a4adb8;\n        --ap-bord: #3a424c;\n        --ap-accent: #6d9bff;\n        --ap-accent-sombre: #8fb4ff;\n        --ap-accent-texte: #10151c;\n        --ap-accent-voile: rgba(109, 155, 255, 0.18);\n        --ap-alerte-fond: #3a1f1c;\n        --ap-alerte-bord: #7c3a33;\n        --ap-alerte-texte: #ffb9b1;\n        --ap-ombre: 0 6px 24px rgba(0, 0, 0, 0.55);\n    }\n}\n\n/* ----------------------------------------------------------------------------\n   La couche.\n\n   Elle occupe le viewport et ne recoit AUCUN clic : c'est ce qui permet a la\n   page de se comporter exactement comme d'habitude tant que l'outil n'est pas\n   en mode annotation. Chaque widget re-active les clics pour lui seul.\n   ---------------------------------------------------------------------------- */\n\n.ap-couche {\n    position: absolute;\n    inset: 0;\n    pointer-events: none;\n    font-family: var(--ap-police);\n    font-size: 14px;\n    line-height: 1.45;\n    color: var(--ap-texte);\n    text-align: left;\n    -webkit-font-smoothing: antialiased;\n}\n\n.ap-couche button,\n.ap-couche input,\n.ap-couche textarea {\n    font-family: inherit;\n    font-size: inherit;\n    line-height: inherit;\n    color: inherit;\n    margin: 0;\n    box-sizing: border-box;\n}\n\n/* ----------------------------------------------------------------------------\n   Le bouton : la seule chose visible quand l'outil est au repos.\n   ---------------------------------------------------------------------------- */\n\n.ap-bouton {\n    position: fixed;\n    right: 16px;\n    bottom: 16px;\n    display: inline-flex;\n    align-items: center;\n    gap: 8px;\n    padding: 9px 14px;\n    border: 1px solid var(--ap-bord);\n    border-radius: 999px;\n    background: var(--ap-fond);\n    color: var(--ap-texte);\n    box-shadow: var(--ap-ombre);\n    cursor: pointer;\n    pointer-events: auto;\n    opacity: 0.92;\n    transition: opacity 0.15s ease, transform 0.15s ease;\n}\n\n.ap-bouton:hover,\n.ap-bouton:focus-visible {\n    opacity: 1;\n    transform: translateY(-1px);\n}\n\n.ap-bouton:focus-visible {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 2px;\n}\n\n.ap-bouton[aria-pressed=\"true\"] {\n    background: var(--ap-accent);\n    border-color: var(--ap-accent);\n    color: var(--ap-accent-texte);\n    opacity: 1;\n}\n\n.ap-bouton-pastille {\n    display: inline-block;\n    width: 8px;\n    height: 8px;\n    border-radius: 50%;\n    background: var(--ap-accent);\n    flex: none;\n}\n\n.ap-bouton[aria-pressed=\"true\"] .ap-bouton-pastille {\n    background: var(--ap-accent-texte);\n}\n\n.ap-bouton-compte {\n    padding: 1px 7px;\n    border-radius: 999px;\n    background: var(--ap-fond-appui);\n    color: var(--ap-texte-doux);\n    font-size: 12px;\n}\n\n.ap-bouton[aria-pressed=\"true\"] .ap-bouton-compte {\n    background: rgba(255, 255, 255, 0.22);\n    color: var(--ap-accent-texte);\n}\n\n/* ----------------------------------------------------------------------------\n   La surbrillance de designation.\n\n   Elle est DESSINEE ICI, a partir des coordonnees de l'element vise. Rien\n   n'est pose sur l'element lui-meme : ni classe, ni attribut, ni style. Le\n   site ne peut donc pas bouger d'un pixel du fait de la designation.\n   ---------------------------------------------------------------------------- */\n\n.ap-surbrillance {\n    position: fixed;\n    border: 2px solid var(--ap-accent);\n    border-radius: 3px;\n    background: var(--ap-accent-voile);\n    pointer-events: none;\n    display: none;\n}\n\n.ap-surbrillance-etiquette {\n    position: fixed;\n    max-width: 320px;\n    padding: 4px 8px;\n    border-radius: 6px;\n    background: var(--ap-accent);\n    color: var(--ap-accent-texte);\n    font-size: 12px;\n    white-space: nowrap;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    pointer-events: none;\n    display: none;\n    box-shadow: var(--ap-ombre);\n}\n\n/* ----------------------------------------------------------------------------\n   Les marqueurs : « il y a deja des notes ici ».\n   ---------------------------------------------------------------------------- */\n\n.ap-marqueur {\n    position: fixed;\n    min-width: 22px;\n    height: 22px;\n    padding: 0 6px;\n    border: 2px solid var(--ap-fond);\n    border-radius: 999px;\n    background: var(--ap-accent);\n    color: var(--ap-accent-texte);\n    font-size: 12px;\n    font-weight: 700;\n    line-height: 18px;\n    text-align: center;\n    cursor: pointer;\n    pointer-events: auto;\n    box-shadow: var(--ap-ombre);\n}\n\n.ap-marqueur:focus-visible {\n    outline: 2px solid var(--ap-accent-sombre);\n    outline-offset: 2px;\n}\n\n/* ----------------------------------------------------------------------------\n   Le panneau.\n   ---------------------------------------------------------------------------- */\n\n.ap-panneau {\n    position: fixed;\n    top: 12px;\n    right: 12px;\n    bottom: 72px;\n    width: 360px;\n    max-width: calc(100vw - 24px);\n    display: none;\n    flex-direction: column;\n    border: 1px solid var(--ap-bord);\n    border-radius: var(--ap-rayon);\n    background: var(--ap-fond);\n    box-shadow: var(--ap-ombre);\n    pointer-events: auto;\n    overflow: hidden;\n}\n\n.ap-panneau.ap-ouvert {\n    display: flex;\n}\n\n.ap-panneau-entete {\n    display: flex;\n    align-items: baseline;\n    gap: 8px;\n    padding: 12px 14px;\n    border-bottom: 1px solid var(--ap-bord);\n    background: var(--ap-fond-doux);\n}\n\n.ap-panneau-titre {\n    font-size: 15px;\n    font-weight: 600;\n    flex: 1 1 auto;\n}\n\n.ap-panneau-consigne {\n    padding: 10px 14px;\n    border-bottom: 1px solid var(--ap-bord);\n    color: var(--ap-texte-doux);\n    font-size: 13px;\n}\n\n.ap-panneau-corps {\n    flex: 1 1 auto;\n    overflow-y: auto;\n    overscroll-behavior: contain;\n    padding: 4px 14px 14px;\n}\n\n.ap-panneau-pied {\n    padding: 8px 14px;\n    border-top: 1px solid var(--ap-bord);\n    background: var(--ap-fond-doux);\n    color: var(--ap-texte-doux);\n    font-size: 12px;\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n\n.ap-section-titre {\n    margin: 14px 0 6px;\n    color: var(--ap-texte-doux);\n    font-size: 12px;\n    font-weight: 600;\n    text-transform: uppercase;\n    letter-spacing: 0.04em;\n}\n\n.ap-section-aide {\n    margin: 0 0 8px;\n    color: var(--ap-texte-doux);\n    font-size: 12px;\n}\n\n.ap-vide {\n    margin: 16px 0;\n    color: var(--ap-texte-doux);\n}\n\n/* ----------------------------------------------------------------------------\n   Une note, et ses reponses.\n   ---------------------------------------------------------------------------- */\n\n.ap-note {\n    margin: 8px 0;\n    padding: 10px 12px;\n    border: 1px solid var(--ap-bord);\n    border-radius: var(--ap-rayon);\n    background: var(--ap-fond);\n}\n\n.ap-note.ap-orpheline {\n    background: var(--ap-fond-doux);\n}\n\n.ap-note.ap-visee {\n    border-color: var(--ap-accent);\n    box-shadow: 0 0 0 3px var(--ap-accent-voile);\n}\n\n.ap-note-entete {\n    display: flex;\n    align-items: baseline;\n    gap: 8px;\n    flex-wrap: wrap;\n}\n\n.ap-note-auteur {\n    font-weight: 600;\n}\n\n.ap-note-date {\n    color: var(--ap-texte-doux);\n    font-size: 12px;\n}\n\n.ap-note-cible {\n    margin: 4px 0 0;\n    color: var(--ap-texte-doux);\n    font-size: 12px;\n    font-style: italic;\n    overflow-wrap: anywhere;\n}\n\n.ap-note-texte {\n    margin: 6px 0 0;\n    white-space: pre-wrap;\n    overflow-wrap: anywhere;\n}\n\n.ap-note-actions {\n    margin-top: 8px;\n    display: flex;\n    gap: 8px;\n    flex-wrap: wrap;\n}\n\n.ap-reponses {\n    margin: 8px 0 0;\n    padding-left: 10px;\n    border-left: 2px solid var(--ap-bord);\n}\n\n.ap-reponse {\n    margin: 8px 0 0;\n}\n\n/* ----------------------------------------------------------------------------\n   Le formulaire, ancre pres de l'element designe.\n   ---------------------------------------------------------------------------- */\n\n.ap-fiche {\n    position: fixed;\n    width: 340px;\n    max-width: calc(100vw - 24px);\n    display: none;\n    flex-direction: column;\n    gap: 8px;\n    padding: 14px;\n    border: 1px solid var(--ap-bord);\n    border-radius: var(--ap-rayon);\n    background: var(--ap-fond);\n    box-shadow: var(--ap-ombre);\n    pointer-events: auto;\n}\n\n.ap-fiche.ap-ouvert {\n    display: flex;\n}\n\n.ap-fiche-titre {\n    font-size: 15px;\n    font-weight: 600;\n}\n\n.ap-fiche-cible {\n    color: var(--ap-texte-doux);\n    font-size: 12px;\n    font-style: italic;\n    overflow-wrap: anywhere;\n}\n\n.ap-etiquette {\n    display: block;\n    margin-bottom: 3px;\n    font-size: 12px;\n    font-weight: 600;\n    color: var(--ap-texte-doux);\n}\n\n.ap-aide {\n    margin: 3px 0 0;\n    font-size: 12px;\n    color: var(--ap-texte-doux);\n}\n\n.ap-champ,\n.ap-zone {\n    width: 100%;\n    padding: 8px 10px;\n    border: 1px solid var(--ap-bord);\n    border-radius: 8px;\n    background: var(--ap-fond-doux);\n    color: var(--ap-texte);\n}\n\n.ap-champ:focus,\n.ap-zone:focus {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 1px;\n}\n\n.ap-zone {\n    min-height: 92px;\n    resize: vertical;\n}\n\n.ap-actions {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    flex-wrap: wrap;\n}\n\n.ap-compteur {\n    margin-left: auto;\n    font-size: 12px;\n    color: var(--ap-texte-doux);\n}\n\n/* ----------------------------------------------------------------------------\n   Boutons.\n   ---------------------------------------------------------------------------- */\n\n.ap-primaire,\n.ap-secondaire,\n.ap-lien {\n    border-radius: 8px;\n    cursor: pointer;\n    pointer-events: auto;\n}\n\n.ap-primaire {\n    padding: 8px 14px;\n    border: 1px solid var(--ap-accent);\n    background: var(--ap-accent);\n    color: var(--ap-accent-texte);\n    font-weight: 600;\n}\n\n.ap-primaire:hover {\n    background: var(--ap-accent-sombre);\n    border-color: var(--ap-accent-sombre);\n}\n\n.ap-secondaire {\n    padding: 8px 14px;\n    border: 1px solid var(--ap-bord);\n    background: var(--ap-fond);\n    color: var(--ap-texte);\n}\n\n.ap-secondaire:hover {\n    background: var(--ap-fond-appui);\n}\n\n.ap-lien {\n    padding: 2px 4px;\n    border: 0;\n    background: none;\n    color: var(--ap-accent);\n    text-decoration: underline;\n    font-size: 13px;\n}\n\n.ap-primaire:disabled,\n.ap-secondaire:disabled,\n.ap-lien:disabled {\n    opacity: 0.6;\n    cursor: default;\n}\n\n.ap-primaire:focus-visible,\n.ap-secondaire:focus-visible,\n.ap-lien:focus-visible {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 2px;\n}\n\n/* ----------------------------------------------------------------------------\n   Les pannes.\n\n   Elles sont ROUGES, en haut du bloc concerne, et portent le message rendu\n   par le serveur tel quel : c'est ainsi qu'une equipe non technique apprend\n   que sa remarque n'est pas enregistree, au lieu de le croire.\n   ---------------------------------------------------------------------------- */\n\n.ap-erreur {\n    margin: 8px 0;\n    padding: 10px 12px;\n    border: 1px solid var(--ap-alerte-bord);\n    border-radius: var(--ap-rayon);\n    background: var(--ap-alerte-fond);\n    color: var(--ap-alerte-texte);\n}\n\n.ap-erreur-titre {\n    font-weight: 700;\n    margin-bottom: 4px;\n}\n\n.ap-erreur-detail {\n    margin: 6px 0 0;\n    white-space: pre-wrap;\n    overflow-wrap: anywhere;\n    font-size: 13px;\n}\n\n.ap-erreur .ap-lien {\n    color: var(--ap-alerte-texte);\n}\n\n/* ----------------------------------------------------------------------------\n   Etroit : le panneau prend toute la largeur, le formulaire aussi.\n   ---------------------------------------------------------------------------- */\n\n/* ----------------------------------------------------------------------------\n   Etroit.\n\n   DEFAUT CONSTATE a 375 px de large : un panneau occupant toute la hauteur\n   recouvre la page entiere, et plus aucun element ne peut etre designe — tout\n   clic atterrit sur le panneau. Il devient donc un bandeau bas, qui laisse\n   libre la moitie haute du viewport ; on y fait defiler la page pour amener\n   l'element voulu. Le formulaire, lui, masque le panneau le temps de la\n   saisie (voir notes.js) : sur un ecran de cette taille, ecrire et lire la\n   liste en meme temps n'est pas tenable.\n   ---------------------------------------------------------------------------- */\n\n/* Sur ecran etroit, le panneau devient un bandeau bas et le formulaire prend\n   toute la largeur.\n\n   LE PLAFOND DE LARGEUR EST CONSERVE, et c'est un defaut mesure : « left: 8 ;\n   right: 8 » dimensionne l'element sur son BLOC CONTENEUR, que le debordement\n   horizontal du site hote peut rendre plus large que la fenetre visible.\n   Mesure, en emulation mobile a 390 px : le site deborde a 407 px (avec comme\n   sans l'outil), le panneau sortait a 391 px de large a partir de 8, soit\n   9 px hors de l'ecran. « 100vw » vaut la fenetre, pas le bloc conteneur :\n   le plafond est donc sans effet quand le site ne deborde pas, et rattrape la\n   largeur quand il deborde. */\n@media (max-width: 560px) {\n    .ap-panneau {\n        top: auto;\n        right: 8px;\n        left: 8px;\n        bottom: 66px;\n        height: 52vh;\n        width: auto;\n        max-width: calc(100vw - 16px);\n    }\n\n    .ap-fiche {\n        left: 8px;\n        right: 8px;\n        width: auto;\n        max-width: calc(100vw - 16px);\n    }\n}\n\n@media (prefers-reduced-motion: reduce) {\n    .ap-bouton {\n        transition: none;\n    }\n}\n\n/* La panne se voit sans ouvrir le panneau : la pastille du bouton change de\n   couleur. Une equipe qui ne clique pas doit pouvoir constater que quelque\n   chose ne va pas. */\n.ap-bouton.ap-panne .ap-bouton-pastille {\n    background: var(--ap-alerte-texte);\n}\n\n.ap-bouton.ap-panne {\n    border-color: var(--ap-alerte-bord);\n}\n\n/* Rappel de signature, dans le formulaire de note.\n   Le nom etait indique en pied de panneau seulement : invisible au moment ou\n   l'on ecrit. Un utilisateur a signale ne pas savoir sous quel nom il ecrivait. */\n.ap-fiche-signature {\n    display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;\n    margin: 0 0 .6rem; font-size: .85rem; opacity: .8;\n}\n\n/* Etat de correction, dit sur la carte.\n   Deux cas qu'il ne faut PAS confondre : corrigee et en ligne, corrigee mais\n   pas encore deployee. Le second garde le defaut a l'ecran du relecteur ; le\n   masquer ou l'annoncer comme regle lui ferait perdre confiance dans l'outil. */\n.ap-marque-etat {\n    display: inline-block; margin: 0 0 .5rem;\n    padding: .15rem .55rem; border-radius: 4px;\n    font-size: .75rem; font-weight: 600; letter-spacing: .02em;\n}\n.ap-note.ap-corrigee { opacity: .72; }\n.ap-note.ap-corrigee .ap-marque-etat {\n    color: #0f7a52; background: rgba(16, 185, 129, .14);\n}\n.ap-note.ap-corrigee-attente .ap-marque-etat {\n    color: #8a5a00; background: rgba(245, 158, 11, .16);\n}\n/* Le bloc « c'est corrige » / « rouvrir », ouvert sous la carte. Meme forme\n   que le bloc de reponse : c'est le meme geste, on repond a une remarque. */\n.ap-resoudre,\n.ap-repondre {\n    margin-top: .6rem;\n    padding-top: .6rem;\n    border-top: 1px solid var(--ap-bord);\n}\n\n.ap-historique-bascule {\n    display: block; width: 100%; margin: 1rem 0 .25rem;\n    padding: .5rem .75rem; border: 1px dashed currentColor; border-radius: 6px;\n    background: none; color: inherit; font: inherit; opacity: .7; cursor: pointer;\n}\n.ap-historique-bascule:hover { opacity: 1; }\n\n\n/* ----------------------------------------------------------------------------\n   L'installation et le collage du sel.\n\n   Ce sont les seuls ecrans ou l'on recopie quelque chose a la main. Tout y\n   est SELECTIONNABLE et en chasse fixe : un sel de 43 caracteres recopie de\n   travers ne se rattrape pas, et rien n'aide moins qu'une police qui confond\n   le I, le l et le 1.\n   ---------------------------------------------------------------------------- */\n\n.ap-panneau-large {\n    width: 560px;\n}\n\n.ap-copie {\n    display: flex;\n    align-items: flex-start;\n    gap: 8px;\n    margin: 0 0 12px;\n}\n\n.ap-code {\n    flex: 1 1 auto;\n    width: 100%;\n    padding: 8px 10px;\n    border: 1px solid var(--ap-bord);\n    border-radius: 8px;\n    background: var(--ap-fond-doux);\n    color: var(--ap-texte);\n    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\",\n                 monospace;\n    font-size: 12.5px;\n    line-height: 1.5;\n    resize: vertical;\n    white-space: pre;\n    overflow-x: auto;\n}\n\n.ap-code:focus-visible {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 1px;\n}\n\n@media (max-width: 560px) {\n    .ap-panneau-large {\n        width: auto;\n    }\n\n    .ap-copie {\n        flex-direction: column;\n    }\n}\n";

    /* ==== 00-preambule.js ==== */

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

    /* ==== 10-outils.js ==== */

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

    /* ==== 15-libelles.js ==== */

    /* -- 5. TOUS LES TEXTES AFFICHES PAR L'OUTIL -----------------------------

       Le francais est la langue par defaut, et c'est le seul endroit ou elle
       s'ecrit : aucun autre fichier de ce paquet ne contient une phrase destinee
       a l'ecran. Traduire l'outil, ou simplement changer un mot qui ne convient
       pas a une equipe, ne demande donc jamais de toucher au code.

       DEUX FACONS DE REMPLACER UN LIBELLE, par ordre de priorite :

         1. un objet defini AVANT le chargement du client :

                <script>
                  window.Annotepage = { libelles: {
                    'bouton.ouvrir': 'Annotate this page'
                  } };
                </script>
                <script src="https://.../annotepage.js" ... defer></script>

         2. un fichier voisin, DECLARE sur la balise :

                <script src="https://.../annotepage.js"
                        data-libelles="/libelles-locaux.js" defer></script>

            Ce fichier ecrit, comme celui-ci, dans window.Annotepage : il pose
            « libelles » (ses propres textes) et non « libellesParDefaut ». Il est
            resolu par rapport au DOCUMENT, pas au CDN : une traduction appartient
            au site relu.

       Pourquoi le fichier local est DECLARE et non cherche : aller voir « s'il
       est present » suppose une requete qui, le plus souvent, repond 404 — et le
       navigateur journalise lui-meme cet echec dans la console de CHAQUE page.

       UN LIBELLE ABSENT RETOMBE SUR LE FRANCAIS. Une traduction partielle est
       donc utilisable telle quelle.

       FORME : un objet PLAT. Les cles sont pointees pour se lire, pas pour etre
       imbriquees — « bouton.ouvrir » est une chaine, pas un chemin.

       { ... } dans une valeur est un emplacement remplace a l'affichage
       ({n}, {max}, {nom}, {extrait}, {code}). Un emplacement inconnu est laisse
       tel quel. */

    espace.libellesParDefaut = {

        /* -- Le bouton, seule trace de l'outil quand il est au repos ------- */
        'bouton.ouvrir': 'Annoter la page',
        'bouton.fermer': 'Terminer',
        'bouton.aide': 'Écrire et lire les remarques sur cette page',
        'bouton.notes_zero': '',
        'bouton.notes_une': '1 note',
        'bouton.notes_n': '{n} notes',

        /* -- Le panneau ---------------------------------------------------- */
        'panneau.titre': 'Notes de relecture',
        'panneau.fermer': 'Fermer',
        'panneau.consigne': 'Cliquez sur un élément de la page pour écrire une remarque à son sujet.',
        'panneau.echap': 'Touche Échap pour arrêter.',
        'panneau.vide': 'Personne n’a encore écrit de note sur cette page.',
        'panneau.section_page': 'Sur cette page',
        'panneau.actualiser': 'Actualiser',

        /* -- Les notes dont l'element ne se retrouve plus ------------------- */
        'orphelines.titre': 'Notes dont l’élément a changé',
        'orphelines.aide':
            'Ces remarques portaient sur un élément qui n’existe plus sous la même '
            + 'forme. Elles sont conservées telles quelles.',

        /* -- Une note ------------------------------------------------------ */
        'note.sur': 'À propos de : {extrait}',
        'note.sans_element': 'À propos de la page entière',
        'note.element_perdu': 'Élément non retrouvé sur la page actuelle',
        'note.voir': 'Montrer sur la page',
        'note.repondre': 'Répondre',
        'note.reponse_placeholder': 'Votre réponse',
        'note.reponse_envoyer': 'Envoyer la réponse',
        'note.annuler': 'Annuler',
        'note.marquer_corrigee': 'Marquer corrigée',
        'note.rouvrir': 'Rouvrir cette remarque',

        /* -- Marquer une remarque corrigee, et revenir sur cette marque ----- */
        'resolution.aide':
            'La remarque sera rangée dans l’historique une fois la correction en '
            + 'ligne. Elle n’est jamais supprimée : elle peut être rouverte.',
        'resolution.valider': 'C’est corrigé',
        'reouverture.aide':
            'La remarque revient dans la liste, avec ses réponses. À faire si la '
            + 'correction se révèle incomplète.',
        'reouverture.valider': 'Rouvrir',

        /* -- Le formulaire ------------------------------------------------- */
        'formulaire.titre': 'Votre remarque',
        'formulaire.sur': 'À propos de : {extrait}',
        'formulaire.sur_sans_texte': 'À propos de l’élément que vous venez de désigner',
        'formulaire.nom': 'Votre nom',
        'formulaire.nom_aide': 'Il apparaîtra à côté de vos remarques, et sera retenu pour la prochaine fois.',
        'formulaire.nom_placeholder': 'Prénom, ou prénom et nom',
        'formulaire.texte_placeholder': 'Ce que vous avez remarqué',
        'formulaire.envoyer': 'Envoyer',
        'formulaire.envoi': 'Envoi en cours...',
        'formulaire.annuler': 'Annuler',
        'formulaire.nom_manquant': 'Indiquez votre nom avant d’envoyer.',
        'formulaire.texte_manquant': 'Écrivez votre remarque avant d’envoyer.',
        'formulaire.trop_long': 'Votre remarque fait {n} caractères ; la limite est de {max}.',
        'formulaire.restants': '{n} caractères restants',

        /* -- Le nom du relecteur ------------------------------------------- */
        'auteur.connu': 'Vous écrivez sous le nom de {nom}.',
        'auteur.changer': 'Changer',
        'historique.montrer': 'Voir l’historique ({n} corrigée·s)',
        'historique.masquer': 'Masquer l’historique',
        'historique.aide': 'Remarques corrigées, dont le correctif est en ligne. '
            + 'Elles restent ici : une correction jugée faite peut se révéler incomplète.',
        'note.corrigee': 'Corrigée le {date} par {par}',
        'note.corrigee_attente': 'Corrigée, en attente de déploiement',

        /* -- Les pannes. Elles s'affichent, elles ne se taisent jamais ------ */
        'erreur.titre': 'Votre remarque n’a PAS été enregistrée',
        'erreur.titre_lecture': 'Les notes n’ont pas pu être relues',
        'erreur.titre_resolution': 'L’état de la remarque n’a PAS été changé',
        'erreur.reseau':
            'Le serveur n’a pas répondu. Votre texte est conservé ci-dessus : '
            + 'réessayez dans un instant.',
        'erreur.inattendue':
            'Le serveur a répondu quelque chose d’inattendu. Votre texte est '
            + 'conservé ci-dessus ; prévenez la personne qui suit le site.',

        /* Le refus SEC : un code 4xx sans message lisible, presque toujours une
           page HTML de pare-feu. Il a sa propre phrase parce que « quelque chose
           d’inattendu » n’aidait personne : le refus est net, il a un code, et il
           existe un geste qui le contourne souvent — reformuler. */
        'erreur.refus':
            'Le serveur a REFUSÉ la requête (code {code}) sans expliquer pourquoi. '
            + 'C’est presque toujours un pare-feu placé devant le site, qui a pris '
            + 'le texte pour une attaque. Votre texte est conservé ci-dessus : '
            + 'reformulez-le — sans balises < >, sans guillemets, sans fragment de '
            + 'code ni adresse web — puis réessayez. Si le refus persiste, '
            + 'prévenez la personne qui suit le site : c’est une règle de pare-feu '
            + 'à ajuster, pas une panne de l’outil.',
        'erreur.refus_taille':
            'Le serveur a refusé la requête parce qu’elle est trop longue (code '
            + '{code}). Votre texte est conservé ci-dessus : raccourcissez-le, ou '
            + 'découpez-le en deux remarques.',
        'erreur.refus_frequence':
            'Le serveur a refusé la requête parce qu’il en a reçu trop en peu de '
            + 'temps (code {code}). Votre texte est conservé ci-dessus : attendez '
            + 'une minute et réessayez.',
        'erreur.panne_serveur':
            'Le serveur a échoué (code {code}). Ce n’est pas votre texte : il est '
            + 'conservé ci-dessus. Réessayez dans un instant, puis prévenez la '
            + 'personne qui suit le site.',
        'erreur.chiffrement':
            'Le chiffrement a échoué dans ce navigateur : rien n’a été envoyé. '
            + 'Votre texte est conservé ci-dessus. Rechargez la page et réessayez ; '
            + 'si cela se reproduit, prévenez la personne qui suit le site.',
        'erreur.lecture_incomplete': 'Ce qui s’affiche peut être incomplet.',
        'erreur.masquer': 'Masquer',

        /* -- Les notes qu'on ne sait pas lire, et qu'on ne cache pas -------- */
        'lecture.recentes_une':
            '1 note a été écrite par une version plus récente d’annotepage et n’a '
            + 'pas pu être lue.',
        'lecture.recentes_n':
            '{n} notes ont été écrites par une version plus récente d’annotepage et '
            + 'n’ont pas pu être lues.',
        'lecture.illisibles_une':
            '1 note n’a pas pu être déchiffrée. Le sel de ce navigateur n’est '
            + 'peut-être pas celui avec lequel elle a été écrite.',
        'lecture.illisibles_n':
            '{n} notes n’ont pas pu être déchiffrées. Le sel de ce navigateur n’est '
            + 'peut-être pas celui avec lequel elles ont été écrites.',
        'lecture.inconnues_une':
            '1 note est écrite dans un mode que cet outil ne connaît pas et n’a pas '
            + 'été lue.',
        'lecture.inconnues_n':
            '{n} notes sont écrites dans un mode que cet outil ne connaît pas et '
            + 'n’ont pas été lues.',
        'lecture.titre_partielle': 'Certaines notes n’ont pas pu être lues',

        /* -- Les marqueurs poses sur les elements deja annotes -------------- */
        'marqueur.une': '1 note ici',
        'marqueur.n': '{n} notes ici',

        /* -- Le sel : le seul secret, et il ne se recupere pas -------------- */
        'sel.titre': 'Le sel de ce projet est nécessaire',
        'sel.aide':
            'Les notes de ce projet sont chiffrées dans votre navigateur. Sans le '
            + 'sel du projet, ce navigateur ne peut ni les lire, ni en écrire. '
            + 'Demandez-le à la personne qui a installé l’outil, et collez-le '
            + 'ci-dessous. Il sera retenu par ce navigateur, pour ce site.',
        'sel.etiquette': 'Le sel du projet (43 caractères)',
        'sel.valider': 'Utiliser ce sel',
        'sel.vide': 'Collez le sel avant de valider.',
        'sel.forme':
            'Ce n’est pas un sel : on attend 43 caractères parmi A-Z a-z 0-9 - _, '
            + 'sans espace ni tiret décoratif. Recopiez-le d’un seul bloc.',
        'sel.mauvais':
            'Ce sel n’est pas celui de ce projet. Rien n’a été envoyé, rien n’a été '
            + 'déchiffré. Vérifiez que vous collez le sel du bon projet.',
        'sel.origine_changee':
            'Ce sel est retenu par navigateur ET par domaine. Le jour où la '
            + 'préproduction devient la production, il faut le recoller une fois '
            + 'sur le nouveau domaine — les notes, elles, ne bougent pas.',
        'sel.non_retenu':
            'Ce navigateur refuse de retenir le sel (navigation privée, ou stockage '
            + 'bloqué). L’outil fonctionne pour cette page, mais le sel sera à '
            + 'recoller au prochain chargement.',
        'sel.remplacer': 'Coller un autre sel',
        'sel.oublier': 'Oublier le sel sur ce navigateur',

        /* -- L'installation ------------------------------------------------ */
        'installation.titre': 'Installer annotepage sur ce site',
        'installation.engendrer': 'Engendrer un sel et créer le projet',
        'installation.avertissement_titre': 'À lire avant de continuer',
        'installation.avertissement':
            'Le sel ci-dessous est le SEUL secret du projet, et personne d’autre ne '
            + 'l’a : ni le serveur, ni l’auteur de l’outil, ni personne à qui le '
            + 'demander. SEL PERDU = NOTES PERDUES, définitivement, sans '
            + 'récupération possible. Rangez-le maintenant, là où votre équipe range '
            + 'ses mots de passe, avant de continuer.',
        'installation.sel': 'Le sel du projet — à conserver',
        'installation.projet': 'L’identifiant du projet — public, il va dans la page',
        'installation.balise': 'La balise à coller en fin de <body>, sur les pages à annoter',
        'installation.serveur': 'À déclarer dans la configuration du serveur',
        'installation.copier': 'Copier',
        'installation.copie': 'Copié',
        'installation.copie_echec': 'Sélectionnez le texte et copiez-le à la main.',
        'installation.continuer': 'J’ai rangé le sel, continuer',
        'installation.faite':
            'Le sel est retenu par ce navigateur. Collez la balise ci-dessus dans '
            + 'les pages, déclarez le projet côté serveur, puis rechargez cette '
            + 'page : l’outil prend la suite.',
        'installation.sans_serveur':
            'Aucune adresse de serveur n’est déclarée sur la balise (data-serveur), '
            + 'et le client ne vient pas du site : il ne peut pas deviner où écrire. '
            + 'Ajoutez data-serveur à la balise.',
        'installation.mode_clair':
            'Ce projet est déclaré en mode CLAIR : le serveur lira les remarques, '
            + 'les noms et les chemins. Ce mode n’est acceptable que si le serveur '
            + 'est le site lui-même, derrière la même restriction d’accès. Un relais '
            + 'le refusera.',

        /* -- Le contexte sur, sans lequel rien n'est possible --------------- */
        'contexte.titre': 'annotepage ne peut pas fonctionner sur cette page',
        'contexte.aide':
            'Le chiffrement des notes et le regroupement par page reposent sur '
            + 'WebCrypto, que le navigateur ne fournit que dans un contexte sûr : '
            + 'https, ou localhost. Cette page n’en est pas un. Rien ne peut être '
            + 'écrit ni relu ici tant qu’elle est servie ainsi.',

        /* -- Divers -------------------------------------------------------- */
        'date.inconnue': 'date inconnue'
    };

    /* ==== 20-chiffrement.js ==== */

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

    /* ==== 30-etat.js ==== */

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

    /* ==== 40-api.js ==== */

    /* -- 8. L'API -----------------------------------------------------------
       Le contrat, tel que le serveur l'a fixe :

         200 + application/json      reponse normale
         200 + JSON « actif: false » outil depose, pas configure -> se retirer
         404 + text/plain            rien a cette adresse -> se retirer
         4xx/5xx + text/plain        message redige pour un humain -> AFFICHER
         4xx sans texte lisible      REFUS SEC, presque toujours un pare-feu ->
                                     le nommer, avec son code (voir plus bas)
         tout le reste               PHP non execute -> se retirer

       Cette fonction ne rejette jamais et n'ecrit jamais dans la console : elle
       rend une cause, et c'est l'appelant qui decide si l'on se tait ou si l'on
       parle. */

    const appeler = (action, corps) => {
        if (!API) return Promise.resolve({ ok: false, cause: 'inactif' });

        const options = {
            method: corps ? 'POST' : 'GET',
            cache: 'no-store',
            // Sur un relais, cela vaut « aucun cookie » : c'est ce qu'on veut. Le
            // projet n'est pas une session, il est un jeton porteur (FORMAT.md
            // §6.3), et le corps urlencode fait de l'ecriture une « requete
            // simple » au sens CORS — donc sans requete preliminaire OPTIONS.
            credentials: 'same-origin'
        };
        if (corps) options.body = corps;

        let adresse = API + (API.indexOf('?') === -1 ? '?' : '&')
            + 'action=' + encodeURIComponent(action);
        if (!corps) {
            // Le chemin reel n'est JAMAIS envoye, dans aucun mode : seul l'index
            // aveugle part. Envoyer le chemin en clair et l'index en chiffre
            // ferait deux chemins de code, et le second serait le moins teste.
            adresse += '&projet=' + encodeURIComponent(PROJET)
                + '&index=' + encodeURIComponent(INDEX_PAGE);
        }

        return fetch(adresse, options)
            .then((reponse) => reponse.text().then((texte) => ({ reponse: reponse, texte: texte })))
            .then((r) => {
                const etat = r.reponse.status;
                const type = (r.reponse.headers.get('content-type') || '').toLowerCase();
                const estJson = type.indexOf('application/json') !== -1;

                if (r.reponse.ok && estJson) {
                    let donnees = null;
                    try {
                        donnees = JSON.parse(r.texte);
                    } catch (e) {
                        return { ok: false, cause: 'nonjson' };
                    }
                    // L'outil est depose ici mais pas configure : il le DIT en
                    // 200, pour ne pas laisser au navigateur une erreur a
                    // journaliser. On se retire, comme sur un 404.
                    if (donnees && donnees.actif === false) {
                        return { ok: false, cause: 'inactif' };
                    }
                    return { ok: true, donnees: donnees };
                }
                if (etat === 404) {
                    // L'outil n'est pas configure ici — ou il n'y a rien a cette
                    // adresse. Dans les deux cas : silence.
                    return { ok: false, cause: 'inactif' };
                }
                if (!r.reponse.ok && type.indexOf('text/plain') !== -1) {
                    return { ok: false, cause: 'serveur', message: couper(r.texte.trim(), 2000) };
                }

                /* LE REFUS SEC. Constate en production : un pare-feu d'hebergeur
                   repond 403 avec une page HTML, et le client affichait « le
                   serveur a repondu quelque chose d'inattendu ». C'etait vrai et
                   inutile — personne ne savait quoi faire de cette phrase.

                   Ce n'est pas notre serveur qui parle : c'est un intermediaire
                   qui a decide que la requete ressemblait a une attaque, souvent
                   a cause d'un mot du texte saisi. On nomme donc le refus, on
                   donne son code, et on suggere le seul geste qui le contourne
                   vraiment : reformuler. Le texte reste dans le formulaire — cela
                   n'a jamais change et ne changera pas. */
                if (etat === 413) return { ok: false, cause: 'refus-taille', code: etat };
                if (etat === 429) return { ok: false, cause: 'refus-frequence', code: etat };
                if (etat >= 400 && etat < 500) return { ok: false, cause: 'refus', code: etat };
                if (etat >= 500) return { ok: false, cause: 'panne', code: etat };

                // 200 qui n'est pas du JSON : PHP n'est pas execute, le source est
                // servi en clair, ou un intermediaire a repondu.
                return { ok: false, cause: 'nonjson' };
            })
            .catch(() => ({ ok: false, cause: 'reseau' }));
    };

    /** Traduit une cause en panne affichable. Rend null s'il n'y a rien a dire. */
    const panneDe = (resultat, titre) => {
        if (resultat.ok) return null;
        const dit = (cle) => ({ titre: T(titre), detail: T(cle, { code: resultat.code }) });
        if (resultat.cause === 'serveur') return { titre: T(titre), detail: resultat.message };
        if (resultat.cause === 'reseau') return dit('erreur.reseau');
        if (resultat.cause === 'refus') return dit('erreur.refus');
        if (resultat.cause === 'refus-taille') return dit('erreur.refus_taille');
        if (resultat.cause === 'refus-frequence') return dit('erreur.refus_frequence');
        if (resultat.cause === 'panne') return dit('erreur.panne_serveur');
        return dit('erreur.inattendue');
    };

    /* -- 9. Ecrire : le mode decide ou vont les champs -----------------------
       Un seul endroit construit un corps de requete. En clair, les champs partent
       tels quels — exactement les colonnes du format 1. En chiffre, TOUT ce qui
       est saisi ou observe passe dans l'enveloppe : chiffrer le seul texte
       livrerait l'arborescence du site, les intitules de ses elements et le nom
       de ses relecteurs (FORMAT.md §2.3). */

    const CHAMPS_DE_CHARGE = ['page', 'selecteur', 'empreinte', 'extrait',
                              'auteur', 'texte', 'version', 'environnement', 'fenetre'];

    const corpsDeNote = (champs, reponseA) => {
        const corps = new URLSearchParams();
        corps.set('projet', PROJET);
        corps.set('mode', MODE);
        if (reponseA) {
            // Une reponse HERITE de l'index de page de sa mere, et en mode clair
            // de sa page et de son element. Les redemander au client ouvrirait la
            // porte a une reponse rattachee ailleurs que la note qu'elle commente.
            corps.set('reponse_a', String(reponseA));
        } else {
            corps.set('index', INDEX_PAGE);
        }

        if (MODE === 'clair') {
            CHAMPS_DE_CHARGE.forEach((cle) => {
                if (champs[cle] !== undefined) corps.set(cle, String(champs[cle]));
            });
            return Promise.resolve(corps);
        }
        // L'AAD emploie l'index de page que NOUS avons calcule, jamais celui que
        // le serveur annonce : c'est precisement contre un serveur qui deplace une
        // note d'une page a l'autre que l'AAD existe.
        return sceller(cles.cleChiffre, PROJET, INDEX_PAGE, 'note', champs)
            .then((enveloppe) => {
                corps.set('charge', enveloppe);
                return corps;
            });
    };

    const corpsDeResolution = (note, marquer, nom) => {
        const corps = new URLSearchParams();
        corps.set('projet', PROJET);
        corps.set('id', String(note.id));
        corps.set('resolue', marquer ? '1' : '0');
        if (!marquer) {
            // Rouvrir n'ecrit rien : le serveur vide la resolution. On ne demande
            // pas le nom du correcteur pour annuler la correction.
            return Promise.resolve(corps);
        }
        if (MODE === 'clair') {
            corps.set('par', nom);
            corps.set('version', VERSION_SITE);
            return Promise.resolve(corps);
        }
        // Seconde enveloppe, son propre nonce, son propre role : elle est ecrite
        // par une autre personne, a un autre moment, souvent depuis une autre
        // machine. La fondre dans l'enveloppe de la note obligerait a rechiffrer
        // une remarque qu'on n'a pas le droit de reecrire.
        return sceller(cles.cleChiffre, PROJET, INDEX_PAGE, 'resolution',
                       { par: nom, version: VERSION_SITE })
            .then((enveloppe) => {
                corps.set('charge_resolution', enveloppe);
                return corps;
            });
    };

    /* -- 10. Lire : ouvrir ce qu'on peut, compter ce qu'on ne peut pas -------- */

    const remplirDepuis = (note, objet) => {
        // Les champs INCONNUS de l'objet sont ignores en silence : c'est ce qui
        // rend possible d'en ajouter un jour sans changer le numero de format.
        CHAMPS_DE_CHARGE.forEach((cle) => {
            note[cle] = objet[cle] === undefined ? '' : String(objet[cle]);
        });
        return note;
    };

    /**
     * Une ligne -> une note lisible, ou null si on ne sait pas la lire.
     * Ce qui est saute est COMPTE : une note qui disparait en silence est pire
     * qu'une note qu'on annonce ne pas savoir lire.
     */
    const ouvrirNote = (note) => {
        if (!note || typeof note !== 'object') return Promise.resolve(null);

        // « mode » absent ou vide : la ligne vient du format 1, elle vaut clair.
        const m = String(note.mode || 'clair');

        if (m === 'clair') return Promise.resolve(note);

        if (m !== 'chiffre') {
            // Ni devinee, ni rendue vide sans le dire.
            sautees.inconnues += 1;
            return Promise.resolve(null);
        }

        return ouvrir(cles.cleChiffre, PROJET, INDEX_PAGE, 'note', note.charge)
            .then(
                (objet) => remplirDepuis(note, objet),
                (e) => {
                    if (e && e.raison === 'recente') sautees.recentes += 1;
                    else sautees.illisibles += 1;
                    return null;
                }
            )
            .then((lue) => {
                if (!lue || !lue.charge_resolution) return lue;
                return ouvrir(cles.cleChiffre, PROJET, INDEX_PAGE, 'resolution', lue.charge_resolution)
                    .then(
                        (objet) => {
                            lue.resolue_par = objet.par === undefined ? '' : String(objet.par);
                            lue.resolue_version = objet.version === undefined ? '' : String(objet.version);
                            return lue;
                        },
                        () => {
                            /* La note se lit, sa resolution non. On garde la note :
                               « corrigee par quelqu'un » vaut mieux que rien, et la
                               date de correction, elle, est en clair. */
                            lue.resolue_par = '';
                            lue.resolue_version = '';
                            return lue;
                        }
                    );
            });
    };

    /** Ouvre une note et ses reponses. Une reponse est une note : meme role. */
    const ouvrirFil = (note) =>
        ouvrirNote(note).then((mere) => {
            if (!mere) return null;
            const filles = Array.isArray(mere.reponses) ? mere.reponses : [];
            if (!filles.length) return mere;
            return Promise.all(filles.map(ouvrirNote))
                .then((lues) => {
                    mere.reponses = lues.filter(Boolean);
                    return mere;
                });
        });

    const lireListe = (donnees) => {
        sautees = { recentes: 0, illisibles: 0, inconnues: 0 };
        const brutes = donnees && Array.isArray(donnees.notes) ? donnees.notes : [];
        return Promise.all(brutes.map(ouvrirFil)).then((lues) => lues.filter(Boolean));
    };

    /** Ce qu'on n'a pas su lire, dit a l'ecran. Rend null s'il n'y a rien a dire. */
    const panneDeLecture = () => {
        const lignes = [];
        if (sautees.recentes) {
            lignes.push(compteLisible(sautees.recentes, '', 'lecture.recentes_une', 'lecture.recentes_n'));
        }
        if (sautees.illisibles) {
            lignes.push(compteLisible(sautees.illisibles, '', 'lecture.illisibles_une', 'lecture.illisibles_n'));
        }
        if (sautees.inconnues) {
            lignes.push(compteLisible(sautees.inconnues, '', 'lecture.inconnues_une', 'lecture.inconnues_n'));
        }
        if (!lignes.length) return null;
        return { titre: T('lecture.titre_partielle'), detail: lignes.join('\n') };
    };

    /* ==== 50-reperes.js ==== */

    /* -- 11. Les trois reperes d'un element ----------------------------------
       Aucun n'est fiable seul : un chemin casse au premier bloc insere, une
       empreinte de classes casse a la refonte du style, un extrait de texte casse
       a la relecture editoriale. Ensemble, ils permettent de DEGRADER — signaler
       la note comme orpheline — au lieu de la perdre. */

    const cheminCss = (el) => {
        const bouts = [];
        let n = el;
        while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement) {
            const balise = n.localName;
            let rang = 1;
            let f = n.previousElementSibling;
            while (f) {
                if (f.localName === balise) rang += 1;
                f = f.previousElementSibling;
            }
            bouts.unshift(balise + ':nth-of-type(' + rang + ')');
            n = n.parentElement;
        }
        // Trop long pour la colonne : on abandonne les segments de tete. Le chemin
        // devient relatif et peut designer plusieurs elements — c'est exactement
        // pour cela que l'empreinte et l'extrait existent.
        let chemin = bouts.join(' > ');
        while (chemin.length > MAX_SELECTEUR && bouts.length > 1) {
            bouts.shift();
            chemin = bouts.join(' > ');
        }
        return couper(chemin, MAX_SELECTEUR);
    };

    const empreinteDe = (el) => {
        if (!el || el.nodeType !== 1) return '';
        let e = el.localName;
        if (el.id) e += '#' + el.id;
        const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        for (let i = 0; i < classes.length && i < 4; i += 1) e += '.' + classes[i];
        return couper(e, MAX_EMPREINTE);
    };

    /**
     * Le texte par lequel un humain reconnait l'element. C'est ce qui s'affiche
     * dans le panneau : « A propos de : Contactez-nous ». Jamais le chemin,
     * jamais l'empreinte — ce sont des reperes de machine.
     */
    const extraitDe = (el) => {
        if (!el || el.nodeType !== 1) return '';
        let t = normaliser(el.textContent);
        if (!t) {
            t = normaliser(
                el.getAttribute('alt') ||
                el.getAttribute('aria-label') ||
                el.getAttribute('placeholder') ||
                el.getAttribute('title') ||
                (el.localName === 'input' ? el.value : '') ||
                ''
            );
        }
        return couper(t, MAX_EXTRAIT);
    };

    /* -- 12. Retrouver l'element d'une note ---------------------------------- */

    const score = (el, note) => {
        let s = 0;
        if (note.empreinte && empreinteDe(el) === note.empreinte) s += 2;
        if (note.extrait) {
            const t = extraitDe(el);
            if (t === note.extrait) s += 2;
            else if (t && note.extrait.length >= 12 && t.indexOf(note.extrait.slice(0, 24)) === 0) s += 1;
        }
        return s;
    };

    /**
     * Trois tentatives, de la plus precise a la plus large. Si aucune ne rend un
     * element assez ressemblant, la note devient ORPHELINE : elle reste lisible
     * dans le panneau, avec sa date et son auteur, au lieu de disparaitre sans
     * que personne le sache.
     */
    const retrouver = (note) => {
        if (!note.selecteur && !note.empreinte && !note.extrait) return null;

        // 1. Le chemin, verifie par au moins un des deux autres reperes.
        if (note.selecteur) {
            let el = null;
            try {
                el = document.body.querySelector(note.selecteur);
            } catch (e) {
                el = null; // chemin devenu invalide : ce n'est pas une panne
            }
            if (el && !dansOutil(el)) {
                if (!note.empreinte && !note.extrait) return el;
                if (score(el, note) >= 1) return el;
            }
        }

        // 2. L'empreinte : meme balise, memes classes, meme identifiant.
        if (note.empreinte) {
            const balise = note.empreinte.split(/[#.]/)[0];
            let candidats = [];
            try {
                candidats = Array.prototype.slice.call(document.body.querySelectorAll(balise));
            } catch (e) {
                candidats = [];
            }
            let meilleur = null;
            let meilleurScore = 0;
            for (let i = 0; i < candidats.length; i += 1) {
                const c = candidats[i];
                if (dansOutil(c)) continue;
                const s = score(c, note);
                if (s > meilleurScore) {
                    meilleur = c;
                    meilleurScore = s;
                }
            }
            if (meilleur && meilleurScore >= 2) return meilleur;
        }

        // 3. Le texte seul, s'il est assez long pour ne pas designer n'importe
        //    quoi. C'est le repere qui survit le mieux a une refonte du style.
        if (note.extrait && note.extrait.length >= 12) {
            const tous = document.body.querySelectorAll('*');
            for (let i = 0; i < tous.length; i += 1) {
                const c = tous[i];
                if (dansOutil(c)) continue;
                if (extraitDe(c) === note.extrait) return c;
            }
        }

        return null;
    };

    /** Repartit les notes du serveur entre elements retrouves et orphelines. */
    const ancrer = () => {
        ancrees = [];
        orphelines = [];
        for (let i = 0; i < notes.length; i += 1) {
            const note = notes[i];
            const el = retrouver(note);
            if (!el) {
                orphelines.push(note);
                continue;
            }
            let groupe = null;
            for (let j = 0; j < ancrees.length; j += 1) {
                if (ancrees[j].element === el) groupe = ancrees[j];
            }
            if (!groupe) {
                groupe = { element: el, notes: [] };
                ancrees.push(groupe);
            }
            groupe.notes.push(note);
        }
    };

    /* ==== 60-interface.js ==== */

    /* -- 13. Construction de l'interface -------------------------------------
       Tout ce qui suit vit dans le shadow root. Le site hote n'en voit rien,
       et n'est vu de rien. */

    /**
     * L'element hote et son shadow root, et RIEN D'AUTRE.
     *
     * Il est cree avant que les libelles soient charges — il faut un shadow
     * root pour les y charger — mais il ne montre rien : l'interface, elle,
     * n'est batie qu'une fois les textes disponibles.
     */
    const batirHote = () => {
        // IDEMPOTENT, et ce n'est pas une precaution de style : l'ecran de collage
        // du sel bati l'hote AVANT que le demarrage normal ne le demande a son
        // tour. Sans cette garde, le site recevait DEUX elements, dont un vide et
        // orphelin — la promesse « un seul element ajoute » tombait au premier
        // sel colle.
        if (hote) return;
        hote = document.createElement('annotepage-notes');
        // Ces proprietes sont posees EN LIGNE et en !important, sur notre propre
        // element : une regle du site visant « body > div » ne doit pas pouvoir
        // deplacer la couche. « all: initial » coupe en outre tout heritage du
        // site vers l'outil.
        hote.style.cssText =
            'all: initial !important;' +
            'position: fixed !important;' +
            'top: 0 !important; left: 0 !important;' +
            'right: 0 !important; bottom: 0 !important;' +
            'width: auto !important; height: auto !important;' +
            'margin: 0 !important; padding: 0 !important; border: 0 !important;' +
            'pointer-events: none !important;' +
            'z-index: 2147483000 !important;';
        document.body.appendChild(hote);
        racine = hote.attachShadow({ mode: 'open' });

        /* La feuille de style est POSEE ICI, en <style>, et non chargee par un
           <link> comme dans l'outil d'origine.

           Raison : le client part en CDN sous SRI. Une seconde requete vers un
           fichier voisin demanderait une seconde empreinte a tenir a jour, et
           personne ne tient deux empreintes en accord bien longtemps. Un seul
           fichier, une seule empreinte, une seule chose a verifier.

           Effet de bord agreable : la feuille est la avant le premier pixel. Le
           masquage puis l'affichage de l'element hote, qui existaient pour ne pas
           montrer l'outil sans style pendant une fraction de seconde, n'ont plus
           lieu d'etre et ont disparu.

           Prix a dire : la feuille pese dans le fichier servi, et le style ne se
           remplace plus en changeant un fichier voisin — il faut reconstruire. */
        /* Deux voies, et la premiere n'est pas de la coquetterie : une politique
           de securite de contenu stricte (style-src sans 'unsafe-inline') BLOQUE
           un element <style>, et l'outil s'afficherait sans style — ce qui
           ressemble a une page cassee. Une feuille CONSTRUITE, elle, n'est pas
           une feuille en ligne au sens de la politique, et passe. On garde
           <style> pour les navigateurs qui ne construisent pas de feuille. */
        let posee = false;
        try {
            if (racine.adoptedStyleSheets && typeof CSSStyleSheet === 'function') {
                const feuille = new CSSStyleSheet();
                feuille.replaceSync(STYLES);
                racine.adoptedStyleSheets = [feuille];
                posee = true;
            }
        } catch (e) {
            posee = false;
        }
        if (!posee) {
            const style = document.createElement('style');
            style.textContent = STYLES;
            racine.appendChild(style);
        }
    };

    /** L'interface. Batie APRES les libelles : aucun texte de repli a poser. */
    const batirUi = () => {
        const couche = creer('div', 'ap-couche');
        racine.appendChild(couche);

        /* -- le bouton -- */
        const bouton = creer('button', 'ap-bouton');
        bouton.type = 'button';
        bouton.setAttribute('aria-pressed', 'false');
        bouton.title = T('bouton.aide');
        const pastille = creer('span', 'ap-bouton-pastille');
        const boutonTexte = creer('span', null, T('bouton.ouvrir'));
        const boutonCompte = creer('span', 'ap-bouton-compte');
        bouton.appendChild(pastille);
        bouton.appendChild(boutonTexte);
        bouton.appendChild(boutonCompte);
        bouton.addEventListener('click', () => basculerMode());
        couche.appendChild(bouton);

        /* -- surbrillance de designation -- */
        const surbrillance = creer('div', 'ap-surbrillance');
        const etiquette = creer('div', 'ap-surbrillance-etiquette');
        couche.appendChild(surbrillance);
        couche.appendChild(etiquette);

        /* -- marqueurs -- */
        const marqueurs = creer('div', 'ap-marqueurs');
        couche.appendChild(marqueurs);

        /* -- panneau -- */
        const panneau = creer('aside', 'ap-panneau');
        panneau.setAttribute('role', 'complementary');
        const entete = creer('div', 'ap-panneau-entete');
        const titre = creer('span', 'ap-panneau-titre', T('panneau.titre'));
        const fermer = creer('button', 'ap-lien', T('panneau.fermer'));
        fermer.type = 'button';
        fermer.addEventListener('click', () => quitterMode());
        entete.appendChild(titre);
        entete.appendChild(fermer);
        const consigne = creer('div', 'ap-panneau-consigne');
        consigne.appendChild(creer('div', null, T('panneau.consigne')));
        consigne.appendChild(creer('div', null, T('panneau.echap')));
        const corps = creer('div', 'ap-panneau-corps');
        const pied = creer('div', 'ap-panneau-pied');
        panneau.appendChild(entete);
        panneau.appendChild(consigne);
        panneau.appendChild(corps);
        panneau.appendChild(pied);
        couche.appendChild(panneau);

        /* -- formulaire -- */
        const fiche = creer('div', 'ap-fiche');
        couche.appendChild(fiche);

        ui = {
            couche: couche,
            bouton: bouton,
            boutonTexte: boutonTexte,
            boutonCompte: boutonCompte,
            surbrillance: surbrillance,
            etiquette: etiquette,
            marqueurs: marqueurs,
            panneau: panneau,
            corps: corps,
            pied: pied,
            fiche: fiche
        };
    };

    /* -- 14. Surbrillance et marqueurs --------------------------------------- */

    const placer = (el, rect, marge) => {
        const m = marge || 0;
        el.style.left = Math.max(0, rect.left - m) + 'px';
        el.style.top = Math.max(0, rect.top - m) + 'px';
        el.style.width = Math.max(0, rect.width + m * 2) + 'px';
        el.style.height = Math.max(0, rect.height + m * 2) + 'px';
    };

    const montrerSurbrillance = (el) => {
        if (!el) return cacherSurbrillance();
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return cacherSurbrillance();
        placer(ui.surbrillance, r, 1);
        ui.surbrillance.style.display = 'block';

        const texte = extraitDe(el);
        ui.etiquette.textContent = texte || T('formulaire.sur_sans_texte');
        ui.etiquette.style.display = 'block';
        const haut = r.top > 26 ? r.top - 24 : Math.min(window.innerHeight - 24, r.bottom + 4);
        ui.etiquette.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 330)) + 'px';
        ui.etiquette.style.top = haut + 'px';
    };

    const cacherSurbrillance = () => {
        if (!ui) return;
        ui.surbrillance.style.display = 'none';
        ui.etiquette.style.display = 'none';
    };

    /** Un pastillage par element annote. Il n'apparait qu'en mode annotation :
        hors de ce mode, la page est exactement celle du site. */
    const dessinerMarqueurs = () => {
        vider(ui.marqueurs);
        if (!mode) return;
        for (let i = 0; i < ancrees.length; i += 1) {
            const groupe = ancrees[i];
            const r = groupe.element.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.bottom < 0 || r.top > window.innerHeight) continue;
            const n = groupe.notes.length;
            const pastille = creer('button', 'ap-marqueur', String(n));
            pastille.type = 'button';
            pastille.title = n === 1 ? T('marqueur.une') : T('marqueur.n', { n: n });
            pastille.style.left = Math.max(2, Math.min(r.left - 8, window.innerWidth - 30)) + 'px';
            pastille.style.top = Math.max(2, Math.min(r.top - 8, window.innerHeight - 30)) + 'px';
            pastille.addEventListener('click', ((note) => () => viser(note))(groupe.notes[0]));
            ui.marqueurs.appendChild(pastille);
        }
    };

    const rafraichirPositions = () => {
        if (rafDemande) return;
        rafDemande = true;
        window.requestAnimationFrame(() => {
            rafDemande = false;
            if (!mode) return;
            dessinerMarqueurs();
            if (survole && document.contains(survole)) montrerSurbrillance(survole);
            if (cible && document.contains(cible)) positionnerFiche(cible);
        });
    };

    /* -- 15. Le panneau ------------------------------------------------------ */

    const blocPanne = (panne, surFermeture) => {
        const bloc = creer('div', 'ap-erreur');
        bloc.setAttribute('role', 'alert');
        bloc.appendChild(creer('div', 'ap-erreur-titre', panne.titre));
        // Le message du serveur est affiche TEL QU'IL A ETE REDIGE : c'est
        // ainsi que « la base est injoignable » atteint l'ecran d'un relecteur.
        bloc.appendChild(creer('p', 'ap-erreur-detail', panne.detail));
        if (surFermeture) {
            const masquer = creer('button', 'ap-lien', T('erreur.masquer'));
            masquer.type = 'button';
            masquer.addEventListener('click', surFermeture);
            bloc.appendChild(masquer);
        }
        return bloc;
    };

    const carteNote = (note, orpheline) => {
        /* Etat de correction, dit sur la carte elle-meme. Deux cas distincts :
           corrigee et en ligne, ou corrigee mais pas encore deployee — le
           second doit se voir, sinon on croit le defaut resolu alors qu'il est
           toujours a l'ecran. */
        const enLigne = note.resolue_le ? dejaDeploye(note.resolue_version) : false;
        const carte = creer('article', 'ap-note'
            + (orpheline ? ' ap-orpheline' : '')
            + (note.resolue_le ? (enLigne ? ' ap-corrigee' : ' ap-corrigee-attente') : ''));
        carte.setAttribute('data-ap-note', String(note.id));
        if (note.resolue_le) {
            const marque = creer('div', 'ap-marque-etat',
                enLigne
                    ? T('note.corrigee', {
                        date: dateLisible(note.resolue_le),
                        par: note.resolue_par || '?',
                      })
                    : T('note.corrigee_attente'));
            marque.title = note.resolue_version
                ? 'Correction partie en version ' + note.resolue_version
                : '';
            carte.appendChild(marque);
        }

        const entete = creer('div', 'ap-note-entete');
        entete.appendChild(creer('span', 'ap-note-auteur', note.auteur));
        entete.appendChild(creer('span', 'ap-note-date', dateLisible(note.cree_le)));
        carte.appendChild(entete);

        // Ce que le relecteur voit de l'element : son TEXTE, jamais son chemin.
        const cibleTexte = orpheline
            ? (note.extrait
                ? T('note.sur', { extrait: note.extrait }) + ' — ' + T('note.element_perdu')
                : T('note.element_perdu'))
            : (note.extrait ? T('note.sur', { extrait: note.extrait }) : T('note.sans_element'));
        carte.appendChild(creer('p', 'ap-note-cible', cibleTexte));

        carte.appendChild(creer('p', 'ap-note-texte', note.texte));

        const actions = creer('div', 'ap-note-actions');
        const repondre = creer('button', 'ap-secondaire', T('note.repondre'));
        repondre.type = 'button';
        actions.appendChild(repondre);
        if (!orpheline) {
            const montrer = creer('button', 'ap-lien', T('note.voir'));
            montrer.type = 'button';
            montrer.addEventListener('click', () => montrerElement(note));
            actions.appendChild(montrer);
        }
        /* Marquer corrigee, et revenir sur cette marque. Sans ce bouton, la
           moitie de l'outil — l'action serveur, ses colonnes, l'historique et
           ses libelles — restait ecrite et injoignable : personne ne pouvait
           poser l'etat que le panneau savait afficher. */
        const etat = creer('button', 'ap-lien',
            T(note.resolue_le ? 'note.rouvrir' : 'note.marquer_corrigee'));
        etat.type = 'button';
        etat.addEventListener('click', () => {
            const ouvert = carte.querySelector('.ap-resoudre');
            if (ouvert) {
                ouvert.remove();
                return;
            }
            carte.appendChild(formulaireResolution(note, !note.resolue_le));
        });
        actions.appendChild(etat);
        carte.appendChild(actions);

        const reponses = creer('div', 'ap-reponses');
        const liste = note.reponses || [];
        for (let i = 0; i < liste.length; i += 1) {
            const r = liste[i];
            const bloc = creer('div', 'ap-reponse');
            const e = creer('div', 'ap-note-entete');
            e.appendChild(creer('span', 'ap-note-auteur', r.auteur));
            e.appendChild(creer('span', 'ap-note-date', dateLisible(r.cree_le)));
            bloc.appendChild(e);
            bloc.appendChild(creer('p', 'ap-note-texte', r.texte));
            reponses.appendChild(bloc);
        }
        if (liste.length) carte.appendChild(reponses);

        repondre.addEventListener('click', () => {
            if (carte.querySelector('.ap-repondre')) return;
            carte.appendChild(formulaireReponse(note));
        });

        return carte;
    };

    /**
     * Marquer une note corrigee, ou rouvrir une note corrigee.
     *
     * Le nom n'est demande QUE pour marquer une correction : c'est lui qui
     * signe le geste. Pour rouvrir, le serveur ne l'exige pas et l'effacerait
     * de toute facon — demander le nom du correcteur pour annuler la
     * correction n'aurait aucun sens.
     *
     * La version du site est envoyee avec la marque : c'est elle qui permet
     * ensuite de distinguer « corrigee et en ligne » de « corrigee, pas encore
     * deployee ». Sans elle, une note serait rangee dans l'historique alors
     * que le defaut est toujours a l'ecran.
     */
    const formulaireResolution = (note, marquer) => {
        const bloc = creer('div', 'ap-resoudre');
        bloc.appendChild(creer('p', 'ap-aide',
            T(marquer ? 'resolution.aide' : 'reouverture.aide')));

        const champsNom = marquer ? champNom() : null;
        if (champsNom) bloc.appendChild(champsNom.bloc);

        const actions = creer('div', 'ap-actions');
        const valider = creer('button', 'ap-primaire',
            T(marquer ? 'resolution.valider' : 'reouverture.valider'));
        valider.type = 'button';
        const annuler = creer('button', 'ap-secondaire', T('note.annuler'));
        annuler.type = 'button';
        annuler.addEventListener('click', () => bloc.remove());
        actions.appendChild(valider);
        actions.appendChild(annuler);
        bloc.appendChild(actions);

        const dire = (panne) => {
            const ancien = bloc.querySelector('.ap-erreur');
            if (ancien) ancien.remove();
            if (panne) bloc.insertBefore(blocPanne(panne), bloc.firstChild);
        };

        valider.addEventListener('click', () => {
            const nom = champsNom ? normaliser(champsNom.champ.value) : auteur;
            if (marquer && !nom) {
                return dire({ titre: T('erreur.titre_resolution'),
                              detail: T('formulaire.nom_manquant') });
            }
            dire(null);
            valider.disabled = true;
            annuler.disabled = true;

            // Le corps est bati AVANT l'envoi et, en mode chiffre, il faut
            // chiffrer pour l'obtenir : c'est asynchrone, comme le reste.
            corpsDeResolution(note, marquer, nom)
                .then((corps) => appeler('resoudre', corps))
                .then((r) => {
                    valider.disabled = false;
                    annuler.disabled = false;
                    if (!r.ok) {
                        dire(panneDe(r, 'erreur.titre_resolution'));
                        return;
                    }
                    if (nom) ecrireAuteur(nom);
                    bloc.remove();
                    // Comme partout : on relit le serveur au lieu de supposer.
                    recharger();
                }, () => {
                    valider.disabled = false;
                    annuler.disabled = false;
                    dire({ titre: T('erreur.titre_resolution'), detail: T('erreur.chiffrement') });
                });
        });

        return bloc;
    };

    const formulaireReponse = (note) => {
        const bloc = creer('div', 'ap-repondre');
        const zone = creer('textarea', 'ap-zone');
        zone.setAttribute('placeholder', T('note.reponse_placeholder'));
        zone.setAttribute('maxlength', String(MAX_TEXTE));
        bloc.appendChild(zone);

        const champsNom = champNom();
        if (champsNom) bloc.appendChild(champsNom.bloc);

        const actions = creer('div', 'ap-actions');
        const envoyer = creer('button', 'ap-primaire', T('note.reponse_envoyer'));
        envoyer.type = 'button';
        const annuler = creer('button', 'ap-secondaire', T('note.annuler'));
        annuler.type = 'button';
        annuler.addEventListener('click', () => bloc.remove());
        actions.appendChild(envoyer);
        actions.appendChild(annuler);
        bloc.appendChild(actions);

        const dire = (panne) => {
            const ancien = bloc.querySelector('.ap-erreur');
            if (ancien) ancien.remove();
            if (panne) bloc.insertBefore(blocPanne(panne), bloc.firstChild);
        };

        envoyer.addEventListener('click', () => {
            const texte = zone.value.trim();
            const nom = champsNom ? normaliser(champsNom.champ.value) : auteur;
            if (!nom) return dire({ titre: T('erreur.titre'), detail: T('formulaire.nom_manquant') });
            if (!texte) return dire({ titre: T('erreur.titre'), detail: T('formulaire.texte_manquant') });
            if (texte.length > MAX_TEXTE) {
                return dire({
                    titre: T('erreur.titre'),
                    detail: T('formulaire.trop_long', { n: texte.length, max: MAX_TEXTE })
                });
            }
            dire(null);
            envoyer.disabled = true;
            annuler.disabled = true;
            envoyer.textContent = T('formulaire.envoi');

            corpsDeNote({
                auteur: nom,
                texte: texte,
                version: VERSION_SITE,
                environnement: ENVIRONNEMENT,
                fenetre: fenetreCourante()
            }, note.id).then((corps) => appeler('ajout', corps)).then((r) => {
                envoyer.disabled = false;
                annuler.disabled = false;
                envoyer.textContent = T('note.reponse_envoyer');
                if (!r.ok) {
                    // Le texte reste dans la zone : rien n'est perdu.
                    dire(panneDe(r, 'erreur.titre'));
                    return;
                }
                ecrireAuteur(nom);
                bloc.remove();
                // On re-interroge le serveur au lieu d'ajouter la reponse a
                // l'ecran : ce qui s'affiche est ce que le serveur dit, jamais
                // ce que le navigateur suppose.
                recharger();
            }, () => {
                envoyer.disabled = false;
                annuler.disabled = false;
                envoyer.textContent = T('note.reponse_envoyer');
                // Le chiffrement a echoue : la reponse n'est PAS partie, et le
                // texte reste dans la zone.
                dire({ titre: T('erreur.titre'), detail: T('erreur.chiffrement') });
            });
        });

        // Confort : la reponse s'ecrit tout de suite.
        window.setTimeout(() => zone.focus(), 0);
        return bloc;
    };

    /** Champ « votre nom », seulement tant qu'on ne le connait pas. */
    const champNom = () => {
        if (auteur) return null;
        const bloc = creer('div');
        const etiquette = creer('label', 'ap-etiquette', T('formulaire.nom'));
        const champ = creer('input', 'ap-champ');
        champ.type = 'text';
        champ.setAttribute('maxlength', String(MAX_AUTEUR));
        champ.setAttribute('placeholder', T('formulaire.nom_placeholder'));
        champ.setAttribute('autocomplete', 'off');
        const id = 'ap-nom-' + Math.random().toString(36).slice(2, 8);
        champ.id = id;
        etiquette.setAttribute('for', id);
        bloc.appendChild(etiquette);
        bloc.appendChild(champ);
        bloc.appendChild(creer('p', 'ap-aide', T('formulaire.nom_aide')));
        return { bloc: bloc, champ: champ };
    };

    const dessinerPanneau = () => {
        vider(ui.corps);
        vider(ui.pied);

        if (panneEnCours) {
            ui.corps.appendChild(blocPanne(panneEnCours, () => {
                panneEnCours = null;
                dessinerPanneau();
            }));
        }

        /* Ce qu'on n'a pas su lire est DIT, avec son compte. Une note sautee en
           silence est une remarque qui disparait, et la personne qui l'a ecrite
           croira que personne ne l'a lue. */
        const partielle = panneDeLecture();
        if (partielle) ui.corps.appendChild(blocPanne(partielle));

        /* Une note corrigee ET dont le correctif est en ligne quitte la vue
           principale : elle a fait son travail. Elle n'est pas supprimee — une
           correction jugee faite peut s'averer incomplete, et la remarque doit
           pouvoir revenir avec son fil de reponses.

           Une note corrigee dont le correctif n'est PAS encore deploye reste
           visible : le defaut est toujours a l'ecran, la masquer ferait croire
           qu'il a disparu. */
        const meres = [];
        const archivees = [];
        for (let i = 0; i < notes.length; i += 1) {
            const n = notes[i];
            if (orphelines.indexOf(n) !== -1) continue;
            if (n.resolue_le && dejaDeploye(n.resolue_version)) archivees.push(n);
            else meres.push(n);
        }

        if (!meres.length && !orphelines.length && !archivees.length) {
            ui.corps.appendChild(creer('p', 'ap-vide', T('panneau.vide')));
        }

        if (meres.length) {
            ui.corps.appendChild(creer('h2', 'ap-section-titre', T('panneau.section_page')));
            for (let i = 0; i < meres.length; i += 1) {
                ui.corps.appendChild(carteNote(meres[i], false));
            }
        }

        if (orphelines.length) {
            ui.corps.appendChild(creer('h2', 'ap-section-titre', T('orphelines.titre')));
            ui.corps.appendChild(creer('p', 'ap-section-aide', T('orphelines.aide')));
            for (let i = 0; i < orphelines.length; i += 1) {
                ui.corps.appendChild(carteNote(orphelines[i], true));
            }
        }

        if (archivees.length) {
            const bascule = creer('button', 'ap-historique-bascule',
                T(historiqueOuvert ? 'historique.masquer' : 'historique.montrer',
                  { n: archivees.length }));
            bascule.type = 'button';
            bascule.addEventListener('click', () => {
                historiqueOuvert = !historiqueOuvert;
                dessinerPanneau();
            });
            ui.corps.appendChild(bascule);

            if (historiqueOuvert) {
                ui.corps.appendChild(creer('p', 'ap-section-aide', T('historique.aide')));
                for (let i = 0; i < archivees.length; i += 1) {
                    ui.corps.appendChild(carteNote(archivees[i], false));
                }
            }
        }

        if (auteur) {
            ui.pied.appendChild(creer('span', null, T('auteur.connu', { nom: auteur })));
            const changer = creer('button', 'ap-lien', T('auteur.changer'));
            changer.type = 'button';
            changer.addEventListener('click', () => {
                ecrireAuteur('');
                dessinerPanneau();
            });
            ui.pied.appendChild(changer);
        }

        /* Le sel se recolle depuis ici. Ce n'est pas un reglage de confort : le
           jour ou la preproduction devient la production, le localStorage change
           d'origine et le sel est a recoller une fois, sur chaque navigateur. Sans
           ce bouton, il faudrait vider le stockage a la main pour y arriver. */
        if (PROJET && selTexte) {
            const changerSel = creer('button', 'ap-lien', T('sel.remplacer'));
            changerSel.type = 'button';
            changerSel.title = T('sel.origine_changee');
            changerSel.addEventListener('click', () => ouvrirEcranSel());
            ui.pied.appendChild(changerSel);
        }

        const total = notes.length;
        ui.boutonCompte.textContent = compteLisible(
            total, 'bouton.notes_zero', 'bouton.notes_une', 'bouton.notes_n');
        // Le bouton porte la panne : quelqu'un qui ne l'ouvre pas doit
        // pouvoir voir, d'un coup d'oeil, que quelque chose ne va pas.
        ui.bouton.classList.toggle('ap-panne', !!panneEnCours);
        ui.bouton.title = panneEnCours ? panneEnCours.titre : T('bouton.aide');
    };

    /** Met en avant une note dans le panneau, sans rien changer a la page. */
    const viser = (note) => {
        const carte = ui.corps.querySelector('[data-ap-note="' + note.id + '"]');
        if (!carte) return;
        const anciennes = ui.corps.querySelectorAll('.ap-visee');
        for (let i = 0; i < anciennes.length; i += 1) anciennes[i].classList.remove('ap-visee');
        carte.classList.add('ap-visee');
        carte.scrollIntoView({ block: 'nearest' });
    };

    /** Ramene l'element commente sous les yeux, en le montrant chez nous. */
    const montrerElement = (note) => {
        let el = null;
        for (let i = 0; i < ancrees.length; i += 1) {
            if (ancrees[i].notes.indexOf(note) !== -1) el = ancrees[i].element;
        }
        if (!el) return;
        // scrollIntoView deplace le point de vue, jamais le document : aucun
        // noeud, aucun style du site n'est touche.
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        window.setTimeout(() => {
            montrerSurbrillance(el);
            window.setTimeout(cacherSurbrillance, 1400);
        }, 350);
    };

    /* -- 16. Le formulaire d'une nouvelle note -------------------------------- */

    const positionnerFiche = (el) => {
        const fiche = ui.fiche;
        const r = el.getBoundingClientRect();
        if (ecranEtroit()) {
            // La feuille de style prend la main : la fiche occupe la largeur.
            fiche.style.left = '';
            fiche.style.top = Math.max(8, Math.min(r.bottom + 8, window.innerHeight - 260)) + 'px';
            return;
        }
        const largeur = fiche.offsetWidth || 340;
        const hauteur = fiche.offsetHeight || 260;
        let gauche = r.left;
        if (gauche + largeur > window.innerWidth - 12) gauche = window.innerWidth - largeur - 12;
        let haut = r.bottom + 8;
        if (haut + hauteur > window.innerHeight - 12) haut = Math.max(8, r.top - hauteur - 8);
        fiche.style.left = Math.max(8, gauche) + 'px';
        fiche.style.top = Math.max(8, haut) + 'px';
    };

    /** Vrai sur les ecrans ou le panneau et le formulaire ne tiennent pas
        cote a cote. Le seuil est celui de la feuille de style. */
    const ecranEtroit = () => window.innerWidth <= 560;

    const fermerFiche = () => {
        cible = null;
        ui.fiche.classList.remove('ap-ouvert');
        vider(ui.fiche);
        // Sur ecran etroit, la liste avait cede la place a la saisie.
        if (mode) ui.panneau.classList.add('ap-ouvert');
    };

    /**
     * @param texteDeja remarque deja saisie, quand le formulaire est
     *   RECONSTRUIT sans avoir ete ferme (changement de nom). Reconstruire
     *   une saisie en cours sans la reporter la ferait disparaitre sous les
     *   doigts de qui ecrit : c'est le meme tort que de perdre une note.
     */
    const ouvrirFiche = (el, texteDeja) => {
        cible = el;
        const fiche = ui.fiche;
        vider(fiche);

        const extrait = extraitDe(el);
        fiche.appendChild(creer('div', 'ap-fiche-titre', T('formulaire.titre')));
        fiche.appendChild(creer('div', 'ap-fiche-cible',
            extrait ? T('formulaire.sur', { extrait: extrait }) : T('formulaire.sur_sans_texte')));

        const nom = champNom();
        if (nom) {
            fiche.appendChild(nom.bloc);
        } else {
            /* Le nom est deja connu : on le RAPPELLE ici, avec de quoi en
               changer, au lieu de le laisser en pied de panneau ou personne ne
               le voit en ecrivant. Signaler qui l'on signe au moment ou l'on
               signe evite qu'une remarque parte sous le nom d'un collegue qui
               a utilise le meme poste. */
            const rappel = creer('div', 'ap-fiche-signature');
            rappel.appendChild(creer('span', null, T('auteur.connu', { nom: auteur })));
            const changer = creer('button', 'ap-lien', T('auteur.changer'));
            changer.type = 'button';
            changer.addEventListener('click', () => {
                // La remarque en cours est REPORTEE dans le formulaire
                // reconstruit : changer de nom ne coute pas ce qu'on a ecrit.
                const enCours = zone.value;
                ecrireAuteur('');
                ouvrirFiche(el, enCours);
            });
            rappel.appendChild(changer);
            fiche.appendChild(rappel);
        }

        const zone = creer('textarea', 'ap-zone');
        zone.setAttribute('placeholder', T('formulaire.texte_placeholder'));
        zone.setAttribute('maxlength', String(MAX_TEXTE));
        if (typeof texteDeja === 'string') zone.value = texteDeja;
        fiche.appendChild(zone);

        const actions = creer('div', 'ap-actions');
        const envoyer = creer('button', 'ap-primaire', T('formulaire.envoyer'));
        envoyer.type = 'button';
        const annuler = creer('button', 'ap-secondaire', T('formulaire.annuler'));
        annuler.type = 'button';
        const compteur = creer('span', 'ap-compteur',
            T('formulaire.restants', { n: Math.max(0, MAX_TEXTE - zone.value.length) }));
        actions.appendChild(envoyer);
        actions.appendChild(annuler);
        actions.appendChild(compteur);
        fiche.appendChild(actions);

        zone.addEventListener('input', () => {
            compteur.textContent = T('formulaire.restants',
                { n: Math.max(0, MAX_TEXTE - zone.value.length) });
        });
        annuler.addEventListener('click', () => fermerFiche());

        const dire = (panne) => {
            const ancien = fiche.querySelector('.ap-erreur');
            if (ancien) ancien.remove();
            if (panne) fiche.insertBefore(blocPanne(panne), fiche.firstChild);
        };

        envoyer.addEventListener('click', () => {
            const texte = zone.value.trim();
            const quiEcrit = nom ? normaliser(nom.champ.value) : auteur;
            if (!quiEcrit) return dire({ titre: T('erreur.titre'), detail: T('formulaire.nom_manquant') });
            if (!texte) return dire({ titre: T('erreur.titre'), detail: T('formulaire.texte_manquant') });
            if (texte.length > MAX_TEXTE) {
                return dire({
                    titre: T('erreur.titre'),
                    detail: T('formulaire.trop_long', { n: texte.length, max: MAX_TEXTE })
                });
            }
            dire(null);
            envoyer.disabled = true;
            annuler.disabled = true;
            envoyer.textContent = T('formulaire.envoi');

            /* Le chemin de page part dans la CHARGE, jamais dans la chaine de
               requete : le serveur regroupe par index aveugle. En mode clair il
               le range quand meme dans sa colonne « page », comme au format 1. */
            corpsDeNote({
                page: cheminDePage(),
                selecteur: cheminCss(el),
                empreinte: empreinteDe(el),
                extrait: extrait,
                auteur: quiEcrit,
                texte: texte,
                version: VERSION_SITE,
                environnement: ENVIRONNEMENT,
                fenetre: fenetreCourante()
            }, null).then((corps) => appeler('ajout', corps)).then((r) => {
                envoyer.disabled = false;
                annuler.disabled = false;
                envoyer.textContent = T('formulaire.envoyer');
                if (!r.ok) {
                    // La remarque reste a l'ecran. Rien n'est perdu, et la
                    // personne sait que rien n'est enregistre.
                    dire(panneDe(r, 'erreur.titre'));
                    return;
                }
                ecrireAuteur(quiEcrit);
                fermerFiche();
                recharger();
            }, () => {
                envoyer.disabled = false;
                annuler.disabled = false;
                envoyer.textContent = T('formulaire.envoyer');
                dire({ titre: T('erreur.titre'), detail: T('erreur.chiffrement') });
            });
        });

        // Sur ecran etroit, ecrire et lire la liste en meme temps est
        // impossible : la saisie prend toute la place, la liste revient a la
        // fermeture du formulaire.
        if (ecranEtroit()) ui.panneau.classList.remove('ap-ouvert');
        fiche.classList.add('ap-ouvert');
        positionnerFiche(el);
        window.setTimeout(() => (nom ? nom.champ : zone).focus(), 0);
    };

    /* -- 17. Le mode annotation ---------------------------------------------- */

    const surviser = (evenement) => {
        const el = evenement.target;
        if (!el || el.nodeType !== 1 || dansOutil(el)) return;
        if (el === document.body || el === document.documentElement) return;
        survole = el;
        montrerSurbrillance(el);
    };

    const surClic = (evenement) => {
        const el = evenement.target;
        // Un clic sur l'outil lui-meme : on laisse l'evenement descendre dans
        // le shadow root, ou nos propres boutons l'attendent.
        if (dansOutil(el)) return;
        // Tout le reste est capte : en mode annotation, on designe, on ne
        // navigue pas. C'est ce qui evite qu'un clic sur un lien emporte la
        // personne ailleurs au moment ou elle voulait le commenter.
        evenement.preventDefault();
        evenement.stopPropagation();
        if (evenement.type !== 'click') return;
        if (!el || el.nodeType !== 1) return;
        if (el === document.body || el === document.documentElement) return;
        ouvrirFiche(el);
    };

    const surTouche = (evenement) => {
        if (evenement.key !== 'Escape') return;
        if (ui.fiche.classList.contains('ap-ouvert')) {
            fermerFiche();
            return;
        }
        quitterMode();
    };

    const entrerMode = () => {
        mode = true;
        ui.bouton.setAttribute('aria-pressed', 'true');
        ui.boutonTexte.textContent = T('bouton.fermer');
        ui.panneau.classList.add('ap-ouvert');

        document.addEventListener('pointerover', surviser, true);
        document.addEventListener('pointerdown', surClic, true);
        document.addEventListener('click', surClic, true);
        document.addEventListener('auxclick', surClic, true);
        document.addEventListener('keydown', surTouche, true);
        window.addEventListener('scroll', rafraichirPositions, true);
        window.addEventListener('resize', rafraichirPositions);
        // Un carrousel, un menu deroulant, une image chargee en retard
        // deplacent les elements sans emettre ni scroll ni resize.
        minuterie = window.setInterval(rafraichirPositions, 500);

        // Les marqueurs de ce qu'on sait DEJA, tout de suite ; le serveur est
        // interroge ensuite et corrigera s'il y a du nouveau. Attendre le
        // reseau pour montrer ce qui est deja a l'ecran ferait croire a une
        // page vide.
        dessinerMarqueurs();
        recharger();
    };

    const quitterMode = () => {
        mode = false;
        ui.bouton.setAttribute('aria-pressed', 'false');
        ui.boutonTexte.textContent = T('bouton.ouvrir');
        ui.panneau.classList.remove('ap-ouvert');
        fermerFiche();
        cacherSurbrillance();
        survole = null;
        vider(ui.marqueurs);

        document.removeEventListener('pointerover', surviser, true);
        document.removeEventListener('pointerdown', surClic, true);
        document.removeEventListener('click', surClic, true);
        document.removeEventListener('auxclick', surClic, true);
        document.removeEventListener('keydown', surTouche, true);
        window.removeEventListener('scroll', rafraichirPositions, true);
        window.removeEventListener('resize', rafraichirPositions);
        if (minuterie) {
            window.clearInterval(minuterie);
            minuterie = null;
        }
    };

    const basculerMode = () => (mode ? quitterMode() : entrerMode());

    /* ==== 70-installation.js ==== */

    /* -- 18. L'installation, et le sel qu'on colle ---------------------------

       Ces ecrans sont les seuls endroits ou le sel s'affiche ou se saisit. Ils
       sont BLOQUANTS : tant que le sel n'est pas connu, l'outil ne montre ni
       bouton d'annotation, ni panneau de notes. Il n'y a rien a annoter sans
       sel — pas meme en mode clair, ou l'index de page est deja un HMAC.

       Aucun de ces ecrans ne fait de requete reseau. Consequence a dire : une
       page qui porte une balise avec un projet, sur un site dont le serveur n'est
       pas encore configure, montrera quand meme l'ecran « collez le sel ». C'est
       assume : sans sel on ne peut meme pas demander la liste des notes, donc pas
       verifier que le serveur repond. La balise, elle, a bien ete posee la par
       quelqu'un. */

    /** Retire l'interface courante sans toucher a la feuille de style. */
    const viderCouche = () => {
        if (!racine) return;
        const anciennes = racine.querySelectorAll('.ap-couche');
        for (let i = 0; i < anciennes.length; i += 1) anciennes[i].remove();
        ui = null;
    };

    /**
     * Un panneau seul, ouvert, sans bouton d'annotation derriere.
     * @return { corps, panneau }
     */
    const ecranBloquant = (titre, large) => {
        if (!hote) batirHote();
        viderCouche();

        const couche = creer('div', 'ap-couche');
        racine.appendChild(couche);

        const panneau = creer('aside', 'ap-panneau ap-ouvert' + (large ? ' ap-panneau-large' : ''));
        panneau.setAttribute('role', 'complementary');
        const entete = creer('div', 'ap-panneau-entete');
        entete.appendChild(creer('span', 'ap-panneau-titre', titre));
        const fermer = creer('button', 'ap-lien', T('panneau.fermer'));
        fermer.type = 'button';
        fermer.addEventListener('click', () => {
            // On se retire pour ce chargement de page. Rien n'est memorise : au
            // rechargement suivant, l'ecran revient, parce que le probleme, lui,
            // n'a pas ete regle.
            if (hote) hote.remove();
            hote = null;
            racine = null;
            ui = null;
        });
        entete.appendChild(fermer);
        const corps = creer('div', 'ap-panneau-corps');
        panneau.appendChild(entete);
        panneau.appendChild(corps);
        couche.appendChild(panneau);
        return { corps: corps, panneau: panneau };
    };

    /** Une valeur a recopier : elle est SELECTIONNABLE, et copiable d'un bouton. */
    const blocCopiable = (parent, etiquette, valeur) => {
        parent.appendChild(creer('div', 'ap-etiquette', etiquette));
        const bloc = creer('div', 'ap-copie');
        const zone = creer('textarea', 'ap-code');
        zone.value = valeur;
        zone.readOnly = true;
        zone.rows = valeur.length > 90 ? 4 : 2;
        zone.setAttribute('spellcheck', 'false');
        zone.addEventListener('focus', () => zone.select());
        bloc.appendChild(zone);

        const copier = creer('button', 'ap-secondaire', T('installation.copier'));
        copier.type = 'button';
        copier.addEventListener('click', () => {
            const dire = (cle) => {
                copier.textContent = T(cle);
                window.setTimeout(() => { copier.textContent = T('installation.copier'); }, 2000);
            };
            // Le presse-papier peut etre refuse (contexte non sur, permission).
            // On le dit et on laisse la selection faire le travail, plutot que de
            // laisser croire que la copie a eu lieu.
            try {
                navigator.clipboard.writeText(valeur)
                    .then(() => dire('installation.copie'), () => {
                        zone.select();
                        dire('installation.copie_echec');
                    });
            } catch (e) {
                zone.select();
                dire('installation.copie_echec');
            }
        });
        bloc.appendChild(copier);
        parent.appendChild(bloc);
        return zone;
    };

    /** La balise exacte a coller, avec l'empreinte SRI REELLEMENT servie. */
    const baliseAColler = (identifiant) => {
        let t = '<script src="' + script.src + '"';
        // On recopie l'integrite et le crossorigin de la balise en cours : ce sont
        // ceux qui fonctionnent, ici, maintenant. Une empreinte recopiee d'une
        // documentation est une empreinte d'une autre version.
        const attribut = (nom) => (script.getAttribute(nom) || '').trim();
        if (attribut('integrity')) t += '\n        integrity="' + attribut('integrity') + '"';
        if (attribut('crossorigin')) t += '\n        crossorigin="' + attribut('crossorigin') + '"';
        if (ADRESSE_DECLAREE) t += '\n        data-serveur="' + ADRESSE_DECLAREE + '"';
        t += '\n        data-projet="' + identifiant + '"';
        if (MODE === 'clair') t += '\n        data-mode="clair"';
        if (PREFIXE_CHEMIN) t += '\n        data-chemin="' + PREFIXE_CHEMIN + '"';
        t += '\n        defer></' + 'script>';
        return t;
    };

    const configurationServeur = (identifiant) =>
        'projet ' + identifiant + '\n'
        + '  origines  ' + location.origin + '\n'
        + '  mode      ' + MODE;

    /* -- L'ecran « collez le sel » ------------------------------------------ */

    const ouvrirEcranSel = () => {
        const ecran = ecranBloquant(T('sel.titre'), false);
        ecran.corps.appendChild(creer('p', 'ap-aide', T('sel.aide')));
        ecran.corps.appendChild(creer('p', 'ap-aide', T('sel.origine_changee')));

        ecran.corps.appendChild(creer('div', 'ap-etiquette', T('sel.etiquette')));
        const champ = creer('input', 'ap-champ');
        champ.type = 'text';
        champ.setAttribute('autocomplete', 'off');
        champ.setAttribute('spellcheck', 'false');
        champ.setAttribute('maxlength', String(LONGUEUR_SEL + 8));
        ecran.corps.appendChild(champ);

        const actions = creer('div', 'ap-actions');
        const valider = creer('button', 'ap-primaire', T('sel.valider'));
        valider.type = 'button';
        actions.appendChild(valider);
        ecran.corps.appendChild(actions);

        const dire = (detail) => {
            const ancien = ecran.corps.querySelector('.ap-erreur');
            if (ancien) ancien.remove();
            if (detail) {
                ecran.corps.insertBefore(
                    blocPanne({ titre: T('sel.titre'), detail: detail }), ecran.corps.firstChild);
            }
        };

        valider.addEventListener('click', () => {
            const brut = normaliser(champ.value).replace(/\s+/g, '');
            if (!brut) return dire(T('sel.vide'));
            const octets = selDepuisTexte(brut);
            if (!octets) return dire(T('sel.forme'));
            dire(null);
            valider.disabled = true;

            /* La verification se fait ICI : on rederive l'identifiant de projet et
               on le compare a celui de la balise. Egaux, le sel est le bon. Rien
               n'est envoye au reseau et rien n'est dechiffre avant ce test — c'est
               ce qui evite d'avoir a transporter une somme de controle a cote du
               sel : l'identifiant de projet joue deja ce role, et il est public. */
            deriver(octets).then((derivees) => {
                valider.disabled = false;
                if (derivees.identifiant !== PROJET) return dire(T('sel.mauvais'));
                if (!ecrireSel(PROJET, brut)) {
                    // Le stockage refuse : on continue quand meme pour cette
                    // page, mais on ne fait pas croire que c'est retenu.
                    dire(T('sel.non_retenu'));
                }
                demarrerAvecSel(brut, derivees);
            }, () => {
                valider.disabled = false;
                dire(T('erreur.chiffrement'));
            });
        });

        window.setTimeout(() => champ.focus(), 0);
    };

    /* -- L'ecran d'installation --------------------------------------------- */

    const ouvrirEcranInstallation = () => {
        const ecran = ecranBloquant(T('installation.titre'), true);

        if (!API) ecran.corps.appendChild(creer('p', 'ap-aide', T('installation.sans_serveur')));
        if (MODE === 'clair') ecran.corps.appendChild(creer('p', 'ap-aide', T('installation.mode_clair')));

        const engendrer = creer('button', 'ap-primaire', T('installation.engendrer'));
        engendrer.type = 'button';
        ecran.corps.appendChild(engendrer);

        engendrer.addEventListener('click', () => {
            engendrer.disabled = true;
            const nouveau = engendrerSel();
            const octets = selDepuisTexte(nouveau);
            deriver(octets).then((derivees) => {
                vider(ecran.corps);

                /* L'avertissement vient AVANT le sel, et avant le bouton qui
                   continue. Il est ecrit en toutes lettres, pas en note de bas de
                   page : c'est le seul secret du projet, et il n'existe aucune
                   recuperation. */
                const avert = creer('div', 'ap-erreur');
                avert.setAttribute('role', 'alert');
                avert.appendChild(creer('div', 'ap-erreur-titre', T('installation.avertissement_titre')));
                avert.appendChild(creer('p', 'ap-erreur-detail', T('installation.avertissement')));
                ecran.corps.appendChild(avert);

                blocCopiable(ecran.corps, T('installation.sel'), nouveau);
                blocCopiable(ecran.corps, T('installation.projet'), derivees.identifiant);
                blocCopiable(ecran.corps, T('installation.balise'), baliseAColler(derivees.identifiant));
                blocCopiable(ecran.corps, T('installation.serveur'), configurationServeur(derivees.identifiant));

                const actions = creer('div', 'ap-actions');
                const continuer = creer('button', 'ap-primaire', T('installation.continuer'));
                continuer.type = 'button';
                continuer.addEventListener('click', () => {
                    const retenu = ecrireSel(derivees.identifiant, nouveau);
                    const fin = creer('p', 'ap-aide',
                        retenu ? T('installation.faite') : T('sel.non_retenu'));
                    actions.replaceWith(fin);
                });
                actions.appendChild(continuer);
                ecran.corps.appendChild(actions);
            }, () => {
                engendrer.disabled = false;
                ecran.corps.appendChild(blocPanne({
                    titre: T('installation.titre'), detail: T('erreur.chiffrement')
                }));
            });
        });
    };

    /* -- L'ecran « ce navigateur ne peut pas » ------------------------------- */

    const ouvrirEcranContexte = () => {
        const ecran = ecranBloquant(T('contexte.titre'), false);
        ecran.corps.appendChild(creer('p', 'ap-aide', T('contexte.aide')));
    };

    /* ==== 90-demarrage.js ==== */

    /* -- 19. Lecture des notes ----------------------------------------------- */

    const redessiner = () => {
        if (!ui) return;
        ancrer();
        dessinerPanneau();
        dessinerMarqueurs();
    };

    const recharger = () =>
        appeler('liste').then((r) => {
            if (!r.ok) {
                // L'outil est deja en place : on ne se tait plus. Les notes deja
                // affichees restent, avec l'avertissement qu'elles peuvent etre
                // incompletes.
                const panne = panneDe(r, 'erreur.titre_lecture');
                panne.detail = panne.detail + '\n' + T('erreur.lecture_incomplete');
                panneEnCours = panne;
                redessiner();
                return null;
            }
            return lireListe(r.donnees).then((lues) => {
                notes = lues;
                panneEnCours = null;
                redessiner();
                return null;
            });
        });

    /* -- 20. Demarrage --------------------------------------------------------
       L'ordre compte : on interroge l'API AVANT de toucher au DOM. Si elle ne
       repond pas ce qu'il faut, le site n'a jamais rien vu passer.

       Une seule exception, assumee : les ecrans d'installation et de collage du
       sel, qui ne peuvent PAS interroger l'API — sans sel, il n'y a pas d'index
       de page a lui donner. Ils sont declares (data-installation) ou demandes par
       une balise qui porte deja un projet : dans les deux cas, quelqu'un a pose
       cette balise ici expres. */

    let libellesLocauxCharges = false;

    const chargerLibellesLocaux = () => {
        if (!URL_LIBELLES_LOCAUX || libellesLocauxCharges || !racine) return Promise.resolve();
        libellesLocauxCharges = true;
        return new Promise((resoudre) => {
            const s = document.createElement('script');
            s.src = URL_LIBELLES_LOCAUX;
            s.addEventListener('load', () => resoudre(true));
            s.addEventListener('error', () => resoudre(false));
            // DANS LE SHADOW ROOT, et non dans <head> ou <body> : un script insere
            // dans un shadow root est execute comme n'importe quel autre — il est
            // connecte au document — mais il n'apparait ni dans
            // document.querySelectorAll('script'), ni dans le comptage des noeuds
            // de la page. Le seul noeud que le site recoit reste l'element hote,
            // et c'est verifiable : +1 element, pas +2.
            racine.appendChild(s);
        });
    };

    const retirer = () => {
        if (hote) hote.remove();
        hote = null;
        racine = null;
        ui = null;
    };

    /** Un ecran bloquant : l'hote existe des maintenant, les libelles d'abord. */
    const prevoirEcran = (ouvrir) => {
        batirHote();
        chargerLibellesLocaux().then(ouvrir);
    };

    /**
     * Le serveur a-t-il quelque chose a DIRE au demarrage ?
     *
     * « inactif », « nonjson » et « reseau » sont des silences : l'outil n'est pas
     * configure ici, PHP ne tourne pas, ou le navigateur est hors ligne. Personne
     * n'a encore rien ecrit, il n'y a rien a annoncer.
     *
     * Un REFUS, lui, se dit — et c'est un changement volontaire par rapport a
     * l'outil d'origine. Un pare-feu qui repond 403 des la premiere requete
     * rendait l'outil entierement invisible : on cherchait la panne dans le
     * mauvais fichier pendant une demi-journee. La balise porte un projet, donc
     * quelqu'un l'a posee ici expres : on parle.
     */
    const parleAuDemarrage = (r) =>
        r.cause === 'serveur' || r.cause === 'panne' || String(r.cause).indexOf('refus') === 0;

    /**
     * Le sel est connu et verifie : on derive l'index de page, on interroge le
     * serveur, et l'outil prend sa forme normale.
     */
    function demarrerAvecSel(texte, derivees) {
        selTexte = texte;
        cles = derivees;

        return indexDeChemin(cles.cleIndex, cheminDePage())
            .then((index) => {
                INDEX_PAGE = index;
                return appeler('liste');
            })
            .then((premier) => {
                if (!premier.ok && !parleAuDemarrage(premier)) {
                    // Silence complet : ni noeud, ni pixel, ni message. Si un
                    // ecran de sel etait ouvert, il s'en va avec le reste.
                    retirer();
                    return null;
                }

                // A partir d'ici l'outil EXISTE, et ne se taira plus sur ses
                // pannes.
                batirHote();
                return chargerLibellesLocaux().then(() => {
                    viderCouche();
                    batirUi();
                    if (premier.ok) {
                        return lireListe(premier.donnees).then((lues) => {
                            notes = lues;
                            redessiner();
                            return null;
                        });
                    }
                    panneEnCours = panneDe(premier, 'erreur.titre_lecture');
                    redessiner();
                    return null;
                });
            });
    }

    const demarrer = () => {
        auteur = lireAuteur();

        // Hors de la portee du projet : silence. La balise peut donc vivre dans un
        // gabarit commun a tout le site.
        if (!dansLaPortee()) return;

        if (!CRYPTO) {
            // Sans contexte sur, rien n'est possible — mais si quelqu'un a
            // declare un projet ici, il a le droit de savoir pourquoi.
            if (PROJET || INSTALLATION_DEMANDEE) prevoirEcran(ouvrirEcranContexte);
            return;
        }

        if (!PROJET) {
            if (INSTALLATION_DEMANDEE) prevoirEcran(ouvrirEcranInstallation);
            return;
        }

        const texte = lireSel(PROJET);
        const octets = selDepuisTexte(texte);
        if (!octets) {
            prevoirEcran(ouvrirEcranSel);
            return;
        }

        deriver(octets).then((derivees) => {
            if (derivees.identifiant !== PROJET) {
                // Le sel range sous cette cle ne derive pas cet identifiant : la
                // balise a change de projet, ou le stockage a ete bricole. On
                // redemande, on ne devine pas.
                prevoirEcran(ouvrirEcranSel);
                return null;
            }
            return demarrerAvecSel(texte, derivees);
        }, () => {
            prevoirEcran(ouvrirEcranSel);
        });
    };

    if (document.body) {
        demarrer();
    } else {
        document.addEventListener('DOMContentLoaded', demarrer);
    }
}());
