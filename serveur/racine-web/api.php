<?php
/**
 * api.php — POINT D'ENTREE HTTP UNIQUE d'annotepage, cote serveur.
 *
 * Aucun autre fichier de cet outil n'est destine a etre appele par le web.
 * Tout ce qui est sous interne/ refuse de s'executer sans la constante posee
 * ici, et rien n'est publie qui ne serve.
 *
 * UN SEUL CODE, DEUX DEPLOIEMENTS. Le meme fichier tourne sur le site relu
 * (auto-heberge) et sur une machine tierce (relais). La configuration le dit,
 * et cette valeur ne change que trois choses, chacune ecrite a l'endroit ou
 * elle agit : le mode clair, l'exigence de l'entete Origin, l'action de
 * reprise. Il n'y a PAS deux implantations — elles divergeraient des la
 * deuxieme correction.
 *
 * CINQ ACTIONS DE SERVICE, PLUS UNE DE MAINTENANCE
 *
 *   GET  api.php?action=liste&projet=<id>&index=<index_page>
 *        Les notes d'une page, en JSON, pour le client. Le CHEMIN REEL n'est
 *        jamais envoye, dans aucun mode : seul l'index aveugle l'est. Envoyer
 *        le chemin en clair et l'index en chiffre ferait deux chemins de
 *        code, et le second serait le moins teste.
 *
 *   POST api.php?action=ajout
 *        Champs (application/x-www-form-urlencoded) :
 *          projet, mode                                    toujours
 *          index                                           note nouvelle
 *          reponse_a                                       reponse a une note
 *          charge                                          mode chiffre
 *          auteur, texte                                   mode clair
 *          page, selecteur, empreinte, extrait             mode clair, nouvelle
 *          version, environnement, fenetre                 mode clair, facultatifs
 *        Une reponse HERITE de l'index de page de sa mere, et en mode clair
 *        de sa page et de son element : les champs de designation sont alors
 *        ignores.
 *        On ne passe PAS au JSON : un corps urlencode est une « requete
 *        simple » au sens CORS et n'entraine aucune requete preliminaire, ce
 *        qui evite au relais toute une machinerie de OPTIONS. Il n'y a donc
 *        pas de gestionnaire OPTIONS ici : si vous en voyez passer dans un
 *        journal, c'est qu'un client envoie un entete qu'il ne devrait pas.
 *
 *   POST api.php?action=resoudre
 *        Champs : projet, id, resolue (0 rouvre, defaut 1),
 *                 charge_resolution (mode chiffre), par et version (clair).
 *        Le MODE n'est pas demande ici : il est celui de la note visee, qui
 *        est fixe depuis qu'elle a ete ecrite.
 *        Rien n'est jamais supprime : une note corrigee passe en historique,
 *        d'ou elle ressort si la correction s'avere incomplete.
 *
 *   GET  api.php?action=texte&projet=<id>
 *        TOUTES les notes du projet, en text/plain structure. C'est l'adresse
 *        que lit un assistant depuis l'exterieur. En mode chiffre, elle rend
 *        l'export STRUCTUREL plus les enveloppes : le document reellement
 *        lisible n'existe que sur la machine qui detient le sel.
 *
 *   GET  api.php?action=diagnostic
 *        Etat du serveur, en text/plain. Aucun parametre, et surtout aucun
 *        projet. Aucune VALEUR d'identifiant n'y figure, jamais — ni sa
 *        longueur ; un identifiant de projet n'y parait que par ses six
 *        premiers caracteres, parce que c'est lui qui donne acces aux lignes.
 *        Il repond MEME quand la configuration locale est illisible ou mal
 *        formee, parce que c'est precisement le moment ou l'on a besoin de lui.
 *
 *   GET|POST api.php?action=reprise
 *        MAINTENANCE, refusee en mode relais. Elle sert une fois, a la
 *        reprise d'une base ecrite par « notes en contexte » 1.2.0 : le
 *        serveur enumere les chemins de page encore sans index aveugle, le
 *        client calcule l'index de chacun (il a le sel, pas le serveur) et le
 *        renvoie. Voir l'en-tete de interne/depot.php pour ce que le serveur
 *        peut et ne peut pas reprendre seul.
 *        Cette action ne fait pas partie des cinq adresses du format : c'est
 *        une addition, et FORMAT.md §7 dit qu'une action ajoutee ne change pas
 *        le numero de format. Elle peut disparaitre le jour ou plus aucune
 *        base 1.2.0 ne tourne.
 *
 * CONTRAT DE REPONSE, tel que le client doit le lire :
 *
 *   200 + application/json   reponse normale : {"ok":true, ...}
 *   200 + application/json   avec {"ok":false,"actif":false} : l'outil est
 *                            DEPOSE ici mais pas configure, ou le projet
 *                            demande n'est pas declare. Le client se retire
 *                            EN SILENCE.
 *                            Pourquoi 200 et non 404 : le navigateur
 *                            journalise lui-meme tout code d'erreur dans la
 *                            console de CHAQUE page. Un 404 sur le chemin le
 *                            plus courant — l'outil recopie, pas encore
 *                            configure — laissait donc une trace a l'ecran de
 *                            qui ouvre la console, alors que la promesse est
 *                            « pas un mot ». Mesure : 3 messages de console
 *                            avec le 404, 2 sans, soit exactement ceux de la
 *                            page nue. Seule l'action « liste » repond ainsi ;
 *                            les autres, qu'un humain appelle a la main,
 *                            gardent leur 404 explique.
 *   403 + text/plain         origine refusee (verrou de domaine), ou plafond
 *                            de projet atteint.
 *   413 + text/plain         corps trop volumineux.
 *   429 + text/plain         limitation de debit, avec Retry-After.
 *   4xx ou 5xx + text/plain  message redige pour un humain : A AFFICHER tel
 *                            quel. C'est ainsi que « la base est injoignable »
 *                            arrive jusqu'a l'ecran d'un relecteur.
 *   404 + text/plain         il n'y a rien a cette adresse, ou l'outil n'y est
 *                            pas configure : le client se retire en silence.
 *   tout le reste            PHP n'est pas execute (source servi en clair,
 *                            page d'erreur du serveur) : le client se retire
 *                            en silence, sans un mot dans la console.
 *
 * UNE PRECISION QUI DEROGE, ET C'EST VOULU : une origine refusee rend 403
 * meme sur « liste ». La regle du silence protege l'installation pas encore
 * configuree ; elle n'a pas a proteger le site qui essaie de consommer le
 * projet d'un autre.
 *
 * CE QUE L'IDENTIFIANT DE PROJET DONNE : tout. C'est un jeton porteur, il n'y
 * a pas d'authentification, et c'etait deja le cas au format 1. En mode
 * chiffre les lignes obtenues sont inexploitables sans le sel ; en mode clair
 * elles sont lisibles, et c'est exactement pourquoi le mode clair est reserve
 * a l'auto-heberge.
 *
 * EN-TETES : ils sont poses par header() de PHP, jamais par un .htaccess.
 * Le module d'en-tetes du serveur peut etre inactif — c'est le cas sur
 * l'hebergement d'origine de cet outil — et une protection qui depend d'un
 * module non verifie n'en est pas une. Cela vaut aussi pour les en-tetes de
 * partage entre origines : le verrou les calcule, PHP les pose.
 *
 * SYNTAXE : ce fichier n'emploie que des constructions PHP 5.4. Ce n'est pas
 * de la coquetterie — le test de version quelques lignes plus bas ne serait
 * JAMAIS atteint si le fichier ne compilait pas. Les fichiers de interne/,
 * inclus APRES ce test, peuvent employer PHP 7.4.
 */

