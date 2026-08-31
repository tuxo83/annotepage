/* notes.mjs — RECUPERER, DECHIFFRER, ECRIRE.
 *
 * C'est ici que les trois autres fichiers se rencontrent : api.mjs va
 * chercher l'export, export-texte.mjs le lit, chiffrement.mjs ouvre les
 * enveloppes. Ce qui en sort est une liste de notes lisibles, avec le compte
 * exact de ce qu'on n'a PAS su lire.
 *
 * UNE SEULE SOURCE DE LECTURE : ?action=texte. Pas ?action=liste — elle exige
 * un index de page, donc de savoir d'avance quelle page on regarde, ce qu'un
 * assistant ne sait justement pas. L'export rend tout, et FORMAT.md §8.5
 * assume qu'il n'est pas pagine.
 *
 * CE QU'ON N'A PAS SU LIRE SE COMPTE ET SE DIT. Une note qui disparait en
 * silence est pire qu'une note qu'on annonce ne pas savoir lire : la premiere
 * fait croire que la recette est finie. Trois causes, et elles ne se
 * confondent pas :
 *
 *   recentes    enveloppe d'un format plus recent. Mettez le paquet a jour.
 *   illisibles  mauvais sel, note deplacee, octets abimes. GCM ne dit pas
 *               laquelle des trois, et c'est voulu.
 *   inconnues   un mode que cette version ne connait pas.
 */

import { lireExport, ecrireExport } from './export-texte.mjs';
import { ouvrir, sceller, indexDeChemin, cheminNormalise, ErreurEnveloppe } from './chiffrement.mjs';
import {
    lireExportCache, oublierCache, ajouter, resoudre, ErreurApi,
} from './api.mjs';

export class ErreurUsage extends Error {}

const CHAMPS_DE_CHARGE = ['page', 'selecteur', 'empreinte', 'extrait',
                          'auteur', 'texte', 'version', 'environnement', 'fenetre'];

/**
 * Ouvre l'enveloppe d'une note et verse son contenu dans la ligne.
 *
 * L'index employe pour l'AAD est celui que le serveur a ECRIT sur la ligne.
 * C'est la seule source dont nous disposions, et elle est sans danger : un
 * index change ne fait pas lire une note ailleurs, il fait echouer le
 * dechiffrement. C'est exactement le role de l'AAD.
 *
 * Corollaire, dont on se sert plus bas : quand une note s'ouvre, l'index
 * annonce par le serveur est AUTHENTIFIE. Il a servi a verifier l'etiquette.
 */
const ouvrirNote = async (projet, note, indexPage, comptes) => {
    if (note.mode === '' || note.mode === 'clair') return note;

    if (note.mode !== 'chiffre') {
        comptes.inconnues += 1;
        return null;
    }
    if (!projet.cles) {
        // Configuration en mode clair devant une note chiffree. Ce n'est pas
        // une erreur de format : c'est une base mixte lue avec la moitie des
        // moyens. On le compte comme illisible, et le message le dira.
        comptes.sansSel += 1;
        return null;
    }
    if (note.charge === '') {
        comptes.illisibles += 1;
        return null;
    }

    let objet;
    try {
        objet = await ouvrir(projet.cles.cleChiffre, projet.identifiant, indexPage,
                             'note', note.charge);
    } catch (e) {
        if (e instanceof ErreurEnveloppe && e.raison === 'recente') comptes.recentes += 1;
        else comptes.illisibles += 1;
        return null;
    }

    // Les champs INCONNUS de l'objet sont ignores en silence : c'est ce qui
    // rend possible d'en ajouter un jour sans changer le numero de format.
    for (const cle of CHAMPS_DE_CHARGE) {
        note[cle] = objet[cle] === undefined ? '' : String(objet[cle]);
    }

    if (note.charge_resolution !== '') {
        try {
            const resolution = await ouvrir(projet.cles.cleChiffre, projet.identifiant,
                                            indexPage, 'resolution', note.charge_resolution);
            note.resolue_par = resolution.par === undefined ? '' : String(resolution.par);
            note.resolue_version = resolution.version === undefined
                ? '' : String(resolution.version);
        } catch (e) {
            /* La note se lit, sa resolution non. On garde la note :
               « corrigee par quelqu'un » vaut mieux que rien, et la date de
               correction, elle, est en clair. */
            note.resolue_par = '';
            note.resolue_version = '';
            comptes.resolutions_illisibles += 1;
        }
    }

    return note;
};

