<?php
/**
 * entrees.php — LA FRONTIERE DE CONFIANCE.
 *
 * Tout ce qui vient du navigateur passe par ici et par nulle part ailleurs :
 * bornes de longueur, retrait des caracteres de controle, forme du chemin de
 * page, forme d'un identifiant de projet, forme d'une enveloppe chiffree,
 * existence et profondeur de la note repondue.
 *
 * Ce fichier existe separement parce que c'est la seule partie de l'outil
 * dont une erreur se paie. Le reste, au pire, n'affiche pas une note.
 *
 * Ce qu'il ne fait PAS, et pourquoi :
 *  - il n'echappe rien pour le HTML. L'echappement appartient au format de
 *    sortie, pas a l'entree : stocker du texte deja echappe le rendrait faux
 *    dans l'export texte brut, et double dans le JSON. Le texte est stocke
 *    tel qu'il a ete saisi ; c'est api.php (JSON) et sortie-texte.php (texte)
 *    qui le rendent inoffensif dans LEUR format.
 *  - il ne concatene jamais rien dans du SQL. Voir depot.php : requetes
 *    preparees, sans exception.
 *  - il ne DECHIFFRE rien, et ne peut pas. En mode chiffre il verifie la
 *    FORME de l'enveloppe et sa longueur, jamais son contenu : la cle ne
 *    quitte pas le navigateur. Consequence a ecrire plutot qu'a taire : les
 *    bornes par champ deviennent alors une convention du client. Un client
 *    modifie peut ranger 3000 caracteres dans le champ « auteur », et le
 *    serveur l'acceptera — il ne voit pas de champ « auteur ». C'est le prix
 *    du chiffrement de bout en bout, et il est paye volontiers : l'outil
 *    s'adresse a une equipe de recette, pas a un public hostile.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

/**
 * Longueur en CARACTERES, pas en octets : « e » et « é » comptent pour un.
 * mbstring peut manquer sur un hebergement quelconque ; on se replie sur une
 * expression reguliere UTF-8, puis sur les octets en dernier recours.
 */
function ap_longueur($chaine)
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($chaine, 'UTF-8');
    }
    $n = preg_match_all('/./us', $chaine);
    return $n === false ? strlen($chaine) : $n;
}

/**
 * Nettoyage commun a tous les champs texte.
 *
 * - refus d'un octet non UTF-8 valide : il ferait echouer l'insertion en
 *   utf8mb4 ou ressortirait mutile, et l'equipe conclurait que l'outil
 *   « perd les notes » ;
 * - normalisation en \n de TOUT ce qu'un lecteur traite comme une fin de
 *   ligne, et pas seulement de \r\n. Voir ci-dessous : c'est le point qui a
 *   ete pris en defaut ;
 * - retrait des caracteres de controle C0, sauf \n et \t : ils cassent le
 *   format de l'export texte, dont l'indentation est le contrat.
 *
 * POURQUOI LA LISTE DES FINS DE LIGNE EST PLUS LONGUE QU'IL N'Y PARAIT
 *
 * Le format de l'export dit la structure PAR L'INDENTATION : une ligne sans
 * marge est une note, une ligne a quatre espaces est du texte de note. Tout
 * caractere qu'un lecteur compte pour une fin de ligne, et que nous laissons
 * passer tel quel, fabrique donc une ligne sans marge AU MILIEU d'un texte —
 * c'est-a-dire une note entiere, avec sa page, son auteur et sa date, qui
 * n'a jamais ete ecrite. Defaut mesure, et corrige ici :
 *
 *     texte = "innocent<U+2028>note 999<U+2028>page /DIRECTION.html<U+2028>..."
 *
 * ressortait dans l'export comme deux notes, la seconde forgee de bout en
 * bout. U+2028, U+2029 et U+0085 ne sont PAS des caracteres de controle C0 :
 * la classe qui retirait \x00-\x1F ne les voyait pas, et `cat -A` — l'outil
 * de la verification « octet a octet » — ne les affiche pas non plus comme
 * des sauts de ligne. Il faut donc les nommer.
 *
 * Ils sont ramenes a \n plutot que supprimes : ce SONT des fins de ligne, et
 * les supprimer collerait deux mots. Une fois ramenes a \n, ils sont
 * indentes comme n'importe quelle autre ligne du texte, et ne peuvent plus
 * rien fabriquer. La reponse n'est jamais d'assouplir le format.
 *
 * La liste couvre exactement ce qu'un lecteur Unicode traite comme une fin de
 * ligne (Python str.splitlines, la norme Unicode UAX #14) : \n, \r, \v, \f,
 * les separateurs \x1C-\x1E, U+0085, U+2028 et U+2029. \v, \f et \x1C-\x1E
 * tombent deja dans la classe C0 retiree plus bas.
 *
 * EN MODE CHIFFRE, ce nettoyage n'a plus prise sur le texte : il dort dans
 * l'enveloppe. Il a lieu alors chez le PRODUCTEUR de l'export, apres
 * dechiffrement — la seule place ou le texte existe. Le present filtre reste
 * neanmoins la ligne de defense du mode clair, et la seconde de sortie-texte.
 *
 * @param bool $multiligne le champ a-t-il le droit de contenir des retours ?
 */
