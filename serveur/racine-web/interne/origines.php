<?php
/**
 * origines.php — LE VERROU DE DOMAINE, ET RIEN D'AUTRE.
 *
 * Ce fichier tient deux choses, et il vaut mieux qu'elles vivent au meme
 * endroit parce que la seconde depend de la premiere :
 *
 *   1. QUELS PROJETS EXISTENT. La configuration les declare par leur
 *      identifiant (22 caracteres base64url, derive du sel DANS LE
 *      NAVIGATEUR : le serveur ne le calcule pas, il le reconnait).
 *   2. QUELLES ORIGINES ONT LE DROIT DE LES CONSOMMER, et les en-tetes de
 *      partage qui en decoulent.
 *
 * CE QUE CE VERROU EST : une mesure ANTI-ABUS. Il empeche un autre site de
 * ramasser un identifiant de projet dans le code source d'une page, d'y ecrire
 * du bruit et d'y user le quota du relais.
 *
 * CE QU'IL N'EST PAS, ET IL NE FAUT JAMAIS LE PRESENTER AINSI : une protection
 * contre les XSS. Une XSS s'execute DANS la page visee, donc avec l'origine
 * legitime : elle passe ce verrou sans effort, et elle a de toute facon acces
 * au localStorage de cette origine, donc au sel. Une XSS sur une page annotee
 * compromet les notes du projet, point. Ce fichier ne change rien a cela.
 *
 * POURQUOI PLUSIEURS ORIGINES PAR PROJET. Une preproduction et la production
 * qu'elle devient sont le meme projet, avec les memes notes. C'est le pendant
 * operationnel de la regle « le domaine n'entre pas dans la cle » (FORMAT.md
 * §1.4) : si le domaine faisait partie du secret, le jour de la mise en
 * production serait le jour ou toutes les notes deviendraient illisibles.
 *
 * LE DOMAINE ET LE PREFIXE DE CHEMIN SONT DE LA CONFIGURATION, PAS DE LA
 * CRYPTOGRAPHIE. Le prefixe de chemin n'apparait d'ailleurs pas ici du tout :
 * le serveur ne voit pas les chemins en mode chiffre, la portee par prefixe
 * est donc verifiee par le client. C'est du rangement, pas une frontiere de
 * securite (FORMAT.md §4).
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

/**
 * Les projets declares, verifies et normalises. Calcule une fois.
 *
 * Une declaration mal formee est une PANNE de configuration, pas un projet
 * ignore : un projet qu'on croit declare et qui ne l'est pas rend « aucune
 * note » a une equipe qui en a ecrit trente, et personne ne pense a relire le
 * fichier local.
 *
 * @return array cle = identifiant, valeur = array('origines' => [...], 'mode' => '...')
 */
