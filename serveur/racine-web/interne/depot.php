<?php
/**
 * depot.php — LE SEUL ENDROIT QUI PARLE A LA BASE.
 *
 * Toute la persistance de l'outil tient dans cette classe. C'est delibere :
 * qui veut brancher l'outil sur autre chose — un fichier, un autre moteur,
 * une API — remplace CE fichier et rien d'autre. Ni api.php, ni le client, ni
 * l'export texte ne savent qu'il y a du SQL derriere.
 *
 * Le contrat que doit tenir tout remplacant :
 *   assurerSchema()          prepare le stockage, sans effet si deja pret, et
 *                            RATTRAPE un stockage cree par une version
 *                            anterieure — colonnes ET index
 *   parPage($p, $index)      les notes d'une page d'un projet, imbriquees
 *   toutes($p)               toutes les notes d'un projet, a plat, en FLUX
 *   ajouter(array $note)     enregistre et renvoie la note creee
 *   note($id, $p)            une note d'un projet, ou null
 *   resoudre(...)            marque une note corrigee, ou annule cette marque
 *   compte($p)               nombre de notes d'un projet
 *   repartitionModes($p)     combien de claires, combien de chiffrees
 *   consommerDebit(...)      compte un evenement dans une fenetre de temps
 *   pagesSansIndex($p)       reprise d'une base 1.2.0 : voir plus bas
 *   affecterIndex(...)       reprise d'une base 1.2.0 : voir plus bas
 *   etat()                   etat du stockage, sans aucun effet (diagnostic)
 *   lignesDiagnostic()       ce que le diagnostic affiche du stockage
 *   extensionsRequises()     ce dont ce depot-ci a besoin pour fonctionner
 *
 * Les deux dernieres existent pour que le POINT D'ENTREE n'ait pas a savoir
 * qu'il y a du SQL derriere : sans elles, api.php nommait « pdo_mysql »,
 * « base.hote » et « prefixe_tables », et un depot remplace aurait laisse
 * derriere lui un diagnostic decrivant un stockage qui n'existe plus.
 *
 * MULTI-LOCATAIRE, UN SEUL CHEMIN DE CODE. La colonne `projet` est presente
 * dans chaque ligne et dans chaque requete, y compris en auto-heberge ou il
 * n'y a qu'un projet. Un seul locataire est un multi-locataire a un
 * locataire : il n'y a donc pas ici une requete « simple » et une requete
 * « multi-projet » qui divergeraient a la deuxieme correction.
 *
 * LE MODE NE FAIT PAS DEUX TABLES NI DEUX REQUETES. Une note claire et une
 * note chiffree sont la meme ligne : ce sont les colonnes REMPLIES qui
 * changent. Le regroupement se fait par `index_page` dans les deux modes,
 * meme quand `page` est lisible a cote — un seul chemin de code, une seule
 * facon de grouper.
 *
 * Le modele est en AJOUT SEUL, a trois exceptions pres, toutes nommees :
 *   - une note peut etre marquee CORRIGEE, et cette marque s'annule ;
 *   - la reprise d'une base 1.2.0 ecrit `projet` et `index_page` sur des
 *     lignes qui n'en avaient pas (voir « REPRISE » plus bas) ;
 *   - le compteur de debit, qui n'est pas une note.
 * Rien n'est jamais supprime — une remarque qu'on efface est une remarque
 * qu'on ne peut plus contredire. Plusieurs relecteurs peuvent donc annoter en
 * meme temps sans verrou et sans conflit.
 *
 * Les dates sont ecrites par PHP en UTC, jamais par NOW() du serveur SQL :
 * le fuseau de PHP et celui de la base ne sont pas alignes par defaut, et une
 * note datee de trois heures dans le futur ferait douter de tout le reste.
 *
 * REPRISE D'UNE BASE 1.2.0 — CE QUI EST POSSIBLE ET CE QUI NE L'EST PAS
 *
 * Une table ecrite par l'outil d'origine est une table de format 2 en mode
 * clair a qui il manque six colonnes. Le rattrapage paresseux les ajoute, et
 * les lignes existantes se lisent alors comme des lignes de format 1 (mode
 * absent = clair). AUCUNE NOTE N'EST PERDUE : elles sont toutes dans la base
 * et toutes dans l'export.
 *
 * Deux colonnes ne peuvent pas etre remplies de la meme facon :
 *
 *  - `projet` : le serveur peut la remplir seul, mais uniquement en
 *    auto-heberge avec UN projet declare — il n'y a alors aucune ambiguite
 *    sur le proprietaire des lignes. C'est fait une fois, au moment ou la
 *    colonne est ajoutee ;
 *  - `index_page` : le serveur ne peut PAS la calculer. Elle vaut
 *    HMAC(cle_index, chemin), et la cle descend du sel, qui ne quitte jamais
 *    le navigateur. C'est le prix, assume, de l'index aveugle. La reprise se
 *    fait donc en deux temps, par l'action `reprise` : le serveur enumere les
 *    chemins encore sans index (il les a en clair, ce sont des lignes de
 *    format 1), le client calcule l'index de chacun et le renvoie.
 *
 * Tant que la reprise n'a pas eu lieu, les anciennes notes sortent bien dans
 * `?action=texte` mais ne se regroupent pas sous leur page dans le panneau.
 * C'est desagreable, c'est visible, et c'est ecrit ici plutot que decouvert.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

class ApDepot
{
    /** @var array configuration effective */
    private $config;

    /** @var PDO|null connexion, ouverte au premier besoin */
    private $pdo = null;

    /** @var bool le schema a-t-il deja ete assure dans cette requete ? */
    private $schemaAssure = false;

    /** @var string nom complet de la table des notes, prefixe compris */
    private $table;

    /** @var string nom complet de la table des compteurs de debit */
    private $tableDebit;

    public function __construct(array $config)
    {
        $this->config = $config;
        // Le prefixe est la SEULE valeur qui entre dans du SQL sans passer par
        // un parametre prepare. Il ne vient jamais du reseau, mais il vient
        // d'un fichier de configuration ecrit a la main : il est verifie ICI,
        // dans le seul fichier qui sache qu'il finira dans du SQL.
        $prefixe = isset($config['prefixe_tables']) ? (string) $config['prefixe_tables'] : '';
        if (!preg_match('/^[A-Za-z0-9_]*$/', $prefixe)) {
            throw new ApPanne(
                "Configuration invalide : prefixe_tables ne peut contenir que des "
                . "lettres, des chiffres et des tirets bas.",
                500);
        }
        $this->table      = $prefixe . 'notes';
        $this->tableDebit = $prefixe . 'debit';
    }

    /**
     * Ce dont CE depot a besoin pour fonctionner du tout.
     *
     * Le point d'entree l'affiche dans son diagnostic sans savoir ce que c'est :
     * un depot fichier rendrait un tableau vide, et le diagnostic cesserait de
     * parler d'une extension de base de donnees le jour ou il n'y en a plus.
     *
     * @return array noms d'extensions PHP
     */
    public static function extensionsRequises()
    {
        return array('pdo_mysql');
    }

    /** Nom de la table, pour les messages destines a l'administrateur. */
    public function table()
    {
        return $this->table;
    }

    /**
     * Ouvre la connexion au premier besoin.
     *
     * Trois refus successifs, chacun avec sa phrase : extension absente,
     * identifiant illisible (traite par configuration.php), serveur
     * injoignable. Aucun repli silencieux vers un autre moteur : croire que
     * tout va bien alors que les notes ne sont plus partagees serait le pire
     * des comportements.
     */
    private function pdo()
    {
        if ($this->pdo !== null) {
            return $this->pdo;
        }

        if (!extension_loaded('pdo_mysql')) {
            throw new ApPanne(
                "L'extension PHP « pdo_mysql » est absente de ce serveur.\n"
                . "Sans elle, aucune note ne peut etre enregistree ni relue.\n"
                . "A transmettre a l'administrateur : activer pdo_mysql pour le PHP "
                . "servi par le serveur web.",
                503);
        }

        $b = $this->config['base'];
        $hote        = ap_valeur_configuree($b['hote'], 'base.hote');
        $nom         = ap_valeur_configuree($b['nom'], 'base.nom');
        $utilisateur = ap_valeur_configuree($b['utilisateur'], 'base.utilisateur');
        $motdepasse  = ap_valeur_configuree($b['motdepasse'], 'base.motdepasse');
        $port        = isset($b['port']) && $b['port'] ? (int) $b['port'] : 3306;

        // charset=utf8mb4 EXPLICITE : le jeu par defaut de la base est
        // inconnu, et un accent ou un emoji ressortirait mutile sans cela.
        $dsn = 'mysql:host=' . $hote . ';port=' . $port
             . ';dbname=' . $nom . ';charset=utf8mb4';

        try {
            $this->pdo = new PDO($dsn, $utilisateur, $motdepasse, array(
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_TIMEOUT            => 5,
            ));
        } catch (PDOException $e) {
            // Le message du pilote peut contenir l'hote, la base, l'utilisateur.
            ap_journaliser('connexion refusee : ' . $e->getMessage());
            throw new ApPanne(
                "La base de donnees est injoignable : vos notes ne sont PAS enregistrees.\n"
                . "L'outil n'a rien perdu de ce qui etait deja enregistre ; il ne peut "
                . "simplement pas y acceder pour l'instant.\n"
                . "Le detail technique est dans le journal d'erreurs PHP du serveur.",
                503, $e);
        }

        return $this->pdo;
    }

    /**
     * Prepare le stockage — a chaque appel de service, et en QUATRE temps.
     *
     * 1. CREATE TABLE IF NOT EXISTS, pour l'installation neuve ;
     * 2. les colonnes manquantes, pour une table creee par une version
     *    ANTERIEURE de l'outil (1.2.0 comprise) ;
     * 3. les INDEX manquants, pour la meme raison — un « IF NOT EXISTS » sur
     *    la table est sans effet sur ses index, et la nouvelle requete de
     *    lecture porte sur (projet, index_page), qui n'existait pas ;
     * 4. le rattachement des lignes de format 1 au projet, quand il n'y a
     *    qu'un projet possible.
     *
     * Le second temps a ete ajoute apres coup dans l'outil d'origine, et son
     * absence etait un defaut bloquant : « IF NOT EXISTS » est sans effet sur
     * une table qui existe deja, de sorte que les colonnes arrivees avec une
     * fonction nouvelle n'atteignaient jamais un site ou l'outil avait deja
     * tourne. La premiere utilisation y repondait « Unknown column », en 500,
     * sans nommer ni la colonne ni le geste a faire. C'est exactement le cas
     * qui compte pour un outil destine a etre depose ailleurs PUIS mis a jour,
     * et c'est aussi le cas de ce port-ci.
     *
     * Il n'y a pas de mecanisme de migration sur ce type d'hebergement : pas
     * de shell, pas de tache d'installation. Le rattrapage paresseux est donc
     * le seul moyen fiable ; il est sans effet des que le schema est complet.
     *
     * Si l'utilisateur de la base n'a pas le droit de creer ou de modifier la
     * table, le message rend LE SQL EXACT a executer a la main :
     * l'administrateur n'a pas a le deviner, et on ne reessaie pas en boucle.
     */
    public function assurerSchema()
    {
        if ($this->schemaAssure) {
            return;
        }

        $sql = $this->sqlCreation();

        try {
            $this->pdo()->exec($sql);
        } catch (PDOException $e) {
            ap_journaliser('creation de table refusee : ' . $e->getMessage());
            $code = $e->getCode();
            if ($code === '42000' || $code === '42501') {
                throw new ApPanne(
                    "L'utilisateur de la base n'a pas le droit de creer la table des notes.\n"
                    . "A transmettre a l'administrateur — SQL exact a executer une fois :\n\n"
                    . $sql . "\n"
                    . $this->sqlCreationDebit() . "\n",
                    503, $e);
            }
            throw new ApPanne(
                "La table des notes n'a pas pu etre preparee : vos notes ne sont PAS "
                . "enregistrees.\nLe detail technique est dans le journal d'erreurs PHP.",
                503, $e);
        }

        $nouvellesColonnes = $this->completerSchema();
        $this->completerIndex();

        // Le rattachement n'est tente qu'au moment ou la colonne `projet`
        // vient d'apparaitre, c'est-a-dire une seule fois dans la vie d'une
        // installation. Le faire a chaque requete couterait une ecriture par
        // appel pour ne rien changer 999 fois sur 1000.
        if (in_array('projet', $nouvellesColonnes, true)) {
            $this->rattacherLignesSansProjet();
        }

        $this->schemaAssure = true;
    }

    /**
     * Ajoute les colonnes qu'une version anterieure de l'outil n'avait pas
     * creees. Sans effet si le schema est deja complet — le cas courant.
     *
     * Un echec de LECTURE du schema n'interrompt rien : si information_schema
     * n'est pas lisible par cet utilisateur, on continue avec le schema tel
     * qu'il est. La panne se manifesterait alors a l'ecriture, avec son
     * message — refuser de servir les notes parce qu'on n'a pas pu VERIFIER
     * serait une panne fabriquee.
     *
     * @return array les noms des colonnes reellement ajoutees
     */
    private function completerSchema()
    {
        $presentes = $this->colonnesPresentes();
        if ($presentes === null) {
            return array();
        }

        $ajoutees = array();
        $manquantes = array();
        foreach ($this->colonnesAttendues() as $nom => $definition) {
            if (!isset($presentes[strtolower($nom)])) {
                $manquantes[] = 'ADD COLUMN `' . $nom . '` ' . $definition;
                $ajoutees[] = $nom;
            }
        }
        if (!$manquantes) {
            return array();
        }

        $sql = 'ALTER TABLE `' . $this->table . '` ' . implode(', ', $manquantes) . ';';

        try {
            $this->pdo()->exec($sql);
        } catch (PDOException $e) {
            ap_journaliser('mise a jour du schema refusee : ' . $e->getMessage());
            throw new ApPanne(
                "La table des notes date d'une version anterieure de l'outil et il lui "
                . "manque des colonnes.\n"
                . "L'outil n'a pas pu les ajouter lui-meme.\n"
                . "A transmettre a l'administrateur — SQL exact a executer une fois :\n\n"
                . $sql . "\n",
                503, $e);
        }

        return $ajoutees;
    }

    /**
     * Ajoute les index manquants.
     *
     * UN ECHEC ICI N'EST PAS FATAL, et c'est une decision, pas un oubli : un
     * index absent rend les requetes lentes, pas fausses. Refuser de servir
     * les notes parce qu'un index manque serait une panne fabriquee, alors
     * qu'une table de recette compte des milliers de lignes, pas des millions.
     * Le diagnostic, lui, le dit, et rend le SQL a executer.
     */
    private function completerIndex()
    {
        $presents = $this->indexPresents();
        if ($presents === null) {
            return;
        }
        foreach ($this->indexAttendus() as $nom => $colonnes) {
            if (isset($presents[strtolower($nom)])) {
                continue;
            }
            $sql = 'ALTER TABLE `' . $this->table . '` ADD KEY `' . $nom . '` ('
                 . $colonnes . ');';
            try {
                $this->pdo()->exec($sql);
            } catch (PDOException $e) {
                ap_journaliser('index ' . $nom . ' non cree : ' . $e->getMessage());
            }
        }
    }

    /**
     * Rattache au projet unique les lignes qui n'en portent pas.
     *
     * Ce sont les notes ecrites par l'outil d'origine, avant que la colonne
     * n'existe. UNIQUEMENT en auto-heberge et UNIQUEMENT quand un seul projet
     * est declare : c'est le seul cas ou le proprietaire des lignes est connu
     * sans ambiguite. Sur un relais, ou avec deux projets declares, on ne
     * devine pas — et un mauvais rattachement donnerait les notes d'une equipe
     * a une autre.
     *
     * Sans ce rattachement, les notes existantes seraient toujours dans la
     * base mais plus dans aucune reponse : la mise a jour de l'outil aurait
     * l'air d'avoir efface trois mois de recette. C'est pour cela que cette
     * ecriture a lieu pendant une etape de schema, ce qui n'est pas beau.
     */
    private function rattacherLignesSansProjet()
    {
        $identifiant = isset($this->config['projet_reprise'])
            ? $this->config['projet_reprise'] : null;
        if (!ap_identifiant_bien_forme($identifiant)) {
            return 0;
        }
        try {
            $req = $this->pdo()->prepare(
                "UPDATE `" . $this->table . "` SET `projet` = ? WHERE `projet` = ''");
            $req->execute(array($identifiant));
            return $req->rowCount();
        } catch (PDOException $e) {
            ap_journaliser('rattachement au projet impossible : ' . $e->getMessage());
            return 0;
        }
    }

    /** Rattachement demande explicitement (action de reprise). */
    public function rattacherOrphelines()
    {
        $this->assurerSchema();
        return $this->rattacherLignesSansProjet();
    }

    /**
     * Colonnes REELLEMENT presentes, en minuscules, ou null si on n'a pas pu
     * le savoir. Aucun effet.
     *
     * @return array|null cle = nom de colonne en minuscules
     */
    private function colonnesPresentes()
    {
        try {
            $req = $this->pdo()->prepare(
                'SELECT column_name FROM information_schema.columns '
                . 'WHERE table_schema = DATABASE() AND table_name = ?');
            $req->execute(array($this->table));
            $out = array();
            foreach ($req->fetchAll(PDO::FETCH_NUM) as $ligne) {
                $out[strtolower((string) $ligne[0])] = true;
            }
            return $out;
        } catch (PDOException $e) {
            ap_journaliser('lecture du schema impossible : ' . $e->getMessage());
            return null;
        }
    }

    /** Index REELLEMENT presents, en minuscules, ou null. Aucun effet. */
    private function indexPresents()
    {
        try {
            $req = $this->pdo()->prepare(
                'SELECT DISTINCT index_name FROM information_schema.statistics '
                . 'WHERE table_schema = DATABASE() AND table_name = ?');
            $req->execute(array($this->table));
            $out = array();
            foreach ($req->fetchAll(PDO::FETCH_NUM) as $ligne) {
                $out[strtolower((string) $ligne[0])] = true;
            }
            return $out;
        } catch (PDOException $e) {
            ap_journaliser('lecture des index impossible : ' . $e->getMessage());
            return null;
        }
    }

    /**
     * La liste des colonnes, SOURCE UNIQUE : la creation et le rattrapage la
     * lisent tous les deux. Cle = nom de colonne, valeur = sa definition SQL.
     *
     * L'ORDRE DES DEFAUTS EST CE QUI REND LA REPRISE POSSIBLE. Une ligne
     * ecrite par l'outil d'origine recoit, a l'ajout des colonnes :
     *   projet = ''         -> rattachee plus loin, ou visible comme orpheline
     *   index_page = ''     -> a calculer par le client (action de reprise)
     *   format = 1          -> c'est ce qu'elle est
     *   mode = ''           -> absent vaut « clair » : c'est ce qu'elle est
     * Aucune de ces quatre valeurs n'est un pis-aller : chacune decrit
     * exactement la ligne telle qu'elle a ete ecrite.
     */
    private function colonnesAttendues()
    {
        $c = $this->config;
        return array(
            // Regroupement, lisible par le serveur dans les deux modes.
            'projet'          => "VARCHAR(22) NOT NULL DEFAULT ''",
            'index_page'      => "VARCHAR(22) NOT NULL DEFAULT ''",
            'format'          => 'INT NOT NULL DEFAULT 1',
            'mode'            => "VARCHAR(8) NOT NULL DEFAULT ''",
            // Charge en clair : remplie en mode clair, vide en mode chiffre.
            'page'            => 'VARCHAR(' . (int) $c['longueur_max_page'] . ") NOT NULL DEFAULT ''",
            'selecteur'       => 'VARCHAR(' . (int) $c['longueur_max_selecteur'] . ") NOT NULL DEFAULT ''",
            'empreinte'       => 'VARCHAR(' . (int) $c['longueur_max_empreinte'] . ") NOT NULL DEFAULT ''",
            'extrait'         => 'VARCHAR(' . (int) $c['longueur_max_extrait'] . ") NOT NULL DEFAULT ''",
            'auteur'          => 'VARCHAR(' . (int) $c['longueur_max_auteur'] . ") NOT NULL DEFAULT ''",
            'texte'           => 'TEXT NOT NULL',
            'version'         => 'VARCHAR(' . (int) $c['longueur_max_version'] . ") NOT NULL DEFAULT ''",
            'environnement'   => 'VARCHAR(' . (int) $c['longueur_max_environ'] . ") NOT NULL DEFAULT ''",
            'fenetre'         => 'VARCHAR(' . (int) $c['longueur_max_fenetre'] . ") NOT NULL DEFAULT ''",
            // Charge chiffree : l'inverse. Declarees NULL avec un defaut NULL
            // et non « NOT NULL » : un TEXT ne peut pas porter de valeur par
            // defaut avant MySQL 8.0.13, et une colonne NOT NULL sans defaut
            // ne s'AJOUTE pas proprement a une table qui contient deja des
            // lignes — c'est-a-dire precisement la ou le rattrapage sert.
            // normaliser() ramene NULL a la chaine vide, une fois, ici.
            'charge'            => 'MEDIUMTEXT NULL DEFAULT NULL',
            'charge_resolution' => 'TEXT NULL DEFAULT NULL',
            // Resolution, partie claire.
            'resolue_le'      => 'DATETIME NULL DEFAULT NULL',
            'resolue_par'     => 'VARCHAR(' . (int) $c['longueur_max_auteur'] . ") NOT NULL DEFAULT ''",
            'resolue_version' => 'VARCHAR(' . (int) $c['longueur_max_version'] . ") NOT NULL DEFAULT ''",
            'cree_le'         => "DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00' COMMENT 'UTC, ecrit par PHP'",
            'reponse_a'       => 'INT UNSIGNED NULL DEFAULT NULL',
        );
    }

    /**
     * Les index, meme principe de source unique que les colonnes.
     *
     * `idx_projet_index` porte TOUTES les lectures de service : le serveur ne
     * lit jamais autrement que « ce projet, cette page ». `idx_page` ne sert
     * plus qu'a la reprise d'une base 1.2.0 et au tri de l'export en mode
     * clair ; il est conserve parce qu'il existe deja sur les bases en
     * service et qu'un index de moins ne rembourse rien.
     */
    private function indexAttendus()
    {
        return array(
            'idx_projet_index' => '`projet`, `index_page`',
            'idx_page'         => '`page`',
            'idx_reponse_a'    => '`reponse_a`',
        );
    }

    /**
     * Le schema, en un seul endroit : il sert a creer la table, a la COMPLETER
     * si elle date d'une version anterieure, ET a la dicter a un administrateur
     * si l'un ou l'autre est refuse.
     *
     * La liste des colonnes vit dans colonnesAttendues() et nulle part
     * ailleurs. C'est ce qui rend le rattrapage fiable : une colonne ajoutee a
     * la creation et oubliee dans la mise a jour est precisement le defaut qui
     * a rendu une fonction injoignable sur une base deja en service. Ici,
     * l'oubli n'est pas possible — il n'y a qu'une liste.
     *
     * Choix de conception inscrits ici :
     *  - « reponse_a » porte la relation de reponse, une seule profondeur.
     *    Une reponse est une note comme une autre ; c'est ce qui evite une
     *    seconde table et un second chemin de code.
     *  - « selecteur », « empreinte » et « extrait » sont les TROIS reperes
     *    qui permettent de retrouver l'element annote apres une evolution du
     *    site. Aucun n'est fiable seul : un selecteur casse au premier bloc
     *    insere, une empreinte de classes casse a la refonte du style, un
     *    extrait de texte casse a la relecture editoriale. Ensemble, ils
     *    permettent au client de degrader au lieu de perdre la note. En mode
     *    chiffre, ils voyagent dans l'enveloppe et ces trois colonnes restent
     *    vides : le serveur ne s'en sert de toute facon jamais.
     *  - « cree_le » est un DATETIME en UTC, ecrit par PHP.
     *  - CHAQUE colonne porte une valeur par defaut, y compris celles qui ne
     *    peuvent pas etre vides a l'usage. Ce n'est pas du laxisme : une
     *    colonne NOT NULL sans defaut ne peut pas etre AJOUTEE a une table qui
     *    contient deja des lignes, et le rattrapage echouerait la ou il sert.
     *  - pas de contrainte de cle etrangere sur reponse_a : rien n'est jamais
     *    supprime, et une contrainte refusee par les droits de l'utilisateur
     *    ferait echouer la creation entiere pour un gain nul.
     *  - `id` reste un compteur GLOBAL au serveur, et non par projet. Fuite
     *    mince mais reelle : entre deux notes d'un meme projet, l'ecart des
     *    identifiants dit combien de notes tous les autres projets ont
     *    ecrites. Conservee parce que la corriger demanderait un compteur a
     *    tenir sans course entre deux ecritures simultanees (FORMAT.md §8.7).
     */
    private function sqlCreation()
    {
        $lignes = array('  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT');
        foreach ($this->colonnesAttendues() as $nom => $definition) {
            $lignes[] = '  `' . $nom . '` ' . $definition;
        }
        $lignes[] = '  PRIMARY KEY (`id`)';
        foreach ($this->indexAttendus() as $nom => $colonnes) {
            $lignes[] = '  KEY `' . $nom . '` (' . $colonnes . ')';
        }

        return "CREATE TABLE IF NOT EXISTS `" . $this->table . "` (\n"
            . implode(",\n", $lignes) . "\n"
            . ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    }

    /**
     * La table des compteurs de debit.
     *
     * Elle est dans la BASE et non sur le disque, pour la meme raison que tout
     * le reste : l'outil n'ecrit aucun fichier, il n'y a ni cache partage ni
     * shell sur ce genre d'hebergement, et un compteur en memoire de processus
     * ne compte rien du tout derriere plusieurs processus PHP.
     *
     * Fenetre FIXE, pas glissante : la fenetre glissante demande de garder un
     * horodatage par evenement, donc une ligne par ecriture — un compteur qui
     * grossit plus vite que ce qu'il protege.
     */
    private function sqlCreationDebit()
    {
        return "CREATE TABLE IF NOT EXISTS `" . $this->tableDebit . "` (\n"
            . "  `cle` VARCHAR(64) NOT NULL,\n"
            . "  `fenetre` INT UNSIGNED NOT NULL,\n"
            . "  `compte` INT UNSIGNED NOT NULL DEFAULT 0,\n"
            . "  PRIMARY KEY (`cle`, `fenetre`)\n"
            . ") ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;";
    }

    /**
     * Compte un evenement et rend le total atteint dans la fenetre courante.
     *
     * La cle est deja un condense (voir debit.php) : cette methode ne sait pas
     * ce qu'elle compte, et c'est voulu — elle ne doit pas devenir l'endroit
     * ou l'on decide de la politique.
     *
     * L'increment et la lecture sont deux requetes. Deux relecteurs simultanes
     * peuvent donc lire le meme total et passer tous les deux la limite d'un
     * cran : c'est une limitation de debit, pas un verrou de caisse, et un
     * depassement d'une unite ne change rien a ce qu'elle protege.
     *
     * @return int le compte apres increment
     */
    public function consommerDebit($cle, $fenetre)
    {
        $this->assurerTableDebit();
        $pdo = $this->pdo();

        $req = $pdo->prepare(
            "INSERT INTO `" . $this->tableDebit . "` (`cle`, `fenetre`, `compte`) "
            . "VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE `compte` = `compte` + 1");
        $req->execute(array((string) $cle, (int) $fenetre));

        $lu = $pdo->prepare(
            "SELECT `compte` FROM `" . $this->tableDebit . "` "
            . "WHERE `cle` = ? AND `fenetre` = ?");
        $lu->execute(array((string) $cle, (int) $fenetre));
        $compte = $lu->fetchColumn();

        // Menage opportuniste : une chance sur cinquante, et seulement sur les
        // fenetres depassees. Il n'y a pas de tache planifiee sur ce genre
        // d'hebergement ; une table de compteurs qui ne se vide jamais
        // finirait par peser plus lourd que les notes.
        if (mt_rand(1, 50) === 1) {
            try {
                $pdo->prepare("DELETE FROM `" . $this->tableDebit . "` WHERE `fenetre` < ?")
                    ->execute(array((int) $fenetre - 2));
            } catch (PDOException $e) {
                ap_journaliser('menage des compteurs impossible : ' . $e->getMessage());
            }
        }

        return $compte === false ? 1 : (int) $compte;
    }

    /** @var bool */
    private $tableDebitAssuree = false;

    private function assurerTableDebit()
    {
        if ($this->tableDebitAssuree) {
            return;
        }
        try {
            $this->pdo()->exec($this->sqlCreationDebit());
        } catch (PDOException $e) {
            ap_journaliser('creation de la table de debit refusee : ' . $e->getMessage());
            throw new ApPanne(
                "La table de limitation de debit n'a pas pu etre preparee.\n"
                . "A transmettre a l'administrateur — SQL exact a executer une fois :\n\n"
                . $this->sqlCreationDebit() . "\n",
                503, $e);
        }
        $this->tableDebitAssuree = true;
    }

    /**
     * Une note d'un projet, par son identifiant, ou null.
     *
     * Le projet est dans la clause WHERE et non verifie apres coup : une note
     * d'un autre projet doit etre INTROUVABLE, pas « trouvee puis refusee ».
     * La difference se voit de l'exterieur — la seconde forme repond a la
     * question « ce numero existe-t-il ailleurs ».
     */
    public function note($id, $projet)
    {
        $this->assurerSchema();
        $req = $this->pdo()->prepare(
            "SELECT * FROM `" . $this->table . "` WHERE `id` = ? AND `projet` = ? LIMIT 1");
        $req->execute(array((int) $id, (string) $projet));
        $ligne = $req->fetch();
        return $ligne === false ? null : $this->normaliser($ligne);
    }

    /**
     * Les notes d'une page, reponses imbriquees sous leur mere.
     *
     * Une seule requete : les meres et les reponses de la page sortent
     * ensemble, on les assemble en memoire. Deux requetes ouvriraient la
     * porte a une reponse arrivee entre les deux et rattachee a rien.
     *
     * Le regroupement se fait par `index_page` DANS LES DEUX MODES. En clair,
     * la colonne `page` porte en plus le chemin lisible, mais elle ne sert
     * jamais a chercher : un second chemin de code aurait diverge, et c'est
     * celui du mode chiffre — le moins exerce — qui aurait diverge le premier.
     */
    public function parPage($projet, $index)
    {
        $this->assurerSchema();
        $req = $this->pdo()->prepare(
            "SELECT * FROM `" . $this->table . "` "
            . "WHERE `projet` = ? AND `index_page` = ? ORDER BY `id` ASC");
        $req->execute(array((string) $projet, (string) $index));

        $meres = array();
        $reponses = array();
        foreach ($req as $ligne) {
            $note = $this->normaliser($ligne);
            if ($note['reponse_a'] === null) {
                $note['reponses'] = array();
                $meres[$note['id']] = $note;
            } else {
                $reponses[] = $note;
            }
        }
        foreach ($reponses as $reponse) {
            $idMere = $reponse['reponse_a'];
            if (isset($meres[$idMere])) {
                $meres[$idMere]['reponses'][] = $reponse;
            }
            // Une reponse dont la mere n'est pas sur cette page ne peut pas
            // exister : ajouter() force l'index de la mere. Si cela arrivait
            // malgre tout, on l'ignore ici plutot que d'inventer un parent.
        }

        return array_values($meres);
    }

    /**
     * TOUTES les notes d'un projet, a plat, deja ordonnees pour l'export.
     *
     * Renvoie un ITERATEUR, pas un tableau : l'export texte le parcourt note
     * a note et ecrit au fil de l'eau. La memoire allouee ne depend donc pas
     * du nombre de notes, dont rien ne borne la croissance.
     *
     * L'ordre groupe chaque mere avec ses reponses :
     *   COALESCE(reponse_a, id) donne le fil, l'identifiant de la mere ;
     *   puis la mere avant ses reponses ; puis l'ordre de creation.
     *
     * Le tri commence par `page` PUIS `index_page`, une seule expression pour
     * les deux modes : en clair, `page` est rempli et l'export sort dans
     * l'ordre alphabetique des chemins, exactement comme au format 1 ; en
     * chiffre, `page` vaut '' partout et le tri retombe sur l'index, dont
     * l'ordre n'a aucun sens pour un humain mais garde chaque page groupee.
     * On n'a pas voulu deux tris — celui du mode chiffre aurait ete le moins
     * relu.
     *
     * La requete est lancee ICI et non dans le generateur : une base
     * injoignable doit se manifester a l'appel, pas au premier parcours,
     * c'est-a-dire avant que le moindre octet de reponse soit parti.
     *
     * DEUX CONSEQUENCES DU FLUX, a connaitre avant d'appeler :
     *  - le jeu de resultats n'est PAS mis en tampon par le pilote, faute de
     *    quoi « sans tout charger en memoire » serait faux : le pilote aurait
     *    deja tout charge ;
     *  - tant que le parcours n'est pas termine, AUCUNE autre requete ne peut
     *    passer sur la meme connexion. compte() et repartitionModes() doivent
     *    donc etre appeles AVANT.
     *
     * @return Traversable notes normalisees, memes cles que parPage()
     */
    public function toutes($projet)
    {
        $this->assurerSchema();
        $options = array();
        if (defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY')) {
            $options[PDO::MYSQL_ATTR_USE_BUFFERED_QUERY] = false;
        }
        $req = $this->pdo()->prepare(
            "SELECT * FROM `" . $this->table . "` WHERE `projet` = ? "
            . "ORDER BY `page` ASC, `index_page` ASC, COALESCE(`reponse_a`, `id`) ASC, "
            . "(`reponse_a` IS NOT NULL) ASC, `id` ASC",
            $options);
        $req->execute(array((string) $projet));
        return $this->parcourir($req);
    }

    /** Normalise au fil du parcours, sans jamais tout charger en memoire. */
    private function parcourir($req)
    {
        foreach ($req as $ligne) {
            yield $this->normaliser($ligne);
        }
    }

    /**
     * Nombre de notes d'un projet. Sert a l'en-tete de l'export.
     * A appeler AVANT toutes(), dont le parcours occupe la connexion.
     */
    public function compte($projet)
    {
        $this->assurerSchema();
        $req = $this->pdo()->prepare(
            "SELECT COUNT(*) FROM `" . $this->table . "` WHERE `projet` = ?");
        $req->execute(array((string) $projet));
        return (int) $req->fetchColumn();
    }

    /**
     * Combien de notes claires et combien de chiffrees, pour la ligne
     * « chiffrement » de l'en-tete d'export.
     *
     * Une installation qui a change d'avis rend « mixte ». Ce cas se dit, il
     * ne se cache pas : un lecteur qui ne recupere que la moitie des textes
     * doit savoir pourquoi.
     *
     * @return array array('clair' => int, 'chiffre' => int)
     */
    public function repartitionModes($projet)
    {
        $this->assurerSchema();
        $req = $this->pdo()->prepare(
            "SELECT `mode`, COUNT(*) FROM `" . $this->table . "` "
            . "WHERE `projet` = ? GROUP BY `mode`");
        $req->execute(array((string) $projet));
        $out = array('clair' => 0, 'chiffre' => 0);
        foreach ($req->fetchAll(PDO::FETCH_NUM) as $ligne) {
            // Mode absent ou vide : la ligne vient du format 1, elle vaut
            // « clair ». Mode inconnu : compte avec le clair pour cette
            // statistique-la seulement ; c'est le producteur de l'export qui
            // saute la ligne et le dit.
            $cle = ((string) $ligne[0] === 'chiffre') ? 'chiffre' : 'clair';
            $out[$cle] += (int) $ligne[1];
        }
        return $out;
    }

    /**
     * REPRISE — les chemins encore sans index de page, pour ce projet.
     *
     * Ce sont les lignes de format 1 : le chemin y est en clair, l'index
     * n'existait pas. Le serveur les enumere ; il ne peut pas calculer leur
     * index, qui descend du sel.
     *
     * @return array chemins distincts
     */
    public function pagesSansIndex($projet)
    {
        $this->assurerSchema();
        $req = $this->pdo()->prepare(
            "SELECT DISTINCT `page` FROM `" . $this->table . "` "
            . "WHERE `projet` = ? AND `index_page` = '' AND `page` <> '' "
            . "ORDER BY `page` ASC");
        $req->execute(array((string) $projet));
        $pages = array();
        foreach ($req->fetchAll(PDO::FETCH_NUM) as $ligne) {
            $pages[] = (string) $ligne[0];
        }
        return $pages;
    }

    /**
     * REPRISE — pose l'index de page sur les lignes d'un chemin donne.
     *
     * Ne touche QUE les lignes qui n'en ont pas : l'operation est idempotente,
     * et un client qui rejoue la reprise ne peut pas reecrire l'index d'une
     * note recente. C'est la seule garde qui compte ici — un mauvais index
     * ferait disparaitre une note de sa page sans rien signaler.
     *
     * La colonne `format` passe a 2 en meme temps, et ce n'est pas cosmetique :
     * une ligne qui porte un index de page n'est plus une ligne de format 1,
     * puisque le format 1 ne connaissait pas cette colonne. Son `mode` reste
     * vide, ce qui vaut « clair » — elle a bien ete ecrite en clair, et rien
     * de ce qu'on vient de faire ne change cela.
     *
     * @return int nombre de lignes touchees
     */
    public function affecterIndex($projet, $page, $index)
    {
        $this->assurerSchema();
        $req = $this->pdo()->prepare(
            "UPDATE `" . $this->table . "` SET `index_page` = ?, `format` = ? "
            . "WHERE `projet` = ? AND `page` = ? AND `index_page` = ''");
        $req->execute(array((string) $index, AP_FORMAT, (string) $projet, (string) $page));
        return $req->rowCount();
    }

    /**
     * Etat du stockage, pour le diagnostic — et SANS AUCUN EFFET.
     *
     * Le diagnostic doit interroger la base ; il passe donc par ici, comme
     * tout le reste. C'est la condition pour que « un seul endroit parle a la
     * base » reste vrai.
     *
     * On ne cree rien, on ne rattache rien, on ne complete rien : un
     * diagnostic qui provisionne ne diagnostique plus, il repare, et masque
     * justement ce qu'on venait mesurer. C'est pourquoi cette methode
     * n'appelle jamais assurerSchema().
     *
     * Ne leve jamais : un etat, meme mauvais, est une reponse.
     *
     * @return array
     */
    public function etat()
    {
        $etat = array(
            'connexion'           => false,
            'moteur'              => null,
            'table'               => $this->table,
            'table_presente'      => null,
            'colonnes_manquantes' => null,
            'index_manquants'     => null,
            'notes'               => null,
            'sans_projet'         => null,
            'sans_index'          => null,
            'table_debit'         => $this->tableDebit,
            'table_debit_presente'=> null,
            'message'             => null,
        );

        try {
            $pdo = $this->pdo();
            $etat['connexion'] = true;
            $etat['moteur'] = (string) $pdo->query('SELECT VERSION()')->fetchColumn();

            // information_schema plutot que SHOW TABLES : cette forme accepte
            // un parametre prepare sans dependre du support de SHOW par le
            // protocole de requetes preparees.
            $req = $pdo->prepare(
                'SELECT COUNT(*) FROM information_schema.tables '
                . 'WHERE table_schema = DATABASE() AND table_name = ?');
            $req->execute(array($this->table));
            $etat['table_presente'] = ((int) $req->fetchColumn()) > 0;

            $req->execute(array($this->tableDebit));
            $etat['table_debit_presente'] = ((int) $req->fetchColumn()) > 0;

            if ($etat['table_presente']) {
                // Les COLONNES, et pas seulement la table. Le diagnostic
                // annoncait « operationnel » sur une table incomplete, pendant
                // qu'une action echouait en 500 : il repondait a une question
                // voisine de celle qu'on lui posait.
                $presentes = $this->colonnesPresentes();
                if ($presentes !== null) {
                    $manquantes = array();
                    foreach ($this->colonnesAttendues() as $nom => $definition) {
                        if (!isset($presentes[strtolower($nom)])) {
                            $manquantes[] = $nom;
                        }
                    }
                    $etat['colonnes_manquantes'] = $manquantes;
                }
                $presentsIdx = $this->indexPresents();
                if ($presentsIdx !== null) {
                    $manquants = array();
                    foreach ($this->indexAttendus() as $nom => $colonnes) {
                        if (!isset($presentsIdx[strtolower($nom)])) {
                            $manquants[] = $nom;
                        }
                    }
                    $etat['index_manquants'] = $manquants;
                }
                $etat['notes'] = (int) $pdo
                    ->query("SELECT COUNT(*) FROM `" . $this->table . "`")
                    ->fetchColumn();

                // Ce qui reste a reprendre. Ces deux nombres sont la seule
                // facon, a distance, de savoir qu'une base 1.2.0 a ete
                // rattrapee pour ses colonnes mais pas pour son contenu.
                if (is_array($etat['colonnes_manquantes'])
                    && !in_array('projet', $etat['colonnes_manquantes'], true)) {
                    $etat['sans_projet'] = (int) $pdo
                        ->query("SELECT COUNT(*) FROM `" . $this->table . "` WHERE `projet` = ''")
                        ->fetchColumn();
                }
                if (is_array($etat['colonnes_manquantes'])
                    && !in_array('index_page', $etat['colonnes_manquantes'], true)) {
                    $etat['sans_index'] = (int) $pdo
                        ->query("SELECT COUNT(*) FROM `" . $this->table . "` WHERE `index_page` = ''")
                        ->fetchColumn();
                }
            }
        } catch (ApPanne $e) {
            $etat['message'] = $e->getMessage();
        } catch (PDOException $e) {
            ap_journaliser('diagnostic : ' . $e->getMessage());
            $etat['message'] = "Le serveur de base de donnees a refuse la requete. "
                . "Detail tronque dans le journal d'erreurs PHP.";
        }

        return $etat;
    }

    /**
     * CE QUE LE DIAGNOSTIC DIT DU STOCKAGE — et le point d'entree n'en sait
     * rien d'autre.
     *
     * Existe pour une raison de conception, pas de commodite : « un seul
     * endroit parle a la base » etait faux tant que api.php nommait lui-meme
     * pdo_mysql, base.hote, base.motdepasse et prefixe_tables. Remplacer ce
     * fichier par un depot fichier aurait laisse un diagnostic decrivant un
     * stockage disparu. Ici, le point d'entree affiche des couples
     * « cle valeur » sans savoir ce qu'ils designent.
     *
     * AUCUNE VALEUR D'IDENTIFIANT N'EN SORT, jamais : on dit d'ou elle vient
     * et si elle est lisible. Ni son contenu, ni sa longueur — la longueur
     * d'un mot de passe n'est pas rien.
     *
     * Ne leve jamais : un etat, meme mauvais, est une reponse.
     *
     * @return array liste de array($cle, $valeur). Un $cle vide = ligne vide.
     */
    public function lignesDiagnostic()
    {
        $lignes = array();
        $base = isset($this->config['base']) && is_array($this->config['base'])
            ? $this->config['base'] : array();

        // L'hote et le port ne sont pas des secrets : les afficher evite un
        // aller-retour a qui diagnostique. L'utilisateur et le mot de passe, si.
        $publics = array('hote' => true, 'port' => true);
        foreach (array('hote', 'port', 'nom', 'utilisateur', 'motdepasse') as $cle) {
            $valeur = isset($base[$cle]) ? $base[$cle] : null;
            $lignes[] = array('stockage.' . $cle, ap_decrire_valeur_configuree(
                $valeur, 'base.' . $cle, !isset($publics[$cle])));
        }
        $lignes[] = array('stockage.table', $this->table);
        $lignes[] = array('stockage.table_debit', $this->tableDebit);
        $lignes[] = array('', '');

        $etat = $this->etat();
        $lignes[] = array('stockage.connexion', $etat['connexion'] ? 'REUSSIE' : 'ECHEC');
        if ($etat['moteur'] !== null) {
            $lignes[] = array('stockage.moteur', $etat['moteur']);
        }
        if ($etat['table_presente'] !== null) {
            $lignes[] = array('stockage.table_presente',
                $etat['table_presente'] ? 'oui' : 'NON');
        }
        if ($etat['table_debit_presente'] !== null) {
            $lignes[] = array('stockage.table_debit_presente',
                $etat['table_debit_presente'] ? 'oui' : 'NON (creee au premier besoin)');
        }
        if (is_array($etat['colonnes_manquantes'])) {
            $lignes[] = array('stockage.colonnes_manquantes',
                $etat['colonnes_manquantes']
                    ? implode(', ', $etat['colonnes_manquantes'])
                    : 'aucune');
        }
        if (is_array($etat['index_manquants'])) {
            $lignes[] = array('stockage.index_manquants',
                $etat['index_manquants']
                    ? implode(', ', $etat['index_manquants'])
                    : 'aucun');
        }
        if ($etat['notes'] !== null) {
            $lignes[] = array('stockage.notes', $etat['notes']);
        }
        if ($etat['sans_projet'] !== null) {
            $lignes[] = array('reprise.notes_sans_projet', $etat['sans_projet']);
        }
        if ($etat['sans_index'] !== null) {
            $lignes[] = array('reprise.notes_sans_index', $etat['sans_index']);
        }
        if ($etat['message'] !== null) {
            $lignes[] = array('', '');
            $lignes[] = array('', $etat['message']);
        }
        $lignes[] = array('', '');

        if (!$etat['connexion']) {
            $lignes[] = array('verdict',
                'le stockage est INJOIGNABLE : aucune note ne peut etre enregistree.');
        } elseif ($etat['table_presente'] === false) {
            $lignes[] = array('verdict',
                'stockage joignable, table absente : elle sera creee a la premiere note.');
        } elseif (is_array($etat['colonnes_manquantes']) && $etat['colonnes_manquantes']) {
            $lignes[] = array('verdict',
                'table INCOMPLETE (creee par une version anterieure) : elle sera '
                . 'completee au prochain appel de service, ou le message le dira.');
        } elseif ($etat['sans_index']) {
            $lignes[] = array('verdict',
                'operationnel, mais ' . $etat['sans_index'] . ' note(s) de format 1 '
                . 'n\'ont pas encore d\'index de page : elles sortent dans '
                . '?action=texte mais ne se regroupent pas sous leur page. '
                . 'Lancez la reprise depuis le client.');
        } else {
            $lignes[] = array('verdict', 'operationnel.');
        }

        return $lignes;
    }

    /**
     * Enregistre une note (ou une reponse) et renvoie la note creee, telle
     * qu'elle a ete enregistree — jamais telle qu'elle a ete envoyee. Le
     * client affiche ce que le serveur dit, jamais son etat local suppose :
     * deux relecteurs ne peuvent pas croire chacun avoir raison.
     *
     * UNE SEULE INSERTION POUR LES DEUX MODES. Les colonnes non concernees
     * recoivent la chaine vide ; entrees.php a deja garanti qu'un mode ne
     * remplit pas les colonnes de l'autre.
     */
    public function ajouter(array $note)
    {
        $this->assurerSchema();

        // UTC, par PHP. Voir l'en-tete de ce fichier.
        $creeLe = gmdate('Y-m-d H:i:s');

        $req = $this->pdo()->prepare(
            "INSERT INTO `" . $this->table . "` "
            . "(`projet`, `index_page`, `format`, `mode`, "
            . "`page`, `selecteur`, `empreinte`, `extrait`, `auteur`, `texte`, "
            . "`version`, `environnement`, `fenetre`, `charge`, "
            . "`cree_le`, `reponse_a`) "
            . "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        $req->execute(array(
            $note['projet'],
            $note['index_page'],
            (int) $note['format'],
            $note['mode'],
            $note['page'],
            $note['selecteur'],
            $note['empreinte'],
            $note['extrait'],
            $note['auteur'],
            $note['texte'],
            $note['version'],
            $note['environnement'],
            $note['fenetre'],
            $note['charge'],
            $creeLe,
            $note['reponse_a'] === null ? null : (int) $note['reponse_a'],
        ));

        return $this->note((int) $this->pdo()->lastInsertId(), $note['projet']);
    }

    /**
     * Marque une note comme corrigee, ou annule cette marque.
     *
     * On ne SUPPRIME jamais une note : une remarque qu'on efface est une
     * remarque qu'on ne peut plus contredire. Elle passe en historique, d'ou
     * elle peut ressortir si la correction s'avere incomplete.
     *
     * `version` est celle dans laquelle le correctif PART. Elle peut donc
     * designer un build qui n'est pas encore en ligne : c'est le client qui
     * compare avec la version courante pour distinguer « corrige » de
     * « corrige et deploye ».
     *
     * En mode chiffre, le nom du correcteur et la version sont eux aussi de
     * la charge : ils partent dans une SECONDE enveloppe. Elle a son propre
     * nonce et elle est ecrite plus tard, par quelqu'un d'autre, souvent
     * depuis une autre machine — la fondre dans l'enveloppe de la note
     * obligerait a rechiffrer une remarque qu'on n'a pas le droit de reecrire.
     *
     * Rouvrir vide les deux formes a la fois : c'est la meme information sous
     * deux modes, et une base mixte ne doit pas garder la moitie d'une
     * resolution annulee.
     */
    public function resoudre($id, $projet, $par, $version, $chargeResolution, $resolue = true)
    {
        $this->assurerSchema();
        if (!$resolue) {
            $this->pdo()->prepare(
                "UPDATE `" . $this->table . "` SET `resolue_le` = NULL, "
                . "`resolue_par` = '', `resolue_version` = '', `charge_resolution` = '' "
                . "WHERE `id` = ? AND `projet` = ?")
                ->execute(array((int) $id, (string) $projet));
            return $this->note($id, $projet);
        }
        $this->pdo()->prepare(
            "UPDATE `" . $this->table . "` SET `resolue_le` = ?, "
            . "`resolue_par` = ?, `resolue_version` = ?, `charge_resolution` = ? "
            . "WHERE `id` = ? AND `projet` = ?")
            ->execute(array(gmdate('Y-m-d H:i:s'), (string) $par, (string) $version,
                            (string) $chargeResolution, (int) $id, (string) $projet));
        return $this->note($id, $projet);
    }

    /**
     * Forme unique d'une note, quelle que soit la source.
     * Les types sortent d'ici deja justes : le reste du code n'a plus a se
     * demander si « reponse_a » est la chaine "0" ou l'entier 0.
     *
     * Toutes les cles sont TOUJOURS presentes, meme vides. Un lecteur qui
     * teste isset() ne doit pas confondre « note ancienne, sans contexte » et
     * « champ oublie par le serveur ».
     */
    private function normaliser(array $ligne)
    {
        return array(
            'id'        => (int) $ligne['id'],
            // Regroupement. « format » absent ou nul vaut 1 : la ligne vient
            // de l'outil d'origine. « mode » vide vaut clair, pour la meme
            // raison — et c'est le lecteur, pas la colonne, qui l'interprete.
            'projet'     => isset($ligne['projet']) ? (string) $ligne['projet'] : '',
            'index_page' => isset($ligne['index_page']) ? (string) $ligne['index_page'] : '',
            'format'     => isset($ligne['format']) && (int) $ligne['format'] > 0
                            ? (int) $ligne['format'] : 1,
            'mode'       => isset($ligne['mode']) && (string) $ligne['mode'] !== ''
                            ? (string) $ligne['mode'] : 'clair',
            'page'      => (string) $ligne['page'],
            'selecteur' => (string) $ligne['selecteur'],
            'empreinte' => (string) $ligne['empreinte'],
            'extrait'   => (string) $ligne['extrait'],
            'auteur'    => (string) $ligne['auteur'],
            'texte'     => (string) $ligne['texte'],
            'cree_le'   => ap_date_iso($ligne['cree_le']),
            // Contexte de prise de note. Ecrit a l'enregistrement, il n'etait
            // pas relu dans l'outil d'origine : la colonne se remplissait et
            // personne ne la voyait. Constate sur les premieres notes
            // reellement ecrites.
            'version'       => isset($ligne['version']) ? (string) $ligne['version'] : '',
            'environnement' => isset($ligne['environnement']) ? (string) $ligne['environnement'] : '',
            'fenetre'       => isset($ligne['fenetre']) ? (string) $ligne['fenetre'] : '',
            // Charge chiffree. NULL en base (voir colonnesAttendues) est
            // ramene ICI a la chaine vide, une fois pour toutes : plus loin,
            // personne n'a a se demander si l'absence d'enveloppe est un NULL
            // ou un ''.
            'charge'            => isset($ligne['charge']) && $ligne['charge'] !== null
                                   ? (string) $ligne['charge'] : '',
            'charge_resolution' => isset($ligne['charge_resolution']) && $ligne['charge_resolution'] !== null
                                   ? (string) $ligne['charge_resolution'] : '',
            // Resolution. « resolue_version » est la version du site DANS
            // LAQUELLE la correction part : c'est elle qui permet de savoir si
            // le correctif est deja en ligne, ou seulement promis.
            'resolue_le'      => isset($ligne['resolue_le']) && $ligne['resolue_le'] !== null
                                 ? ap_date_iso($ligne['resolue_le']) : null,
            'resolue_par'     => isset($ligne['resolue_par']) ? (string) $ligne['resolue_par'] : '',
            'resolue_version' => isset($ligne['resolue_version']) ? (string) $ligne['resolue_version'] : '',
            'reponse_a' => $ligne['reponse_a'] === null ? null : (int) $ligne['reponse_a'],
        );
    }
}

/**
 * DATETIME UTC de la base -> ISO 8601 avec decalage explicite.
 *
 * Le decalage est ecrit, jamais sous-entendu : c'est ce qui permet au client
 * d'afficher l'heure locale du lecteur, et a un humain de lire l'export sans
 * se demander de quel fuseau il s'agit.
 */
function ap_date_iso($datetimeUtc)
{
    try {
        $d = new DateTime((string) $datetimeUtc, new DateTimeZone('UTC'));
        return $d->format('c');
    } catch (Exception $e) {
        // Une date illisible ne justifie pas de perdre la note.
        return (string) $datetimeUtc;
    }
}