// --- 1. Version de PHP ----------------------------------------------------
// Premiere instruction executable. La version vue en ligne de commande n'est
// pas forcement celle que sert le serveur web : seule une page reellement
// servie permet de le savoir, et le savoir ne doit pas exiger un shell.

if (!defined('PHP_VERSION_ID') || PHP_VERSION_ID < 70400) {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    if (function_exists('http_response_code')) {
        http_response_code(500);
    } else {
        header('HTTP/1.1 500 Internal Server Error');
    }
    echo "annotepage exige PHP 7.4 ou plus recent.\n";
    echo 'Version servie par ce serveur web : '
        . (defined('PHP_VERSION') ? PHP_VERSION : 'inconnue') . "\n";
    echo "Aucune note ne peut etre enregistree tant que ce point n'est pas regle.\n";
    exit;
}

// --- 2. Filets et dependances --------------------------------------------
// La constante-garde est posee ICI et nulle part ailleurs : c'est elle, et
// non le .htaccess, qui empeche l'appel direct d'un fichier de interne/.
// Elle ne depend d'aucun module du serveur.

define('AP_INTERNE', 1);

/**
 * LE NUMERO DE FORMAT, entier, sans point. Il apparait a trois endroits et
 * les trois doivent s'accorder : la colonne `format` de chaque ligne, le
 * prefixe `ap<n>` de chaque enveloppe, la ligne `format` de l'en-tete
 * d'export. Il est declare une seule fois, ici, pour que ce soit vrai.
 *
 * Il est PAR LIGNE, pas par installation : une base peut porter des lignes de
 * format 1, 2 et 3, chacune se lit selon le sien.
 */
