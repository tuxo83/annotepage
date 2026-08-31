<?php
/**
 * configuration.php — LA configuration effective de l'outil.
 *
 * Deux couches, et une seule regle : ce fichier-ci ne connait AUCUN serveur.
 * Il porte des valeurs par defaut generiques, puis fusionne ce qu'un fichier
 * `configuration-locale.php` voisin lui apporte, s'il existe.
 *
 * SANS fichier local, l'outil est INACTIF. C'est delibere : le comportement
 * sur par defaut est le silence, pas une connexion tentee au hasard vers une
 * base dont on ne sait rien. Un dossier recopie par erreur sur un site ne
 * fait donc rien du tout.
 *
 * UN SEUL CODE, DEUX DEPLOIEMENTS. La cle `deploiement` vaut « auto-heberge »
 * (l'outil est pose sur le site relu, derriere la meme restriction d'acces
 * que lui) ou « relais » (l'outil est pose sur une machine tierce et sert
 * plusieurs sites). Ce n'est PAS un aiguillage vers deux implantations : le
 * meme code lit la meme table avec la meme requete, et cette valeur ne change
 * que trois choses, chacune ecrite noir sur blanc a l'endroit ou elle agit —
 * le mode clair (impossible en relais), l'absence d'entete Origin (toleree en
 * auto-heberge) et l'action de reprise (refusee en relais).
 *
 * Voir configuration-locale.exemple.php pour le modele a recopier.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

/**
 * Valeurs par defaut. Chaque cle est commentee : ce tableau est la
 * documentation de reference de la configuration.
 */
