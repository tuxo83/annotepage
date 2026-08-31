/* outils-mcp.mjs — CE QUE L'ASSISTANT PEUT FAIRE, ET COMMENT ON LE LUI DIT.
 *
 * C'EST LE POINT DE TOUT LE PROJET. La moitie humaine — cliquer sur un
 * element, y laisser une remarque — existe ailleurs. Ce qui n'existe pas
 * ailleurs, c'est l'IA comme participante de plein droit de la boucle de
 * recette : elle lit les remarques la ou elles sont, elle corrige, elle repond
 * dans le fil, et elle estampille la version ou le correctif part.
 *
 * TROIS REGLES DE REDACTION, et elles valent autant que le code :
 *
 *  1. TOUT CE QUI SORT D'ICI EST DANS LA GRAMMAIRE DES QUATRE MARGES. Pas de
 *     JSON, pas de tableau, pas de balisage. C'est le meme texte que rend
 *     « curl ?action=texte » en mode clair, et c'est voulu : un assistant qui
 *     sait lire l'un sait lire l'autre, et le MCP reste un AJOUT, jamais un
 *     passage oblige. Le jour ou ces deux formats divergent, le chemin simple
 *     est casse et personne ne s'en apercoit avant d'en avoir besoin.
 *
 *  2. LA DESCRIPTION D'UN OUTIL DIT SA CONSEQUENCE, pas sa mecanique. « Rien
 *     ne s'efface dans cet outil » compte plus que « appelle POST
 *     ?action=ajout ». L'assistant qui lit ces descriptions decide d'ecrire
 *     dans la base de recette de quelqu'un.
 *
 *  3. ON NE MENT PAS SUR CE QU'ON NE SAIT PAS. Un compte de notes illisibles
 *     se dit, un chiffrement qu'on n'a pas su ouvrir se dit, une version
 *     absente se dit. Une note qui disparait en silence fait croire que la
 *     recette est finie.
 */

import {
    recuperer, exportRempli, trouverNote, estOuverte,
    repondre, marquerCorrigee, rouvrir,
} from './notes.mjs';
import { ecrireExport } from './export-texte.mjs';
import { lireDiagnostic } from './api.mjs';
import { choisirProjet } from './configuration.mjs';

/* Le schema d'un argument « projet », ajoute a chaque outil. Quand la
   configuration ne declare qu'un projet, il est inutile ; quand elle en
   declare plusieurs, l'omettre est une erreur et non un tirage au sort —
   ecrire dans le mauvais projet ne se defait pas. */
const ARG_PROJET = {
    type: 'string',
    description: "Le nom du projet dans la configuration locale. Inutile s'il n'y en "
        + "a qu'un, ou si l'un d'eux est declare par defaut.",
};

const entier = (valeur, quoi) => {
    const n = parseInt(valeur, 10);
    if (!Number.isFinite(n) || String(n) !== String(valeur).trim()) {
        throw new Error('Le champ « ' + quoi + ' » attend un numero de note entier. Recu : '
            + JSON.stringify(valeur));
    }
    return n;
};

/** Un sous-ensemble de notes, rendu dans la meme grammaire que l'export. */
const rendreListe = (etat, projet, notes, pied) =>
    ecrireExport({
        format: etat.entete.format,
        version: etat.entete.version,
        projet: etat.entete.projet || projet.identifiant,
        chiffrement: etat.entete.chiffrement,
    }, notes, pied === undefined ? etat.pied : pied);

