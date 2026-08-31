/* export-texte.mjs — LIRE ET ECRIRE LA GRAMMAIRE DES QUATRE MARGES.
 *
 * FORMAT.md §5 decrit DEUX producteurs pour UNE grammaire : le serveur, en
 * mode clair ; ce paquet, en mode chiffre. Ce fichier est la moitie qui nous
 * revient, et il fait les deux sens — lire ce que le serveur envoie, ecrire
 * ce que l'assistant lira.
 *
 * Les faire dans le meme fichier n'est pas une commodite : c'est la seule
 * facon que l'analyseur et l'ecrivain restent d'accord. Un format lu ici et
 * ecrit ailleurs derive a la premiere addition.
 *
 *      0 espace   ligne de structure d'une note
 *      2 espaces  ligne de structure d'une reponse
 *      4 espaces  texte d'une note
 *      6 espaces  texte d'une reponse
 *
 * LA CLE N'EST PAS LE PREMIER MOT. C'est le plus long prefixe de la ligne qui
 * figure dans la liste FERMEE des cles, et la valeur est le reste. Le format 1
 * laissait la regle implicite et se contredisait lui-meme : « a la note »
 * compte trois mots, « index-page » n'en compte qu'un mais « notes 128 » de
 * l'en-tete commence par « note ». On lit du plus long au plus court, et
 * l'ambiguite disparait.
 *
 * TROIS PIEGES DE L'ANALYSE, tires de la grammaire elle-meme. Ils ne sont pas
 * theoriques : chacun rend, si on l'ignore, un export a moitie lu sans que
 * rien ne le signale.
 *
 *  1. UNE LIGNE VIDE NE SEPARE PAS TOUJOURS DEUX NOTES. Une remarque peut
 *     contenir un paragraphe vide, et l'ecrivain laisse alors une ligne
 *     VRAIMENT vide, sans les quatre espaces (des espaces en fin de ligne
 *     sont ce qu'un outil de recuperation supprime le premier). Une ligne
 *     vide est donc mise EN ATTENTE : elle rejoint le texte si une ligne de
 *     texte suit, elle separe si une ligne de structure suit.
 *
 *  2. UN TEXTE PEUT ETRE INDENTE PLUS QUE SA MARGE. Une remarque qui cite du
 *     code commence par des espaces, et l'ecrivain les conserve. Dans un bloc
 *     de texte de marge M, toute ligne d'au moins M espaces est du texte ;
 *     seule une ligne de MOINS de M espaces le referme. C'est sans ambiguite
 *     parce que les deux marges de structure, 0 et 2, sont inferieures aux
 *     deux marges de texte, 4 et 6 — c'est exactement ce qu'achete l'ecart de
 *     quatre espaces.
 *
 *  3. UNE CLE INCONNUE S'IGNORE EN SILENCE, et un export d'un numero de
 *     format superieur se lit quand meme (FORMAT.md §7). Un lecteur qui
 *     echoue sur ce qu'il ne connait pas rend la premiere addition
 *     impossible. C'est l'inverse exact de la regle des enveloppes, ou un
 *     numero superieur est un refus net : on ne devine pas une cryptographie,
 *     on devine une ligne de texte.
 */

import { FORMAT, valeurSure, indenter, dateIso } from './format.mjs';

/* -- Les cles, par endroit ou elles peuvent paraitre ---------------------- */

const CLES_ENTETE = ['outil', 'format', 'version', 'projet', 'chiffrement',
                     'export', 'notes'];

/* Le pied de l'export. Ces deux cles ne sont JAMAIS des champs de note, meme
   quand elles suivent une note : sans cette exception, le compte des lignes
   ignorees se retrouverait range dans la derniere remarque de la liste. */
const CLES_PIED = ['ignorees', 'ignorees-raison'];

const CLES_COMMUNES = ['mode', 'auteur', 'date', 'version', 'environnement',
                       'fenetre', 'etat', 'corrigee', 'texte',
                       'charge', 'charge-resolution'];

const CLES_NOTE = ['note', 'page', 'index-page', 'element', 'extrait']
    .concat(CLES_COMMUNES);

const CLES_REPONSE = ['reponse', 'a la note'].concat(CLES_COMMUNES);