define('AP_FORMAT', 2);

require __DIR__ . '/interne/erreurs.php';
ap_installer_gestionnaires();

// Tout est mis en tampon : une panne survenue au milieu d'une reponse doit
// pouvoir la REMPLACER, et non s'y ajouter. L'export en flux, lui, videra ce
// tampon avant de commencer.
ob_start();

require __DIR__ . '/interne/configuration.php';
require __DIR__ . '/interne/origines.php';
require __DIR__ . '/interne/entrees.php';
require __DIR__ . '/interne/debit.php';
require __DIR__ . '/interne/depot.php';
require __DIR__ . '/interne/sortie-texte.php';

// --- 3. Utilitaires de reponse -------------------------------------------

/**
 * Version de l'OUTIL, lue dans le fichier VERSION qui l'accompagne.
 *
 * Elle est renvoyee dans le diagnostic et dans chaque reponse JSON : c'est
 * ce qui permet de savoir A DISTANCE quelle version est reellement en ligne,
 * sans acces au serveur.
 */
function ap_version()
{
    static $version = null;
    if ($version !== null) {
        return $version;
    }
    $version = 'inconnue';
    // Le fichier vit dans la partie servie ; le second chemin ne sert qu'au
    // cas ou l'outil serait servi depuis son dossier complet.
    $candidats = array(__DIR__ . '/VERSION', __DIR__ . '/../VERSION');
    foreach ($candidats as $chemin) {
        if (is_readable($chemin)) {
            $lu = trim((string) file_get_contents($chemin));
            if ($lu !== '' && preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $lu)) {
                $version = $lu;
                break;
            }
        }
    }
    return $version;
}

/** En-tetes communs a TOUTES les reponses, erreurs comprises. */
function ap_entetes_communs()
{
    // Sans no-store, un cache place devant le serveur pourrait servir la
    // liste de l'un a l'autre, ou une liste perimee a un relecteur.
    header('Cache-Control: no-store');
    // Le module d'en-tetes du serveur pouvant etre inactif, c'est PHP qui
    // pose celui-ci. Il n'y a par ailleurs aucun fichier .html a proteger :
    // l'outil n'en depose aucun sur le disque.
    header('X-Robots-Tag: noindex, nofollow');
    // Un text/plain ne doit pas etre reinterprete par le navigateur.
    header('X-Content-Type-Options: nosniff');
    // Le partage entre origines, calcule par le verrou de domaine. Vide tant
    // qu'aucune origine n'a ete verifiee, ce qui est le cas en auto-heberge.
    foreach (ap_entetes_partage() as $ligne) {
        header($ligne);
    }
}