function ap_nettoyer_texte($valeur, $multiligne, $etiquette)
{
    $valeur = (string) $valeur;

    if (preg_match('//u', $valeur) !== 1) {
        throw new ApPanne(
            "Le champ « " . $etiquette . " » contient des caracteres qui ne sont pas "
            . "de l'UTF-8 valide.", 400);
    }

    $valeur = str_replace(
        array("\r\n", "\r", "\xC2\x85", "\xE2\x80\xA8", "\xE2\x80\xA9"),
        "\n", $valeur);
    $valeur = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $valeur);

    if (!$multiligne) {
        $valeur = str_replace(array("\n", "\t"), ' ', $valeur);
        $valeur = preg_replace('/ {2,}/', ' ', $valeur);
    } else {
        // Au plus deux retours consecutifs : un paragraphe, pas une page
        // blanche qui deformerait l'export.
        $valeur = preg_replace('/\n{3,}/', "\n\n", $valeur);
    }

    return trim($valeur);
}

/**
 * Lit un champ, le nettoie, le borne.
 *
 * Le depassement de longueur rend 400 en DONNANT la limite : une troncature
 * silencieuse ferait disparaitre la fin d'une remarque sans que personne le
 * sache, ce qui est pire que le refus.
 */
function ap_champ($source, $cle, $max, $obligatoire, $etiquette, $multiligne = false)
{
    $brut = isset($source[$cle]) ? $source[$cle] : '';
    if (!is_string($brut)) {
        throw new ApPanne("Le champ « " . $etiquette . " » est mal forme.", 400);
    }

    $valeur = ap_nettoyer_texte($brut, $multiligne, $etiquette);

    if ($valeur === '') {
        if ($obligatoire) {
            throw new ApPanne("Le champ « " . $etiquette . " » est obligatoire.", 400);
        }
        return '';
    }

    $longueur = ap_longueur($valeur);
    if ($longueur > $max) {
        throw new ApPanne(
            "Le champ « " . $etiquette . " » fait " . $longueur . " caracteres ; "
            . "la limite est de " . $max . ".", 400);
    }

    return $valeur;
}

/**
 * Refuse un champ qui n'aurait pas du etre envoye.
 *
 * Sert au mode chiffre : recevoir « auteur » ou « texte » en clair a cote
 * d'une enveloppe veut dire que le client s'est trompe de mode. On refuse au
 * lieu d'ignorer, parce qu'ignorer enregistrerait la note sans le nom de son
 * auteur, et que personne ne s'en apercevrait avant la relecture suivante.
 */
function ap_refuser_champ($source, $cle, $etiquette, $raison)
{
    if (!isset($source[$cle])) {
        return;
    }
    if (is_string($source[$cle]) && trim($source[$cle]) === '') {
        return;
    }
    throw new ApPanne(
        "Le champ « " . $etiquette . " » ne doit pas etre envoye : " . $raison . "\n"
        . "La note n'a pas ete enregistree.", 400);
}

/**
 * Identifiant de note recu du navigateur.
 *
 * Existe parce que « tout ce qui vient du navigateur passe par ici » avait
 * une seconde porte : le point d'entree lisait $_POST['id'] et le convertissait
 * en entier lui-meme. Or (int) applique a un TABLEAU non vide vaut 1 — un
 * « id[]=x » designait donc la note numero 1, et l'operation reussissait en
 * 200. Le garde is_string() de ap_champ() vit ici, pas ailleurs.
 *
 * @return int identifiant strictement positif
 */