function ap_configuration_defauts()
{
    return array(

        // L'outil repond-il ? Faux tant qu'aucun fichier local ne l'active.
        'actif' => false,

        // « auto-heberge » ou « relais ». Le defaut est le plus restrictif
        // des deux : un relais mal declare refuserait le mode clair et
        // exigerait un entete Origin, ce qui se voit tout de suite. L'inverse
        // — un relais pris pour un auto-heberge — servirait du clair a un
        // tiers sans que personne s'en apercoive.
        'deploiement' => 'relais',

        // LES PROJETS. Cle = identifiant_projet (22 caracteres base64url,
        // derive du sel dans le NAVIGATEUR : voir FORMAT.md §1.3). Le serveur
        // ne le calcule pas, il le reconnait.
        //
        //   'projets' => array(
        //       '7Qb1kZ3xNvA9dLpEqKf2Zt' => array(
        //           'origines' => array('https://preprod.exemple.fr',
        //                               'https://www.exemple.fr'),
        //           'mode'     => 'chiffre',
        //       ),
        //   )
        //
        // EN AUTO-HEBERGE, ce tableau contient exactement UNE entree. Ce
        // n'est pas un cas particulier du code : c'est le meme tableau, la
        // meme colonne `projet`, la meme requete. Un seul locataire est un
        // multi-locataire a un locataire.
        'projets' => array(),

        // ESPACE DE CONFIGURATION DU DEPOT (interne/depot.php), que lui seul
        // interprete. Ce fichier-ci ne sait pas ce qu'est un « hote » : il
        // transporte des cles et resout les valeurs, c'est tout. Qui remplace
        // depot.php remplace aussi le sens de ce sous-tableau.
        //
        // CHAQUE valeur accepte deux formes :
        //   - une chaine, la valeur en clair ;
        //   - array('fichier' => '/chemin/absolu'), la valeur lue dans un
        //     fichier depose HORS de la racine web.
        // La seconde forme est la seule facon generique de lire un secret
        // sans l'ecrire dans un fichier servi par le serveur web.
        'base' => array(
            'hote'       => '127.0.0.1',
            'port'       => 3306,
            'nom'        => null,
            'utilisateur'=> null,
            'motdepasse' => null,
        ),

        // Prefixe de nommage du stockage. Le depot en fait ce qu'il veut ;
        // avec celui qui est livre, les tables s'appelleront <prefixe>notes
        // et <prefixe>debit. Configurable pour qu'un stockage deja occupe ne
        // pose pas de collision. C'est le depot qui en verifie la forme,
        // parce que c'est lui qui sait ou cette valeur finit.
        'prefixe_tables' => 'notes_',

        // Bornes de saisie, appliquees cote serveur (le client peut mentir).
        // Elles dimensionnent aussi les colonnes de la table : les changer sur
        // une base deja creee n'elargit pas les colonnes existantes.
        //
        // ELLES NE S'APPLIQUENT QU'AU MODE CLAIR. En mode chiffre le serveur
        // ne voit qu'une enveloppe : il ne sait pas ou finit l'auteur et ou
        // commence le texte. Voir FORMAT.md §3.6 — c'est le prix du
        // chiffrement de bout en bout, et il est ecrit plutot que tu.
        'longueur_max_texte'      => 4000,
        'longueur_max_auteur'     => 80,
        'longueur_max_page'       => 300,
        'longueur_max_selecteur'  => 500,
        'longueur_max_empreinte'  => 255,
        'longueur_max_extrait'    => 300,
        // Contexte de prise de note : version du site, environnement, taille
        // de la fenetre. Volontairement courts — ce sont des etiquettes, pas
        // du contenu, et un champ long invite a y ecrire autre chose.
        'longueur_max_version'    => 60,
        'longueur_max_environ'    => 20,
        'longueur_max_fenetre'    => 20,

        // Bornes des enveloppes chiffrees, en CARACTERES. Ce sont les seules
        // que le serveur puisse appliquer en mode chiffre. Valeurs fixees par
        // FORMAT.md §3.6 : les changer sans changer le format, c'est accepter
        // qu'une note ecrite ici soit refusee ailleurs.
        'longueur_max_charge'            => 24000,
        'longueur_max_charge_resolution' => 2000,

        // PLAFOND DE CORPS, en octets, verifie sur Content-Length AVANT toute
        // lecture. Une enveloppe de 24000 caracteres plus les autres champs
        // tient tres au large dans 64 Kio. Sans ce plafond, un corps de
        // plusieurs mega-octets serait entierement recu et analyse par PHP
        // avant d'etre refuse champ par champ.
        'plafond_corps_octets' => 65536,

        // LIMITATION DE DEBIT. Fenetre fixe, comptage en base (l'outil
        // n'ecrit rien sur le disque, et il n'y a pas de cache partage sur ce
        // genre d'hebergement). Une valeur a 0 desactive le compteur
        // correspondant.
        //
        // Ce qui est compte : les ECRITURES (ajout, resoudre) et les EXPORTS
        // (texte). Pas « liste » : la compter couterait une ecriture en base
        // par chargement de page, pour se defendre d'une requete qui ne fait
        // grossir personne. L'abus qui compte est celui qui remplit la base
        // ou qui aspire un projet entier ; ce sont ces deux-la qui sont
        // bornes.
        'debit_fenetre_secondes'     => 300,
        'debit_ecritures_par_ip'     => 120,
        'debit_ecritures_par_projet' => 300,
        'debit_exports_par_ip'       => 20,

        // Nombre maximal de notes par projet, 0 = sans limite. FORMAT.md §8.6
        // laisse le quota et la retention OUVERTS : ce plafond est donc un
        // outil, pas une politique. Il n'efface rien et ne fait expirer rien ;
        // il refuse l'ecriture au-dela, en le disant.
        'plafond_notes_par_projet' => 0,

        // En-tete portant l'adresse du client quand un mandataire est devant
        // (par exemple 'HTTP_X_FORWARDED_FOR'). NUL PAR DEFAUT, et ce defaut
        // est le point important : un en-tete que le client peut ecrire
        // lui-meme rendrait la limitation de debit contournable en une ligne.
        // Ne le renseignez QUE si un mandataire de confiance le reecrit a
        // chaque requete.
        'entete_ip_client' => null,
    );
}

/**
 * Configuration effective, calculee une fois par requete.
 *
 * @return array
 */