function ap_repondre_json(array $charge)
{
    if (!function_exists('json_encode')) {
        throw new ApPanne(
            "L'extension PHP « json » est absente de ce serveur : annotepage "
            . "ne peut pas repondre au client.", 503);
    }
    $corps = json_encode($charge,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

    if ($corps === false) {
        throw new ApPanne("Reponse impossible a encoder en JSON.", 500);
    }

    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    ap_entetes_communs();
    echo $corps;
    exit;
}

function ap_commencer_texte()
{
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    header('Content-Type: text/plain; charset=utf-8');
    ap_entetes_communs();
}

/** L'enveloppe commune de toute reponse JSON de service. */
function ap_enveloppe_reponse(array $sup)
{
    return array_merge(array(
        'ok'      => true,
        'outil'   => 'annotepage',
        'format'  => AP_FORMAT,
        'version' => ap_version(),
    ), $sup);
}

/** Exige la methode POST pour une action qui change l'etat. */
function ap_exiger_post($quoi)
{
    $methode = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
    if (strtoupper($methode) !== 'POST') {
        throw new ApPanne(
            $quoi . " se fait en POST. Methode recue : "
            . strtoupper(preg_replace('/[^A-Za-z]/', '', $methode)) . ".",
            405);
    }
}

// --- 4. Diagnostic --------------------------------------------------------
//
// UNE SEULE REQUETE, DEPUIS L'EXTERIEUR, doit suffire a trancher : le PHP
// est-il execute, dans quelle version, avec quelles extensions, les
// identifiants sont-ils lisibles, la base repond-elle, la table existe-t-elle,
// les projets sont-ils declares, et que reste-t-il a reprendre d'une base
// 1.2.0. Ce sont exactement les questions qu'on ne peut pas resoudre sans
// acces au serveur — et personne, sur ce genre d'hebergement, n'a de shell.
//
// TROIS REGLES, sans exception :
//   - aucune VALEUR d'identifiant n'est affichee, jamais. On dit d'ou elle
//     vient et si elle est lisible ; c'est tout ce dont on a besoin ;
//   - un identifiant de PROJET n'y parait que par ses six premiers
//     caracteres. Six suffisent a confirmer qu'on regarde le bon, et
//     l'identifiant entier est ce qui donne acces aux lignes ;
//   - aucun effet. Le diagnostic ne cree pas la table qu'il vient chercher,
//     ne complete pas un schema, ne rattache aucune ligne a aucun projet.

function ap_ligne_diag($cle, $valeur)
{
    echo $cle . ' ' . $valeur . "\n";
}

function ap_oui_non($booleen)
{
    return $booleen ? 'oui' : 'NON';
}

function ap_ecrire_diagnostic($config, $version, $erreurConfiguration)
{
    ap_ligne_diag('outil', 'annotepage');
    ap_ligne_diag('version', $version);
    ap_ligne_diag('format', AP_FORMAT);
    ap_ligne_diag('date', gmdate('Y-m-d\TH:i:sP'));
    echo "\n";

    // --- PHP reellement servi par le serveur web --------------------------
    ap_ligne_diag('php.version', PHP_VERSION);
    ap_ligne_diag('php.interface', PHP_SAPI);
    $utilisateur = 'inconnu';
    if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
        $infos = posix_getpwuid(posix_geteuid());
        if (isset($infos['name'])) {
            $utilisateur = $infos['name'];
        }
    } elseif (function_exists('get_current_user')) {
        $utilisateur = get_current_user();
    }
    ap_ligne_diag('php.utilisateur', $utilisateur === '' ? 'inconnu' : $utilisateur);

    // Les extensions dont l'OUTIL a besoin, plus celles que reclame le depot.
    // Le point d'entree ne sait pas ce que le depot demande, ni pourquoi :
    // c'est ce qui permet de remplacer le depot sans laisser derriere un
    // diagnostic qui reclame une extension dont plus personne ne se sert.
    $extensions = array_merge(array('json', 'mbstring', 'filter'),
                              ApDepot::extensionsRequises());
    foreach ($extensions as $extension) {
        ap_ligne_diag('php.extension.' . $extension,
            extension_loaded($extension) ? 'presente' : 'ABSENTE');
    }
    echo "\n";

    // --- Configuration ----------------------------------------------------
    // Ce bloc est ecrit MEME quand la configuration n'a pas pu etre chargee :
    // c'est le seul cas ou l'on a vraiment besoin du diagnostic, et il etait
    // justement le seul ou il mourait en 500 sans rien nommer.
    $chemin = __DIR__ . '/interne/configuration-locale.php';
    ap_ligne_diag('configuration.fichier', $chemin);
    ap_ligne_diag('configuration.presente', ap_oui_non(is_file($chemin)));
    ap_ligne_diag('configuration.lisible',
        ap_oui_non(is_file($chemin) && is_readable($chemin)));

    if ($erreurConfiguration !== null) {
        ap_ligne_diag('configuration.chargement', 'ECHEC');
        echo "\n";
        echo $erreurConfiguration . "\n";
        echo "\n";
        ap_ligne_diag('verdict',
            "la configuration n'a pas pu etre chargee : rien d'autre ne peut etre "
            . "verifie tant que ce point n'est pas regle.");
        return;
    }

    ap_ligne_diag('configuration.chargement', 'REUSSI');
    ap_ligne_diag('configuration.actif', ap_oui_non($config['actif']));
    ap_ligne_diag('configuration.deploiement', $config['deploiement']);
    ap_ligne_diag('configuration.longueur_max_texte', $config['longueur_max_texte']);
    ap_ligne_diag('configuration.longueur_max_auteur', $config['longueur_max_auteur']);
    ap_ligne_diag('configuration.longueur_max_charge', $config['longueur_max_charge']);
    ap_ligne_diag('configuration.plafond_corps_octets', $config['plafond_corps_octets']);
    ap_ligne_diag('debit.fenetre_secondes', $config['debit_fenetre_secondes']);
    ap_ligne_diag('debit.ecritures_par_ip', $config['debit_ecritures_par_ip']);
    ap_ligne_diag('debit.ecritures_par_projet', $config['debit_ecritures_par_projet']);
    ap_ligne_diag('debit.exports_par_ip', $config['debit_exports_par_ip']);
    ap_ligne_diag('debit.entete_ip_client',
        $config['entete_ip_client'] === null ? 'aucun (REMOTE_ADDR)' : $config['entete_ip_client']);
    ap_ligne_diag('quota.notes_par_projet',
        (int) $config['plafond_notes_par_projet'] > 0
            ? $config['plafond_notes_par_projet'] : 'sans limite');
    echo "\n";

    // --- Projets ----------------------------------------------------------
    // Les origines sont affichees EN ENTIER : ce sont des noms de domaine
    // publics, et c'est justement la ligne qu'on vient comparer, caractere par
    // caractere, avec ce que le navigateur envoie. Les identifiants, eux, sont
    // abreges : voir les trois regles ci-dessus.
    try {
        $projets = ap_projets_declares($config);
        ap_ligne_diag('projets.declares', count($projets));
        foreach ($projets as $identifiant => $projet) {
            // Les points de suspension de l'abrege sont retires ICI, et
            // seulement ici : dans une cle « projet.xxxxxx.mode » ils
            // donneraient « projet.xxxxxx....mode », qu'on relit trois fois
            // avant de comprendre que ce n'est pas une faute de frappe.
            $abrege = rtrim(ap_projet_abrege($identifiant), '.');
            ap_ligne_diag('projet.' . $abrege . '.mode', $projet['mode']);
            ap_ligne_diag('projet.' . $abrege . '.origines',
                implode(', ', $projet['origines']));
        }
        $reprise = ap_projet_de_reprise($config);
        ap_ligne_diag('projets.reprise_possible',
            $reprise === null
                ? 'non (relais, ou plusieurs projets declares)'
                : 'oui, vers ' . ap_projet_abrege($reprise));
    } catch (ApPanne $e) {
        ap_ligne_diag('projets.declares', 'ECHEC');
        echo "\n" . $e->getMessage() . "\n\n";
        ap_ligne_diag('verdict',
            "la declaration des projets est invalide : aucune note ne sera servie "
            . "tant que ce point n'est pas regle.");
        return;
    }
    echo "\n";

    if (!$config['actif']) {
        ap_ligne_diag('verdict',
            "outil INACTIF. Deposez interne/configuration-locale.php "
            . "(modele : configuration-locale.exemple.php).");
        return;
    }

    // --- Stockage ---------------------------------------------------------
    // Ce qui suit vient ENTIEREMENT du depot, qui est le seul a savoir ce
    // qu'est le stockage. On affiche des couples « cle valeur » sans les
    // interpreter.
    try {
        $lignes = (new ApDepot($config))->lignesDiagnostic();
    } catch (ApPanne $e) {
        echo $e->getMessage() . "\n\n";
        ap_ligne_diag('verdict', 'le stockage ne peut meme pas etre interroge.');
        return;
    }
    foreach ($lignes as $ligne) {
        if ($ligne[0] === '') {
            echo $ligne[1] === '' ? "\n" : $ligne[1] . "\n";
            continue;
        }
        ap_ligne_diag($ligne[0], $ligne[1]);
    }
}