function ap_champ_identifiant($source, $cle, $etiquette)
{
    $brut = isset($source[$cle]) ? $source[$cle] : '';
    if (!is_string($brut)) {
        throw new ApPanne("Le champ « " . $etiquette . " » est mal forme.", 400);
    }
    $brut = trim($brut);
    if ($brut === '') {
        throw new ApPanne("Le champ « " . $etiquette . " » est obligatoire.", 400);
    }
    if (!preg_match('/^[0-9]{1,10}$/', $brut) || (int) $brut <= 0) {
        throw new ApPanne(
            "L'identifiant de note « " . $etiquette . " » est mal forme.", 400);
    }
    return (int) $brut;
}

/**
 * Identifiant de PROJET recu du navigateur : 22 caracteres base64url.
 *
 * Il n'est pas verifie ici contre la configuration — c'est le role du verrou
 * d'origine, qui sait quels projets existent. Ici, on verifie seulement qu'il
 * a la FORME d'un identifiant, avant qu'il n'atteigne une requete preparee ou
 * une clef de compteur de debit.
 */
function ap_champ_projet($source, $cle = 'projet')
{
    $brut = isset($source[$cle]) ? $source[$cle] : '';
    if (!is_string($brut)) {
        throw new ApPanne("Le champ « projet » est mal forme.", 400);
    }
    $brut = trim($brut);
    if ($brut === '') {
        throw new ApPanne(
            "Le champ « projet » est obligatoire.\n"
            . "Il vaut l'identifiant de projet declare par la balise de la page.", 400);
    }
    if (!ap_identifiant_bien_forme($brut)) {
        throw new ApPanne(
            "L'identifiant de projet est mal forme : 22 caracteres pris dans "
            . "A-Z a-z 0-9 - _ sont attendus.", 400);
    }
    return $brut;
}

/**
 * INDEX AVEUGLE d'une page : HMAC tronque, en base64url, 22 caracteres.
 *
 * Le serveur ne peut pas le verifier — c'est tout l'interet : il regroupe par
 * page sans savoir laquelle. Il en verifie donc uniquement la FORME. Il
 * n'applique aucune normalisation de chemin, pour la meilleure des raisons :
 * il ne voit pas de chemin. FORMAT.md §4 fige la normalisation cote client
 * (aucune), et il n'y a rien ici qui puisse en diverger.
 */
function ap_champ_index($source, $cle, $obligatoire, $etiquette = 'index')
{
    $brut = isset($source[$cle]) ? $source[$cle] : '';
    if (!is_string($brut)) {
        throw new ApPanne("Le champ « " . $etiquette . " » est mal forme.", 400);
    }
    $brut = trim($brut);
    if ($brut === '') {
        if ($obligatoire) {
            throw new ApPanne(
                "Le champ « " . $etiquette . " » est obligatoire : c'est lui qui dit "
                . "a quelle page la note appartient.", 400);
        }
        return '';
    }
    if (!ap_identifiant_bien_forme($brut)) {
        throw new ApPanne(
            "L'index de page est mal forme : 22 caracteres pris dans "
            . "A-Z a-z 0-9 - _ sont attendus.", 400);
    }
    return $brut;
}

/**
 * Drapeau oui/non recu du navigateur.
 *
 * Meme raison que ci-dessus : un champ absent vaut le defaut, un tableau est
 * refuse au lieu d'etre converti au hasard.
 */
function ap_champ_drapeau($source, $cle, $defaut, $etiquette)
{
    if (!isset($source[$cle])) {
        return $defaut;
    }
    $brut = $source[$cle];
    if (!is_string($brut)) {
        throw new ApPanne("Le champ « " . $etiquette . " » est mal forme.", 400);
    }
    $brut = strtolower(trim($brut));
    if ($brut === '0' || $brut === 'non' || $brut === 'false' || $brut === '') {
        return false;
    }
    if ($brut === '1' || $brut === 'oui' || $brut === 'true') {
        return true;
    }
    throw new ApPanne(
        "Le champ « " . $etiquette . " » attend 0 ou 1. Recu : "
        . ap_extrait_lisible($brut) . ".", 400);
}