function ap_projets_declares(array $config)
{
    static $memoire = null;
    if ($memoire !== null) {
        return $memoire;
    }

    $bruts = isset($config['projets']) && is_array($config['projets'])
        ? $config['projets'] : array();
    // Le resultat est construit dans une variable LOCALE et n'est confie a la
    // memoire qu'une fois complet. Sans cela, une declaration refusee au
    // milieu du tableau laisserait derriere elle une liste a moitie faite, que
    // l'appel suivant rendrait sans un mot — un projet declare deviendrait
    // « inconnu » par le seul effet d'une erreur dans un autre.
    $projets = array();

    foreach ($bruts as $identifiant => $declaration) {
        $identifiant = (string) $identifiant;
        if (!ap_identifiant_bien_forme($identifiant)) {
            throw new ApPanne(
                "Configuration invalide : « " . ap_extrait_lisible($identifiant)
                . " » n'est pas un identifiant de projet.\n"
                . "Un identifiant fait exactement 22 caracteres pris dans "
                . "A-Z a-z 0-9 - _ (base64url).\n"
                . "Il est engendre par l'ecran d'installation, dans le navigateur, "
                . "a partir du sel. Le serveur ne le calcule pas.",
                500);
        }
        if (!is_array($declaration)) {
            throw new ApPanne(
                "Configuration invalide : le projet " . ap_projet_abrege($identifiant)
                . " doit etre declare par un tableau "
                . "array('origines' => array(...), 'mode' => 'chiffre').",
                500);
        }

        // MODE. « chiffre » par defaut, et ce defaut n'est pas negociable en
        // relais : voir plus bas.
        $mode = isset($declaration['mode'])
            ? strtolower(trim((string) $declaration['mode'])) : 'chiffre';
        if ($mode !== 'clair' && $mode !== 'chiffre') {
            throw new ApPanne(
                "Configuration invalide : le projet " . ap_projet_abrege($identifiant)
                . " declare le mode « " . ap_extrait_lisible($mode) . " ».\n"
                . "Les deux seules valeurs acceptees sont « clair » et « chiffre ».",
                500);
        }
        // Le chiffrement est actif par defaut et ne se desactive qu'en
        // auto-heberge, ou il ne protege de rien : les notes sont dans la meme
        // base, sur la meme machine, derriere la meme restriction d'acces que
        // le site relu. En relais, il n'y a aucune restriction d'acces a
        // offrir — le mode clair y rendrait les notes de quelqu'un d'autre
        // lisibles par l'operateur du relais et par qui trouve l'identifiant.
        // On refuse a la LECTURE DE LA CONFIGURATION, pas a l'ecriture : une
        // installation qui se croit protegee doit l'apprendre au premier
        // diagnostic, pas a la premiere note.
        if ($mode === 'clair' && !ap_est_auto_heberge($config)) {
            throw new ApPanne(
                "Configuration refusee : le projet " . ap_projet_abrege($identifiant)
                . " declare le mode « clair » sur un deploiement « relais ».\n"
                . "Le mode clair n'est possible qu'en auto-heberge, ou les notes sont "
                . "derriere la meme restriction d'acces que le site relu.\n"
                . "Sur un relais, il n'y a rien de tel a offrir : les notes seraient "
                . "lisibles par l'operateur du relais et par quiconque trouve "
                . "l'identifiant de projet dans le code source d'une page.",
                500);
        }

        // ORIGINES.
        $origines = array();
        $declarees = isset($declaration['origines']) ? $declaration['origines'] : array();
        if (is_string($declarees)) {
            // Une seule origine ecrite sans tableau : c'est la faute de frappe
            // la plus probable, et la refuser n'apprendrait rien a personne.
            $declarees = array($declarees);
        }
        if (!is_array($declarees) || !$declarees) {
            throw new ApPanne(
                "Configuration invalide : le projet " . ap_projet_abrege($identifiant)
                . " ne declare aucune origine.\n"
                . "Exemple : 'origines' => array('https://preprod.exemple.fr', "
                . "'https://www.exemple.fr').\n"
                . "Un projet sans origine n'est pas « ouvert a tous » : il est "
                . "inutilisable, et c'est voulu.",
                500);
        }
        foreach ($declarees as $origine) {
            $normalisee = ap_normaliser_origine($origine);
            if ($normalisee === null) {
                throw new ApPanne(
                    "Configuration invalide : « " . ap_extrait_lisible((string) $origine)
                    . " » n'est pas une origine.\n"
                    . "Une origine s'ecrit schema://hote[:port], sans chemin et sans "
                    . "barre finale : https://preprod.exemple.fr\n"
                    . "C'est exactement ce que le navigateur met dans l'entete Origin ; "
                    . "tout le reste ne correspondra jamais.",
                    500);
            }
            $origines[$normalisee] = true;
        }

        $projets[$identifiant] = array(
            'origines' => array_keys($origines),
            'mode'     => $mode,
        );
    }

    $memoire = $projets;
    return $memoire;
}

/** Forme d'un identifiant de projet : 22 caracteres base64url. */
function ap_identifiant_bien_forme($identifiant)
{
    return is_string($identifiant)
        && preg_match('/^[A-Za-z0-9_-]{22}$/', $identifiant) === 1;
}