// --- 5. Aiguillage --------------------------------------------------------

$action = isset($_GET['action']) ? $_GET['action'] : '';
if (!is_string($action)) {
    $action = '';
}
$action = strtolower(trim($action));

// L'ordre suit celui de la liste affichee en cas d'action inconnue, plus
// bas : les deux se lisent ensemble, et une action qui manquerait ici
// serait refusee par le message qui l'annonce.
$actions = array('liste', 'ajout', 'resoudre', 'texte', 'diagnostic', 'reprise');

if (!in_array($action, $actions, true)) {
    // Jamais un corps vide : celui qui se trompe d'adresse doit lire ce qu'il
    // fallait ecrire.
    throw new ApPanne(
        ($action === ''
            ? "Aucune action demandee."
            : "Action inconnue : " . ap_extrait_lisible($action) . ".")
        . "\nActions disponibles :\n"
        . "  ?action=liste&projet=<id>&index=<index>  les notes d'une page (JSON)\n"
        . "  ?action=ajout                            ecrire une note (POST)\n"
        . "  ?action=resoudre                         marquer corrigee (POST)\n"
        . "  ?action=texte&projet=<id>                toutes les notes (texte brut)\n"
        . "  ?action=diagnostic                       etat du serveur (texte brut)\n"
        . "  ?action=reprise&projet=<id>              reprise d'une base 1.2.0",
        400);
}