/**
 * Le mode d'une note : « clair » ou « chiffre ».
 *
 * Il est ecrit PAR LIGNE et jamais recalcule. Une installation peut avoir
 * tourne en clair pendant deux semaines avant qu'on active le chiffrement,
 * ou avoir migre d'un auto-heberge vers un relais : une base mi-claire
 * mi-chiffree doit rester entierement lisible, et le seul moyen est que
 * chaque ligne dise elle-meme ce qu'elle est.
 *
 * UNE SEULE REGLE POUR LES DEUX REFUS, et ce n'est pas un hasard : le mode
 * clair n'est accepte que si le deploiement est auto-heberge ET que le projet
 * declare le mode clair. En relais, le premier terme est faux — c'est le
 * refus exige par FORMAT.md §3.4. Sur un projet passe au chiffrement, c'est
 * le second : on ne retourne pas en arriere, la base ne se dechiffre pas
 * toute seule.
 */
function ap_champ_mode($source, array $config, $identifiant, array $projet)
{
    $brut = isset($source['mode']) ? $source['mode'] : '';
    if (!is_string($brut)) {
        throw new ApPanne("Le champ « mode » est mal forme.", 400);
    }
    $brut = strtolower(trim($brut));
    if ($brut === '') {
        throw new ApPanne(
            "Le champ « mode » est obligatoire : « clair » ou « chiffre ».\n"
            . "Il est inscrit dans la note et n'est jamais recalcule.", 400);
    }
    if ($brut !== 'clair' && $brut !== 'chiffre') {
        throw new ApPanne(
            "Le champ « mode » attend « clair » ou « chiffre ». Recu : "
            . ap_extrait_lisible($brut) . ".", 400);
    }
    if ($brut === 'clair' && !(ap_est_auto_heberge($config) && $projet['mode'] === 'clair')) {
        throw new ApPanne(
            "Ecriture en clair refusee pour le projet " . ap_projet_abrege($identifiant) . ".\n"
            . (ap_est_auto_heberge($config)
                ? "Ce projet est declare en mode « chiffre » : on n'y revient pas en "
                  . "arriere, la base ne se dechiffre pas toute seule."
                : "Ce serveur est un relais. Le mode clair y est impossible : il n'a "
                  . "aucune restriction d'acces a offrir, et les notes seraient lisibles "
                  . "par son operateur.")
            . "\nLa note n'a pas ete enregistree.",
            400);
    }
    return $brut;
}

/**
 * Une enveloppe chiffree, verifiee sur sa FORME seule.
 *
 *     ap<format>.<nonce base64url, 16 caracteres>.<chiffre+etiquette base64url>
 *
 * Trois verifications, et chacune evite une ligne qu'on ne pourra plus lire :
 *
 *  - le prefixe EST le numero de format. Le serveur n'accepte que le sien :
 *    il ecrit « format 2 » dans la colonne, et stocker une enveloppe « ap3 »
 *    sous un format 2 ferait une ligne qui se ment a elle-meme. Un client de
 *    format 3 demande un serveur de format 3, et le message le dit ;
 *  - le nonce fait exactement 16 caracteres (12 octets). Un lecteur qui en
 *    compte un autre doit refuser la ligne au lieu de deviner ; autant ne pas
 *    l'ecrire ;
 *  - l'alphabet est base64url sans remplissage, ce qui traverse une chaine de
 *    requete, un corps urlencode et une colonne SQL sans echappement.
 *
 * Le contenu n'est pas verifie : il ne peut pas l'etre. La cle ne quitte pas
 * le navigateur, et c'est la seule raison d'etre de tout ceci.
 */
