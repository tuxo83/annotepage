<?php
/**
 * erreurs.php — L'ecran blanc n'est jamais une reponse.
 *
 * Une equipe non technique qui annote un site n'a aucun moyen de distinguer
 * « le serveur n'a rien renvoye » de « mes notes sont enregistrees ». Toute
 * panne doit donc SORTIR, en texte lisible, avec un code HTTP juste.
 *
 * Trois filets, parce qu'aucun ne couvre les trois cas a lui seul :
 *   - set_exception_handler()      : les exceptions non rattrapees ;
 *   - set_error_handler()          : les erreurs non fatales (journalisees) ;
 *   - register_shutdown_function() : les erreurs FATALES et les erreurs de
 *     compilation d'un fichier inclus, que les deux premiers ne voient pas.
 *
 * Regle absolue de ce fichier : aucun message sorti au reseau ne recopie un
 * identifiant, un mot de passe ni une chaine de connexion. Les messages des
 * pilotes de stockage sont tronques AVANT journalisation : ils contiennent
 * couramment l'hote, le nom du stockage et l'utilisateur, et un journal se
 * relit plus souvent qu'on ne le croit.
 *
 * S'AJOUTE AU PORT : une reponse d'erreur peut partir vers une AUTRE origine
 * (mode relais). Les en-tetes de partage sont donc poses ici aussi, par un
 * point de rappel que le verrou d'origine remplit — sans quoi le navigateur
 * masquerait le message au client et l'equipe verrait un echec muet, ce qui
 * est exactement ce que ce fichier existe pour empecher.
 *
 * Ce fichier ne parle d'aucun site en particulier.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

/** Longueur maximale d'un message de pilote recopie dans un journal. */
if (!defined('AP_TRONCATURE_JOURNAL')) {
    define('AP_TRONCATURE_JOURNAL', 120);
}

/**
 * Panne annoncable : porte le code HTTP a rendre et un message deja redige
 * pour un lecteur humain. Tout ce qui est leve avec cette classe est destine
 * a etre AFFICHE ; tout le reste est un defaut de programmation et sort en
 * 500 avec un message generique.
 */
class ApPanne extends Exception
{
    private $statut;

    public function __construct($message, $statut = 500, $precedente = null)
    {
        parent::__construct($message, 0, $precedente);
        $this->statut = (int) $statut;
    }

    public function statut()
    {
        return $this->statut;
    }
}

/**
 * En-tetes a reposer sur CHAQUE reponse, y compris les erreurs.
 *
 * Le verrou d'origine (origines.php) depose ici la ligne de partage qu'il a
 * calculee. Ce fichier ne sait pas ce qu'est une origine ; il sait seulement
 * qu'une erreur doit arriver a l'ecran du relecteur, meme quand elle traverse
 * une frontiere d'origine.
 *
 * @param string|null $entetes lignes completes, ou null pour seulement lire
 * @return array
 */
function ap_entetes_partage($entetes = null)
{
    static $memoire = array();
    if ($entetes !== null) {
        $memoire = $entetes;
    }
    return $memoire;
}

/**
 * Tronque un message technique avant de le confier au journal.
 * Un message de pilote peut contenir un hote, un nom de base, un utilisateur.
 */
function ap_tronquer($message)
{
    $message = (string) $message;
    $message = str_replace(array("\r", "\n"), ' ', $message);
    if (strlen($message) > AP_TRONCATURE_JOURNAL) {
        $message = substr($message, 0, AP_TRONCATURE_JOURNAL) . '...';
    }
    return $message;
}

/** Journalise par le mecanisme de PHP, deja configure par l'hebergeur. */
function ap_journaliser($message)
{
    error_log('[annotepage] ' . ap_tronquer($message));
}

/**
 * Rend une reponse d'erreur et s'arrete.
 *
 * Deux situations, traitees differemment :
 *  - rien n'est encore parti : on jette ce qui est en tampon, on pose le code
 *    HTTP et le type, on ecrit le message seul ;
 *  - la reponse a deja commence (export en flux) : on ne peut plus changer le
 *    code HTTP, alors on ajoute une ligne d'erreur au flux, ce qui vaut
 *    mieux qu'une troncature muette prise pour une fin normale.
 */
