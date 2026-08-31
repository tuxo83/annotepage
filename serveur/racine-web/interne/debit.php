<?php
/**
 * debit.php — LIMITATION DE DEBIT ET PLAFONDS DE TAILLE.
 *
 * Un relais public verra des abus des le premier jour. Ce fichier porte la
 * POLITIQUE ; le comptage lui-meme est dans le depot, qui est le seul a
 * parler a la base. La separation n'est pas decorative : elle permet de
 * changer d'avis sur ce qu'on limite sans toucher a la facon de compter, et
 * inversement.
 *
 * CE QUI EST COMPTE, ET CE QUI NE L'EST PAS
 *
 * Compte : les ECRITURES (ajout, resoudre) et les EXPORTS (texte).
 * Pas compte : « liste ». La compter couterait une ecriture en base par
 * chargement de page, pour se defendre d'une requete qui ne fait grossir
 * personne et dont le cout est borne par ce qu'elle peut rendre. L'abus qui
 * compte est celui qui remplit la base, et celui qui aspire un projet entier
 * en boucle ; ce sont ces deux-la qui sont bornes.
 *
 * Consequence a ecrire plutot qu'a taire : une boucle de « liste » sur un
 * index de page connu n'est bornee par rien ici. Elle ne rend que les notes
 * d'une page, chiffrees si le projet l'est, mais elle consomme du serveur. Si
 * cela devenait un probleme, la reponse serait un plafond de requetes par
 * minute devant PHP, pas un compteur en base a chaque lecture.
 *
 * DEUX COMPTEURS, PAS UN
 *
 *  - PAR ADRESSE : empeche une seule machine de remplir la base, quel que
 *    soit le projet vise ;
 *  - PAR PROJET : empeche qu'un projet, meme depuis mille adresses, occupe le
 *    relais a lui seul. C'est le compteur qui tient quand l'abus est
 *    distribue, et le seul dont la valeur soit visible par l'operateur.
 *
 * QUAND LE COMPTEUR LUI-MEME EST EN PANNE
 *
 * Une limitation qui s'efface a la premiere erreur n'en est pas une. Mais
 * refuser toutes les ecritures d'un site interne parce qu'une table
 * secondaire manque est une panne fabriquee. La regle tranche selon ce qu'il
 * y a a perdre :
 *   - RELAIS : on refuse. Un relais sans compteur est un relais qui sera
 *     rempli, et l'operateur en est comptable.
 *   - AUTO-HEBERGE : on laisse passer, et on le journalise. Les notes sont
 *     derriere la meme restriction d'acces que le site relu ; l'abus y est
 *     bien moins probable que l'interruption.
 *
 * FENETRE FIXE, pas glissante. Une fenetre glissante demande un horodatage
 * par evenement, donc une ligne par ecriture : un compteur qui grossit plus
 * vite que ce qu'il protege. Le prix de la fenetre fixe est connu : a cheval
 * sur deux fenetres, on peut ecrire deux fois la limite. Pour un outil de
 * recette, cela n'a aucune consequence.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

/**
 * Plafond de taille du corps, verifie sur Content-Length.
 *
 * AVANT toute lecture des champs : sans lui, un corps de plusieurs
 * mega-octets serait entierement recu et analyse par PHP avant d'etre refuse
 * champ par champ. C'est le seul refus qui coute moins cher que l'attaque.
 *
 * Content-Length est declaratif et peut mentir : ce plafond-ci ne remplace
 * pas la limite `post_max_size` de PHP, il la double en donnant un message
 * lisible au lieu d'un $_POST vide et inexplicable.
 */
function ap_verifier_taille_corps(array $config)
{
    $plafond = (int) $config['plafond_corps_octets'];
    if ($plafond <= 0 || !isset($_SERVER['CONTENT_LENGTH'])) {
        return;
    }
    $taille = (int) $_SERVER['CONTENT_LENGTH'];
    if ($taille > $plafond) {
        throw new ApPanne(
            "Le corps de la requete fait " . $taille . " octets ; la limite est de "
            . $plafond . ".\nRien n'a ete enregistre.",
            413);
    }
}

/**
 * L'adresse du client, telle que ce serveur peut la connaitre.
 *
 * REMOTE_ADDR par defaut, et c'est un defaut, pas une negligence : derriere
 * un mandataire, REMOTE_ADDR est celle du mandataire, et tous les clients
 * partagent alors un seul compteur. On le corrige en declarant
 * `entete_ip_client`, JAMAIS en faisant confiance a un entete par defaut —
 * un entete que le client ecrit lui-meme rend la limitation contournable en
 * une ligne.
 */