/** Toutes les cles connues, du plus long au plus court. */
const trier = (liste) => liste.slice().sort((a, b) => b.length - a.length);

const CLES_MARGE_0 = trier([].concat(CLES_ENTETE, CLES_PIED, CLES_NOTE));
const CLES_MARGE_2 = trier(CLES_REPONSE);

/**
 * Coupe une ligne en « cle » et « valeur », ou rend null si aucune cle
 * connue ne la commence.
 *
 * La cle doit etre suivie d'une espace ou de la fin de la ligne : sans cette
 * exigence, « notes 128 » serait lu comme la cle « note » suivie de « s 128 »
 * dans une liste ou « notes » ne figurerait pas encore.
 */
const couper = (ligne, cles) => {
    for (const cle of cles) {
        if (ligne === cle) return { cle, valeur: '' };
        if (ligne.length > cle.length && ligne.startsWith(cle + ' ')) {
            return { cle, valeur: ligne.slice(cle.length + 1) };
        }
    }
    return null;
};

const compterEspaces = (ligne) => {
    let n = 0;
    while (n < ligne.length && ligne.charAt(n) === ' ') n += 1;
    return n;
};

/**
 * « corrigee <date> par <nom> en <version> » -> les trois morceaux.
 *
 * En mode chiffre, le serveur n'ecrit que la date : il ne connait pas le nom.
 * La cle reste « corrigee » et la valeur est le reste de la ligne — le
 * contrat ne dit nulle part que ce reste doive contenir un nom.
 *
 * AMBIGUITE ASSUMEE, et il vaut mieux l'ecrire que la decouvrir : un nom qui
 * contient « en » entoure d'espaces se lit de travers. On prend la DERNIERE
 * occurrence, parce qu'une version, elle, n'en contient jamais. Un nom mal
 * coupe reste affiche en entier dans « corrigee », qu'on ne reecrit pas.
 */
const lireCorrigee = (valeur) => {
    const espace = valeur.indexOf(' ');
    if (espace === -1) return { date: valeur, par: '', version: '' };
    const date = valeur.slice(0, espace);
    let reste = valeur.slice(espace + 1);
    if (!reste.startsWith('par ')) return { date, par: '', version: '' };
    reste = reste.slice(4);
    const en = reste.lastIndexOf(' en ');
    if (en === -1) return { date, par: reste, version: '' };
    return { date, par: reste.slice(0, en), version: reste.slice(en + 4) };
};

const noteVide = () => ({
    id: 0, reponse_a: null, mode: 'clair',
    page: '', index_page: '', selecteur: '', extrait: '',
    auteur: '', texte: '', cree_le: '',
    version: '', environnement: '', fenetre: '',
    resolue_le: null, resolue_par: '', resolue_version: '',
    charge: '', charge_resolution: '',
    reponses: [],
});

/** Range une ligne « cle valeur » dans une note. Les cles inconnues n'entrent
    jamais ici : elles ont deja ete ignorees par couper(). */
const ranger = (note, cle, valeur) => {
    switch (cle) {
        case 'note': case 'reponse': note.id = parseInt(valeur, 10) || 0; break;
        case 'a la note': note.reponse_a = parseInt(valeur, 10) || 0; break;
        case 'page': note.page = valeur; break;
        case 'index-page': note.index_page = valeur; break;
        case 'element': note.selecteur = valeur; break;
        case 'extrait': note.extrait = valeur; break;
        case 'mode': note.mode = valeur; break;
        case 'auteur': note.auteur = valeur; break;
        case 'date': note.cree_le = valeur; break;
        case 'version': note.version = valeur; break;
        case 'environnement': note.environnement = valeur; break;
        case 'fenetre': note.fenetre = valeur; break;
        case 'charge': note.charge = valeur; break;
        case 'charge-resolution': note.charge_resolution = valeur; break;
        case 'etat': break;   // « etat ouverte » : l'absence de « corrigee » suffit
        case 'corrigee': {
            const lu = lireCorrigee(valeur);
            note.resolue_le = lu.date;
            note.resolue_par = lu.par;
            note.resolue_version = lu.version;
            break;
        }
        default: break;
    }
};