/**
 * Les six premiers caracteres d'un identifiant, pour les messages.
 *
 * JAMAIS l'identifiant entier : c'est lui qui donne acces aux lignes du
 * projet (FORMAT.md §6.3), et un message d'erreur se recopie dans un ticket,
 * un journal, une capture d'ecran. Six caracteres suffisent a confirmer qu'on
 * parle du bon projet.
 */
function ap_projet_abrege($identifiant)
{
    $identifiant = (string) $identifiant;
    return substr(preg_replace('/[^A-Za-z0-9_-]/', '', $identifiant), 0, 6) . '...';
}

/** Fragment de valeur douteuse, rendu affichable dans un message d'erreur. */
function ap_extrait_lisible($valeur)
{
    return substr(preg_replace('/[^\x20-\x7E]/', '', (string) $valeur), 0, 60);
}

/**
 * Origine canonique : schema://hote[:port], schema et hote en minuscules, le
 * port par defaut du schema retire.
 *
 * C'est la forme que le navigateur met dans l'entete Origin. La comparaison
 * est ensuite une egalite de chaines, exacte : ni prefixe, ni joker, ni
 * sous-domaine implicite. Un joker sur les sous-domaines paraitrait commode
 * et ouvrirait le projet a la premiere page hebergee sur un sous-domaine
 * qu'on ne controle plus.
 *
 * @return string|null null si ce n'est pas une origine
 */
function ap_normaliser_origine($origine)
{
    if (!is_string($origine)) {
        return null;
    }
    $origine = trim($origine);
    if ($origine === '' || strlen($origine) > 255) {
        return null;
    }

    $parties = @parse_url($origine);
    if (!is_array($parties) || !isset($parties['scheme'], $parties['host'])) {
        return null;
    }
    // Un chemin, une chaine de requete ou un fragment veut dire que ce n'est
    // pas une origine mais une URL : on refuse plutot que de rogner
    // silencieusement, faute de quoi 'https://exemple.fr/prod' et
    // 'https://exemple.fr/preprod' declareraient la meme chose.
    if (isset($parties['path']) && $parties['path'] !== ''
        || isset($parties['query']) || isset($parties['fragment'])
        || isset($parties['user']) || isset($parties['pass'])) {
        return null;
    }

    $schema = strtolower($parties['scheme']);
    if ($schema !== 'http' && $schema !== 'https') {
        return null;
    }
    $hote = strtolower($parties['host']);
    if ($hote === '') {
        return null;
    }

    $port = isset($parties['port']) ? (int) $parties['port'] : 0;
    $defaut = ($schema === 'https') ? 443 : 80;
    if ($port === 0 || $port === $defaut) {
        return $schema . '://' . $hote;
    }
    return $schema . '://' . $hote . ':' . $port;
}

/**
 * L'origine de la requete, normalisee, ou null si l'entete est absent.
 *
 * L'entete Origin n'est pas ecrit par le navigateur sur une requete de MEME
 * origine : son absence n'est donc pas suspecte en auto-heberge. Elle l'est
 * en relais, ou toute requete legitime vient forcement d'ailleurs.
 */
function ap_origine_requete()
{
    if (!isset($_SERVER['HTTP_ORIGIN']) || !is_string($_SERVER['HTTP_ORIGIN'])) {
        return null;
    }
    $brute = trim($_SERVER['HTTP_ORIGIN']);
    if ($brute === '' || $brute === 'null') {
        // « null » est ce qu'envoie une page a origine opaque (fichier local,
        // bac a sable). Ce n'est pas une origine declarable : traite comme
        // une origine INCONNUE, pas comme une absence.
        return 'null';
    }
    $normalisee = ap_normaliser_origine($brute);
    return $normalisee === null ? 'null' : $normalisee;
}