export const construireOutils = (configuration) => {

    /* Chaque outil recupere l'etat frais du projet vise. api.mjs garde
       l'export quelques secondes et toute ecriture le vide : lister puis lire
       trois notes ne fait donc qu'un export, et une note qu'on vient d'ecrire
       reparait aussitot. */
    const etatDe = async (args) => {
        const projet = choisirProjet(configuration, args && args.projet);
        const etat = await recuperer(projet);
        return { projet, etat };
    };

    return [
        {
            nom: 'annotepage_notes_ouvertes',
            titre: 'Notes ouvertes',
            description:
                "Les remarques de relecture QUI RESTENT A CORRIGER, avec leur fil de "
                + "reponses. C'est le point de depart : une note ouverte designe un "
                + "element precis d'une page precise et dit ce qui ne va pas.\n\n"
                + "Le resultat est en texte brut, une information par ligne, "
                + "l'indentation seule disant ce qu'on lit : 0 espace pour la structure "
                + "d'une note, 2 pour celle d'une reponse, 4 pour le texte d'une note, "
                + "6 pour celui d'une reponse. La cle d'une ligne est le plus long "
                + "prefixe connu, la valeur est le reste ; une ligne absente vaut une "
                + "valeur vide.\n\n"
                + "Une ligne « ignorees » a la fin signale les notes qui n'ont PAS pu "
                + "etre lues. Si elle est la, la liste est incomplete, et il faut le dire "
                + "avant de conclure que la recette est finie.",
            schema: {
                type: 'object',
                properties: {
                    projet: ARG_PROJET,
                    page: {
                        type: 'string',
                        description: "Ne garder que les notes de ce chemin de page, par "
                            + "exemple « /fr/contact.html ». Comparaison exacte : "
                            + "« /a » et « /a/ » sont deux pages.",
                    },
                    limite: {
                        type: 'integer',
                        description: 'Nombre maximum de notes rendues, les plus anciennes '
                            + "d'abord. Sans limite par defaut.",
                        minimum: 1,
                    },
                },
                additionalProperties: false,
            },
            appeler: async (args) => {
                const { projet, etat } = await etatDe(args);
                let notes = etat.notes.filter(estOuverte);

                if (args.page) {
                    const cherche = String(args.page);
                    const avant = notes.length;
                    notes = notes.filter((n) => n.page === cherche);
                    if (notes.length === 0 && avant > 0 && !projet.cles
                        && etat.entete.chiffrement !== 'non') {
                        return "Aucune note ouverte sur « " + cherche + " ».\n"
                            + "Attention : ce projet est chiffre et la configuration ne "
                            + "porte pas de sel, les chemins de page ne sont donc pas "
                            + "lisibles. Le filtre n'a rien pu comparer.\n";
                    }
                }

                if (args.limite) notes = notes.slice(0, entier(args.limite, 'limite'));
                return rendreListe(etat, projet, notes);
            },
        },

        {
            nom: 'annotepage_lire_note',
            titre: 'Lire une note',
            description:
                "Une note et son fil complet, corrigee ou non. Elle porte le chemin de "
                + "la page, le selecteur CSS de l'element vise (cle « element ») et le "
                + "texte visible de cet element au moment de la remarque (cle "
                + "« extrait ») : c'est de quoi retrouver l'element dans les sources, "
                + "meme si la page a bouge depuis.\n\n"
                + "Meme grammaire que la liste des notes ouvertes.",
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'Le numero de la note, tel que '
                        + "la ligne « note » l'affiche." },
                    projet: ARG_PROJET,
                },
                required: ['id'],
                additionalProperties: false,
            },
            appeler: async (args) => {
                const { projet, etat } = await etatDe(args);
                const id = entier(args.id, 'id');
                const trouve = trouverNote(etat, id);
                if (!trouve) {
                    return 'Aucune note ' + id + ' dans ce projet.\n'
                        + (etat.pied.ignorees
                            ? 'Attention : ' + etat.pied.ignorees + ' note(s) de ce projet '
                              + "n'ont pas pu etre lues. Elle en fait peut-etre partie.\n"
                            : '');
                }
                // Une reponse se lit dans le fil de sa mere : la sortir seule
                // donnerait un texte sans ce qu'il commente.
                return rendreListe(etat, projet, [trouve.mere || trouve.note], {});
            },
        },

        {
            nom: 'annotepage_repondre',
            titre: 'Repondre a une note',
            description:
                "Ecrit une reponse dans le fil d'une note. C'est par la qu'un assistant "
                + "dit ce qu'il a compris, ce qu'il a change, ou pourquoi il ne change "
                + "rien.\n\n"
                + "La reponse est SIGNEE du nom declare dans la configuration locale : "
                + "le relecteur humain voit qui parle.\n\n"
                + "RIEN NE S'EFFACE DANS CET OUTIL. Une reponse ecrite reste, elle ne se "
                + "modifie pas et ne se supprime pas. Le fil n'a qu'une profondeur : on "
                + "repond a une note, jamais a une reponse.",
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'Le numero de la note a laquelle '
                        + 'on repond. Pas celui d\'une reponse.' },
                    texte: { type: 'string', description: 'Le texte de la reponse. Il '
                        + 'sera lu par un humain sur la page annotee.' },
                    projet: ARG_PROJET,
                },
                required: ['id', 'texte'],
                additionalProperties: false,
            },
            appeler: async (args) => {
                const { projet, etat } = await etatDe(args);
                const id = entier(args.id, 'id');
                await repondre(projet, etat, id, args.texte);
                return 'Reponse ecrite dans le fil de la note ' + id + ', signee « '
                    + projet.auteur + " ».\nElle ne peut plus etre modifiee ni "
                    + 'supprimee.\n';
            },
        },

        {
            nom: 'annotepage_marquer_corrigee',
            titre: 'Marquer une note corrigee',
            description:
                "Marque une note corrigee et ESTAMPILLE LA VERSION ou le correctif part. "
                + "C'est le geste qui ferme la boucle de recette.\n\n"
                + "La version compte, et elle a une consequence visible sur la page : le "
                + "client compare la version du correctif a celle que le site declare "
                + "servir. Correctif plus recent que le site : la note RESTE sous les yeux "
                + "du relecteur, parce que le defaut, lui, est encore a l'ecran. Correctif "
                + "deja en ligne : la note passe en historique replie. Version vide : le "
                + "correctif est tenu pour non deploye, et la note reste visible.\n\n"
                + "Ne marquez corrigee qu'une note dont vous avez REELLEMENT applique le "
                + "correctif. Une note fermee a tort sort de la liste de ce qui reste a "
                + "faire, et personne ne la relit. On peut la rouvrir, mais il faut "
                + "d'abord s'apercevoir de l'erreur.",
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'Le numero de la note corrigee.' },
                    version: {
                        type: 'string',
                        description: "La version ou le correctif part, telle que le site "
                            + "la nomme (par exemple « 1.4.13 »). Chaine vide si elle "
                            + "n'est pas connue : la note restera alors visible sur la "
                            + "page, ce qui est le comportement voulu tant que le "
                            + 'correctif n\'est pas deploye.',
                    },
                    projet: ARG_PROJET,
                },
                required: ['id', 'version'],
                additionalProperties: false,
            },
            appeler: async (args) => {
                const { projet, etat } = await etatDe(args);
                const id = entier(args.id, 'id');
                const version = String(args.version == null ? '' : args.version).trim();
                await marquerCorrigee(projet, etat, id, version);
                return 'Note ' + id + ' marquee corrigee par « ' + projet.auteur + ' »'
                    + (version ? ', en version ' + version : ', sans version declaree')
                    + '.\n'
                    + (version
                        ? "Elle passera en historique replie des que le site servira cette "
                          + "version ou une plus recente.\n"
                        : "Sans version, le correctif est tenu pour non deploye : la note "
                          + "reste visible sur la page.\n");
            },
        },

        {
            nom: 'annotepage_rouvrir',
            titre: 'Rouvrir une note',
            description:
                "Annule la marque « corrigee » d'une note, le jour ou la correction se "
                + "revele incomplete. La remarque revient sous les yeux du relecteur AVEC "
                + "son fil de reponses : on ne recree pas la note, on ne perd pas ce qui "
                + "s'est dit.\n\n"
                + "Rouvrir n'ecrit aucun nom : on ne demande pas qui signe pour annuler "
                + 'une correction.',
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'Le numero de la note a rouvrir.' },
                    projet: ARG_PROJET,
                },
                required: ['id'],
                additionalProperties: false,
            },
            appeler: async (args) => {
                const { projet, etat } = await etatDe(args);
                const id = entier(args.id, 'id');
                await rouvrir(projet, etat, id);
                return 'Note ' + id + ' rouverte. Son fil de reponses est intact.\n';
            },
        },

        {
            nom: 'annotepage_export',
            titre: 'Export complet',
            description:
                "TOUTES les notes du projet, corrigees comprises, dans la grammaire des "
                + "quatre marges. C'est le document qu'on lit d'un bout a l'autre pour "
                + "faire le point sur une recette, et c'est exactement ce que rendrait "
                + "« curl ?action=texte » si le projet n'etait pas chiffre.\n\n"
                + "L'en-tete dit combien de notes, et si le projet est chiffre, clair, ou "
                + '« mixte » — une installation qui a change d\'avis en cours de route.',
            schema: {
                type: 'object',
                properties: {
                    projet: ARG_PROJET,
                    etat: {
                        type: 'string',
                        enum: ['toutes', 'ouvertes', 'corrigees'],
                        description: 'Filtre par etat. « toutes » par defaut.',
                    },
                },
                additionalProperties: false,
            },
            appeler: async (args) => {
                const { projet, etat } = await etatDe(args);
                const quoi = args.etat || 'toutes';
                if (quoi === 'toutes') return exportRempli(etat, projet);
                const garder = quoi === 'ouvertes' ? estOuverte : (n) => !estOuverte(n);
                return rendreListe(etat, projet, etat.notes.filter(garder));
            },
        },

        {
            nom: 'annotepage_projets',
            titre: 'Projets et etat du serveur',
            description:
                "Ce que la configuration locale declare, et l'etat du serveur qui heberge "
                + "les notes : version de PHP, extensions, base joignable, table presente. "
                + "A appeler quand une autre commande echoue sans qu'on comprenne "
                + "pourquoi.\n\n"
                + "Le sel n'y figure jamais, sous aucune forme, meme tronque. Ce qui "
                + "identifie un projet est son identifiant, qui est deja public.",
            schema: {
                type: 'object',
                properties: {
                    projet: ARG_PROJET,
                    serveur: {
                        type: 'boolean',
                        description: 'Interroger aussi le serveur (?action=diagnostic). '
                            + 'Faux par defaut : cela fait une requete reseau.',
                    },
                },
                additionalProperties: false,
            },
            appeler: async (args) => {
                let sortie = 'configuration ' + configuration.chemin + '\n';
                for (const [nom, p] of configuration.projets) {
                    sortie += '\nprojet ' + nom + '\n';
                    sortie += '  identifiant ' + p.identifiant + '\n';
                    sortie += '  api ' + p.api + '\n';
                    sortie += '  mode ' + p.mode + '\n';
                    sortie += '  sel ' + (p.cles ? 'present' : 'absent') + '\n';
                    sortie += '  auteur ' + (p.auteur || '(aucun : ecriture refusee)') + '\n';
                    sortie += '  ecriture ' + (p.lecture_seule ? 'lecture seule'
                        : (p.auteur ? 'permise' : 'refusee, faute de nom')) + '\n';
                    if (p.origine) sortie += '  origine ' + p.origine + '\n';
                    if (configuration.defaut === nom) sortie += '  par defaut oui\n';
                }
                for (const mot of configuration.avertissements) {
                    sortie += '\navertissement ' + mot.replace(/\n/g, '\n  ') + '\n';
                }
                if (args.serveur) {
                    const projet = choisirProjet(configuration, args.projet);
                    sortie += '\ndiagnostic ' + projet.api + '\n\n';
                    sortie += await lireDiagnostic(projet);
                }
                return sortie;
            },
        },
    ];
};