function ap_champ_enveloppe($source, $cle, $max, $obligatoire, $etiquette)
{
    $brut = isset($source[$cle]) ? $source[$cle] : '';
    if (!is_string($brut)) {
        throw new ApPanne("Le champ « " . $etiquette . " » est mal forme.", 400);
    }
    $brut = trim($brut);
    if ($brut === '') {
        if ($obligatoire) {
            throw new ApPanne(
                "Le champ « " . $etiquette . " » est obligatoire en mode chiffre : "
                . "c'est lui qui porte la note.", 400);
        }
        return '';
    }

    // La longueur AVANT la forme : sur un corps de 24 000 caracteres, une
    // expression reguliere qui echoue a la fin coute pour rien.
    $longueur = strlen($brut);   // ASCII par construction : octets = caracteres
    if ($longueur > $max) {
        throw new ApPanne(
            "L'enveloppe « " . $etiquette . " » fait " . $longueur . " caracteres ; "
            . "la limite est de " . $max . ".\n"
            . "Aucune troncature n'est appliquee : une enveloppe tronquee ne se "
            . "dechiffre pas, elle se perd.", 400);
    }

    $morceaux = explode('.', $brut);
    if (count($morceaux) !== 3 || $morceaux[0] !== 'ap' . AP_FORMAT) {
        if (count($morceaux) === 3 && preg_match('/^ap([0-9]{1,3})$/', $morceaux[0], $m)) {
            throw new ApPanne(
                "Cette note a ete ecrite par une version plus recente d'annotepage "
                . "(format " . $m[1] . " ; ce serveur ecrit le format " . AP_FORMAT . ").\n"
                . "Le serveur ne la stocke pas : il inscrirait « format " . AP_FORMAT
                . " » sur une ligne qui n'en est pas une.\n"
                . "Mettez le serveur a jour.", 400);
        }
        throw new ApPanne(
            "L'enveloppe « " . $etiquette . " » est mal formee.\n"
            . "Forme attendue : ap" . AP_FORMAT . ".<nonce>.<contenu>", 400);
    }
    if (strlen($morceaux[1]) !== 16) {
        throw new ApPanne(
            "L'enveloppe « " . $etiquette . " » porte un nonce de "
            . strlen($morceaux[1]) . " caracteres au lieu de 16 (12 octets).", 400);
    }
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $morceaux[1])
        || !preg_match('/^[A-Za-z0-9_-]+$/', $morceaux[2])) {
        throw new ApPanne(
            "L'enveloppe « " . $etiquette . " » contient des caracteres hors "
            . "base64url sans remplissage (A-Z a-z 0-9 - _).", 400);
    }

    return $brut;
}

/**
 * Chemin de la page annotee.
 *
 * On accepte exactement ce que `location.pathname` produit : un chemin absolu
 * commencant par une seule barre. Sont refuses l'URL complete (un autre site
 * n'a rien a faire ici), le chemin protocole-relatif `//hote/...` et tout
 * segment `..`, qui melangerait deux pages dans une meme liste de notes.
 *
 * N'est appele qu'en mode clair et par l'action de reprise. En mode chiffre,
 * le chemin ne franchit jamais le navigateur.
 */
function ap_champ_page($source, $cle, $max)
{
    $page = ap_champ($source, $cle, $max, true, 'page');

    if ($page[0] !== '/' || (isset($page[1]) && $page[1] === '/')) {
        throw new ApPanne(
            "Le chemin de page doit commencer par une seule barre oblique. "
            . "Recu : " . $page, 400);
    }
    if (strpos($page, '..') !== false) {
        throw new ApPanne("Le chemin de page ne peut pas contenir « .. ».", 400);
    }
    if (!preg_match('#^/[A-Za-z0-9/._~%()@+,;=:&-]*$#', $page)) {
        throw new ApPanne(
            "Le chemin de page contient des caracteres inattendus. Recu : " . $page, 400);
    }

    return $page;
}

/**
 * Identifiant de la note repondue.
 *
 * Trois verifications, et les deux dernieres sont celles qui comptent :
 *  - la note mere doit EXISTER ;
 *  - elle doit appartenir AU MEME PROJET. L'identifiant de note est un
 *    compteur global au serveur (FORMAT.md §2.4) : sans ce test, un projet
 *    repondrait aux notes d'un autre en devinant un entier, ce qui n'est pas
 *    difficile ;
 *  - elle ne doit pas etre elle-meme une reponse. L'outil tient une seule
 *    profondeur — un fil qui s'enfonce serait illisible dans l'export texte,
 *    dont l'indentation est justement le contrat.
 *
 * @param ApDepot $depot le seul objet qui parle a la base
 * @return array|null  la note mere, ou null s'il ne s'agit pas d'une reponse
 */
function ap_champ_reponse_a($source, $cle, $depot, $identifiant)
{
    $brut = isset($source[$cle]) ? trim((string) $source[$cle]) : '';
    if ($brut === '' || $brut === '0') {
        return null;
    }
    if (!preg_match('/^[0-9]{1,10}$/', $brut)) {
        throw new ApPanne("L'identifiant de la note repondue est mal forme.", 400);
    }

    $mere = $depot->note((int) $brut, $identifiant);
    if ($mere === null) {
        throw new ApPanne(
            "La note a laquelle vous repondez n'existe pas (ou plus). "
            . "Rechargez la page pour voir les notes a jour.", 400);
    }
    if ($mere['reponse_a'] !== null) {
        throw new ApPanne(
            "On ne repond pas a une reponse : repondez a la note d'origine.", 400);
    }

    return $mere;
}