// La configuration est chargee SANS interrompre le diagnostic si elle echoue.
// Un fichier local mal forme leve ici une exception ; le diagnostic, lui, doit
// pouvoir dire LEQUEL et POURQUOI, et c'est tout ce qu'on peut savoir a
// distance quand plus rien ne repond.
$config = null;
$erreurConfiguration = null;
try {
    $config = ap_configuration();
} catch (ApPanne $e) {
    $erreurConfiguration = $e->getMessage();
} catch (Exception $e) {
    $erreurConfiguration = "Le fichier de configuration locale n'a pas pu etre charge : "
        . get_class($e) . '.';
} catch (Throwable $e) {
    // Erreur de syntaxe dans le fichier local : depuis PHP 7, un ParseError
    // dans un fichier INCLUS est rattrapable. Le message brut n'est pas
    // affiche — il peut porter un fragment de configuration — mais le fait
    // qu'il y ait une erreur de syntaxe, et dans quel fichier, se dit.
    ap_journaliser('configuration locale illisible : ' . $e->getMessage());
    $erreurConfiguration = "Le fichier interne/configuration-locale.php contient une "
        . "erreur de syntaxe PHP.\nLe detail est dans le journal d'erreurs PHP du serveur.";
}

// Le diagnostic repond TOUJOURS : c'est justement lui qu'on interroge quand
// rien d'autre ne repond. Il ne passe par aucun verrou d'origine — il n'est
// pas appele par une page, il est appele par un humain avec une barre
// d'adresse, et il ne rend jamais de note.
if ($action === 'diagnostic') {
    ap_commencer_texte();
    ap_ecrire_diagnostic($config, ap_version(), $erreurConfiguration);
    exit;
}

// Hors diagnostic, une configuration qui n'a pas pu etre chargee est une panne
// comme une autre : elle s'affiche.
if ($erreurConfiguration !== null) {
    throw new ApPanne($erreurConfiguration . "\nVoir ?action=diagnostic.", 500);
}

// Outil DEPOSE mais pas configure. Le defaut sur est le silence, pas une
// connexion tentee au hasard : un dossier recopie par erreur sur un site ne
// fait strictement rien.
//
// « liste » repond 200 avec actif=false, et le client se retire sans un mot.
// Les autres actions gardent leur 404 explique : elles ne sont appelees a la
// main que par quelqu'un qui cherche justement pourquoi rien ne marche.
if (!$config['actif']) {
    if ($action === 'liste') {
        ap_repondre_json(array(
            'ok'      => false,
            'actif'   => false,
            'outil'   => 'annotepage',
            'format'  => AP_FORMAT,
            'version' => ap_version(),
            'message' => "annotepage est inactif sur ce serveur. Voir ?action=diagnostic.",
        ));
    }
    throw new ApPanne(
        "annotepage est inactif sur ce serveur : aucun fichier "
        . "interne/configuration-locale.php.\n"
        . "Voir ?action=diagnostic.",
        404);
}

// Le plafond de corps est verifie AVANT tout le reste : c'est le seul refus
// qui coute moins cher que la requete qu'il refuse.
ap_verifier_taille_corps($config);

// La source des champs suit la methode, et non l'action : une action de
// service en GET lit la chaine de requete, une ecriture lit le corps. PHP ne
// remplit $_POST que pour un corps urlencode ou multipart, ce qui est
// exactement ce que le client envoie.
$entree = (strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '') === 'POST')
    ? $_POST : $_GET;

// LE PROJET, D'ABORD. Il decide de tout ce qui suit : quelles origines sont
// admises, quel mode est accepte, quelles lignes sont visibles.
$identifiant = ap_champ_projet($entree, 'projet');
$projets = ap_projets_declares($config);

