<?php
/**
 * store.php -- THE ONLY PLACE THAT TALKS TO THE DATABASE.
 *
 * All of the tool's persistence sits in this class. That is deliberate:
 * whoever wants to plug the tool onto something else -- a file, another engine,
 * an API -- replaces THIS file and nothing else. Neither api.php, nor the
 * client, nor the text export knows there is SQL behind.
 *
 * The contract any replacement must hold:
 *   ensureSchema()          prepares the storage, no effect if already ready,
 *                           and CATCHES UP a storage created by an earlier
 *                           version -- columns AND indexes
 *   byPage($p, $index)      the notes of one page of a project, nested
 *   all($p)                 every note of a project, flat, STREAMED
 *   add(array $note)        saves and returns the created note
 *   note($id, $p)           one note of a project, or null
 *   resolve(...)            marks a note resolved, or undoes that mark
 *   count($p)               number of notes of a project
 *   modeBreakdown($p)       how many plain, how many encrypted
 *   consumeRate(...)        counts one event within a time window
 *   pagesWithoutIndex($p)   backfill of a 1.2.0 database: see below
 *   assignIndex(...)        backfill of a 1.2.0 database: see below
 *   state()                 state of the storage, with no effect (diagnostic)
 *   diagnosticLines()       what the diagnostic shows of the storage
 *   requiredExtensions()    what THIS store needs in order to work
 *
 * The last two exist so that the ENTRY POINT does not have to know there is SQL
 * behind: without them, api.php named `pdo_mysql`, `database.host` and
 * `table_prefix`, and a replaced store would have left behind a diagnostic
 * describing a storage that no longer exists.
 *
 * MULTI-TENANT, ONE SINGLE CODE PATH. The `project` column is in every row and
 * in every query, including when self-hosted where there is only one project. A
 * single tenant is a multi-tenant with one tenant: so there is no "simple"
 * query and no "multi-project" query here to diverge at the second fix.
 *
 * THE MODE MAKES NEITHER TWO TABLES NOR TWO QUERIES. A plain note and an
 * encrypted note are the same row: what changes is which columns are FILLED.
 * Grouping is done by `page_index` in both modes, even when `page` is readable
 * next to it -- one code path, one way of grouping.
 *
 * The model is APPEND-ONLY, with three exceptions, all named:
 *   - a note can be marked RESOLVED, and that mark can be undone;
 *   - the backfill of a 1.2.0 database writes `project` and `page_index` on
 *     rows that had none (see "BACKFILL" below);
 *   - the rate counter, which is not a note.
 * Nothing is ever deleted BY ANYONE -- a remark one erases is a remark one can
 * no longer contradict. Several reviewers can therefore annotate at the same
 * time with no lock and no conflict.
 *
 * The one thing that removes rows is RETENTION, and it is the fourth named
 * exception: `max_note_age_days`, off unless set. It expires whole threads by
 * age, mechanically, choosing nothing -- nobody can point at a remark and make
 * it go. A relay open to strangers needs a ceiling on what it stores, and this
 * is it. A server where it is set says so in its diagnostic and in the export
 * header, because "nothing is deleted" stops being true there.
 *
 * Dates are written by PHP in UTC, never by the SQL server's NOW(): PHP's
 * timezone and the database's are not aligned by default, and a note dated
 * three hours in the future would cast doubt on everything else.
 *
 * BACKFILL OF A 1.2.0 DATABASE -- WHAT IS POSSIBLE AND WHAT IS NOT
 *
 * A table written by the original tool is a format-2 table in plain mode whose
 * twelve columns carry French names and whose six other columns are missing.
 * The lazy catch-up RENAMES the first and ADDS the second, and the existing
 * rows then read as format-1 rows (mode absent = plain). NO NOTE IS LOST: they
 * are all in the database and all in the export.
 *
 * Two columns cannot be filled the same way:
 *
 *  - `project`: the server can fill it on its own, but only when self-hosted
 *    with ONE declared project -- there is then no ambiguity about who owns the
 *    rows. It is done once, at the moment the column appears;
 *  - `page_index`: the server CANNOT compute it. It is
 *    HMAC(index_key, path), and the key descends from the key, which never
 *    leaves the browser. That is the accepted price of the blind index. The
 *    backfill therefore happens in two steps, through the `backfill` action:
 *    the server enumerates the paths still without an index (it has them in the
 *    clear, they are format-1 rows), the client computes each index and sends
 *    it back.
 *
 * Until the backfill has happened, the old notes do come out of `?action=text`
 * but do not group under their page in the panel. That is unpleasant, it is
 * visible, and it is written here rather than discovered.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

class ApStore
{
    /** @var array effective configuration */
    private $config;

    /** @var PDO|null connection, opened on first need */
    private $pdo = null;

    /** @var bool has the schema already been ensured in this request? */
    private $schemaEnsured = false;

    /** @var string full name of the notes table, prefix included */
    private $table;

    /** @var string full name of the rate counter table */
    private $rateTable;

    public function __construct(array $config)
    {
        $this->config = $config;
        // The prefix is the ONLY value that enters SQL without going through a
        // prepared parameter. It never comes from the network, but it does come
        // from a configuration file written by hand: it is checked HERE, in the
        // only file that knows where it will end up.
        $prefix = isset($config['table_prefix']) ? (string) $config['table_prefix'] : '';
        if (!preg_match('/^[A-Za-z0-9_]*$/', $prefix)) {
            throw new ApFailure(
                "Invalid configuration: table_prefix can only contain letters, digits "
                . "and underscores.",
                500);
        }
        $this->table     = $prefix . 'notes';
        $this->rateTable = $prefix . 'rate';
    }

    /**
     * What THIS store needs in order to work at all.
     *
     * The entry point displays it in its diagnostic without knowing what it is:
     * a file store would return an empty array, and the diagnostic would stop
     * talking about a database extension the day there is none.
     *
     * @return array names of PHP extensions
     */
    public static function requiredExtensions()
    {
        return array('pdo_mysql');
    }

    /** Name of the table, for messages aimed at the administrator. */
    public function table()
    {
        return $this->table;
    }

    /**
     * Opens the connection on first need.
     *
     * Three successive refusals, each with its own sentence: extension missing,
     * credential unreadable (handled by config.php), server unreachable. No
     * silent fallback to another engine: believing all is well while the notes
     * are no longer shared would be the worst behaviour of all.
     */
    private function pdo()
    {
        if ($this->pdo !== null) {
            return $this->pdo;
        }

        if (!extension_loaded('pdo_mysql')) {
            throw new ApFailure(
                "The PHP extension `pdo_mysql` is missing on this server.\n"
                . "Without it, no note can be saved or read back.\n"
                . "To pass on to the administrator: enable pdo_mysql for the PHP served "
                . "by the web server.",
                503);
        }

        $d = $this->config['database'];
        $host     = ap_configured_value($d['host'], 'database.host');
        $name     = ap_configured_value($d['name'], 'database.name');
        $user     = ap_configured_value($d['user'], 'database.user');
        $password = ap_configured_value($d['password'], 'database.password');
        $port     = isset($d['port']) && $d['port'] ? (int) $d['port'] : 3306;

        // charset=utf8mb4 EXPLICITLY: the database's default set is unknown, and
        // an accent or an emoji would come back out mangled without it.
        $dsn = 'mysql:host=' . $host . ';port=' . $port
             . ';dbname=' . $name . ';charset=utf8mb4';

        try {
            $this->pdo = new PDO($dsn, $user, $password, array(
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_TIMEOUT            => 5,
            ));
        } catch (PDOException $e) {
            // The driver message can contain the host, the database, the user.
            ap_log('connection refused : ' . $e->getMessage());
            throw new ApFailure(
                "The database is unreachable: your notes are NOT saved.\n"
                . "The tool has lost nothing of what was already saved; it simply cannot "
                . "reach it for now.\n"
                . "The technical detail is in the server's PHP error log.",
                503, $e);
        }

        return $this->pdo;
    }

    /**
     * Prepares the storage -- on every service call, and in FIVE steps.
     *
     * 1. CREATE TABLE IF NOT EXISTS, for a fresh install;
     * 2. the RENAME of the format-1 French columns, for a table written by
     *    "in-context notes" 1.2.0;
     * 3. the missing columns, for a table created by an EARLIER version of the
     *    tool (1.2.0 included);
     * 4. the missing INDEXES, for the same reason -- an "IF NOT EXISTS" on the
     *    table has no effect on its indexes, and the new read query is on
     *    (project, page_index), which did not exist;
     * 5. attaching the format-1 rows to the project, when there is only one
     *    possible project.
     *
     * THE ORDER OF 2 AND 3 IS NOT NEGOTIABLE. Add first and one adds an empty
     * `text` column next to the `texte` column that holds every remark, and the
     * data is lost in silence -- nothing fails, nothing is logged, the notes are
     * simply no longer read. Rename first, then add what is still missing.
     *
     * Step 3 was added after the fact in the original tool, and its absence was
     * a blocking defect: "IF NOT EXISTS" has no effect on a table that already
     * exists, so columns arriving with a new feature never reached a site where
     * the tool had already run. The first use answered "Unknown column", with a
     * 500, naming neither the column nor the thing to do. That is exactly the
     * case that matters for a tool meant to be dropped in elsewhere AND THEN
     * updated, and it is this port's case too.
     *
     * There is no migration mechanism on this kind of hosting: no shell, no
     * install task. The lazy catch-up is therefore the only reliable way; it has
     * no effect as soon as the schema is complete, and running it twice does
     * nothing the second time.
     *
     * If the database user has no right to create or alter the table, the
     * message returns THE EXACT SQL to run by hand: the administrator does not
     * have to guess it, and we do not retry in a loop.
     */
    public function ensureSchema()
    {
        if ($this->schemaEnsured) {
            return;
        }

        $sql = $this->createSql();

        try {
            $this->pdo()->exec($sql);
        } catch (PDOException $e) {
            ap_log('table creation refused : ' . $e->getMessage());
            $code = $e->getCode();
            if ($code === '42000' || $code === '42501') {
                throw new ApFailure(
                    "The database user has no right to create the notes table.\n"
                    . "To pass on to the administrator -- exact SQL to run once:\n\n"
                    . $sql . "\n"
                    . $this->createRateSql() . "\n",
                    503, $e);
            }
            throw new ApFailure(
                "The notes table could not be prepared: your notes are NOT saved.\n"
                . "The technical detail is in the server's PHP error log.",
                503, $e);
        }

        // Read the columns ONCE, then rename, then add. Reading again between
        // the two steps would cost a round trip to learn what we have just
        // done.
        $present = $this->presentColumns();
        $added = array();
        if ($present !== null) {
            foreach ($this->renameLegacyColumns($present) as $old => $new) {
                unset($present[strtolower($old)]);
                $present[strtolower($new)] = true;
            }
            $added = $this->addMissingColumns($present);
        }
        $this->completeIndexes();

        // The attachment is only attempted at the moment the `project` column
        // has just appeared, that is once in the life of an installation. Doing
        // it on every request would cost one write per call to change nothing
        // 999 times out of 1000.
        if (in_array('project', $added, true)) {
            $this->attachRowsWithoutProject();
        }

        $this->schemaEnsured = true;
    }

    /**
     * The format-1 column names, and what each is called now.
     *
     * A database written by "in-context notes" 1.2.0 is a format-2 database in
     * plain mode -- with French column names. This map is the whole difference,
     * and renaming is what keeps the promise "nothing to export, nothing to
     * reimport" true now that the product ships in one language.
     *
     * `id`, `page` and `version` are spelled the same in both languages and are
     * left alone. `format` and `mode` never existed in format 1: they are added,
     * not renamed.
     *
     * The last four never reached a released version, since nothing was
     * published before the conversion. They are here for one reason: if such a
     * table exists anywhere, renaming costs nothing, whereas ADDING `project`
     * next to a full `projet` would lose every note in silence.
     *
     * @return array old name => new name
     */
    private function legacyColumnNames()
    {
        return array(
            'reponse_a'         => 'reply_to',
            'cree_le'           => 'created_at',
            'resolue_le'        => 'resolved_at',
            'resolue_par'       => 'resolved_by',
            'resolue_version'   => 'resolved_version',
            'selecteur'         => 'selector',
            'empreinte'         => 'fingerprint',
            'extrait'           => 'excerpt',
            'auteur'            => 'author',
            'texte'             => 'text',
            'environnement'     => 'environment',
            'fenetre'           => 'viewport',
            'projet'            => 'project',
            'index_page'        => 'page_index',
            'charge'            => 'payload',
            'charge_resolution' => 'resolution_payload',
        );
    }

    /**
     * Renames the format-1 columns that are still there. No effect once done --
     * which is what makes it safe to run on every call.
     *
     * TWO GUARDS, and the second is the one that matters:
     *
     *  - the old name has to be there. Otherwise there is nothing to rename,
     *    and a second run finds nothing to do;
     *  - the new name must NOT be there. If both are present, we touch nothing
     *    and we log it. That situation should not exist; if it does, one of the
     *    two columns holds the notes and we do not know which. Renaming would
     *    fail anyway, and choosing would risk erasing the wrong one -- a human
     *    decides, with the SQL in front of them.
     *
     * CHANGE COLUMN and not RENAME COLUMN: RENAME COLUMN needs MySQL 8.0, and
     * this tool is dropped onto whatever hosting is there. CHANGE also
     * reapplies the column definition, which brings a format-1 column back to
     * the size the current configuration declares -- the same definition the
     * creation and the add path use, from the same single list.
     *
     * @param array $present columns really present, lowercased keys
     * @return array old name => new name, for those actually renamed
     */
    private function renameLegacyColumns(array $present)
    {
        $expected = $this->expectedColumns();
        $clauses = array();
        $renamed = array();

        foreach ($this->legacyColumnNames() as $old => $new) {
            if (!isset($present[strtolower($old)]) || !isset($expected[$new])) {
                continue;
            }
            if (isset($present[strtolower($new)])) {
                ap_log('columns `' . $old . '` and `' . $new . '` both present : '
                    . 'rename skipped, a human has to decide');
                continue;
            }
            $clauses[] = 'CHANGE COLUMN `' . $old . '` `' . $new . '` ' . $expected[$new];
            $renamed[$old] = $new;
        }

        if (!$clauses) {
            return array();
        }

        $sql = 'ALTER TABLE `' . $this->table . '` ' . implode(', ', $clauses) . ';';

        try {
            $this->pdo()->exec($sql);
        } catch (PDOException $e) {
            ap_log('column rename refused : ' . $e->getMessage());
            throw new ApFailure(
                "The notes table comes from `in-context notes` 1.2.0 and its columns "
                . "still carry their old names.\n"
                . "The tool could not rename them itself. It has done NOTHING else: no "
                . "column was added next to them, and no note was lost.\n"
                . "To pass on to the administrator -- exact SQL to run once:\n\n"
                . $sql . "\n",
                503, $e);
        }

        return $renamed;
    }

    /**
     * Adds the columns an earlier version of the tool had not created. No
     * effect if the schema is already complete -- the common case.
     *
     * Called AFTER renameLegacyColumns(), and only with the column list that
     * rename produced. The other order adds an English column next to the
     * French one holding all the data.
     *
     * @param array $present columns really present, lowercased keys
     * @return array the names of the columns actually added
     */
    private function addMissingColumns(array $present)
    {
        $added = array();
        $missing = array();
        foreach ($this->expectedColumns() as $name => $definition) {
            if (!isset($present[strtolower($name)])) {
                $missing[] = 'ADD COLUMN `' . $name . '` ' . $definition;
                $added[] = $name;
            }
        }
        if (!$missing) {
            return array();
        }

        $sql = 'ALTER TABLE `' . $this->table . '` ' . implode(', ', $missing) . ';';

        try {
            $this->pdo()->exec($sql);
        } catch (PDOException $e) {
            ap_log('schema update refused : ' . $e->getMessage());
            throw new ApFailure(
                "The notes table comes from an earlier version of the tool and columns "
                . "are missing from it.\n"
                . "The tool could not add them itself.\n"
                . "To pass on to the administrator -- exact SQL to run once:\n\n"
                . $sql . "\n",
                503, $e);
        }

        return $added;
    }

    /**
     * Adds the missing indexes.
     *
     * A FAILURE HERE IS NOT FATAL, and that is a decision, not an oversight: a
     * missing index makes the queries slow, not wrong. Refusing to serve the
     * notes because an index is missing would be a manufactured outage, when a
     * review table holds thousands of rows, not millions. The diagnostic does
     * say so, and returns the SQL to run.
     */
    private function completeIndexes()
    {
        $present = $this->presentIndexes();
        if ($present === null) {
            return;
        }
        foreach ($this->expectedIndexes() as $name => $columns) {
            if (isset($present[strtolower($name)])) {
                continue;
            }
            $sql = 'ALTER TABLE `' . $this->table . '` ADD KEY `' . $name . '` ('
                 . $columns . ');';
            try {
                $this->pdo()->exec($sql);
            } catch (PDOException $e) {
                ap_log('index ' . $name . ' not created : ' . $e->getMessage());
            }
        }
    }

    /**
     * Attaches the rows that carry no project to the single project.
     *
     * These are the notes written by the original tool, before the column
     * existed. ONLY when self-hosted and ONLY when a single project is
     * declared: that is the only case where the owner of the rows is known
     * without ambiguity. On a relay, or with two declared projects, we do not
     * guess -- and a wrong attachment would give one team's notes to another.
     *
     * Without this attachment the existing notes would still be in the database
     * but no longer in any response: the update would look like it had erased
     * three months of review. That is why this write happens during a schema
     * step, which is not pretty.
     */
    private function attachRowsWithoutProject()
    {
        $id = isset($this->config['backfill_project'])
            ? $this->config['backfill_project'] : null;
        if (!ap_is_well_formed_id($id)) {
            return 0;
        }
        try {
            $req = $this->pdo()->prepare(
                "UPDATE `" . $this->table . "` SET `project` = ? WHERE `project` = ''");
            $req->execute(array($id));
            return $req->rowCount();
        } catch (PDOException $e) {
            ap_log('attachment to the project impossible : ' . $e->getMessage());
            return 0;
        }
    }

    /** Attachment asked for explicitly (the backfill action). */
    public function attachOrphans()
    {
        $this->ensureSchema();
        return $this->attachRowsWithoutProject();
    }

    /**
     * Columns REALLY present, lowercased, or null if we could not find out. No
     * effect.
     *
     * A failure to READ the schema interrupts nothing: if information_schema is
     * not readable by this user, we carry on with the schema as it is. The
     * failure would then show at write time, with its message -- refusing to
     * serve the notes because we could not CHECK would be a manufactured
     * outage.
     *
     * @return array|null key = column name, lowercased
     */
    private function presentColumns()
    {
        try {
            $req = $this->pdo()->prepare(
                'SELECT column_name FROM information_schema.columns '
                . 'WHERE table_schema = DATABASE() AND table_name = ?');
            $req->execute(array($this->table));
            $out = array();
            foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
                $out[strtolower((string) $row[0])] = true;
            }
            return $out;
        } catch (PDOException $e) {
            ap_log('cannot read the schema : ' . $e->getMessage());
            return null;
        }
    }

    /** Indexes REALLY present, lowercased, or null. No effect. */
    private function presentIndexes()
    {
        try {
            $req = $this->pdo()->prepare(
                'SELECT DISTINCT index_name FROM information_schema.statistics '
                . 'WHERE table_schema = DATABASE() AND table_name = ?');
            $req->execute(array($this->table));
            $out = array();
            foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
                $out[strtolower((string) $row[0])] = true;
            }
            return $out;
        } catch (PDOException $e) {
            ap_log('cannot read the indexes : ' . $e->getMessage());
            return null;
        }
    }

    /**
     * The list of columns, SINGLE SOURCE: creation, rename and catch-up all
     * read it. Key = column name, value = its SQL definition.
     *
     * THE ORDER OF THE DEFAULTS IS WHAT MAKES THE BACKFILL POSSIBLE. A row
     * written by the original tool receives, when the columns are added:
     *   project = ''      -> attached further on, or visible as an orphan
     *   page_index = ''   -> to be computed by the client (backfill action)
     *   format = 1        -> that is what it is
     *   mode = ''         -> absent means `plain`: that is what it is
     * None of these four values is a stopgap: each describes exactly the row as
     * it was written.
     */
    private function expectedColumns()
    {
        $c = $this->config;
        return array(
            // Grouping, readable by the server in both modes.
            'project'    => "VARCHAR(22) NOT NULL DEFAULT ''",
            'page_index' => "VARCHAR(22) NOT NULL DEFAULT ''",
            'format'     => 'INT NOT NULL DEFAULT 1',
            // VARCHAR(16), not VARCHAR(8): `encrypted` is nine characters and a
            // narrower column truncates it in silence. A truncated mode is an
            // unknown mode, and an unknown mode means every row is skipped
            // (FORMAT.md section 2.1). Do not tighten it back.
            'mode'       => "VARCHAR(16) NOT NULL DEFAULT ''",
            // Plain payload: filled in plain mode, empty in encrypted mode.
            'page'        => 'VARCHAR(' . (int) $c['max_page_length'] . ") NOT NULL DEFAULT ''",
            'selector'    => 'VARCHAR(' . (int) $c['max_selector_length'] . ") NOT NULL DEFAULT ''",
            'fingerprint' => 'VARCHAR(' . (int) $c['max_fingerprint_length'] . ") NOT NULL DEFAULT ''",
            'excerpt'     => 'VARCHAR(' . (int) $c['max_excerpt_length'] . ") NOT NULL DEFAULT ''",
            'author'      => 'VARCHAR(' . (int) $c['max_author_length'] . ") NOT NULL DEFAULT ''",
            'text'        => 'TEXT NOT NULL',
            'version'     => 'VARCHAR(' . (int) $c['max_version_length'] . ") NOT NULL DEFAULT ''",
            'environment' => 'VARCHAR(' . (int) $c['max_environment_length'] . ") NOT NULL DEFAULT ''",
            'viewport'    => 'VARCHAR(' . (int) $c['max_viewport_length'] . ") NOT NULL DEFAULT ''",
            // Encrypted payload: the other way round. Declared NULL with a NULL
            // default rather than `NOT NULL`: a TEXT cannot carry a default
            // value before MySQL 8.0.13, and a NOT NULL column with no default
            // does not ADD cleanly to a table that already holds rows -- that is,
            // precisely where the catch-up is useful. normalise() brings NULL
            // back to the empty string, once, here.
            'payload'            => 'MEDIUMTEXT NULL DEFAULT NULL',
            'resolution_payload' => 'TEXT NULL DEFAULT NULL',
            // THE TITLE, IN ITS OWN PAIR OF COLUMNS. Plain mode fills
            // `title`, encrypted mode fills `title_payload` -- the same
            // split every other field of a note already follows. It is a
            // second envelope rather than a field of the note's own,
            // exactly like the resolution and for the same reason: it is
            // written LATER, by somebody else, and folding it in would
            // mean re-encrypting a remark nobody is allowed to rewrite.
            'title'         => 'VARCHAR(' . (int) $c['max_title_length'] . ") NOT NULL DEFAULT ''",
            'title_payload' => 'TEXT NULL DEFAULT NULL',
            // Resolution, plain part.
            'resolved_at'      => 'DATETIME NULL DEFAULT NULL',
            'resolved_by'      => 'VARCHAR(' . (int) $c['max_author_length'] . ") NOT NULL DEFAULT ''",
            'resolved_version' => 'VARCHAR(' . (int) $c['max_version_length'] . ") NOT NULL DEFAULT ''",
            'created_at'       => "DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00' COMMENT 'UTC, written by PHP'",
            'reply_to'         => 'INT UNSIGNED NULL DEFAULT NULL',
        );
    }

    /**
     * The indexes, same single-source principle as the columns.
     *
     * `idx_project_index` carries EVERY service read: the server never reads
     * other than "this project, this page". `idx_page` now serves only the
     * backfill of a 1.2.0 database and the sort of the export in plain mode; it
     * is kept because it already exists on the databases in service and one
     * index fewer pays nothing back.
     */
    private function expectedIndexes()
    {
        return array(
            'idx_project_index' => '`project`, `page_index`',
            'idx_page'          => '`page`',
            'idx_reply_to'      => '`reply_to`',
        );
    }

    /**
     * The schema, in one single place: it serves to create the table, to
     * COMPLETE it if it comes from an earlier version, AND to dictate it to an
     * administrator if either is refused.
     *
     * The list of columns lives in expectedColumns() and nowhere else. That is
     * what makes the catch-up reliable: a column added at creation and
     * forgotten in the update is precisely the defect that made a feature
     * unreachable on a database already in service. Here, forgetting is not
     * possible -- there is only one list.
     *
     * Design decisions recorded here:
     *  - `reply_to` carries the reply relation, one single depth. A reply is a
     *    note like any other; that is what avoids a second table and a second
     *    code path.
     *  - `selector`, `fingerprint` and `excerpt` are the THREE anchors that let
     *    the annotated element be found again after the site evolves. None is
     *    reliable alone: a selector breaks at the first inserted block, a
     *    fingerprint of classes breaks when the styling is redone, a text
     *    excerpt breaks at the next copy edit. Together they let the client
     *    degrade instead of losing the note. In encrypted mode they travel in
     *    the envelope and these three columns stay empty: the server never uses
     *    them anyway.
     *  - `created_at` is a DATETIME in UTC, written by PHP.
     *  - EVERY column carries a default value, including those that cannot be
     *    empty in practice. That is not laxity: a NOT NULL column with no
     *    default cannot be ADDED to a table that already holds rows, and the
     *    catch-up would fail where it is useful.
     *  - no foreign key constraint on reply_to: nothing is ever deleted, and a
     *    constraint refused by the user's rights would fail the whole creation
     *    for no gain.
     *  - `id` stays a counter GLOBAL to the server, not per project. A thin but
     *    real leak: between two notes of the same project, the gap in ids says
     *    how many notes all the other projects have written. Kept, because
     *    fixing it would need a counter to maintain with no race between two
     *    simultaneous writes (FORMAT.md section 8.7).
     */
    private function createSql()
    {
        $lines = array('  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT');
        foreach ($this->expectedColumns() as $name => $definition) {
            $lines[] = '  `' . $name . '` ' . $definition;
        }
        $lines[] = '  PRIMARY KEY (`id`)';
        foreach ($this->expectedIndexes() as $name => $columns) {
            $lines[] = '  KEY `' . $name . '` (' . $columns . ')';
        }

        return "CREATE TABLE IF NOT EXISTS `" . $this->table . "` (\n"
            . implode(",\n", $lines) . "\n"
            . ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    }

    /**
     * The rate counter table.
     *
     * It is in the DATABASE and not on disk, for the same reason as everything
     * else: the tool writes no file, there is neither a shared cache nor a shell
     * on this kind of hosting, and a counter in process memory counts nothing at
     * all behind several PHP processes.
     *
     * FIXED window, not sliding: a sliding window means keeping a timestamp per
     * event, hence one row per write -- a counter that grows faster than what it
     * protects.
     */
    private function createRateSql()
    {
        return "CREATE TABLE IF NOT EXISTS `" . $this->rateTable . "` (\n"
            . "  `counter_key` VARCHAR(64) NOT NULL,\n"
            . "  `window_index` INT UNSIGNED NOT NULL,\n"
            . "  `hits` INT UNSIGNED NOT NULL DEFAULT 0,\n"
            . "  PRIMARY KEY (`counter_key`, `window_index`)\n"
            . ") ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;";
    }

    /**
     * Counts one event and returns the total reached in the current window.
     *
     * The key is already a digest (see rate-limit.php): this method does not
     * know what it is counting, and that is intended -- it must not become the
     * place where policy is decided.
     *
     * The increment and the read are two queries. Two simultaneous reviewers can
     * therefore read the same total and both go one notch over the limit: this
     * is rate limiting, not a till lock, and going one over changes nothing
     * about what it protects.
     *
     * @return int the count after the increment
     */
    public function consumeRate($key, $window)
    {
        $this->ensureRateTable();
        $pdo = $this->pdo();

        $req = $pdo->prepare(
            "INSERT INTO `" . $this->rateTable . "` (`counter_key`, `window_index`, `hits`) "
            . "VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE `hits` = `hits` + 1");
        $req->execute(array((string) $key, (int) $window));

        $read = $pdo->prepare(
            "SELECT `hits` FROM `" . $this->rateTable . "` "
            . "WHERE `counter_key` = ? AND `window_index` = ?");
        $read->execute(array((string) $key, (int) $window));
        $count = $read->fetchColumn();

        // Opportunistic housekeeping: one chance in fifty, and only on windows
        // already past. There is no scheduled task on this kind of hosting; a
        // counter table that never empties would end up weighing more than the
        // notes.
        if (mt_rand(1, 50) === 1) {
            try {
                $pdo->prepare("DELETE FROM `" . $this->rateTable . "` WHERE `window_index` < ?")
                    ->execute(array((int) $window - 2));
            } catch (PDOException $e) {
                ap_log('cannot clean up the counters : ' . $e->getMessage());
            }
        }

        return $count === false ? 1 : (int) $count;
    }

    /** @var bool */
    private $rateTableEnsured = false;

    private function ensureRateTable()
    {
        if ($this->rateTableEnsured) {
            return;
        }
        try {
            $this->pdo()->exec($this->createRateSql());
        } catch (PDOException $e) {
            ap_log('rate table creation refused : ' . $e->getMessage());
            throw new ApFailure(
                "The rate limiting table could not be prepared.\n"
                . "To pass on to the administrator -- exact SQL to run once:\n\n"
                . $this->createRateSql() . "\n",
                503, $e);
        }
        $this->rateTableEnsured = true;
    }

    /**
     * One note of a project, by its id, or null.
     *
     * The project is in the WHERE clause and not checked afterwards: a note of
     * another project must be NOT FOUND, not "found then refused". The
     * difference shows from the outside -- the second form answers the question
     * "does this number exist elsewhere".
     */
    public function note($id, $project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            "SELECT * FROM `" . $this->table . "` WHERE `id` = ? AND `project` = ? LIMIT 1");
        $req->execute(array((int) $id, (string) $project));
        $row = $req->fetch();
        return $row === false ? null : $this->normalise($row);
    }

    /**
     * The notes of one page, replies nested under their parent.
     *
     * One single query: the parents and the replies of the page come out
     * together and we assemble them in memory. Two queries would open the door
     * to a reply that arrived in between and is attached to nothing.
     *
     * Grouping is done by `page_index` IN BOTH MODES. In plain mode the `page`
     * column additionally carries the readable path, but it is never used to
     * search: a second code path would have diverged, and it is the encrypted
     * one -- the least exercised -- that would have diverged first.
     */
    public function byPage($project, $index)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            "SELECT * FROM `" . $this->table . "` "
            . "WHERE `project` = ? AND `page_index` = ? ORDER BY `id` ASC");
        $req->execute(array((string) $project, (string) $index));

        $parents = array();
        $replies = array();
        foreach ($req as $row) {
            $note = $this->normalise($row);
            if ($note['reply_to'] === null) {
                $note['replies'] = array();
                $parents[$note['id']] = $note;
            } else {
                $replies[] = $note;
            }
        }
        foreach ($replies as $reply) {
            $parentId = $reply['reply_to'];
            if (isset($parents[$parentId])) {
                $parents[$parentId]['replies'][] = $reply;
            }
            // A reply whose parent is not on this page cannot exist: add()
            // forces the parent's index. If it happened anyway, we ignore it
            // here rather than invent a parent.
        }

        return array_values($parents);
    }

    /**
     * EVERY note of a project, flat, already ordered for the export.
     *
     * Returns an ITERATOR, not an array: the text export walks it note by note
     * and writes as it goes. The memory allocated therefore does not depend on
     * the number of notes, whose growth nothing bounds.
     *
     * The order groups each parent with its replies:
     *   COALESCE(reply_to, id) gives the thread, the parent's id;
     *   then the parent before its replies; then creation order.
     *
     * The sort starts with `page` THEN `page_index`, one single expression for
     * both modes: in plain mode `page` is filled and the export comes out in
     * alphabetical order of paths, exactly as in format 1; in encrypted mode
     * `page` is '' everywhere and the sort falls back on the index, whose order
     * means nothing to a human but keeps each page grouped. We did not want two
     * sorts -- the encrypted mode's would have been the less reviewed.
     *
     * The query is issued HERE and not in the generator: an unreachable database
     * must show at the call, not at the first step of the walk, that is, before
     * a single byte of response has gone out.
     *
     * TWO CONSEQUENCES OF STREAMING, to know before calling:
     *  - the result set is NOT buffered by the driver, otherwise "without
     *    loading everything into memory" would be false: the driver would
     *    already have loaded it all;
     *  - until the walk is finished, NO other query can go through on the same
     *    connection. count() and modeBreakdown() must therefore be called
     *    BEFORE.
     *
     * @return Traversable normalised notes, same keys as byPage()
     */
    public function all($project)
    {
        $this->ensureSchema();
        $options = array();
        if (defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY')) {
            $options[PDO::MYSQL_ATTR_USE_BUFFERED_QUERY] = false;
        }
        $req = $this->pdo()->prepare(
            "SELECT * FROM `" . $this->table . "` WHERE `project` = ? "
            . "ORDER BY `page` ASC, `page_index` ASC, COALESCE(`reply_to`, `id`) ASC, "
            . "(`reply_to` IS NOT NULL) ASC, `id` ASC",
            $options);
        $req->execute(array((string) $project));
        return $this->traverse($req);
    }

    /** Normalises as the walk goes, never loading everything into memory. */
    private function traverse($req)
    {
        foreach ($req as $row) {
            yield $this->normalise($row);
        }
    }

    /**
     * Number of notes of a project. Serves the export header.
     * To be called BEFORE all(), whose walk occupies the connection.
     */
    public function count($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            "SELECT COUNT(*) FROM `" . $this->table . "` WHERE `project` = ?");
        $req->execute(array((string) $project));
        return (int) $req->fetchColumn();
    }

    /**
     * How many plain notes and how many encrypted ones, for the `encryption`
     * line of the export header.
     *
     * An installation that changed its mind gives `mixed`. That case is said,
     * not hidden: a reader who only gets half the texts must know why.
     *
     * @return array array('plain' => int, 'encrypted' => int)
     */
    /**
     * What a project holds, counted and nothing else.
     *
     * THREE NUMBERS THE SERVER CAN GIVE WITHOUT READING A WORD. It has never
     * been able to decrypt a remark and never will; what it does hold is the
     * shape of the pile -- how many notes, how many still open, how many
     * distinct pages carry one. `resolved_at` is a column this server writes
     * itself, and `page_index` is a blind index: counting distinct values of it
     * says how many pages are under review without saying what any of them is.
     *
     * REPLIES ARE NOT NOTES. A thread with four answers is one remark, and a
     * count that said five would make a quiet project look busy.
     *
     * @return array{notes:int,open:int,pages:int}
     */
    public function projectTotals($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            "SELECT COUNT(*), "
            . "SUM(CASE WHEN `resolved_at` IS NULL THEN 1 ELSE 0 END), "
            . "COUNT(DISTINCT `page_index`) "
            . "FROM `" . $this->table . "` "
            . "WHERE `project` = ? AND `reply_to` IS NULL");
        $req->execute(array((string) $project));
        $row = $req->fetch(PDO::FETCH_NUM);
        if (!$row) {
            return array('notes' => 0, 'open' => 0, 'pages' => 0);
        }
        return array(
            'notes' => (int) $row[0],
            /* SUM over no rows is NULL, not 0, in both engines. */
            'open'  => (int) $row[1],
            'pages' => (int) $row[2],
        );
    }

    public function modeBreakdown($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            "SELECT `mode`, COUNT(*) FROM `" . $this->table . "` "
            . "WHERE `project` = ? GROUP BY `mode`");
        $req->execute(array((string) $project));
        $out = array('plain' => 0, 'encrypted' => 0);
        foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
            // Mode absent or empty: the row comes from format 1, it counts as
            // `plain`. Unknown mode: counted with the plain ones for THIS
            // statistic only; it is the export producer that skips the row and
            // says so.
            $key = ((string) $row[0] === 'encrypted') ? 'encrypted' : 'plain';
            $out[$key] += (int) $row[1];
        }
        return $out;
    }

    /**
     * BACKFILL -- the paths still without a page index, for this project.
     *
     * These are the format-1 rows: the path is there in the clear, the index did
     * not exist. The server enumerates them; it cannot compute their index,
     * which descends from the key.
     *
     * @return array distinct paths
     */
    public function pagesWithoutIndex($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            "SELECT DISTINCT `page` FROM `" . $this->table . "` "
            . "WHERE `project` = ? AND `page_index` = '' AND `page` <> '' "
            . "ORDER BY `page` ASC");
        $req->execute(array((string) $project));
        $pages = array();
        foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
            $pages[] = (string) $row[0];
        }
        return $pages;
    }

    /**
     * BACKFILL -- sets the page index on the rows of a given path.
     *
     * Touches ONLY the rows that have none: the operation is idempotent, and a
     * client that replays the backfill cannot rewrite the index of a recent
     * note. That is the only guard that matters here -- a wrong index would make
     * a note disappear from its page without a word.
     *
     * The `format` column moves to 2 at the same time, and that is not cosmetic:
     * a row that carries a page index is no longer a format-1 row, since format
     * 1 did not know that column. Its `mode` stays empty, which means `plain` --
     * it really was written in the clear, and nothing we have just done changes
     * that.
     *
     * @return int number of rows touched
     */
    public function assignIndex($project, $page, $index)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            "UPDATE `" . $this->table . "` SET `page_index` = ?, `format` = ? "
            . "WHERE `project` = ? AND `page` = ? AND `page_index` = ''");
        $req->execute(array((string) $index, AP_FORMAT, (string) $project, (string) $page));
        return $req->rowCount();
    }

    /**
     * State of the storage, for the diagnostic -- and WITH NO EFFECT WHATEVER.
     *
     * The diagnostic must question the database; it therefore goes through here,
     * like everything else. That is the condition for "one single place talks to
     * the database" to stay true.
     *
     * We create nothing, attach nothing, complete nothing: a diagnostic that
     * provisions no longer diagnoses, it repairs, and hides exactly what one
     * came to measure. That is why this method never calls ensureSchema().
     *
     * Never throws: a state, even a bad one, is an answer.
     *
     * @return array
     */
    public function state()
    {
        $state = array(
            'connection'         => false,
            'engine'             => null,
            'table'              => $this->table,
            'table_present'      => null,
            'missing_columns'    => null,
            'missing_indexes'    => null,
            'notes'              => null,
            'without_project'    => null,
            'without_index'      => null,
            'rate_table'         => $this->rateTable,
            'rate_table_present' => null,
            'message'            => null,
        );

        try {
            $pdo = $this->pdo();
            $state['connection'] = true;
            $state['engine'] = (string) $pdo->query('SELECT VERSION()')->fetchColumn();

            // information_schema rather than SHOW TABLES: this form accepts a
            // prepared parameter without depending on SHOW being supported by
            // the prepared statement protocol.
            $req = $pdo->prepare(
                'SELECT COUNT(*) FROM information_schema.tables '
                . 'WHERE table_schema = DATABASE() AND table_name = ?');
            $req->execute(array($this->table));
            $state['table_present'] = ((int) $req->fetchColumn()) > 0;

            $req->execute(array($this->rateTable));
            $state['rate_table_present'] = ((int) $req->fetchColumn()) > 0;

            if ($state['table_present']) {
                // The COLUMNS, and not only the table. The diagnostic announced
                // "operational" on an incomplete table while an action was
                // failing with a 500: it answered a question next to the one it
                // was asked.
                $present = $this->presentColumns();
                if ($present !== null) {
                    $missing = array();
                    foreach ($this->expectedColumns() as $name => $definition) {
                        if (!isset($present[strtolower($name)])) {
                            $missing[] = $name;
                        }
                    }
                    $state['missing_columns'] = $missing;
                }
                $presentIdx = $this->presentIndexes();
                if ($presentIdx !== null) {
                    $missing = array();
                    foreach ($this->expectedIndexes() as $name => $columns) {
                        if (!isset($presentIdx[strtolower($name)])) {
                            $missing[] = $name;
                        }
                    }
                    $state['missing_indexes'] = $missing;
                }
                $state['notes'] = (int) $pdo
                    ->query("SELECT COUNT(*) FROM `" . $this->table . "`")
                    ->fetchColumn();

                // What is left to backfill. These two numbers are the only way,
                // from a distance, to know that a 1.2.0 database has been caught
                // up for its columns but not for its content.
                if (is_array($state['missing_columns'])
                    && !in_array('project', $state['missing_columns'], true)) {
                    $state['without_project'] = (int) $pdo
                        ->query("SELECT COUNT(*) FROM `" . $this->table . "` WHERE `project` = ''")
                        ->fetchColumn();
                }
                if (is_array($state['missing_columns'])
                    && !in_array('page_index', $state['missing_columns'], true)) {
                    $state['without_index'] = (int) $pdo
                        ->query("SELECT COUNT(*) FROM `" . $this->table . "` WHERE `page_index` = ''")
                        ->fetchColumn();
                }
            }
        } catch (ApFailure $e) {
            $state['message'] = $e->getMessage();
        } catch (PDOException $e) {
            ap_log('diagnostic : ' . $e->getMessage());
            $state['message'] = "The database server refused the query. "
                . "Detail truncated in the PHP error log.";
        }

        return $state;
    }

    /**
     * WHAT THE DIAGNOSTIC SAYS OF THE STORAGE -- and the entry point knows
     * nothing else about it.
     *
     * Exists for a design reason, not for convenience: "one single place talks
     * to the database" was false as long as api.php itself named pdo_mysql,
     * database.host, database.password and table_prefix. Replacing this file
     * with a file store would have left a diagnostic describing a storage that
     * had gone. Here, the entry point displays "key value" pairs without
     * knowing what they designate.
     *
     * NO CREDENTIAL VALUE COMES OUT OF IT, ever: we say where it comes from and
     * whether it is readable. Neither its content, nor its length -- the length
     * of a password is not nothing.
     *
     * Never throws: a state, even a bad one, is an answer.
     *
     * @return array list of array($key, $value). An empty $key = a blank line.
     */
    public function diagnosticLines()
    {
        $lines = array();
        $db = isset($this->config['database']) && is_array($this->config['database'])
            ? $this->config['database'] : array();

        // The state is read FIRST, because it decides what may be printed below.
        $state = $this->state();

        // The host and the port are not secrets, but they are not nothing
        // either: on shared hosting the database host names the hosting
        // company, and this endpoint is public and unauthenticated. The reason
        // for printing them was always "it saves whoever is diagnosing a round
        // trip" -- and whoever is diagnosing is looking at a connection that
        // FAILED. When it succeeded, the host has already proved itself and
        // printing it only tells the world where the site is hosted.
        //
        // So: in full when the connection failed, withheld when it worked. The
        // user and the password are never shown either way.
        $public = $state['connection'] ? array() : array('host' => true, 'port' => true);
        foreach (array('host', 'port', 'name', 'user', 'password') as $key) {
            $value = isset($db[$key]) ? $db[$key] : null;
            if ($state['connection'] && ($key === 'host' || $key === 'port')) {
                $line = ($value === null || $value === '')
                    ? 'not in the configuration'
                    : 'declared -- shown only when the connection fails';
            } else {
                $line = ap_describe_configured_value(
                    $value, 'database.' . $key, !isset($public[$key]));
            }
            $lines[] = array('storage.' . $key, $line);
        }
        $lines[] = array('storage.table', $this->table);
        $lines[] = array('storage.rate_table', $this->rateTable);
        $lines[] = array('', '');

        $lines[] = array('storage.connection', $state['connection'] ? 'SUCCEEDED' : 'FAILED');
        if ($state['engine'] !== null) {
            $lines[] = array('storage.engine', $state['engine']);
        }
        if ($state['table_present'] !== null) {
            $lines[] = array('storage.table_present',
                $state['table_present'] ? 'yes' : 'NO');
        }
        if ($state['rate_table_present'] !== null) {
            $lines[] = array('storage.rate_table_present',
                $state['rate_table_present'] ? 'yes' : 'NO (created on first need)');
        }
        if (is_array($state['missing_columns'])) {
            $lines[] = array('storage.missing_columns',
                $state['missing_columns']
                    ? implode(', ', $state['missing_columns'])
                    : 'none');
        }
        if (is_array($state['missing_indexes'])) {
            $lines[] = array('storage.missing_indexes',
                $state['missing_indexes']
                    ? implode(', ', $state['missing_indexes'])
                    : 'none');
        }
        if ($state['notes'] !== null) {
            $lines[] = array('storage.notes', $state['notes']);
        }
        if ($state['without_project'] !== null) {
            $lines[] = array('backfill.notes_without_project', $state['without_project']);
        }
        if ($state['without_index'] !== null) {
            $lines[] = array('backfill.notes_without_index', $state['without_index']);
        }
        if ($state['message'] !== null) {
            $lines[] = array('', '');
            $lines[] = array('', $state['message']);
        }
        $lines[] = array('', '');

        if (!$state['connection']) {
            $lines[] = array('verdict',
                'the storage is UNREACHABLE: no note can be saved.');
        } elseif ($state['table_present'] === false) {
            $lines[] = array('verdict',
                'storage reachable, table missing: it will be created at the first note.');
        } elseif (is_array($state['missing_columns']) && $state['missing_columns']) {
            $lines[] = array('verdict',
                'table INCOMPLETE (created by an earlier version): it will be completed '
                . 'at the next service call -- the format-1 columns renamed, the missing '
                . 'ones added -- or the message will say why not.');
        } elseif ($state['without_index']) {
            $lines[] = array('verdict',
                'operational, but ' . $state['without_index'] . ' format-1 note(s) have '
                . 'no page index yet: they come out of ?action=text but do not group '
                . 'under their page. Run the backfill from the client.');
        } else {
            $lines[] = array('verdict', 'operational.');
        }

        return $lines;
    }

    /**
     * Saves a note (or a reply) and returns the created note, as it was SAVED --
     * never as it was sent. The client displays what the server says, never its
     * own assumed local state: two reviewers cannot each believe they are right.
     *
     * ONE SINGLE INSERT FOR BOTH MODES. The columns not concerned receive the
     * empty string; input.php has already guaranteed that one mode does not fill
     * the other's columns.
     */
    public function add(array $note)
    {
        $this->ensureSchema();

        // UTC, by PHP. See this file's header.
        $createdAt = gmdate('Y-m-d H:i:s');

        $req = $this->pdo()->prepare(
            "INSERT INTO `" . $this->table . "` "
            . "(`project`, `page_index`, `format`, `mode`, "
            . "`page`, `selector`, `fingerprint`, `excerpt`, `author`, `text`, "
            . "`version`, `environment`, `viewport`, `payload`, "
            . "`created_at`, `reply_to`) "
            . "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        $req->execute(array(
            $note['project'],
            $note['page_index'],
            (int) $note['format'],
            $note['mode'],
            $note['page'],
            $note['selector'],
            $note['fingerprint'],
            $note['excerpt'],
            $note['author'],
            $note['text'],
            $note['version'],
            $note['environment'],
            $note['viewport'],
            $note['payload'],
            $createdAt,
            $note['reply_to'] === null ? null : (int) $note['reply_to'],
        ));

        return $this->note((int) $this->pdo()->lastInsertId(), $note['project']);
    }

    /**
     * Marks a note resolved, or undoes that mark.
     *
     * We NEVER delete a note: a remark one erases is a remark one can no longer
     * contradict. It moves into history, from where it can come back out if the
     * fix turns out to be incomplete.
     *
     * `version` is the one the fix SHIPS IN. It can therefore name a build that
     * is not online yet: it is the client that compares with the current version
     * to tell "fixed" from "fixed and deployed".
     *
     * In encrypted mode the fixer's name and the version are payload too: they
     * go into a SECOND envelope. It has its own nonce and it is written later, by
     * somebody else, often from another machine -- melting it into the note's
     * envelope would force re-encrypting a remark nobody is allowed to rewrite.
     *
     * Reopening clears both forms at once: it is the same information under two
     * modes, and a mixed database must not keep half of a cancelled resolution.
     */
    /**
     * Expires whole threads whose LAST message is older than $days.
     *
     * A thread and not a note: cutting a reply off its remark would leave the
     * reader a fragment nobody can situate, and cutting an old remark that is
     * still being answered would erase a live conversation. The thread is dated
     * by its most recent message, so a discussion stays as long as it lives.
     *
     * NOBODY CHOOSES. That is what keeps the append-only promise honest: no
     * moderation, no takedown, no "this one goes". Age, and nothing else.
     *
     * @param int $days 0 disables it entirely -- and it is the default.
     * @return int rows removed
     */
    public function expireOlderThan($days)
    {
        $days = (int) $days;
        if ($days <= 0) {
            return 0;
        }

        // The cutoff is computed by PHP in UTC, like every other date here, and
        // never by the SQL engine: the two timezones are not aligned by default,
        // and an expiry running hours off would be invisible until it had eaten
        // something it should not have.
        $cutoff = gmdate('Y-m-d H:i:s', time() - ($days * 86400));
        $table  = $this->table();

        // COALESCE(reply_to, id) is the thread's root: a remark is its own root.
        // The derived table is not decoration -- MySQL refuses to DELETE from a
        // table named directly in the subquery.
        $sql = "DELETE FROM `" . $table . "` WHERE COALESCE(`reply_to`, `id`) IN ("
             . "SELECT `root` FROM (SELECT COALESCE(`reply_to`, `id`) AS `root` "
             . "FROM `" . $table . "` GROUP BY COALESCE(`reply_to`, `id`) "
             . "HAVING MAX(`created_at`) < ?) AS `expired`)";

        try {
            $req = $this->pdo()->prepare($sql);
            $req->execute(array($cutoff));
            return (int) $req->rowCount();
        } catch (PDOException $e) {
            // Housekeeping must never fail a write. A relay that refused notes
            // because its own cleanup stumbled would be worse than one that
            // grows.
            ap_log('retention: ' . $e->getMessage());
            return 0;
        }
    }

    public function resolve($id, $project, $by, $version, $resolutionPayload, $resolved = true)
    {
        $this->ensureSchema();
        if (!$resolved) {
            $this->pdo()->prepare(
                "UPDATE `" . $this->table . "` SET `resolved_at` = NULL, "
                . "`resolved_by` = '', `resolved_version` = '', `resolution_payload` = '' "
                . "WHERE `id` = ? AND `project` = ?")
                ->execute(array((int) $id, (string) $project));
            return $this->note($id, $project);
        }
        $this->pdo()->prepare(
            "UPDATE `" . $this->table . "` SET `resolved_at` = ?, "
            . "`resolved_by` = ?, `resolved_version` = ?, `resolution_payload` = ? "
            . "WHERE `id` = ? AND `project` = ?")
            ->execute(array(gmdate('Y-m-d H:i:s'), (string) $by, (string) $version,
                            (string) $resolutionPayload, (int) $id, (string) $project));
        return $this->note($id, $project);
    }


    /**
     * Writes the title of a remark, or clears it.
     *
     * ONE FIELD, ITS OWN ACTION, AND NO OTHER FIELD REACHABLE. The temptation
     * was an "update note" action taking whatever is sent; that would make a
     * remark rewritable by anything holding the key, which is the one thing
     * this store must never allow. A note's own envelope is written once, at
     * creation, and nothing here can touch it.
     *
     * REPLACEABLE, unlike the remark itself: a title is a description of a
     * thing, not the thing. A better one may be written later, and an empty one
     * takes the title off -- the row is left exactly as it was before anybody
     * titled it, which is a state the reader already understands.
     *
     * Both forms are written together for the same reason resolve() clears
     * both: it is one piece of information under two modes, and a mixed
     * database must not end up carrying a plain title beside an encrypted one
     * that says something else.
     */
    public function setTitle($id, $project, $title, $titlePayload)
    {
        $this->ensureSchema();
        $this->pdo()->prepare(
            "UPDATE `" . $this->table . "` SET `title` = ?, `title_payload` = ? "
            . "WHERE `id` = ? AND `project` = ?")
            ->execute(array((string) $title, (string) $titlePayload,
                            (int) $id, (string) $project));
        return $this->note($id, $project);
    }

    /**
     * The single shape of a note, whatever the source.
     * The types come out of here already right: the rest of the code no longer
     * has to wonder whether `reply_to` is the string "0" or the integer 0.
     *
     * All the keys are ALWAYS present, even empty. A reader testing isset() must
     * not confuse "old note, no context" with "field forgotten by the server".
     */
    private function normalise(array $row)
    {
        return array(
            'id'        => (int) $row['id'],
            // Grouping. `format` absent or zero means 1: the row comes from the
            // original tool. An empty `mode` means plain, for the same reason --
            // and it is the reader, not the column, that interprets it.
            'project'    => isset($row['project']) ? (string) $row['project'] : '',
            'page_index' => isset($row['page_index']) ? (string) $row['page_index'] : '',
            'format'     => isset($row['format']) && (int) $row['format'] > 0
                            ? (int) $row['format'] : 1,
            'mode'       => isset($row['mode']) && (string) $row['mode'] !== ''
                            ? (string) $row['mode'] : 'plain',
            'page'        => (string) $row['page'],
            'selector'    => (string) $row['selector'],
            'fingerprint' => (string) $row['fingerprint'],
            'excerpt'     => (string) $row['excerpt'],
            'author'      => (string) $row['author'],
            'text'        => (string) $row['text'],
            'created_at'  => ap_iso_date($row['created_at']),
            // Note-taking context. Written at save time, it was not read back in
            // the original tool: the column filled up and nobody saw it.
            // Observed on the first notes really written.
            'version'     => isset($row['version']) ? (string) $row['version'] : '',
            'environment' => isset($row['environment']) ? (string) $row['environment'] : '',
            'viewport'    => isset($row['viewport']) ? (string) $row['viewport'] : '',
            // Encrypted payload. NULL in the database (see expectedColumns) is
            // brought back HERE to the empty string, once and for all: further
            // on, nobody has to wonder whether a missing envelope is a NULL or
            // an ''.
            'payload'            => isset($row['payload']) && $row['payload'] !== null
                                    ? (string) $row['payload'] : '',
            'resolution_payload' => isset($row['resolution_payload']) && $row['resolution_payload'] !== null
                                    ? (string) $row['resolution_payload'] : '',
            'title'         => isset($row['title']) ? (string) $row['title'] : '',
            'title_payload' => isset($row['title_payload']) && $row['title_payload'] !== null
                               ? (string) $row['title_payload'] : '',
            // Resolution. `resolved_version` is the version of the site the fix
            // SHIPS IN: it is what tells whether the fix is already online, or
            // only promised.
            'resolved_at'      => isset($row['resolved_at']) && $row['resolved_at'] !== null
                                  ? ap_iso_date($row['resolved_at']) : null,
            'resolved_by'      => isset($row['resolved_by']) ? (string) $row['resolved_by'] : '',
            'resolved_version' => isset($row['resolved_version']) ? (string) $row['resolved_version'] : '',
            'reply_to' => $row['reply_to'] === null ? null : (int) $row['reply_to'],
        );
    }
}

/**
 * UTC DATETIME from the database -> ISO 8601 with an explicit offset.
 *
 * The offset is written, never implied: that is what lets the client show the
 * reader's local time, and a human read the export without wondering which
 * timezone it is in.
 */
function ap_iso_date($utcDatetime)
{
    try {
        $d = new DateTime((string) $utcDatetime, new DateTimeZone('UTC'));
        return $d->format('c');
    } catch (Exception $e) {
        // An unreadable date is no reason to lose the note.
        return (string) $utcDatetime;
    }
}
