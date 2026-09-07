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
 *   projectTotals($p)       notes, still open, pages -- what the panel draws
 *   modeBreakdown($p)       how many plain, how many encrypted
 *   setTitle(...)           writes the title of a remark, or clears it
 *   consumeRate(...)        counts one event within a time window
 *   expireOlderThan($days)  retention: removes whole threads by age
 *   expiredTotals($p)       what retention has taken from one project
 *   serverTotals()          projects, notes and pages, across the server
 *   compact()               gives the freed space back, where that is cheap
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
 *   - taking over a database written by "in-context notes" 1.2.0 fills
 *     `project` on rows that had none, once, by itself;
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
 *  - `page_index`: the server CANNOT compute it. It is HMAC(index_key, path),
 *    and that key descends from the project key, which never leaves the
 *    browser. That is the accepted price of the blind index.
 *
 * So a format-1 row keeps an empty index for ever: it comes out of
 * `?action=text` like any other, and it does not group under its page in the
 * panel. An action once existed to let a client compute those indexes and send
 * them back; it was removed, because nothing ever drove it -- no client, no
 * package and no tool in this repository could compute that HMAC, and the
 * store that ships by default cannot hold such a row at all. What is left is
 * the part that happens by itself, above.
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

    /** @var string full name of the retention tally table */
    private $tallyTable;

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
        $this->tallyTable = $prefix . 'tally';
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

        $this->ensureTally();

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

    /**
     * Columns a live table declares NARROWER than the code now enforces.
     *
     * THE ONE THING THAT COULD STILL LOSE TEXT, MADE VISIBLE INSTEAD OF LEFT
     * TO BE MET. A table created before 2.15 carries VARCHAR(n) where this
     * version writes TEXT, and nothing rewrites it: that is safe today,
     * because those n are exactly the numbers ap_field() still refuses past.
     * It stops being safe the day one of the AP_LEN_* constants GROWS -- the
     * check would accept 900 characters that a VARCHAR(300) cannot hold, and
     * the insert would either fail with a 500 or, on a permissive sql_mode,
     * truncate in silence.
     *
     * So the comparison is made here rather than trusted to whoever changes a
     * constant: every column the code fills with a bounded field is measured
     * against the bound. Empty is the answer on a table this version created,
     * and on every table in service today.
     *
     * No effect on anything: it reads the schema and returns a list.
     *
     * @return array of readable lines, empty when everything can hold what the
     *               code accepts, or empty when the schema cannot be read
     */
    public function narrowColumns()
    {
        $bounds = array(
            'page' => AP_LEN_PAGE, 'selector' => AP_LEN_SELECTOR,
            'fingerprint' => AP_LEN_FINGERPRINT, 'excerpt' => AP_LEN_EXCERPT,
            'author' => AP_LEN_AUTHOR, 'text' => AP_LEN_TEXT,
            'version' => AP_LEN_VERSION, 'environment' => AP_LEN_ENVIRONMENT,
            'viewport' => AP_LEN_VIEWPORT, 'title' => AP_LEN_TITLE,
            'resolved_by' => AP_LEN_AUTHOR, 'resolved_version' => AP_LEN_VERSION,
            'payload' => AP_LEN_PAYLOAD,
            'resolution_payload' => AP_LEN_RESOLUTION_PAYLOAD,
            'title_payload' => AP_LEN_TITLE_PAYLOAD,
        );
        try {
            $req = $this->pdo()->prepare(
                'SELECT column_name, character_maximum_length '
                . 'FROM information_schema.columns '
                . 'WHERE table_schema = DATABASE() AND table_name = ?');
            $req->execute(array($this->table));
            $rows = $req->fetchAll(PDO::FETCH_NUM);
        } catch (PDOException $e) {
            ap_log('cannot read the column widths : ' . $e->getMessage());
            return array();
        }

        $narrow = array();
        foreach ($rows as $row) {
            $name = strtolower((string) $row[0]);
            if (!isset($bounds[$name]) || $row[1] === null) {
                continue;
            }
            $width = (int) $row[1];
            if ($width > 0 && $width < $bounds[$name]) {
                $narrow[] = $name . ' holds ' . $width . ' characters and this server '
                    . 'accepts ' . $bounds[$name];
            }
        }
        return $narrow;
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
     *   page_index = ''   -> a format-1 row, which cannot be computed here
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
            /* WHAT A HUMAN WROTE IS A TEXT COLUMN, WITH NO WIDTH AT ALL, and
               that is the answer to a question this file used to get wrong.
               These were VARCHAR(n), n coming from the same constants the
               input check uses. A width in a column looks like a second line
               of defence. It is not one -- measured, both ways, on MariaDB
               10.11:

                 - in strict mode (the default), a value longer than the
                   column is an ERROR at the insert. If the check ever accepts
                   what the column refuses, the reviewer gets a 500 and their
                   text is gone;
                 - with a permissive sql_mode -- which shared hosting sets and
                   this tool does not control -- the same value is TRUNCATED
                   and stored. 500 characters in, 300 kept, no error, nobody
                   told. A remark cut mid-sentence.

               Neither is a refusal anybody can act on. The refusal that is one
               happens before both, in ap_field(): a 400 naming the field and
               the limit. And SQLite, which is the default store and most of
               the installations, never had a width at all -- it ignores
               VARCHAR(n). So the width was not protecting anything; it was one
               store behaving differently from the other, in the direction that
               damages text.

               NULL DEFAULT NULL and not NOT NULL DEFAULT '': a TEXT column
               cannot carry a default before MySQL 8.0.13 and not at all on
               MariaDB, and a NOT NULL column with no default does not ADD
               cleanly to a table that already holds rows -- which is exactly
               where the catch-up is useful. normalise() brings NULL back to
               the empty string, once, on the way out.

               An existing table keeps its VARCHARs: nothing here rewrites a
               live table, and it does not need to, since the widths it has are
               the numbers the code still enforces. narrowColumns() below is
               what makes that safe to leave alone. */
            'page'        => 'TEXT NULL DEFAULT NULL',
            'selector'    => 'TEXT NULL DEFAULT NULL',
            'fingerprint' => 'TEXT NULL DEFAULT NULL',
            'excerpt'     => 'TEXT NULL DEFAULT NULL',
            'author'      => 'TEXT NULL DEFAULT NULL',
            'text'        => 'TEXT NULL DEFAULT NULL',
            'version'     => 'TEXT NULL DEFAULT NULL',
            'environment' => 'TEXT NULL DEFAULT NULL',
            'viewport'    => 'TEXT NULL DEFAULT NULL',
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
            'title'         => 'TEXT NULL DEFAULT NULL',
            'title_payload' => 'TEXT NULL DEFAULT NULL',
            // Resolution, plain part.
            'resolved_at'      => 'DATETIME NULL DEFAULT NULL',
            'resolved_by'      => 'TEXT NULL DEFAULT NULL',
            'resolved_version' => 'TEXT NULL DEFAULT NULL',
            'created_at'       => "DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00' COMMENT 'UTC, written by PHP'",
            'reply_to'         => 'INT UNSIGNED NULL DEFAULT NULL',
        );
    }

    /**
     * The indexes, same single-source principle as the columns.
     *
     * `idx_project_index` carries EVERY service read: the server never reads
     * other than "this project, this page". `idx_page` now serves only the
     * takeover of a 1.2.0 database and the sort of the export in plain mode; it
     * is kept because it already exists on the databases in service and one
     * index fewer pays nothing back.
     */
    private function expectedIndexes()
    {
        return array(
            'idx_project_index' => '`project`, `page_index`',
            /* `idx_page` IS GONE, and it is not a loss: no query of this file
               has ever filtered on `page`. It served the export's ORDER BY,
               which does not use it -- EXPLAIN on 14,000 rows says `type: ALL,
               Using filesort` with the index in place, because the sort is on
               five expressions and no index covers them. It cannot survive
               `page` becoming a TEXT column anyway: MySQL refuses an index on
               a TEXT without a prefix length, and a prefix index would serve
               that sort no better than none.
               A table that already carries it keeps it -- the catch-up adds
               what is missing and drops nothing, which is the right way round
               for something running on somebody else's data. */
            'idx_reply_to'      => '`reply_to`',
            /* THE ONE THE PANEL WAITS ON. projectTotals() runs on EVERY load of
               an annotated page -- three counts over one project -- and the
               index above stops at `page_index`, so the engine read the rows
               to see `reply_to` and `resolved_at`. Measured on 50,000 notes:
               1,096 ms, the optimiser giving up on the index and scanning the
               table; 15.6 ms with this one, which answers from the index
               alone. It costs about 3% of the table. */
            'idx_project_totals' => '`project`, `reply_to`, `resolved_at`, `page_index`',
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
        $pdo = $this->pdo();

        /* UNBUFFERED IS SET ON THE CONNECTION, NOT ON THE STATEMENT, AND THAT
           IS THE WHOLE DIFFERENCE. Passed as prepare()'s third argument --
           where it had been since this method was written -- PDO_MySQL
           IGNORES it, in silence. So this walk was not a walk: the driver
           fetched the whole project into memory on execute(), before one byte
           went out, and the sentence above claiming the memory does not depend
           on the number of notes was false on MySQL.
           Measured on 50,000 rows: 40 MB as an option on prepare(), 2 MB as an
           attribute on the connection. The export of a large project fell over
           a shared host's memory_limit before it could answer.
           SQLite has no equivalent and never had the defect: its statements
           step by row. */
        $unbuffered = defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY');
        if ($unbuffered) {
            $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
        }
        $req = $pdo->prepare(
            "SELECT * FROM `" . $this->table . "` WHERE `project` = ? "
            . "ORDER BY `page` ASC, `page_index` ASC, COALESCE(`reply_to`, `id`) ASC, "
            . "(`reply_to` IS NOT NULL) ASC, `id` ASC");
        $req->execute(array((string) $project));
        return $this->traverse($req, $unbuffered);
    }

    /** Normalises as the walk goes, never loading everything into memory. */
    private function traverse($req, $unbuffered = false)
    {
        foreach ($req as $row) {
            yield $this->normalise($row);
        }
        /* THE ATTRIBUTE IS STICKY: it belongs to the connection, so anything
           asked of this store after the walk would inherit it. Put back the
           moment the walk ends -- and the walk always ends, since the export
           is the last thing that request does. */
        if ($unbuffered) {
            $this->pdo()->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
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
     * A SECOND TABLE, holding what the first one no longer holds: how many
     * remarks and how many whole pages retention has taken, per project.
     *
     * WHY IT EXISTS. `max_note_age_days` deletes; a reviewer who comes back to
     * a page they annotated in April finds nothing there and no reason. The
     * count is what turns a hole into a fact, and it is the only trace kept:
     * no text, no page, no date beyond the last sweep.
     *
     * WHY A SECOND TABLE RATHER THAN A COLUMN. A tally belongs to a PROJECT,
     * and the notes table has one row per note; the count would have had to be
     * written on every row and read from an arbitrary one. And a counter row
     * hidden among the notes would appear in the export, which is a contract.
     *
     * Created on the same lazy path as the columns, so a server that updates
     * gains it at its first call, with nothing to run by hand.
     */
    private function ensureTally()
    {
        try {
            $this->pdo()->exec($this->createTallySql());
        } catch (PDOException $e) {
            /* HOUSEKEEPING MUST NEVER COST A NOTE. Without this table the
               figures are simply absent, which the client already knows how to
               draw: it is the state of every server older than this one. */
            ap_log('tally table: ' . $e->getMessage());
        }
    }

    private function tallyTable()
    {
        return $this->tallyTable;
    }

    private function createTallySql()
    {
        return "CREATE TABLE IF NOT EXISTS `" . $this->tallyTable() . "` (\n"
            . "  `project` VARCHAR(22) NOT NULL,\n"
            . "  `expired_notes` INT UNSIGNED NOT NULL DEFAULT 0,\n"
            . "  `expired_pages` INT UNSIGNED NOT NULL DEFAULT 0,\n"
            . "  `last_sweep` DATETIME NULL DEFAULT NULL,\n"
            . "  PRIMARY KEY (`project`)\n"
            . ") ENGINE=InnoDB DEFAULT CHARSET=ascii COLLATE=ascii_bin;";
    }

    /** What was swept, per project, added to what was swept before. */
    private function recordSweep(array $perProject)
    {
        $now = gmdate('Y-m-d H:i:s');
        foreach ($perProject as $project => $counts) {
            try {
                /* ON DUPLICATE KEY, not INSERT ... ON CONFLICT: the SQLite
                   spelling is not MySQL's, and this is the only difference
                   between the two versions of this method. */
                $this->pdo()->prepare(
                    "INSERT INTO `" . $this->tallyTable() . "` "
                    . "(`project`, `expired_notes`, `expired_pages`, `last_sweep`) "
                    . "VALUES (?, ?, ?, ?) "
                    . "ON DUPLICATE KEY UPDATE "
                    . "`expired_notes` = `expired_notes` + VALUES(`expired_notes`), "
                    . "`expired_pages` = `expired_pages` + VALUES(`expired_pages`), "
                    . "`last_sweep` = VALUES(`last_sweep`)")
                    ->execute(array((string) $project, (int) $counts['notes'],
                                    (int) $counts['pages'], $now));
            } catch (PDOException $e) {
                ap_log('tally write: ' . $e->getMessage());
            }
        }
    }

    /** The tally of one project, zeroes when it has never been swept. */
    public function expiredTotals($project)
    {
        $this->ensureSchema();
        try {
            $req = $this->pdo()->prepare(
                "SELECT `expired_notes`, `expired_pages`, `last_sweep` FROM `"
                . $this->tallyTable() . "` WHERE `project` = ?");
            $req->execute(array((string) $project));
            $row = $req->fetch(PDO::FETCH_NUM);
        } catch (PDOException $e) {
            return array('notes' => 0, 'pages' => 0, 'last_sweep' => null);
        }
        if (!$row) {
            return array('notes' => 0, 'pages' => 0, 'last_sweep' => null);
        }
        return array(
            'notes' => (int) $row[0],
            'pages' => (int) $row[1],
            'last_sweep' => $row[2] === null ? null : ap_iso_date($row[2]),
        );
    }

    /**
     * WHAT THIS SERVER HOLDS ALTOGETHER, across every project.
     *
     * Answered only where the operator has asked for it to be -- see
     * `publish_server_totals` in config.php. On a relay it tells any visitor of
     * any annotated page how many teams use it, which is nobody's business but
     * the operator's; on a server holding one team's own notes it is a figure
     * that team already knows.
     */
    public function serverTotals()
    {
        $this->ensureSchema();
        try {
            /* PROJECTS COUNTED ON BOTH TABLES. A project whose every thread has
               expired has no row left among the notes, so it fell out of the
               count -- while its expired notes went on being summed below.
               Measured: a relay serving two teams showed "1 site" and "1 note
               removed by age", which reads as one team that lost a note rather
               than two teams of which one is now empty. */
            $req = $this->pdo()->query(
                "SELECT COUNT(*) FROM (SELECT `project` FROM `" . $this->table . "` "
                . "UNION SELECT `project` FROM `" . $this->tallyTable() . "`) AS `both`");
            $projects = (int) $req->fetchColumn();

            $req = $this->pdo()->query(
                "SELECT COUNT(*), COUNT(DISTINCT `page_index`) "
                . "FROM `" . $this->table . "` WHERE `reply_to` IS NULL");
            $row = $req->fetch(PDO::FETCH_NUM);
            /* AND WHAT IS NO LONGER THERE, summed over every project. A total
               that counted only what remains would shrink every night on a
               server with retention, and read as a project people are leaving.
               SUM over no rows is NULL in both engines, hence the cast. */
            $gone = $this->pdo()->query(
                "SELECT SUM(`expired_notes`), SUM(`expired_pages`) FROM `"
                . $this->tallyTable() . "`")->fetch(PDO::FETCH_NUM);
        } catch (PDOException $e) {
            return null;
        }
        if (!$row) {
            return null;
        }
        return array(
            'projects'      => $projects,
            'notes'         => (int) $row[0],
            'pages'         => (int) $row[1],
            'expired_notes' => $gone ? (int) $gone[0] : 0,
            'expired_pages' => $gone ? (int) $gone[1] : 0,
        );
    }

    /**
     * NOTHING TO DO HERE, AND THAT IS THE ANSWER, not an omission.
     *
     * InnoDB keeps the pages a delete frees and reuses them for the next rows,
     * so a table that has been swept does not grow again on what it swept. The
     * file does not shrink, and it does not need to.
     *
     * WHAT WOULD SHRINK IT is `OPTIMIZE TABLE <table>`, which rebuilds the
     * table and HOLDS IT LOCKED for the length of the rebuild. Run nightly by
     * this tool on a relay, that is a scheduled outage taken without asking, to
     * give back disk nobody was short of. Whether it is worth it, and at what
     * hour, is the database administrator's call on their own server -- so the
     * statement is named here and run by nobody.
     *
     * The SQLite store does compact, because VACUUM there costs a rewrite of a
     * file this tool owns alone, and because a SQLite file really does keep the
     * size of everything it has ever held.
     *
     * @return bool false -- nothing was done
     */
    public function compact()
    {
        return false;
    }

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

    /**
     * How many plain notes and how many encrypted ones, for the `encryption`
     * line of the export header.
     *
     * An installation that changed its mind gives `mixed`. That case is said,
     * not hidden: a reader who only gets half the texts must know why.
     *
     * @return array array('plain' => int, 'encrypted' => int)
     */
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
            'tally_table_present' => null,
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

            /* THE TALLY TOO. ensureTally() swallows its failure into the log --
               housekeeping must never cost a note -- so a host where the user
               cannot create a table gets zeroes on every screen and no reason
               anywhere. The figures then read as "nothing was ever removed",
               which is a statement, and the wrong one. */
            $req->execute(array($this->tallyTable()));
            $state['tally_table_present'] = ((int) $req->fetchColumn()) > 0;

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

                // What a taken-over 1.2.0 database still carries. These two
                // numbers are the only way, from a distance, to tell a database
                // caught up for its columns from one caught up for its content.
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
        if ($state['tally_table_present'] !== null) {
            $lines[] = array('storage.tally_table_present',
                $state['tally_table_present']
                    ? 'yes'
                    : 'NO -- what age removes is not being counted, and the panel '
                      . 'shows zeroes. Created on first need; if it never appears, '
                      . 'this user cannot create a table.');
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
            $lines[] = array('takeover.notes_without_project', $state['without_project']);
        }
        if ($state['without_index'] !== null) {
            $lines[] = array('takeover.notes_without_index', $state['without_index']);
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
                . 'no page index: they come out of ?action=text but do not group under '
                . 'their page, and nothing can compute that index here -- it is derived '
                . 'from a key this server never receives.');
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

        // What is about to go, per project, MEASURED BEFORE THE DELETE: after
        // it there is nothing left to count. A tally that cost a sweep would
        // not be worth having, so a failure here is logged and the sweep goes
        // ahead unrecorded.
        $swept = $this->sweepCounts($cutoff);

        try {
            $req = $this->pdo()->prepare($sql);
            $req->execute(array($cutoff));
            $rows = (int) $req->rowCount();
        } catch (PDOException $e) {
            // Housekeeping must never fail a write. A relay that refused notes
            // because its own cleanup stumbled would be worse than one that
            // grows.
            ap_log('retention: ' . $e->getMessage());
            return 0;
        }

        if ($rows > 0 && $swept) {
            $this->recordSweep($swept);
        }
        return $rows;
    }

    /**
     * How many threads, and how many whole pages, the cutoff is about to take
     * -- counted per project, in the units the panel already draws: a thread
     * is one note, its replies are not notes.
     *
     * A PAGE COUNTS AS GONE when every remark on it goes. The condition is the
     * same one the delete uses: the newest row on the page is older than the
     * cutoff. A page holding one thread whose reply came yesterday keeps that
     * thread, so the page stays, and so it is not counted.
     */
    private function sweepCounts($cutoff)
    {
        $table = $this->table();
        $out   = array();

        try {
            $req = $this->pdo()->prepare(
                "SELECT `project`, COUNT(*) FROM ("
                . "SELECT `project`, COALESCE(`reply_to`, `id`) AS `root`, "
                . "MAX(`created_at`) AS `last` FROM `" . $table . "` "
                . "GROUP BY `project`, COALESCE(`reply_to`, `id`)"
                . ") AS `threads` WHERE `last` < ? GROUP BY `project`");
            $req->execute(array($cutoff));
            foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
                $out[(string) $row[0]] = array('notes' => (int) $row[1], 'pages' => 0);
            }

            $req = $this->pdo()->prepare(
                "SELECT `project`, COUNT(*) FROM ("
                . "SELECT `project`, `page_index` FROM `" . $table . "` "
                . "GROUP BY `project`, `page_index` HAVING MAX(`created_at`) < ?"
                . ") AS `pages` GROUP BY `project`");
            $req->execute(array($cutoff));
            foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
                $key = (string) $row[0];
                if (!isset($out[$key])) {
                    $out[$key] = array('notes' => 0, 'pages' => 0);
                }
                $out[$key]['pages'] = (int) $row[1];
            }
        } catch (PDOException $e) {
            ap_log('tally count: ' . $e->getMessage());
            return array();
        }

        return $out;
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
            /* NULL COMES BACK AS THE EMPTY STRING, HERE AND NOWHERE ELSE.
               These columns are TEXT NULL since 2.15 -- a TEXT cannot carry a
               default on MariaDB, so the addable shape is the nullable one --
               and a row written by an older version, or added by the catch-up
               to a table that already held rows, carries NULL in them. Every
               reader downstream expects a string, and (string) null is '' :
               the cast is the conversion, and it is done once. */
            'page'        => isset($row['page']) ? (string) $row['page'] : '',
            'selector'    => isset($row['selector']) ? (string) $row['selector'] : '',
            'fingerprint' => isset($row['fingerprint']) ? (string) $row['fingerprint'] : '',
            'excerpt'     => isset($row['excerpt']) ? (string) $row['excerpt'] : '',
            'author'      => isset($row['author']) ? (string) $row['author'] : '',
            'text'        => isset($row['text']) ? (string) $row['text'] : '',
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