if (!isset($projets[$identifiant])) {
    // Projet inconnu : meme regle que l'outil non configure. « liste » se tait,
    // les autres expliquent.
    //
    // Cela distingue de l'exterieur « projet declare » de « projet inconnu »,
    // par le 403 du verrou d'origine dans un cas et ce 200 dans l'autre. La
    // fuite est nulle : l'identifiant de projet est un jeton porteur, et qui
    // le possede peut deja lire les lignes. Qui ne le possede pas n'apprend
    // rien en devinant 128 bits.
    if ($action === 'liste') {
        ap_repondre_json(array(
            'ok'      => false,
            'actif'   => false,
            'outil'   => 'annotepage',
            'format'  => AP_FORMAT,
            'version' => ap_version(),
            'message' => "Projet inconnu de ce serveur. Voir ?action=diagnostic.",
        ));
    }
    throw new ApPanne(
        "Projet inconnu de ce serveur : " . ap_projet_abrege($identifiant) . "\n"
        . "Declarez-le dans interne/configuration-locale.php, avec ses origines.\n"
        . "Voir ?action=diagnostic.",
        404);
}
$projet = $projets[$identifiant];

// LE VERROU DE DOMAINE. Anti-abus, et rien d'autre : voir interne/origines.php.
$ecriture = ($action === 'ajout' || $action === 'resoudre' || $action === 'reprise');
ap_appliquer_verrou_origine($config, $identifiant, $projet, $ecriture);

// Le depot recoit l'identifiant de reprise par la configuration : c'est lui
// qui rattachera les lignes de format 1 quand la colonne « projet »
// apparaitra, et il n'a pas a savoir ce qu'est une origine pour cela.
$config['projet_reprise'] = ap_projet_de_reprise($config);
$depot = new ApDepot($config);

