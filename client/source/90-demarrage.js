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