function ap_repondre_erreur($statut, $message)
{
    if (!headers_sent()) {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        http_response_code((int) $statut);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex, nofollow');
        header('X-Content-Type-Options: nosniff');
        foreach (ap_entetes_partage() as $ligne) {
            header($ligne);
        }
        echo $message . "\n";
    } else {
        echo "\nERREUR " . (int) $statut . ' : ' . $message . "\n";
        echo "Cet export est INCOMPLET.\n";
    }
    exit;
}

/**
 * Installe les trois filets. Appele une seule fois, au tout debut du point
 * d'entree, AVANT d'inclure quoi que ce soit d'autre : une erreur de
 * compilation dans un fichier inclus ne serait pas rattrapee autrement.
 */
function ap_installer_gestionnaires()
{
    // Le detail part au journal, jamais a l'ecran : il peut contenir des
    // fragments de configuration.
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    error_reporting(E_ALL);

    set_exception_handler('ap_gestionnaire_exception');
    set_error_handler('ap_gestionnaire_erreur');
    register_shutdown_function('ap_gestionnaire_arret');
}

function ap_gestionnaire_exception($e)
{
    if ($e instanceof ApPanne) {
        ap_journaliser($e->getMessage());
        ap_repondre_erreur($e->statut(), $e->getMessage());
        return;
    }

    // Defaut de programmation : le detail au journal, une phrase a l'ecran.
    ap_journaliser(get_class($e) . ' : ' . $e->getMessage()
        . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')');
    ap_repondre_erreur(500,
        "Panne interne de l'outil de notes. Vos notes ne sont peut-etre pas enregistrees.\n"
        . "Le detail est dans le journal d'erreurs PHP du serveur.");
}

/**
 * Erreurs non fatales : journalisees, jamais affichees, et l'execution
 * continue. Rendre fatale une simple alerte transformerait un desagrement en
 * panne — et l'outil n'ecrit rien sur le disque, ou une alerte serait grave.
 */
function ap_gestionnaire_erreur($niveau, $message, $fichier = '', $ligne = 0)
{
    if ((error_reporting() & $niveau) === 0) {
        return true;
    }
    ap_journaliser('erreur PHP (' . $niveau . ') ' . $message
        . ' (' . basename((string) $fichier) . ':' . (int) $ligne . ')');

    // Seules les erreurs de niveau fatal interrompent la reponse.
    $fatales = E_USER_ERROR | E_RECOVERABLE_ERROR;
    if (($niveau & $fatales) !== 0) {
        ap_repondre_erreur(500,
            "Panne interne de l'outil de notes. Vos notes ne sont peut-etre pas enregistrees.");
    }
    return true;
}

/**
 * Dernier filet : erreur fatale, memoire epuisee, delai depasse, ou erreur de
 * compilation d'un fichier inclus. C'est le seul qui couvre le cas ou PHP
 * s'arrete sans avoir rien ecrit — c'est-a-dire l'ecran blanc.
 */
function ap_gestionnaire_arret()
{
    $derniere = error_get_last();
    if ($derniere === null) {
        return;
    }
    $fatales = array(E_ERROR, E_PARSE, E_CORE_ERROR, E_CORE_WARNING,
                     E_COMPILE_ERROR, E_COMPILE_WARNING, E_USER_ERROR);
    if (!in_array($derniere['type'], $fatales, true)) {
        return;
    }
    ap_journaliser('arret fatal : ' . $derniere['message']
        . ' (' . basename($derniere['file']) . ':' . $derniere['line'] . ')');
    ap_repondre_erreur(500,
        "Panne interne de l'outil de notes (arret premature du script).\n"
        . "Vos notes ne sont peut-etre pas enregistrees.\n"
        . "Le detail est dans le journal d'erreurs PHP du serveur.");
}