function ap_adresse_client(array $config)
{
    $entete = isset($config['entete_ip_client']) ? $config['entete_ip_client'] : null;
    if (is_string($entete) && $entete !== ''
        && isset($_SERVER[$entete]) && is_string($_SERVER[$entete])) {
        // X-Forwarded-For porte une LISTE ; la premiere entree est le client
        // d'origine tel que le mandataire l'a vu.
        $morceaux = explode(',', $_SERVER[$entete]);
        $premier = trim($morceaux[0]);
        if ($premier !== '') {
            return $premier;
        }
    }
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'inconnue';
}

/**
 * Cle de comptage : un condense, jamais la valeur.
 *
 * Ce n'est PAS de l'anonymisation — l'espace des adresses IPv4 s'enumere en
 * quelques minutes, et qui a la table peut retrouver l'adresse. C'est de
 * l'hygiene : la base des notes ne doit pas contenir, en clair, une seconde
 * liste des adresses de ceux qui annotent. Le serveur web en tient deja une,
 * c'est son travail ; celle-ci n'a aucune raison d'exister.
 */
function ap_cle_debit($portee, $valeur)
{
    return $portee . ':' . substr(hash('sha256', (string) $valeur), 0, 40);
}

/**
 * Applique la limitation de debit pour une action donnee.
 *
 * @param string $action 'ecriture' ou 'export'
 */
function ap_appliquer_debit(array $config, $depot, $identifiant, $action)
{
    $duree = (int) $config['debit_fenetre_secondes'];
    if ($duree <= 0) {
        return;
    }
    $fenetre = (int) floor(time() / $duree);

    $limites = array();
    if ($action === 'ecriture') {
        $limites[] = array('ip',
            ap_cle_debit('e-ip', ap_adresse_client($config)),
            (int) $config['debit_ecritures_par_ip'],
            "trop d'ecritures depuis cette machine");
        $limites[] = array('projet',
            ap_cle_debit('e-pr', $identifiant),
            (int) $config['debit_ecritures_par_projet'],
            "trop d'ecritures sur ce projet");
    } else {
        $limites[] = array('ip',
            ap_cle_debit('x-ip', ap_adresse_client($config)),
            (int) $config['debit_exports_par_ip'],
            "trop d'exports demandes depuis cette machine");
    }

    foreach ($limites as $limite) {
        list($portee, $cle, $plafond, $phrase) = $limite;
        if ($plafond <= 0) {
            continue;
        }
        try {
            $compte = $depot->consommerDebit($cle, $fenetre);
        } catch (ApPanne $e) {
            // Voir l'en-tete : on refuse en relais, on laisse passer en
            // auto-heberge. Dans les deux cas on le journalise, parce qu'un
            // compteur en panne finit toujours par etre decouvert trop tard.
            ap_journaliser('compteur de debit indisponible (' . $portee . ')');
            if (ap_est_auto_heberge($config)) {
                return;
            }
            throw $e;
        }
        if ($compte > $plafond) {
            // Retry-After : la seconde ou la fenetre courante se termine. Un
            // client qui reessaie tout de suite ne fait qu'incrementer le
            // compteur, ce qui repousse d'autant la fin de sa punition — a lui
            // de lire l'entete.
            $reste = ($fenetre + 1) * $duree - time();
            if (!headers_sent()) {
                header('Retry-After: ' . max(1, $reste));
            }
            throw new ApPanne(
                "Trop de requetes : " . $phrase . ".\n"
                . "La limite est de " . $plafond . " par tranche de " . $duree
                . " secondes. Reessayez dans " . max(1, $reste) . " secondes.\n"
                . "Rien n'a ete enregistre ; le texte que vous avez saisi n'est pas perdu.",
                429);
        }
    }
}

/**
 * Plafond de notes par projet.
 *
 * FORMAT.md §8.6 laisse OUVERTS le quota et la retention : ce plafond est
 * donc un outil, pas une politique. Il vaut 0 — sans limite — par defaut, il
 * n'efface rien, il ne fait expirer rien. Il refuse l'ecriture au-dela, en le
 * disant, ce qui vaut mieux qu'un relais qui grossit jusqu'a ce que
 * l'hebergeur tranche a la place de son operateur.
 */
function ap_verifier_plafond_notes(array $config, $depot, $identifiant)
{
    $plafond = (int) $config['plafond_notes_par_projet'];
    if ($plafond <= 0) {
        return;
    }
    if ($depot->compte($identifiant) >= $plafond) {
        throw new ApPanne(
            "Ce projet a atteint le plafond de " . $plafond . " notes fixe par "
            . "l'operateur de ce serveur.\n"
            . "Aucune note n'a ete effacee : c'est l'ecriture qui est refusee.\n"
            . "Rien n'a ete enregistre ; le texte que vous avez saisi n'est pas perdu.",
            403);
    }
}