function ap_configuration()
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = ap_configuration_defauts();

    $local = __DIR__ . '/configuration-locale.php';
    if (is_file($local)) {
        // LISIBILITE VERIFIEE AVANT LE require, et pas apres : un require sur
        // un fichier present mais illisible est une erreur FATALE de
        // compilation, que ni try/catch ni le gestionnaire d'exceptions ne
        // rattrapent. Sans cette ligne, un simple droit de lecture manquant
        // emportait aussi ?action=diagnostic — c'est-a-dire l'unique moyen de
        // savoir a distance que le droit manque.
        if (!is_readable($local)) {
            throw new ApPanne(
                "Le fichier de configuration de l'outil de notes existe mais n'est pas "
                . "lisible par l'utilisateur sous lequel tourne PHP.\n"
                . "Fichier : " . $local . "\n"
                . "A transmettre a l'administrateur : donner le droit de LECTURE sur ce "
                . "fichier a l'utilisateur de PHP.",
                500);
        }
        $apport = require $local;
        if (!is_array($apport)) {
            throw new ApPanne(
                "Le fichier configuration-locale.php doit RENVOYER un tableau "
                . "(return array(...);). Il n'a rien renvoye d'exploitable.",
                500);
        }
        // Fusion a un niveau, plus la sous-cle « base » : suffisant pour la
        // forme de cette configuration, et previsible a la lecture.
        //
        // « projets » n'est PAS fusionne cle a cle : le fichier local le
        // remplace en entier. Fusionner laisserait un projet declare par
        // erreur dans les defauts survivre a sa suppression du fichier local,
        // et un projet de trop est un locataire de trop.
        if (isset($apport['base']) && is_array($apport['base'])) {
            $config['base'] = array_merge($config['base'], $apport['base']);
            unset($apport['base']);
        }
        $config = array_merge($config, $apport);
    }

    $config['actif'] = !empty($config['actif']);
    $config['configuration_locale'] = $local;
    $config['configuration_locale_presente'] = is_file($local);

    // Le deploiement est normalise ICI, et une valeur inconnue est une PANNE,
    // jamais un repli silencieux. « relias » au lieu de « relais » retomberait
    // sur le defaut, et le defaut est justement l'autre mode : on servirait du
    // clair a un tiers en croyant l'inverse.
    $deploiement = isset($config['deploiement']) ? strtolower(trim((string) $config['deploiement'])) : '';
    if ($deploiement !== 'auto-heberge' && $deploiement !== 'relais') {
        throw new ApPanne(
            "Configuration invalide : « deploiement » vaut « "
            . substr(preg_replace('/[^\x20-\x7E]/', '', $deploiement), 0, 30)
            . " ».\nLes deux seules valeurs acceptees sont « auto-heberge » et "
            . "« relais ».",
            500);
    }
    $config['deploiement'] = $deploiement;

    return $config;
}

/** Vrai si l'outil est pose sur le site qu'il relit. */
function ap_est_auto_heberge(array $config)
{
    return $config['deploiement'] === 'auto-heberge';
}

/**
 * Resout une valeur de configuration donnee soit en clair, soit sous la forme
 * array('fichier' => '/chemin/absolu').
 *
 * Trois refus explicites, chacun pour une panne deja vue ailleurs :
 *
 *  1. chemin non absolu. PHP resout un chemin relatif par rapport au
 *     REPERTOIRE DE TRAVAIL du processus, pas par rapport au fichier qui
 *     l'ecrit — et sous certaines configurations de serveur ce repertoire
 *     n'est pas celui qu'on croit. Un chemin relatif produirait un « fichier
 *     illisible » trompeur ; on refuse en nommant le chemin obtenu.
 *  2. fichier illisible. On nomme le CHEMIN, jamais le contenu, et on donne
 *     la phrase a transmettre a l'administrateur.
 *  3. fichier vide. Un mot de passe vide echouerait plus loin, avec un
 *     message de pilote incomprehensible.
 *
 * @param mixed  $valeur    la valeur declaree
 * @param string $etiquette le nom de la cle, pour le message
 * @return string
 */