const raisonsLisibles = (comptes) => {
    const morceaux = [];
    if (comptes.recentes) {
        morceaux.push(comptes.recentes + ' ecrite(s) par une version plus recente '
            + "d'annotepage (mettez ce paquet a jour)");
    }
    if (comptes.illisibles) {
        morceaux.push(comptes.illisibles + " impossible(s) a dechiffrer : mauvais sel, "
            + 'note deplacee, ou octets abimes');
    }
    if (comptes.sansSel) {
        morceaux.push(comptes.sansSel + ' chiffree(s), alors que la configuration de ce '
            + "projet ne porte pas de sel");
    }
    if (comptes.inconnues) {
        morceaux.push(comptes.inconnues + ' portant un mode que cette version ne '
            + 'connait pas');
    }
    return morceaux.join(' ; ');
};

/**
 * L'etat complet du projet : en-tete, notes lisibles, comptes de ce qui ne
 * l'est pas.
 *
 * @returns {{entete: object, notes: Array, comptes: object, pied: object}}
 */
export const recuperer = async (projet, signal) => {
    const brut = await lireExportCache(projet, signal);
    const lu = lireExport(brut);

    const comptes = {
        recentes: 0, illisibles: 0, inconnues: 0, sansSel: 0,
        resolutions_illisibles: 0,
        /* Le serveur a peut-etre deja saute des lignes de son cote, pour la
           meme raison que nous. Son compte n'est pas le notre : on les
           additionne, on ne les remplace pas. */
        serveur: parseInt(lu.pied.ignorees, 10) || 0,
    };

    const notes = [];
    for (const note of lu.notes) {
        const indexPage = note.index_page;
        const mere = await ouvrirNote(projet, note, indexPage, comptes);
        if (!mere) continue;
        const reponses = [];
        for (const reponse of note.reponses) {
            /* Une reponse HERITE de l'index de page de sa mere : le serveur ne
               le lui redemande pas et ne l'ecrit pas dans l'export. Son AAD est
               donc celle de la mere, et c'est bien ce que le navigateur a
               scelle — il etait sur la meme page. */
            reponse.index_page = indexPage;
            const lue = await ouvrirNote(projet, reponse, indexPage, comptes);
            if (lue) reponses.push(lue);
        }
        mere.reponses = reponses;
        notes.push(mere);
    }

    const perdues = comptes.recentes + comptes.illisibles + comptes.inconnues
        + comptes.sansSel + comptes.serveur;

    return {
        entete: lu.entete,
        notes,
        comptes,
        pied: perdues === 0 ? {} : {
            ignorees: perdues,
            'ignorees-raison': raisonsLisibles(comptes)
                + (comptes.serveur
                    ? (raisonsLisibles(comptes) ? ' ; ' : '')
                      + comptes.serveur + ' deja sautee(s) par le serveur'
                    : '')
                + ". Elles n'ont pas ete affichees, et elles n'ont pas ete perdues.",
        },
    };
};

/** L'export complet, rempli, dans la grammaire des quatre marges. */
export const exportRempli = (etat, projet) =>
    ecrireExport({
        format: etat.entete.format,
        version: etat.entete.version,
        projet: etat.entete.projet || projet.identifiant,
        chiffrement: etat.entete.chiffrement,
    }, etat.notes, etat.pied);

/** Une note est ouverte tant qu'elle n'a pas de date de correction. */
export const estOuverte = (note) => !note.resolue_le;

export const trouverNote = (etat, id) => {
    const cherche = parseInt(id, 10);
    for (const note of etat.notes) {
        if (note.id === cherche) return { note, mere: null };
        for (const reponse of note.reponses) {
            if (reponse.id === cherche) return { note: reponse, mere: note };
        }
    }
    return null;
};

/* -- Ecrire -------------------------------------------------------------- */