/**
 * Analyse un export et rend { entete, notes, pied }.
 *
 * Les notes sont dans l'ordre de l'export, chaque mere portant ses reponses.
 * Rien n'est valide au-dela de la grammaire : une date qui n'en est pas une
 * ressort telle quelle. Ce n'est pas de la negligence — cet analyseur lit
 * aussi les exports d'un format plus recent que le sien, et refuser une
 * valeur qu'on ne comprend pas ferait perdre les autres.
 */
export const lireExport = (texte) => {
    const entete = {};
    const pied = {};
    const notes = [];

    let courante = null;      // la note mere en cours
    let cible = null;         // la note ou la reponse qui recoit les lignes
    let margeTexte = -1;      // -1 : on n'est pas dans un bloc de texte
    let morceauxTexte = [];
    let blancsEnAttente = 0;

    const fermerTexte = () => {
        if (margeTexte === -1) return;
        // Les lignes vides EN ATTENTE au moment de fermer sont perdues : ce
        // sont celles qui separent la note de la suivante, pas des lignes du
        // texte. C'est la reciproque exacte du piege 1.
        cible.texte = morceauxTexte.join('\n');
        margeTexte = -1;
        morceauxTexte = [];
    };

    for (const ligne of String(texte == null ? '' : texte).split('\n')) {
        if (ligne.trim() === '') {
            // En attente : cette ligne vide appartient au texte si du texte
            // suit, elle separe deux notes sinon. On ne peut pas trancher ici.
            blancsEnAttente += 1;
            continue;
        }

        const espaces = compterEspaces(ligne);

        if (margeTexte !== -1 && espaces >= margeTexte) {
            for (let i = 0; i < blancsEnAttente; i += 1) morceauxTexte.push('');
            blancsEnAttente = 0;
            morceauxTexte.push(ligne.slice(margeTexte));
            continue;
        }

        fermerTexte();
        blancsEnAttente = 0;

        if (espaces === 0) {
            const coupe = couper(ligne, CLES_MARGE_0);
            if (!coupe) continue;              // cle inconnue : silence (piege 3)

            if (CLES_PIED.includes(coupe.cle)) {
                pied[coupe.cle] = coupe.valeur;
                continue;
            }
            if (coupe.cle === 'note') {
                courante = noteVide();
                cible = courante;
                notes.push(courante);
                ranger(cible, coupe.cle, coupe.valeur);
                continue;
            }
            if (courante === null) {
                // Avant la premiere note : c'est l'en-tete.
                if (CLES_ENTETE.includes(coupe.cle)) entete[coupe.cle] = coupe.valeur;
                continue;
            }
            if (coupe.cle === 'texte') {
                cible = courante;
                margeTexte = 4;
                continue;
            }
            cible = courante;
            ranger(cible, coupe.cle, coupe.valeur);
            continue;
        }

        if (espaces === 2 && courante !== null) {
            const coupe = couper(ligne.slice(2), CLES_MARGE_2);
            if (!coupe) continue;
            if (coupe.cle === 'reponse') {
                cible = noteVide();
                cible.reponse_a = courante.id;
                courante.reponses.push(cible);
                ranger(cible, coupe.cle, coupe.valeur);
                continue;
            }
            if (cible === null || cible === courante) {
                // Une ligne de reponse sans « reponse » qui la commence : la
                // ligne est orpheline, on ne la range nulle part plutot que
                // de l'attribuer a la mere.
                continue;
            }
            if (coupe.cle === 'texte') {
                margeTexte = 6;
                continue;
            }
            ranger(cible, coupe.cle, coupe.valeur);
            continue;
        }

        // Marge inattendue hors bloc de texte : on l'ignore, comme une cle
        // inconnue. Elle vient d'un format plus recent, ou d'un fichier
        // recopie de travers ; dans les deux cas le reste se lit.
    }

    fermerTexte();

    return { entete, notes, pied };
};

/* -- L'ecriture ----------------------------------------------------------
   Ce que produit ce paquet est, mot pour mot, ce que le serveur produirait
   s'il avait le sel. Un outil qui lit l'export ne sait pas — et n'a pas a
   savoir — lequel des deux producteurs l'a ecrit. C'est FORMAT.md §5.3, et
   c'est pourquoi il n'y a ici AUCUNE ligne « produit par le paquet MCP » :
   elle serait commode, et elle romprait la seule promesse du chapitre. */

