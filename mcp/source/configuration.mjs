/* configuration.mjs — OU DORT LE SEL SUR CETTE MACHINE.
 *
 * Le sel est le seul secret du projet, et FORMAT.md §1.1 le dit sans
 * detour : sel perdu = notes perdues, sel copie = notes lues. Dans le
 * navigateur il vit dans le localStorage ; ici il vit dans un fichier, et un
 * fichier se versionne par accident.
 *
 * TROIS DECISIONS, ET LEURS RAISONS :
 *
 *  1. LE FICHIER N'EST JAMAIS VERSIONNE. Le nom par defaut commence par un
 *     point et l'installation ecrit une ligne dans .gitignore ; ce n'est pas
 *     suffisant, et la seule mesure qui tienne est de le dire, ici et dans le
 *     LISEZMOI. Un sel dans un depot public est un projet a refaire — il n'y
 *     a pas de rotation de sel (FORMAT.md §8.2).
 *
 *  2. LES DROITS DU FICHIER SONT VERIFIES, et un fichier lisible par les
 *     autres utilisateurs de la machine provoque un AVERTISSEMENT, jamais un
 *     refus. Refuser bloquerait une recette pour une raison que l'outil ne
 *     peut pas juger a la place de son proprietaire — un conteneur a un seul
 *     compte, par exemple. Avertir laisse le choix a qui sait.
 *
 *  3. LE SEL N'EST JAMAIS AFFICHE. Ni dans un message d'erreur, ni dans le
 *     diagnostic, ni dans la liste des projets, ni tronque « pour verifier ».
 *     Ce qu'on affiche pour verifier qu'on tient le bon sel est
 *     l'IDENTIFIANT DE PROJET qu'il produit : il est deja public, il est
 *     exactement ce qui distingue un sel d'un autre, et un mecanisme de moins
 *     est un mecanisme de moins a implanter de travers (FORMAT.md §1.2).
 *
 * Le mode clair a droit a une configuration SANS sel : la ligne y est
 * lisible en base, « curl ?action=texte » suffit, et exiger un secret pour
 * lire ce qui n'est pas chiffre ferait de ce paquet un passage oblige. Il ne
 * doit pas en etre un. On demande alors l'identifiant de projet directement,
 * puisqu'il ne peut plus etre derive.
 */

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

import { LONGUEUR_IDENTIFIANT } from './format.mjs';
import { selDepuisTexte, deriver } from './chiffrement.mjs';

export class ErreurConfiguration extends Error {}

/**
 * Les endroits ou l'on cherche, dans l'ordre. Le premier qui existe gagne, et
 * on ne fusionne rien : deux fichiers a demi remplis produisent une
 * configuration que personne ne sait relire.
 */
export const cheminsCandidats = (explicite) => {
    if (explicite) return [resolve(explicite)];
    if (process.env.ANNOTEPAGE_CONFIG) return [resolve(process.env.ANNOTEPAGE_CONFIG)];
    const maison = homedir() || '.';
    return [
        resolve('.annotepage.json'),
        join(maison, '.config', 'annotepage', 'annotepage.json'),
        join(maison, '.annotepage.json'),
    ];
};

const lireFichier = (chemins) => {
    for (const chemin of chemins) {
        let brut;
        try {
            brut = readFileSync(chemin, 'utf8');
        } catch (e) {
            continue;
        }
        let objet;
        try {
            objet = JSON.parse(brut);
        } catch (e) {
            throw new ErreurConfiguration(
                'Le fichier ' + chemin + " n'est pas du JSON valide : " + e.message
                + "\nRien n'a ete lu : une configuration a moitie comprise ferait "
                + "ecrire des notes dans le mauvais projet.");
        }
        return { chemin, objet };
    }
    return null;
};

/** Rend un avertissement, ou null. Voir la decision 2 de l'en-tete. */
const avertissementDroits = (chemin) => {
    if (process.platform === 'win32') return null;
    let etat;
    try {
        etat = statSync(chemin);
    } catch (e) {
        return null;
    }
    if ((etat.mode & 0o077) === 0) return null;
    return 'Le fichier ' + chemin + ' est lisible par d\'autres comptes de cette '
        + 'machine (droits ' + (etat.mode & 0o777).toString(8) + ').\n'
        + 'Il contient le sel du projet, c\'est-a-dire la totalite des notes.\n'
        + 'Corrigez avec : chmod 600 ' + chemin;
};