switch ($action) {

    case 'liste':
        $index = ap_champ_index($entree, 'index', true);
        ap_repondre_json(ap_enveloppe_reponse(array(
            'projet' => $identifiant,
            'index'  => $index,
            'notes'  => $depot->parPage($identifiant, $index),
        )));
        break;

    case 'ajout':
        ap_exiger_post("L'ecriture d'une note");
        ap_appliquer_debit($config, $depot, $identifiant, 'ecriture');
        ap_verifier_plafond_notes($config, $depot, $identifiant);
        $mode = ap_champ_mode($entree, $config, $identifiant, $projet);
        $note = ap_note_depuis_requete($entree, $config, $depot, $identifiant, $mode);
        ap_repondre_json(ap_enveloppe_reponse(array(
            'projet' => $identifiant,
            'note'   => $depot->ajouter($note),
        )));
        break;

    case 'resoudre':
        /* Marque une note comme corrigee, ou annule cette marque.
           En POST, comme toute ecriture : une action qui modifie l'etat ne
           doit pas partir d'un lien qu'on suit ou qu'un aspirateur explore. */
        ap_exiger_post("La resolution d'une note");
        ap_appliquer_debit($config, $depot, $identifiant, 'ecriture');
        /* Les deux champs passent par entrees.php comme tous les autres.
           Ils ne le faisaient pas dans l'outil d'origine : « id » etait
           converti en entier ici meme, et (int) sur un TABLEAU non vide vaut 1
           — « id[]=x » marquait donc la note numero 1 corrigee, en 200. Il n'y
           a qu'une frontiere de confiance, ou il n'y en a pas. */
        $id = ap_champ_identifiant($entree, 'id', 'id');
        /* La note est cherchee DANS CE PROJET. L'identifiant de note est un
           compteur global au serveur : sans cette portee, un projet marquerait
           corrigees les notes d'un autre en devinant un entier. */
        $visee = $depot->note($id, $identifiant);
        if ($visee === null) {
            throw new ApPanne("Note introuvable dans ce projet : " . $id . ".", 404);
        }
        /* LE MODE VIENT DE LA NOTE, PAS DE LA REQUETE. C'est le seul endroit
           du code ou il ne se demande pas au client, et c'est la bonne
           reponse : une resolution s'attache a une note deja ecrite, dont le
           mode est fixe depuis. Une base mi-claire mi-chiffree se resout donc
           ligne par ligne, sans que personne ait a se souvenir de ce qu'etait
           l'installation le jour ou la remarque a ete posee. */
        $mode = $visee['mode'];
        if ($mode !== 'clair' && $mode !== 'chiffre') {
            throw new ApPanne(
                "Cette note porte un mode que cette version d'annotepage ne connait "
                . "pas.\nElle n'a pas ete modifiee.", 400);
        }
        /* « resolue=0 » rouvre. Le cas existe : une correction jugee faite
           puis constatee incomplete doit pouvoir revenir sous les yeux, sans
           qu'on ait a recreer la remarque et perdre son fil de reponses. */
        $resolue = ap_champ_drapeau($entree, 'resolue', true, 'resolue');

        $par = '';
        $versionCorrectif = '';
        $chargeResolution = '';
        if ($mode === 'chiffre') {
            /* Le nom du correcteur et la version du correctif sont de la
               charge : ils partent dans une SECONDE enveloppe, de role
               « resolution ». Elle a son propre nonce et elle est ecrite plus
               tard, par quelqu'un d'autre — fondre les deux obligerait a
               rechiffrer une remarque qu'on n'a pas le droit de reecrire. */
            $chargeResolution = ap_champ_enveloppe(
                $entree, 'charge_resolution', $config['longueur_max_charge_resolution'],
                $resolue, 'charge_resolution');
            ap_refuser_champ($entree, 'par', 'par',
                "ce projet est en mode chiffre, et le nom du correcteur voyagerait en "
                . "clair jusqu'au serveur.");
            ap_refuser_champ($entree, 'version', 'version',
                "ce projet est en mode chiffre, et la version du correctif voyagerait en "
                . "clair jusqu'au serveur.");
        } else {
            /* Le nom n'est OBLIGATOIRE que pour marquer une correction : c'est
               lui qui signe. Pour rouvrir, il etait exige puis jete par le
               depot, qui remet resolue_par a vide — on demandait le nom du
               correcteur pour annuler la correction. */
            $par = ap_champ($entree, 'par', $config['longueur_max_auteur'],
                            $resolue, 'par');
            $versionCorrectif = ap_champ($entree, 'version',
                                         $config['longueur_max_version'], false, 'version');
        }

        ap_repondre_json(ap_enveloppe_reponse(array(
            'projet' => $identifiant,
            'note'   => $depot->resoudre($id, $identifiant, $par, $versionCorrectif,
                                         $chargeResolution, $resolue),
        )));
        break;

    case 'texte':
        ap_appliquer_debit($config, $depot, $identifiant, 'export');
        // Les deux requetes de comptage sont lancees AVANT toutes() : le
        // parcours en flux occupe la connexion, et une base injoignable doit
        // sortir en 503, pas au milieu d'un export commence.
        $total = $depot->compte($identifiant);
        $repartition = $depot->repartitionModes($identifiant);
        $notes = $depot->toutes($identifiant);
        ap_commencer_texte();
        ap_ecrire_export_texte(ap_version(), $identifiant, $repartition, $total, $notes);
        break;

    case 'reprise':
        /* MAINTENANCE. Refusee en relais : un relais n'a jamais eu de base
           1.2.0 a reprendre, et cette action enumere des chemins de page EN
           CLAIR — ce qui n'a de sens que la ou ils sont deja lisibles, sur le
           site relu lui-meme. */
        if (!ap_est_auto_heberge($config)) {
            throw new ApPanne(
                "La reprise n'existe qu'en mode auto-heberge.\n"
                . "Elle sert a rattacher les notes ecrites par « notes en contexte » "
                . "1.2.0, et elle enumere des chemins de page en clair : cela n'a de "
                . "sens que sur le site relu lui-meme.",
                404);
        }
        $rattachees = $depot->rattacherOrphelines();

        $methode = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '');
        if ($methode !== 'POST') {
            /* Etat de la reprise : ce qu'il reste a faire, et pour quels
               chemins. Le client calcule l'index de chacun — il a le sel, le
               serveur ne l'aura jamais — et les renvoie un par un. */
            ap_repondre_json(ap_enveloppe_reponse(array(
                'projet'     => $identifiant,
                'rattachees' => $rattachees,
                'pages'      => $depot->pagesSansIndex($identifiant),
            )));
        }

        /* Un couple par requete. Un tableau de couples dans un corps
           urlencode demanderait une syntaxe de tableau, donc un analyseur, et
           il n'y en a pas d'autre dans cet outil. Une base de recette compte
           quelques dizaines de pages : quelques dizaines de requetes, une
           seule fois dans la vie de l'installation. */
        $page = ap_champ_page($entree, 'page', $config['longueur_max_page']);
        $index = ap_champ_index($entree, 'index', true);
        ap_repondre_json(ap_enveloppe_reponse(array(
            'projet'     => $identifiant,
            'rattachees' => $rattachees,
            'page'       => $page,
            'index'      => $index,
            'touchees'   => $depot->affecterIndex($identifiant, $page, $index),
            'restantes'  => count($depot->pagesSansIndex($identifiant)),
        )));
        break;
}
