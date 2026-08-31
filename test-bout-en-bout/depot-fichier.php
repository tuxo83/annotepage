<?php
/**
 * depot-fichier.php — STOCKAGE DE SECOURS POUR LE TEST, ET RIEN D'AUTRE.
 *
 * CE FICHIER N'EST PAS DU CODE DE PRODUCTION. Il ne va nulle part ailleurs
 * que dans le dossier temporaire fabrique par lancer.mjs, et il n'est employe
 * que lorsque la machine qui joue le test n'a pas de MySQL sous la main.
 * Quand MySQL est la, c'est serveur/racine-web/interne/depot.php — le vrai —
 * qui est copie, et ce fichier-ci n'est pas ouvert du tout.
 *
 * POURQUOI IL EXISTE. Le depot livre exige pdo_mysql, et exiger une base de
 * donnees pour lancer un test rend le test facultatif — donc jamais lance.
 * L'en-tete de depot.php prevoit explicitement le remplacement : « qui veut
 * brancher l'outil sur autre chose — un fichier, un autre moteur, une API —
 * remplace CE fichier et rien d'autre ». C'est ce qu'on fait, en tenant le
 * contrat qu'il enonce, methode pour methode.
 *
 * CE QU'IL FAUT SAVOIR EN LISANT UN RESULTAT DE TEST : avec ce depot, la
 * couche de PERSISTANCE n'est pas celle qui tourne en production. Tout le
 * reste du serveur l'est — api.php, entrees.php, origines.php, debit.php,
 * sortie-texte.php, configuration.php sont les fichiers du depot, copies tels
 * quels. Le test le dit en toutes lettres dans son rapport, et il faut le
 * croire : un test qui tait ce qu'il n'a pas exerce ment mieux qu'il ne
 * verifie.
 *
 * IL NE CHERCHE PAS A ETRE RAPIDE NI CONCURRENT. Tout le fichier est relu et
 * reecrit a chaque ecriture, sous un verrou exclusif. C'est le comportement
 * le plus simple a relire, et la simplicite est ici la seule qualite qui
 * compte : un stockage de test subtil se met a avoir ses propres defauts, et
 * on passe la journee a chercher dans le protocole un defaut qui est dans le
 * bac a sable.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

class ApDepot
{
    /** @var array configuration effective */
    private $config;

    /** @var string chemin du fichier de stockage */
    private $fichier;

    /** @var string etiquette de stockage, l'equivalent d'un nom de table */
    private $table;

    /** @var string etiquette du compteur de debit */
    private $tableDebit;

    public function __construct(array $config)
    {
        $this->config = $config;

        // Meme verification que le depot livre : le prefixe vient d'un fichier
        // de configuration ecrit a la main, et c'est ici qu'on sait ou il
        // finit.
        $prefixe = isset($config['prefixe_tables']) ? (string) $config['prefixe_tables'] : '';
        if (!preg_match('/^[A-Za-z0-9_]*$/', $prefixe)) {
            throw new ApPanne(
                "Configuration invalide : prefixe_tables ne peut contenir que des "
                . "lettres, des chiffres et des tirets bas.",
                500);
        }
        $this->table      = $prefixe . 'notes';
        $this->tableDebit = $prefixe . 'debit';

        $base = isset($config['base']) && is_array($config['base']) ? $config['base'] : array();
        $chemin = isset($base['fichier']) ? (string) $base['fichier'] : '';
        if ($chemin === '') {
            throw new ApPanne(
                "Le depot de test attend base.fichier : le chemin absolu du fichier "
                . "de stockage.", 500);
        }
        $this->fichier = $chemin;
    }

    /** Aucune extension PHP au-dela du noyau : c'est tout l'interet. */
    public static function extensionsRequises()
    {
        return array();
    }

    public function table()
    {
        return $this->table;
    }

    /* -- Le fichier -------------------------------------------------------
       Une seule structure : le compteur d'identifiants, les notes, les
       compteurs de debit. Le compteur est GLOBAL au serveur, comme l'est
       l'AUTO_INCREMENT de la table livree — la fuite decrite par FORMAT.md
       §2.4 est donc reproduite, et non corrigee au passage. Un bac a sable
       plus vertueux que la production teste autre chose que la production. */

    private function charger()
    {
        if (!is_file($this->fichier)) {
            return array('suivant' => 1, 'notes' => array(), 'debit' => array());
        }
        $brut = file_get_contents($this->fichier);
        $lu = $brut === false || $brut === '' ? null : json_decode($brut, true);
        if (!is_array($lu) || !isset($lu['notes'])) {
            return array('suivant' => 1, 'notes' => array(), 'debit' => array());
        }
        return $lu;
    }

    /**
     * Ecriture par fichier temporaire puis rename : une lecture concurrente
     * voit l'ancien contenu ou le nouveau, jamais la moitie de l'un.
     */
    private function enregistrer(array $donnees)
    {
        $temporaire = $this->fichier . '.' . getmypid() . '.tmp';
        $ecrit = file_put_contents($temporaire,
            json_encode($donnees, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        if ($ecrit === false || !rename($temporaire, $this->fichier)) {
            throw new ApPanne(
                "Le fichier de stockage du test n'a pas pu etre ecrit : "
                . $this->fichier, 503);
        }
    }

    /**
     * Lit, laisse modifier, reecrit — le tout sous verrou exclusif.
     *
     * Le verrou porte sur un fichier voisin et non sur le fichier de donnees :
     * celui-ci est remplace par rename() a chaque ecriture, et un verrou pose
     * sur un inode qui vient d'etre remplace ne protege plus rien.
     */
    private function transaction(callable $travail)
    {
        $verrou = fopen($this->fichier . '.verrou', 'c');
        if ($verrou === false) {
            throw new ApPanne("Verrou de stockage impossible a ouvrir.", 503);
        }
        flock($verrou, LOCK_EX);
        try {
            $donnees = $this->charger();
            $resultat = $travail($donnees);
            $this->enregistrer($donnees);
            return $resultat;
        } finally {
            flock($verrou, LOCK_UN);
            fclose($verrou);
        }
    }

    /* -- Schema -----------------------------------------------------------
       Il n'y a pas de schema a assurer : une note est un objet, ses cles sont
       celles que ajouter() ecrit. La methode existe parce que le contrat
       l'exige et parce que api.php l'appelle indirectement partout. */

    public function assurerSchema()
    {
        if (!is_file($this->fichier)) {
            $this->transaction(function (&$donnees) { return null; });
        }
    }

    public function rattacherOrphelines()
    {
        // Rien a rattacher : ce depot n'a jamais porte de base 1.2.0. On rend
        // 0 plutot que de lever — l'action de reprise doit pouvoir repondre.
        return 0;
    }

    /* -- Debit ------------------------------------------------------------ */

    public function consommerDebit($cle, $fenetre)
    {
        return $this->transaction(function (&$donnees) use ($cle, $fenetre) {
            $index = (string) $cle . '/' . (int) $fenetre;
            if (!isset($donnees['debit'][$index])) {
                $donnees['debit'][$index] = 0;
            }
            $donnees['debit'][$index] += 1;
            return (int) $donnees['debit'][$index];
        });
    }

    /* -- Lecture ---------------------------------------------------------- */

    public function note($id, $projet)
    {
        $donnees = $this->charger();
        foreach ($donnees['notes'] as $ligne) {
            if ((int) $ligne['id'] === (int) $id && (string) $ligne['projet'] === (string) $projet) {
                return $this->normaliser($ligne);
            }
        }
        return null;
    }

    public function parPage($projet, $index)
    {
        $donnees = $this->charger();
        $retenues = array();
        foreach ($donnees['notes'] as $ligne) {
            if ((string) $ligne['projet'] === (string) $projet
                && (string) $ligne['index_page'] === (string) $index) {
                $retenues[] = $ligne;
            }
        }
        usort($retenues, function ($a, $b) { return (int) $a['id'] - (int) $b['id']; });

        $meres = array();
        $reponses = array();
        foreach ($retenues as $ligne) {
            $note = $this->normaliser($ligne);
            if ($note['reponse_a'] === null) {
                $note['reponses'] = array();
                $meres[$note['id']] = $note;
            } else {
                $reponses[] = $note;
            }
        }
        foreach ($reponses as $reponse) {
            if (isset($meres[$reponse['reponse_a']])) {
                $meres[$reponse['reponse_a']]['reponses'][] = $reponse;
            }
        }
        return array_values($meres);
    }

    /**
     * Toutes les notes d'un projet, dans l'ordre exact de l'export.
     *
     * L'ordre reproduit celui du ORDER BY du depot livre :
     *   page, puis index_page, puis le fil COALESCE(reponse_a, id),
     *   puis la mere avant ses reponses, puis l'ordre de creation.
     * Il compte : l'export texte est un contrat, et son ordre en fait partie.
     */
    public function toutes($projet)
    {
        $donnees = $this->charger();
        $retenues = array();
        foreach ($donnees['notes'] as $ligne) {
            if ((string) $ligne['projet'] === (string) $projet) {
                $retenues[] = $ligne;
            }
        }
        usort($retenues, function ($a, $b) {
            $c = strcmp((string) $a['page'], (string) $b['page']);
            if ($c !== 0) return $c;
            $c = strcmp((string) $a['index_page'], (string) $b['index_page']);
            if ($c !== 0) return $c;
            $filA = $a['reponse_a'] === null ? (int) $a['id'] : (int) $a['reponse_a'];
            $filB = $b['reponse_a'] === null ? (int) $b['id'] : (int) $b['reponse_a'];
            if ($filA !== $filB) return $filA - $filB;
            $repA = $a['reponse_a'] === null ? 0 : 1;
            $repB = $b['reponse_a'] === null ? 0 : 1;
            if ($repA !== $repB) return $repA - $repB;
            return (int) $a['id'] - (int) $b['id'];
        });

        // Un generateur, comme le depot livre : sortie-texte.php ecrit au fil
        // de l'eau et ne doit pas dependre d'un tableau complet.
        $normaliser = array($this, 'normaliser');
        return (function () use ($retenues, $normaliser) {
            foreach ($retenues as $ligne) {
                yield call_user_func($normaliser, $ligne);
            }
        })();
    }

    public function compte($projet)
    {
        $n = 0;
        foreach ($this->charger()['notes'] as $ligne) {
            if ((string) $ligne['projet'] === (string) $projet) $n++;
        }
        return $n;
    }

    public function repartitionModes($projet)
    {
        $out = array('clair' => 0, 'chiffre' => 0);
        foreach ($this->charger()['notes'] as $ligne) {
            if ((string) $ligne['projet'] !== (string) $projet) continue;
            $cle = ((string) $ligne['mode'] === 'chiffre') ? 'chiffre' : 'clair';
            $out[$cle] += 1;
        }
        return $out;
    }

    public function pagesSansIndex($projet)
    {
        $pages = array();
        foreach ($this->charger()['notes'] as $ligne) {
            if ((string) $ligne['projet'] === (string) $projet
                && (string) $ligne['index_page'] === ''
                && (string) $ligne['page'] !== '') {
                $pages[(string) $ligne['page']] = true;
            }
        }
        $liste = array_keys($pages);
        sort($liste);
        return $liste;
    }

    public function affecterIndex($projet, $page, $index)
    {
        return $this->transaction(function (&$donnees) use ($projet, $page, $index) {
            $touchees = 0;
            foreach ($donnees['notes'] as $rang => $ligne) {
                if ((string) $ligne['projet'] === (string) $projet
                    && (string) $ligne['page'] === (string) $page
                    && (string) $ligne['index_page'] === '') {
                    $donnees['notes'][$rang]['index_page'] = (string) $index;
                    $donnees['notes'][$rang]['format'] = AP_FORMAT;
                    $touchees++;
                }
            }
            return $touchees;
        });
    }

    /* -- Ecriture --------------------------------------------------------- */

    public function ajouter(array $note)
    {
        $id = $this->transaction(function (&$donnees) use ($note) {
            $id = (int) $donnees['suivant'];
            $donnees['suivant'] = $id + 1;
            $donnees['notes'][] = array(
                'id'                => $id,
                'projet'            => (string) $note['projet'],
                'index_page'        => (string) $note['index_page'],
                'format'            => (int) $note['format'],
                'mode'              => (string) $note['mode'],
                'page'              => (string) $note['page'],
                'selecteur'         => (string) $note['selecteur'],
                'empreinte'         => (string) $note['empreinte'],
                'extrait'           => (string) $note['extrait'],
                'auteur'            => (string) $note['auteur'],
                'texte'             => (string) $note['texte'],
                'version'           => (string) $note['version'],
                'environnement'     => (string) $note['environnement'],
                'fenetre'           => (string) $note['fenetre'],
                'charge'            => (string) $note['charge'],
                'charge_resolution' => '',
                // UTC, ecrit par PHP et jamais par le moteur de stockage :
                // c'est la regle de FORMAT.md §2.1, et elle vaut ici aussi.
                'cree_le'           => gmdate('Y-m-d H:i:s'),
                'resolue_le'        => null,
                'resolue_par'       => '',
                'resolue_version'   => '',
                'reponse_a'         => $note['reponse_a'] === null ? null : (int) $note['reponse_a'],
            );
            return $id;
        });
        return $this->note($id, $note['projet']);
    }

    public function resoudre($id, $projet, $par, $version, $chargeResolution, $resolue = true)
    {
        $this->transaction(function (&$donnees) use ($id, $projet, $par, $version, $chargeResolution, $resolue) {
            foreach ($donnees['notes'] as $rang => $ligne) {
                if ((int) $ligne['id'] !== (int) $id
                    || (string) $ligne['projet'] !== (string) $projet) {
                    continue;
                }
                if (!$resolue) {
                    // Rouvrir vide les deux formes a la fois : c'est la meme
                    // information sous deux modes, et une base mixte ne doit
                    // pas garder la moitie d'une resolution annulee.
                    $donnees['notes'][$rang]['resolue_le'] = null;
                    $donnees['notes'][$rang]['resolue_par'] = '';
                    $donnees['notes'][$rang]['resolue_version'] = '';
                    $donnees['notes'][$rang]['charge_resolution'] = '';
                } else {
                    $donnees['notes'][$rang]['resolue_le'] = gmdate('Y-m-d H:i:s');
                    $donnees['notes'][$rang]['resolue_par'] = (string) $par;
                    $donnees['notes'][$rang]['resolue_version'] = (string) $version;
                    $donnees['notes'][$rang]['charge_resolution'] = (string) $chargeResolution;
                }
                return null;
            }
            return null;
        });
        return $this->note($id, $projet);
    }

    /* -- Diagnostic ------------------------------------------------------- */

    public function etat()
    {
        $etat = array(
            'connexion'      => is_dir(dirname($this->fichier)),
            'fichier'        => $this->fichier,
            'present'        => is_file($this->fichier),
            'notes'          => null,
            'message'        => null,
        );
        if ($etat['present']) {
            $etat['notes'] = count($this->charger()['notes']);
        }
        return $etat;
    }

    public function lignesDiagnostic()
    {
        $etat = $this->etat();
        $lignes = array();
        $lignes[] = array('stockage.type', 'fichier (depot de test, PAS la production)');
        $lignes[] = array('stockage.fichier', $etat['fichier']);
        $lignes[] = array('stockage.table', $this->table);
        $lignes[] = array('stockage.table_debit', $this->tableDebit);
        $lignes[] = array('', '');
        $lignes[] = array('stockage.connexion', $etat['connexion'] ? 'REUSSIE' : 'ECHEC');
        $lignes[] = array('stockage.table_presente', $etat['present'] ? 'oui' : 'NON');
        if ($etat['notes'] !== null) {
            $lignes[] = array('stockage.notes', $etat['notes']);
        }
        $lignes[] = array('', '');
        $lignes[] = array('verdict', $etat['connexion']
            ? 'operationnel (stockage fichier de test).'
            : 'le dossier de stockage est INJOIGNABLE.');
        return $lignes;
    }

    /**
     * Forme unique d'une note — RECOPIEE du depot livre, cle pour cle.
     *
     * C'est la seule duplication assumee de ce fichier, et elle est
     * volontaire : cette forme est le contrat entre le depot et tout le reste
     * du serveur. Si elle divergeait, le test verifierait un serveur qui
     * n'existe pas.
     */
    private function normaliser(array $ligne)
    {
        return array(
            'id'         => (int) $ligne['id'],
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
            'version'       => isset($ligne['version']) ? (string) $ligne['version'] : '',
            'environnement' => isset($ligne['environnement']) ? (string) $ligne['environnement'] : '',
            'fenetre'       => isset($ligne['fenetre']) ? (string) $ligne['fenetre'] : '',
            'charge'            => isset($ligne['charge']) && $ligne['charge'] !== null
                                   ? (string) $ligne['charge'] : '',
            'charge_resolution' => isset($ligne['charge_resolution']) && $ligne['charge_resolution'] !== null
                                   ? (string) $ligne['charge_resolution'] : '',
            'resolue_le'      => isset($ligne['resolue_le']) && $ligne['resolue_le'] !== null
                                 ? ap_date_iso($ligne['resolue_le']) : null,
            'resolue_par'     => isset($ligne['resolue_par']) ? (string) $ligne['resolue_par'] : '',
            'resolue_version' => isset($ligne['resolue_version']) ? (string) $ligne['resolue_version'] : '',
            'reponse_a' => $ligne['reponse_a'] === null ? null : (int) $ligne['reponse_a'],
        );
    }
}

/**
 * DATETIME UTC -> ISO 8601 avec decalage explicite.
 * Meme fonction, meme nom que dans le depot livre : elle est definie par le
 * depot, et le remplacer emporte donc la responsabilite de la fournir.
 */
function ap_date_iso($datetimeUtc)
{
    try {
        $d = new DateTime((string) $datetimeUtc, new DateTimeZone('UTC'));
        return $d->format('c');
    } catch (Exception $e) {
        return (string) $datetimeUtc;
    }
}