const exigerTexte = (valeur, quoi, ou) => {
    if (typeof valeur !== 'string' || valeur.trim() === '') {
        throw new ErreurConfiguration(
            'Le champ « ' + quoi + ' » manque, ou n\'est pas une chaine, dans ' + ou + '.');
    }
    return valeur.trim();
};

/**
 * Charge la configuration et derive ce qui en descend.
 *
 * Rend { chemin, avertissements, defaut, projets: Map<nom, projet> } ou
 * chaque projet porte :
 *   nom, api, identifiant, mode, auteur, lecture_seule,
 *   cles (null en mode clair sans sel).
 */
export const chargerConfiguration = async (explicite) => {
    const chemins = cheminsCandidats(explicite);
    const trouve = lireFichier(chemins);

    if (trouve === null) {
        throw new ErreurConfiguration(
            'Aucune configuration trouvee. Cherchee, dans l\'ordre :\n'
            + chemins.map((c) => '  ' + c).join('\n')
            + '\n\nPartez du modele annotepage.exemple.json fourni avec ce paquet.\n'
            + 'Le fichier contient le sel du projet : ne le versionnez jamais.');
    }

    const { chemin, objet } = trouve;
    const avertissements = [];
    const droits = avertissementDroits(chemin);
    if (droits) avertissements.push(droits);

    if (!objet || typeof objet !== 'object' || !objet.projets
        || typeof objet.projets !== 'object') {
        throw new ErreurConfiguration(
            'Le fichier ' + chemin + ' doit contenir un objet « projets ».\n'
            + 'Voir annotepage.exemple.json.');
    }

    const noms = Object.keys(objet.projets);
    if (noms.length === 0) {
        throw new ErreurConfiguration(
            'Le fichier ' + chemin + ' ne declare aucun projet.');
    }

    const projets = new Map();
    for (const nom of noms) {
        const brut = objet.projets[nom];
        const ou = 'le projet « ' + nom + ' » de ' + chemin;
        if (!brut || typeof brut !== 'object') {
            throw new ErreurConfiguration(ou + " n'est pas un objet.");
        }

        const api = exigerTexte(brut.api, 'api', ou);
        if (!/^https?:\/\//i.test(api)) {
            throw new ErreurConfiguration(
                'L\'adresse de ' + ou + ' doit commencer par http:// ou https:// : ' + api);
        }
        /* http:// est accepte et NON recommande. On ne le refuse pas : une
           preproduction interne sans certificat existe, et c'est justement le
           genre de site qu'on relit. Mais on le dit — en mode chiffre le
           contenu est protege, la charge circulant en clair reste une charge
           qu'un intermediaire peut retenir ou rejouer. */
        if (/^http:\/\//i.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(api)) {
            avertissements.push(
                'Le projet « ' + nom + ' » interroge une adresse en http:// non chiffre : '
                + api + '\nLes enveloppes restent illisibles, le trafic ne l\'est pas.');
        }

        const mode = brut.mode === undefined ? 'chiffre' : String(brut.mode);
        if (mode !== 'clair' && mode !== 'chiffre') {
            throw new ErreurConfiguration(
                'Le champ « mode » de ' + ou + ' attend « clair » ou « chiffre ». Recu : '
                + mode);
        }

        let cles = null;
        let identifiant;

        if (brut.sel !== undefined && brut.sel !== null && String(brut.sel) !== '') {
            const octets = selDepuisTexte(brut.sel);
            if (octets === null) {
                throw new ErreurConfiguration(
                    'Le sel de ' + ou + " n'a pas la forme attendue : 43 caracteres pris "
                    + "dans A-Z a-z 0-9 - _ , sans espace ni tiret decoratif.\n"
                    + "On ne le « nettoie » pas : un sel presque juste rend un identifiant "
                    + "de projet faux, et l'erreur se lirait alors comme un projet inconnu.");
            }
            cles = await deriver(octets);
            identifiant = cles.identifiant;

            /* Verification d'un sel colle, FORMAT.md §1.2 : si la
               configuration declare AUSSI un identifiant, les deux doivent
               s'accorder. C'est le seul controle possible sans reseau, et il
               attrape le cas de loin le plus courant — deux projets, deux
               sels, recopies dans le mauvais ordre. */
            if (brut.identifiant !== undefined && String(brut.identifiant).trim() !== ''
                && String(brut.identifiant).trim() !== identifiant) {
                throw new ErreurConfiguration(
                    'Le sel de ' + ou + " ne produit pas l'identifiant declare a cote de "
                    + "lui.\nIdentifiant declare  : " + String(brut.identifiant).trim()
                    + "\nIdentifiant du sel    : " + identifiant
                    + "\nCe sel n'est pas celui de ce projet. Aucune requete n'a ete faite.");
            }
        } else if (mode === 'clair') {
            /* Mode clair sans sel : lecture seule, et par « curl » si l'on
               veut. On ne peut alors ni chiffrer, ni calculer un index de
               page — donc ni ecrire une note nouvelle, ni repondre. Le
               message le dira au moment ou l'on essaiera, pas avant. */
            identifiant = exigerTexte(brut.identifiant, 'identifiant', ou);
            if (identifiant.length !== LONGUEUR_IDENTIFIANT) {
                throw new ErreurConfiguration(
                    "L'identifiant de " + ou + ' fait ' + identifiant.length
                    + ' caracteres ; il en faut ' + LONGUEUR_IDENTIFIANT + '.');
            }
        } else {
            throw new ErreurConfiguration(
                'Le champ « sel » manque dans ' + ou + '.\n'
                + "En mode chiffre il est indispensable : sans lui il n'y a rien a lire, "
                + "et il n'existe aucune recuperation (FORMAT.md §1.1).");
        }

        projets.set(nom, {
            nom,
            api,
            identifiant,
            mode,
            cles,
            /* Le nom dont l'assistant signe ce qu'il ecrit. Il est OBLIGATOIRE
               des qu'une ecriture est permise : une remarque non signee dans
               un fil ou tout le monde signe fait douter de tout le fil. */
            auteur: typeof brut.auteur === 'string' && brut.auteur.trim() !== ''
                ? brut.auteur.trim() : '',
            lecture_seule: brut.lecture_seule === true,
            /* L'origine annoncee au serveur. Elle n'est PAS facultative face a
               un relais : FORMAT.md §6.2 y refuse toute ecriture sans entete
               Origin, parce qu'un navigateur en envoie toujours un et qu'une
               ecriture sans Origin ne vient donc pas d'une page. Nous ne
               sommes pas une page, et nous le disons en recopiant l'origine du
               site relu.
               Que nous puissions ecrire cet entete a la main est exactement ce
               qui fait du verrou de domaine une mesure ANTI-ABUS et non une
               authentification. FORMAT.md §6.2 l'ecrit ; ce champ le
               demontre. */
            origine: typeof brut.origine === 'string' && brut.origine.trim() !== ''
                ? brut.origine.trim().replace(/\/+$/, '') : '',
        });
    }

    let defaut = objet.projet_par_defaut;
    if (defaut !== undefined && !projets.has(String(defaut))) {
        throw new ErreurConfiguration(
            'Le projet par defaut « ' + defaut + ' » n\'est pas declare dans ' + chemin + '.');
    }
    if (defaut === undefined) defaut = noms.length === 1 ? noms[0] : null;

    return { chemin, avertissements, defaut, projets };
};

/**
 * Choisit le projet vise. Un seul projet declare : pas la peine de le nommer.
 * Plusieurs : on exige le nom, plutot que d'en prendre un « au hasard mais
 * toujours le meme » — ecrire une note dans le mauvais projet ne se defait
 * pas, rien ne s'efface dans cet outil.
 */
export const choisirProjet = (configuration, nom) => {
    if (nom) {
        const projet = configuration.projets.get(String(nom));
        if (!projet) {
            throw new ErreurConfiguration(
                'Projet inconnu de la configuration : ' + nom + '\n'
                + 'Declares : ' + [...configuration.projets.keys()].join(', '));
        }
        return projet;
    }
    if (configuration.defaut) return configuration.projets.get(configuration.defaut);
    throw new ErreurConfiguration(
        'Plusieurs projets sont declares et aucun n\'est par defaut : nommez celui '
        + 'que vous visez.\nDeclares : ' + [...configuration.projets.keys()].join(', '));
};