const ligne = (marge, cle, valeur) => {
    const v = valeurSure(valeur);
    return v === '' ? '' : marge + cle + ' ' + v + '\n';
};

const bloc = (note, marge, estReponse) => {
    let sortie = '';
    if (estReponse) {
        sortie += marge + 'reponse ' + (parseInt(note.id, 10) || 0) + '\n';
        sortie += marge + 'a la note ' + (parseInt(note.reponse_a, 10) || 0) + '\n';
    } else {
        sortie += 'note ' + (parseInt(note.id, 10) || 0) + '\n';
        sortie += ligne('', 'page', note.page);
        sortie += ligne('', 'index-page', note.index_page);
        sortie += ligne('', 'element', note.selecteur);
        sortie += ligne('', 'extrait', note.extrait);
    }

    /* « mode chiffre » n'est emis que pour une note chiffree. Une note claire
       n'a pas de ligne « mode », et une note du format 1 non plus : la meme
       absence, la meme signification. Les exports du format 1 restent donc
       valides tels quels. */
    if (note.mode === 'chiffre') sortie += marge + 'mode chiffre\n';

    sortie += ligne(marge, 'auteur', note.auteur);
    sortie += ligne(marge, 'date', note.cree_le);
    sortie += ligne(marge, 'version', note.version);
    sortie += ligne(marge, 'environnement', note.environnement);
    sortie += ligne(marge, 'fenetre', note.fenetre);

    if (note.resolue_le) {
        sortie += marge + 'corrigee ' + valeurSure(note.resolue_le)
            + (note.resolue_par ? ' par ' + valeurSure(note.resolue_par) : '')
            + (note.resolue_version ? ' en ' + valeurSure(note.resolue_version) : '')
            + '\n';
    } else {
        sortie += marge + 'etat ouverte\n';
    }

    /* Les enveloppes ne sont PAS reecrites. Le serveur les emet parce qu'il
       n'a que cela a offrir ; nous avons le texte, et une enveloppe recopiee
       a cote de son contenu en clair n'apprend plus rien a personne — elle ne
       fait qu'allonger de mille caracteres un document destine a etre lu.
       Qui les veut les demande au serveur, c'est la meme adresse. */

    sortie += marge + 'texte\n';
    sortie += indenter(note.texte, marge + '    ');
    return sortie;
};

/**
 * L'export complet, rempli, dans la grammaire des quatre marges.
 *
 * @param {object} entete  outil, format, version, projet, chiffrement
 * @param {Array}  notes   notes dechiffrees, chacune avec ses reponses
 * @param {object} pied    ignorees, ignorees-raison — ce qu'on n'a PAS su lire
 */
export const ecrireExport = (entete, notes, pied) => {
    let sortie = '';
    sortie += 'outil annotepage\n';
    sortie += 'format ' + (entete.format || FORMAT) + '\n';
    sortie += ligne('', 'version', entete.version);
    sortie += ligne('', 'projet', entete.projet);
    sortie += ligne('', 'chiffrement', entete.chiffrement);
    sortie += 'export ' + dateIso() + '\n';
    sortie += 'notes ' + notes.reduce((n, m) => n + 1 + m.reponses.length, 0) + '\n';
    sortie += '\n';

    if (notes.length === 0) {
        sortie += 'aucune note enregistree\n';
    }

    notes.forEach((note, rang) => {
        if (rang > 0) sortie += '\n';
        sortie += bloc(note, '', false);
        for (const reponse of note.reponses) {
            sortie += '\n' + bloc(reponse, '  ', true);
        }
    });

    sortie += '\n';

    /* Ce qu'on n'a pas su lire se DIT, et se compte. Une note qui disparait
       en silence est pire qu'une note qu'on annonce ne pas savoir lire : la
       premiere fait croire que la recette est finie. */
    if (pied && pied.ignorees) {
        sortie += 'ignorees ' + pied.ignorees + '\n';
        sortie += ligne('', 'ignorees-raison', pied['ignorees-raison']);
    }

    return sortie;
};