/**
 * La politique d'ecriture de ce paquet. FORMAT.md §8.4 laisse la question
 * ouverte : « ce qu'un serveur MCP a le droit de faire seul » n'est pas
 * ecrit, et le format le permet tout entier. Voici ce qui est tranche ICI, et
 * qui n'engage que ce paquet :
 *
 *  - lecture_seule dans la configuration coupe toute ecriture. C'est le reglage
 *    a choisir quand on branche un assistant sur une recette qu'on ne connait
 *    pas encore ;
 *  - toute ecriture est SIGNEE du nom declare dans la configuration. Un fil ou
 *    tout le monde signe et ou une voix ne signe pas est un fil dont on doute
 *    entierement. Le champ « auteur » est donc obligatoire des qu'une ecriture
 *    est permise ;
 *  - ce paquet ne cree JAMAIS de note nouvelle, seulement des reponses et des
 *    resolutions. Une note d'annotepage est epinglee a un element d'une page :
 *    sans selecteur ni empreinte, ce n'est pas une note en contexte, c'est un
 *    message dans une base de notes. L'assistant n'a pas de navigateur, il n'a
 *    donc pas d'element a designer, et une note qu'il fabriquerait serait
 *    inaffichable la ou elle compte — sur la page. Le fil d'une note existante
 *    est l'endroit prevu pour qu'il parle ;
 *  - rien ne s'efface, jamais. C'est la regle de l'outil depuis le format 1 et
 *    elle n'a pas d'exception ici : marquer corrigee et rouvrir sont les deux
 *    seuls changements d'etat.
 */
const exigerEcriture = (projet) => {
    if (projet.lecture_seule) {
        throw new ErreurUsage(
            'Le projet « ' + projet.nom + ' » est declare en lecture seule dans la '
            + "configuration.\nRien n'a ete ecrit. Retirez « lecture_seule » pour "
            + 'autoriser les reponses et les resolutions.');
    }
    if (!projet.auteur) {
        throw new ErreurUsage(
            'Le projet « ' + projet.nom + ' » ne declare pas de champ « auteur ».\n'
            + "Ce paquet ne publie rien d'anonyme : dans un fil ou tout le monde signe, "
            + "une voix qui ne signe pas fait douter du fil entier.\n"
            + 'Ajoutez "auteur": "..." a la configuration de ce projet.');
    }
};

/**
 * Verifie que l'index employe pour sceller est bien celui de la page de la
 * note mere, et le rend.
 *
 * Deux garanties, et elles se completent :
 *
 *  - la mere s'est OUVERTE avec cet index : il a servi a verifier l'etiquette
 *    d'authentification, il est donc celui que le navigateur a scelle. Un
 *    serveur qui l'aurait change aurait fait echouer le dechiffrement ;
 *  - on le RECALCULE quand meme a partir du chemin dechiffre, parce que rien
 *    ne coute moins cher qu'un HMAC et que ce controle-la couvre aussi le mode
 *    clair, ou aucune etiquette n'a rien authentifie du tout.
 *
 * Si les deux ne s'accordent pas, on n'ecrit pas. Une reponse scellee sous un
 * index qui n'est pas celui de sa mere est une reponse que personne ne pourra
 * lire, et rien ne s'efface dans cet outil.
 */
const indexPourEcrire = async (projet, mere) => {
    const annonce = mere.index_page;
    if (!projet.cles || !mere.page) {
        if (!annonce) {
            throw new ErreurUsage(
                "La note " + mere.id + " ne porte pas d'index de page, et son chemin "
                + "n'est pas connu : impossible de sceller une reponse a sa place.");
        }
        return annonce;
    }
    const recalcule = await indexDeChemin(projet.cles.cleIndex, cheminNormalise(mere.page));
    if (annonce && recalcule !== annonce) {
        throw new ErreurUsage(
            "L'index de page annonce par le serveur pour la note " + mere.id
            + " ne correspond pas au chemin de cette note.\n"
            + 'Chemin      : ' + mere.page + '\n'
            + 'Index annonce   : ' + annonce + '\n'
            + 'Index recalcule : ' + recalcule + '\n'
            + "Rien n'a ete ecrit : une reponse scellee sous le mauvais index serait "
            + 'illisible par celui a qui elle s\'adresse.');
    }
    return recalcule;
};

/**
 * Repond a une note. Une reponse EST une note : meme table, meme role
 * d'enveloppe, une seule profondeur de fil.
 */