/**
 * Applique le verrou de domaine et pose les en-tetes de partage.
 *
 * Trois cas, et c'est toute la regle (FORMAT.md §6.2) :
 *
 *  - Origin present et RECONNU : la reponse porte
 *    Access-Control-Allow-Origin avec l'origine verifiee, jamais « * ». Le
 *    joker rendrait le verrou decoratif, et il est de toute facon incompatible
 *    avec la moindre evolution vers des requetes portees.
 *  - Origin present et INCONNU : 403, en text/plain. Y compris pour
 *    « liste » — ce qui deroge a la regle du silence (§6.4), et c'est
 *    delibere : le silence protege l'installation pas encore configuree, pas
 *    le site qui essaie de consommer le projet d'un autre.
 *  - Origin ABSENT : autorise en auto-heberge (une requete de meme origine
 *    n'en envoie pas). En relais, toute ECRITURE est refusee — un navigateur
 *    envoie toujours Origin sur une requete d'origine differente, donc une
 *    ecriture sans Origin ne vient pas d'un navigateur.
 *
 * Vary: Origin est pose des qu'un cache intermediaire pourrait exister : sans
 * lui, la reponse autorisee pour un site serait servie a un autre.
 *
 * @param array  $projet   la declaration du projet, deja normalisee
 * @param bool   $ecriture l'action modifie-t-elle l'etat ?
 */
function ap_appliquer_verrou_origine(array $config, $identifiant, array $projet, $ecriture)
{
    $origine = ap_origine_requete();

    if ($origine === null) {
        if (!ap_est_auto_heberge($config) && $ecriture) {
            throw new ApPanne(
                "Ecriture refusee : la requete ne porte pas d'entete Origin.\n"
                . "Sur un relais, une ecriture vient forcement d'un autre domaine, et un "
                . "navigateur y joint toujours cet entete.\n"
                . "Une requete sans Origin ne vient donc pas d'une page : elle est "
                . "refusee.",
                403);
        }
        // Rien a partager : sans Origin, il n'y a pas de frontiere d'origine a
        // franchir, et un Access-Control-Allow-Origin poserait la question de
        // savoir quelle valeur y mettre.
        return;
    }

    if (!in_array($origine, $projet['origines'], true)) {
        // L'origine refusee est recopiee dans le message : c'est elle qu'il
        // faut comparer, caractere par caractere, avec la ligne du fichier de
        // configuration. « http » contre « https », un port, une barre finale :
        // ce sont les trois erreurs, et aucune ne se voit sans les deux
        // chaines cote a cote.
        throw new ApPanne(
            "Origine refusee pour le projet " . ap_projet_abrege($identifiant) . ".\n"
            . "Origine de la requete : " . ap_extrait_lisible($origine) . "\n"
            . "Ce projet ne declare pas cette origine dans la configuration du serveur.\n"
            . "Ce verrou est une mesure anti-abus : il empeche un autre site de consommer "
            . "cet identifiant de projet. Ce n'est PAS une protection contre les XSS.",
            403);
    }

    // Les en-tetes sont confies a erreurs.php AUSSI, pour qu'une panne
    // traverse la frontiere d'origine. Une erreur que le navigateur masque au
    // client est un echec muet — precisement ce que cet outil refuse.
    ap_entetes_partage(array(
        'Access-Control-Allow-Origin: ' . $origine,
        'Vary: Origin',
    ));
}

/**
 * L'identifiant du projet auquel rattacher des lignes qui n'en portent pas,
 * ou null s'il n'y a pas de reponse evidente.
 *
 * Une seule situation donne une reponse : auto-heberge, un seul projet
 * declare. Ce sont alors les notes ecrites par l'outil d'origine sur ce
 * site-la, et il n'y a personne d'autre a qui elles pourraient appartenir.
 *
 * Partout ailleurs — un relais, ou deux projets declares — on ne devine pas.
 * Un mauvais rattachement donnerait les notes d'une equipe a une autre, et
 * rien dans la base ne permettrait ensuite de defaire l'erreur : les lignes
 * n'ont plus de trace de leur origine une fois la colonne remplie.
 */
function ap_projet_de_reprise(array $config)
{
    if (!ap_est_auto_heberge($config)) {
        return null;
    }
    $projets = ap_projets_declares($config);
    if (count($projets) !== 1) {
        return null;
    }
    $cles = array_keys($projets);
    return $cles[0];
}