/**
 * Assemble une note prete a etre enregistree, a partir de la requete.
 *
 * UNE SEULE FORME DE LIGNE POUR LES DEUX MODES : ce sont les memes colonnes,
 * la meme insertion, la meme requete de relecture. Le mode ne decide que de
 * ce qui est REMPLI — les champs en clair, ou l'enveloppe. Il n'y a pas deux
 * chemins de code ici, et c'est voulu : le second serait le moins teste.
 *
 * Une reponse HERITE de l'index de page de sa mere — et, en mode clair, de sa
 * page, de son selecteur, de son empreinte et de son extrait. Les redemander
 * au client ouvrirait la porte a une reponse rattachee ailleurs que la note
 * qu'elle commente.
 */
function ap_note_depuis_requete($source, array $config, $depot, $identifiant, $mode)
{
    $mere = ap_champ_reponse_a($source, 'reponse_a', $depot, $identifiant);

    $note = array(
        'projet'            => $identifiant,
        'format'            => AP_FORMAT,
        'mode'              => $mode,
        'reponse_a'         => $mere === null ? null : (int) $mere['id'],
        'page'              => '',
        'selecteur'         => '',
        'empreinte'         => '',
        'extrait'           => '',
        'auteur'            => '',
        'texte'             => '',
        'version'           => '',
        'environnement'     => '',
        'fenetre'           => '',
        'charge'            => '',
        'charge_resolution' => '',
    );

    // L'INDEX AVEUGLE est calcule dans les DEUX modes, par le client, et
    // herite d'une mere quand il s'agit d'une reponse.
    $note['index_page'] = $mere !== null
        ? $mere['index_page']
        : ap_champ_index($source, 'index', true);

    if ($mode === 'chiffre') {
        // Tout ce qui est saisi ou observe est dans l'enveloppe : la page,
        // l'auteur, l'extrait, la version compris. Ne chiffrer que le texte
        // livrerait l'arborescence du site, ses intitules et ses relecteurs —
        // c'est-a-dire une bonne partie de ce qu'une preproduction ne publie
        // pas encore. Voir FORMAT.md §2.3.
        $note['charge'] = ap_champ_enveloppe(
            $source, 'charge', $config['longueur_max_charge'], true, 'charge');

        foreach (array('auteur', 'texte', 'page', 'selecteur', 'empreinte',
                       'extrait', 'version', 'environnement', 'fenetre') as $clair) {
            ap_refuser_champ($source, $clair, $clair,
                "ce projet est en mode chiffre, et ce champ voyagerait en clair jusqu'au "
                . "serveur.");
        }
        return $note;
    }

    $note['auteur'] = ap_champ($source, 'auteur', $config['longueur_max_auteur'],
                               true, 'auteur');
    $note['texte']  = ap_champ($source, 'texte', $config['longueur_max_texte'],
                               true, 'texte', true);

    // Contexte de prise de note, pose par le client et jamais saisi a la main.
    // Il vaut pour une REPONSE comme pour une note : deux personnes peuvent
    // repondre depuis deux versions du site, et c'est justement ce qu'on veut
    // pouvoir distinguer quand une remarque semble contredire une autre.
    $note['version']       = ap_champ($source, 'version',
                                      $config['longueur_max_version'], false, 'version');
    $note['environnement'] = ap_champ($source, 'environnement',
                                      $config['longueur_max_environ'], false, 'environnement');
    $note['fenetre']       = ap_champ($source, 'fenetre',
                                      $config['longueur_max_fenetre'], false, 'fenetre');

    if ($mere !== null) {
        $note['page']      = $mere['page'];
        $note['selecteur'] = $mere['selecteur'];
        $note['empreinte'] = $mere['empreinte'];
        $note['extrait']   = $mere['extrait'];
    } else {
        $note['page']      = ap_champ_page($source, 'page', $config['longueur_max_page']);
        $note['selecteur'] = ap_champ($source, 'selecteur',
                                      $config['longueur_max_selecteur'], false, 'selecteur');
        $note['empreinte'] = ap_champ($source, 'empreinte',
                                      $config['longueur_max_empreinte'], false, 'empreinte');
        $note['extrait']   = ap_champ($source, 'extrait',
                                      $config['longueur_max_extrait'], false, 'extrait');
    }

    return $note;
}