export const repondre = async (projet, etat, id, texte, signal) => {
    exigerEcriture(projet);

    const propre = String(texte == null ? '' : texte).trim();
    if (propre === '') {
        throw new ErreurUsage("Une reponse vide n'a pas de sens et ne s'efface pas.");
    }

    const trouve = trouverNote(etat, id);
    if (!trouve) {
        throw new ErreurUsage('Aucune note ' + id + ' dans ce projet.');
    }
    if (trouve.mere) {
        /* Une seule profondeur de fil, comme au format 1. Le serveur refuse
           aussi, en 400 ; on refuse ici pour nommer la note mere, ce que le
           serveur ne peut pas faire — il ne lit rien. */
        throw new ErreurUsage(
            'La ligne ' + id + ' est deja une reponse a la note ' + trouve.mere.id + '.\n'
            + "Le fil n'a qu'une profondeur : repondez a la note " + trouve.mere.id + '.');
    }

    const mere = trouve.note;
    const champs = { reponse_a: String(mere.id), mode: mere.mode || 'clair' };

    if (champs.mode === 'chiffre') {
        if (!projet.cles) {
            throw new ErreurUsage(
                'La note ' + mere.id + " est chiffree et la configuration de ce projet "
                + "ne porte pas de sel : il n'y a pas de quoi sceller une reponse.");
        }
        const index = await indexPourEcrire(projet, mere);
        champs.charge = await sceller(projet.cles.cleChiffre, projet.identifiant, index,
                                      'note', { auteur: projet.auteur, texte: propre });
    } else {
        champs.auteur = projet.auteur;
        champs.texte = propre;
    }

    const reponse = await ajouter(projet, champs, signal);
    oublierCache(projet);
    return reponse;
};

/**
 * Marque une note corrigee, en estampillant la version ou le correctif part.
 *
 * LA VERSION EST LE POINT DE L'OUTIL, et elle a une consequence visible : le
 * client compare la version du correctif a celle que le site declare servir.
 * Plus recente que le site : la note reste SOUS LES YEUX du relecteur, parce
 * que le defaut, lui, est encore a l'ecran. Egale ou anterieure : la note
 * passe en historique replie. Version vide ou illisible : le correctif est
 * tenu pour NON deploye, et la note reste visible.
 *
 * On accepte donc une version vide — mieux vaut une correction signee sans
 * version qu'une correction jamais marquee — mais l'appelant doit l'ecrire
 * explicitement, pour qu'il sache ce qu'il achete.
 */
export const marquerCorrigee = async (projet, etat, id, version, signal) => {
    exigerEcriture(projet);

    const trouve = trouverNote(etat, id);
    if (!trouve) throw new ErreurUsage('Aucune note ' + id + ' dans ce projet.');

    const note = trouve.note;
    if (note.resolue_le) {
        throw new ErreurUsage(
            'La note ' + id + ' est deja marquee corrigee, le '
            + note.resolue_le + (note.resolue_par ? ' par ' + note.resolue_par : '') + '.\n'
            + "Rien n'a ete change. Rouvrez-la d'abord si la correction etait incomplete.");
    }

    const champs = { id: String(note.id), resolue: '1' };
    const propre = String(version == null ? '' : version).trim();

    if ((note.mode || 'clair') === 'chiffre') {
        if (!projet.cles) {
            throw new ErreurUsage(
                'La note ' + id + " est chiffree et la configuration de ce projet ne "
                + 'porte pas de sel : le nom du correcteur voyagerait en clair.');
        }
        const mere = trouve.mere || note;
        const index = await indexPourEcrire(projet, mere);
        /* Seconde enveloppe, son propre nonce, son propre role : elle est
           ecrite plus tard, par quelqu'un d'autre. La fondre dans l'enveloppe
           de la note obligerait a rechiffrer une remarque qu'on n'a pas le
           droit de reecrire. */
        champs.charge_resolution = await sceller(
            projet.cles.cleChiffre, projet.identifiant, index, 'resolution',
            { par: projet.auteur, version: propre });
    } else {
        champs.par = projet.auteur;
        champs.version = propre;
    }

    const reponse = await resoudre(projet, champs, signal);
    oublierCache(projet);
    return reponse;
};

/**
 * Rouvre une note dont la correction s'est revelee incomplete.
 *
 * Rouvrir n'ecrit rien : le serveur vide la resolution. On ne demande donc pas
 * le nom du correcteur pour ANNULER la correction, et le fil de reponses n'est
 * pas touche.
 */
export const rouvrir = async (projet, etat, id, signal) => {
    exigerEcriture(projet);

    const trouve = trouverNote(etat, id);
    if (!trouve) throw new ErreurUsage('Aucune note ' + id + ' dans ce projet.');
    if (!trouve.note.resolue_le) {
        throw new ErreurUsage('La note ' + id + " n'est pas marquee corrigee.");
    }

    const reponse = await resoudre(projet, { id: String(trouve.note.id), resolue: '0' }, signal);
    oublierCache(projet);
    return reponse;
};

export { ErreurApi };
