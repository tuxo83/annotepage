<?php
/**
 * configuration-locale.exemple.php — MODELE A RECOPIER.
 *
 * Ce fichier n'est PAS lu : seul `configuration-locale.php`, dans ce meme
 * dossier, l'est. Recopiez celui-ci sous ce nom, puis adaptez.
 *
 * Il n'a besoin de contenir que ce qui differe des defauts de
 * configuration.php — les autres cles restent aux valeurs par defaut.
 *
 * DEUX FORMES POUR CHAQUE IDENTIFIANT DE BASE
 *
 *   'utilisateur' => 'monsite'                       la valeur en clair
 *   'utilisateur' => array('fichier' => '/chemin')   la valeur LUE DANS un
 *                                                    fichier depose hors de
 *                                                    la racine web
 *
 * La seconde forme est la raison d'etre de ce mecanisme : beaucoup
 * d'hebergements deposent les identifiants de la base dans un dossier voisin
 * de la racine web, hors de portee du navigateur. On les LIT la ; on ne les
 * recopie jamais dans un fichier servi. Consequence directe : ce fichier-ci
 * ne contient alors aucun secret, seulement des CHEMINS vers des secrets, et
 * il peut etre versionne sans faute.
 *
 * CE QUI N'EST PAS ICI, ET NE LE SERA JAMAIS : LE SEL.
 *
 * Le sel de 256 bits ne quitte pas le navigateur. Le serveur ne le recoit a
 * aucun moment, sous aucune forme, dans aucun mode. Ce qu'on ecrit ci-dessous
 * est l'identifiant de PROJET, qui en descend (HKDF) mais ne permet pas de
 * remonter jusqu'a lui — et qui est de toute facon public : il figure dans la
 * balise de chaque page annotee.
 *
 * SEL PERDU = NOTES PERDUES. Il n'y a pas de recuperation, pas de question
 * secrete, pas de tiers de sequestre. Ce fichier ne peut rien y faire.
 *
 * LE CHEMIN DOIT ETRE ANCRE SUR __DIR__
 *
 * PHP resout un chemin relatif par rapport au REPERTOIRE DE TRAVAIL du
 * processus, PAS par rapport au fichier qui l'ecrit — et ce repertoire n'est
 * pas toujours celui qu'on croit. Ecrire '../../secrets/mot-de-passe'
 * produirait donc, un jour, un « fichier illisible » incomprehensible.
 * Ecrivez toujours __DIR__ . '/../../secrets/mot-de-passe', et comptez les
 * niveaux : depuis ce fichier, '..' remonte a la racine servie de l'outil,
 * '../..' au dossier ou l'outil est monte, et ainsi de suite. La
 * configuration refuse tout chemin qui n'est pas absolu apres resolution, en
 * affichant celui qu'elle a obtenu.
 *
 * Les noms de fichiers ci-dessous sont des EXEMPLES. Chaque hebergement a les
 * siens ; c'est au fichier local, et a lui seul, de les connaitre.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

return array(

    // Rien ne repond tant que ceci n'est pas vrai.
    'actif' => true,

    // OU CE SERVEUR EST-IL POSE ?
    //
    //   'auto-heberge' : sur le site relu lui-meme, derriere la meme
    //                    restriction d'acces que lui. Le mode clair y est
    //                    possible, l'entete Origin y est facultatif, et
    //                    l'action de reprise y est disponible.
    //   'relais'       : sur une machine tierce, qui sert plusieurs sites. Le
    //                    mode clair y est IMPOSSIBLE, l'entete Origin est
    //                    exige a l'ecriture, et la reprise est refusee.
    //
    // Il n'y a pas de troisieme valeur, et une faute de frappe est une panne :
    // retomber en silence sur un defaut servirait du clair a un tiers sans que
    // personne s'en apercoive.
    'deploiement' => 'auto-heberge',

    // LES PROJETS.
    //
    // La cle est l'identifiant de projet : 22 caracteres, engendres par
    // l'ecran d'installation DANS LE NAVIGATEUR, a partir du sel. Recopiez-le
    // depuis cet ecran ; le serveur ne le calcule pas, il le reconnait.
    //
    // En auto-heberge, il n'y a qu'une entree. C'est la meme colonne et la
    // meme requete qu'en relais : un seul locataire est un multi-locataire a
    // un locataire.
    //
    // 'origines' : les origines autorisees a consommer ce projet. Un projet
    // peut en declarer plusieurs, et c'est voulu — une preproduction et la
    // production qu'elle devient sont le meme projet, avec les memes notes.
    // Ecrivez-les comme le navigateur les envoie : schema://hote[:port], sans
    // chemin et sans barre finale. C'est une mesure ANTI-ABUS ; ce n'est PAS
    // une protection contre les XSS, qui s'executent dans la page elle-meme.
    //
    // 'mode' : 'chiffre' (defaut) ou 'clair'. Le mode clair n'est acceptable
    // qu'en auto-heberge, ou il ne protege de rien : les notes sont dans la
    // meme base, sur la meme machine, derriere la meme restriction d'acces que
    // le site relu. En relais, le declarer est refuse au chargement de ce
    // fichier — pas a la premiere note.
    'projets' => array(

        '7Qb1kZ3xNvA9dLpEqKf2Zt' => array(
            'origines' => array(
                'https://preprod.exemple.fr',
                'https://www.exemple.fr',
            ),
            'mode' => 'chiffre',
        ),

        // Un second projet, sur un relais qui sert plusieurs sites :
        // 'A1b2C3d4E5f6G7h8I9j0Kl' => array(
        //     'origines' => array('https://recette.autre-exemple.fr'),
        //     'mode'     => 'chiffre',
        // ),
    ),

    'base' => array(

        // Hote et port : en clair, ce ne sont pas des secrets.
        'hote' => '127.0.0.1',
        'port' => 3306,

        // Forme 1 — identifiants lus dans des fichiers deposes hors de la
        // racine web. Noms et niveaux a adapter a l'hebergement : comptez-les
        // depuis CE fichier.
        'nom'         => array('fichier' => __DIR__ . '/../../../secrets/nom-de-la-base'),
        'utilisateur' => array('fichier' => __DIR__ . '/../../../secrets/utilisateur'),
        'motdepasse'  => array('fichier' => __DIR__ . '/../../../secrets/mot-de-passe'),

        // Forme 2 — valeurs en clair. A n'employer que si ce fichier n'est
        // NI versionne NI servi par le serveur web.
        // 'nom'         => 'ma_base',
        // 'utilisateur' => 'mon_utilisateur',
        // 'motdepasse'  => 'a ne pas ecrire ici si le fichier est versionne',
    ),

    // Les tables s'appelleront <prefixe>notes et <prefixe>debit.
    // A changer si la base est partagee.
    'prefixe_tables' => 'notes_',

    // Bornes de saisie. Elles dimensionnent les colonnes a la CREATION de la
    // table : les augmenter apres coup n'elargit pas une table existante.
    // Elles ne s'appliquent QU'AU MODE CLAIR — en mode chiffre le serveur ne
    // voit qu'une enveloppe, et ne sait pas ou finit l'auteur.
    // 'longueur_max_texte'  => 4000,
    // 'longueur_max_auteur' => 80,

    // LIMITATION DE DEBIT. Les valeurs ci-dessous sont les defauts ; elles
    // conviennent a une equipe de recette. Sur un relais public, les baisser
    // est plus prudent que les monter. Une valeur a 0 desactive le compteur —
    // a ne faire qu'en auto-heberge.
    // 'debit_fenetre_secondes'     => 300,
    // 'debit_ecritures_par_ip'     => 120,
    // 'debit_ecritures_par_projet' => 300,
    // 'debit_exports_par_ip'       => 20,

    // Nombre maximal de notes par projet ; 0 = sans limite. N'efface rien et
    // ne fait expirer rien : refuse l'ecriture au-dela, en le disant.
    // 'plafond_notes_par_projet' => 5000,

    // Derriere un mandataire de confiance QUI LE REECRIT A CHAQUE REQUETE.
    // Sans mandataire, laissez cette cle absente : un entete que le client
    // ecrit lui-meme rendrait la limitation de debit contournable en une ligne.
    // 'entete_ip_client' => 'HTTP_X_FORWARDED_FOR',
);