function ap_valeur_configuree($valeur, $etiquette)
{
    if (is_array($valeur) && isset($valeur['fichier'])) {
        $chemin = (string) $valeur['fichier'];

        if ($chemin === '' || $chemin[0] !== '/') {
            throw new ApPanne(
                "Configuration invalide pour « " . $etiquette . " » : le chemin du fichier "
                . "doit etre ABSOLU.\n"
                . "Chemin obtenu : " . $chemin . "\n"
                . "Ancrez-le sur __DIR__, par exemple "
                . "__DIR__ . '/../../secrets/utilisateur-de-la-base'.",
                500);
        }
        if (!is_readable($chemin)) {
            throw new ApPanne(
                "L'outil de notes ne peut pas lire son identifiant « " . $etiquette . " ».\n"
                . "Fichier attendu : " . $chemin . "\n"
                . (is_file($chemin)
                    ? "Le fichier existe mais n'est pas lisible par l'utilisateur sous lequel "
                      . "tourne PHP.\nA transmettre a l'administrateur : donner le droit de "
                      . "LECTURE sur ce fichier a l'utilisateur de PHP."
                    : "Le fichier est absent. Verifiez le chemin, y compris le nombre de "
                      . "niveaux remontes.")
                . "\nAucune note ne peut etre enregistree tant que ce point n'est pas regle.",
                503);
        }
        $contenu = file_get_contents($chemin);
        if ($contenu === false) {
            throw new ApPanne(
                "Lecture impossible de " . $chemin . " (identifiant « " . $etiquette . " »).",
                503);
        }
        $contenu = trim($contenu);
        if ($contenu === '') {
            throw new ApPanne(
                "Le fichier " . $chemin . " est vide : l'identifiant « " . $etiquette
                . " » n'a pas de valeur.",
                503);
        }
        return $contenu;
    }

    if ($valeur === null || $valeur === '') {
        throw new ApPanne(
            "Configuration incomplete : « " . $etiquette . " » n'est pas renseigne dans "
            . "configuration-locale.php.",
            503);
    }

    return (string) $valeur;
}

/**
 * Decrit une valeur de configuration SANS la lire et SANS jamais lever.
 *
 * Sert au diagnostic, dont toute la valeur tient a une regle : on dit d'ou
 * vient la valeur et si elle est lisible ; on n'affiche JAMAIS la valeur. Un
 * diagnostic qui laisse fuir un mot de passe est pire que pas de diagnostic.
 *
 * @param bool $secret la valeur est-elle sensible ? Un hote et un port ne le
 *                     sont pas, et les afficher fait gagner un aller-retour a
 *                     qui diagnostique. Un utilisateur et un mot de passe le
 *                     sont, et ne sortent jamais d'ici.
 * @return string une ligne lisible par un administrateur
 */
function ap_decrire_valeur_configuree($valeur, $etiquette, $secret = true)
{
    if (is_array($valeur) && isset($valeur['fichier'])) {
        $chemin = (string) $valeur['fichier'];
        if ($chemin === '' || $chemin[0] !== '/') {
            return 'fichier ' . $chemin . ' : CHEMIN NON ABSOLU, refuse';
        }
        if (!is_file($chemin)) {
            return 'fichier ' . $chemin . ' : ABSENT';
        }
        if (!is_readable($chemin)) {
            return 'fichier ' . $chemin
                . ' : NON LISIBLE par l\'utilisateur de PHP';
        }
        // La TAILLE non plus n'est pas affichee : la longueur d'un mot de
        // passe n'est pas rien, et cette adresse n'est protegee que par une
        // restriction d'adresses IP. « Lisible » repond a la question posee.
        return 'fichier ' . $chemin . ' : lisible (contenu non affiche)';
    }

    if ($valeur === null || $valeur === '') {
        return 'NON RENSEIGNE';
    }

    return $secret
        ? 'valeur ecrite dans la configuration (non affichee)'
        : (string) $valeur;
}
