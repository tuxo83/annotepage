<?php
/**
 * store-sqlite.php -- THE DEFAULT STORE: ONE FILE, NO DATABASE TO CREATE.
 *
 * Same contract as internal/store.php, method for method -- that file's header
 * is the contract, and test-end-to-end/file-store.php was already a second
 * implementation of it. This is the third, and the first one that ships.
 *
 * WHY IT IS THE DEFAULT. The most expensive step of installing this server was
 * never the code: it was "create a MySQL database, then write the credentials
 * into a file by hand". pdo_sqlite is compiled into PHP on nearly every host,
 * so the storage becomes a file the tool creates itself. MySQL stays fully
 * supported and is chosen by writing `storage => 'mysql'` -- see config.php.
 *
 * WHAT IS DIFFERENT FROM THE MySQL STORE, and none of it is hidden:
 *
 *   - THE COLUMN WIDTHS DO NOT EXIST. SQLite ignores VARCHAR(n); a text of any
 *     length goes in. The bounds of config.php are therefore applied by
 *     input.php alone, before the write, exactly as they already were -- the
 *     MySQL column was a second net, and here there is one net instead of two.
 *     Nothing accepted here would be refused there: input.php refuses first;
 *   - NO FORMAT-1 RENAME. A database written by "in-context notes" 1.2.0 is a
 *     MySQL database. No SQLite file in the world carries French column names,
 *     so the rename step of the MySQL store has nothing to do here and is not
 *     written: code that can never run is code nobody can check. Adding
 *     missing columns IS here, because a file created by an earlier version of
 *     THIS store is a real case;
 *   - ONE WRITER AT A TIME. SQLite locks the whole file for a write. WAL and a
 *     busy timeout make that invisible for a review team; it would not hold a
 *     public relay under load, and that is what `storage => 'mysql'` is for.
 *
 * WHERE THE FILE LIVES, AND THE ONE THING THAT MATTERS ABOUT IT
 *
 * A SQLite file dropped inside the web root can be FETCHED OVER HTTP. An
 * .htaccess denying it does nothing under nginx, and plenty of cheap hosting
 * is nginx. The notes are encrypted, so the damage is bounded -- but page
 * indexes, timestamps and volumes leak, and in plain mode everything leaks.
 *
 * So: install.php picks a directory OUTSIDE the document root when it can find
 * a writable one, falls back to a directory inside carrying its own .htaccess
 * and an index.php that exits, with a name that is not guessable -- and then
 * PROVES it by requesting the file's own URL over HTTP and reading the status.
 * This file's part of that bargain is small and mechanical: it creates the
 * directory with the two guard files whenever it creates the database, so a
 * path written by hand into config-local.php is guarded too.
 *
 * The guards are a fallback, not the plan. The plan is `database.file`
 * pointing outside the document root.
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

    /** @var bool */
    private $rateTableEnsured = false;

    /** @var string absolute path of the database file */
    private $file;

    /** @var string name of the notes table, prefix included */
    private $table;

    /** @var string name of the rate counter table */
    private $rateTable;

    public function __construct(array $config)
    {
        $this->config = $config;

        // Same check as the MySQL store: the prefix is the one value that
        // enters SQL without a prepared parameter, it never comes from the
        // network, and it does come from a file written by hand.
        $prefix = isset($config['table_prefix']) ? (string) $config['table_prefix'] : '';
        if (!preg_match('/^[A-Za-z0-9_]*$/', $prefix)) {
            throw new ApFailure(
                "Invalid configuration: table_prefix can only contain letters, digits "
                . "and underscores.",
                500);
        }
        $this->table     = $prefix . 'notes';
        $this->rateTable = $prefix . 'rate';
        $this->file      = self::resolveFile($config);
    }

    /**
     * The absolute path of the database file.
     *
     * `database.file` is what install.php writes, and it is the normal case.
     * It accepts the two forms every other credential accepts, so a path can
     * be read from a file dropped outside the web root like any other.
     *
     * WITHOUT IT, we still work rather than fail -- "upload it and it runs" is
     * the whole point of this store -- and the fallback is a directory whose
     * name is derived from the ABSOLUTE PATH of this installation:
     *
     *     <install>/ap-data-<16 hex of sha256(path of internal/)>/notes.sqlite
     *
     * Unguessable from outside (nobody on the network knows the server's
     * absolute paths), stable for a given installation, and guarded by the two
     * files this class writes next to it.
     *
     * THE TRAP, written down rather than discovered: MOVING THE INSTALLATION
     * CHANGES THE NAME. The old directory stays on disk with every note in it,
     * and the tool starts an empty one. The diagnostic prints the path it is
     * using, which is how you find the old one. Declaring `database.file`
     * removes the trap entirely, and install.php always declares it.
     */
    private static function resolveFile(array $config)
    {
        $db = isset($config['database']) && is_array($config['database'])
            ? $config['database'] : array();

        if (isset($db['file']) && $db['file'] !== null && $db['file'] !== '') {
            $path = ap_configured_value($db['file'], 'database.file');
            if ($path === '' || $path[0] !== '/') {
                throw new ApFailure(
                    "Invalid configuration: `database.file` must be an ABSOLUTE path.\n"
                    . "Path obtained: " . $path . "\n"
                    . "Anchor it on __DIR__, for example __DIR__ . '/../ap-data/notes.sqlite'.",
                    500);
            }
            return $path;
        }

        return dirname(__DIR__) . '/ap-data-'
            . substr(hash('sha256', __DIR__), 0, 16) . '/notes.sqlite';
    }

    /**
     * What THIS store needs. The entry point prints it without knowing what it
     * is, which is what lets the store be replaced without leaving behind a
     * diagnostic demanding an extension nobody uses any more.
     */
    public static function requiredExtensions()
    {
        return array('pdo_sqlite');
    }

    /** Name of the table, for messages aimed at the administrator. */
    public function table()
    {
        return $this->table;
    }

    /** Path of the database file, for the diagnostic and for install.php. */
    public function file()
    {
        return $this->file;
    }

    /* -- The connection --------------------------------------------------- */

    /**
     * Opens the file on first need, creating its directory and its guards.
     *
     * The missing-extension case gets ONE sentence naming what to do, because
     * it is the only failure a host can hand you here and a stack trace would
     * tell an operator nothing they can act on.
     */
    private function pdo()
    {
        if ($this->pdo !== null) {
            return $this->pdo;
        }

        if (!extension_loaded('pdo_sqlite')) {
            throw new ApFailure(
                "The PHP extension `pdo_sqlite` is missing on this server, so the "
                . "default file storage cannot open.\n"
                . "Two ways out, either is enough: ask the host to enable pdo_sqlite "
                . "for the PHP the web server runs, or switch this installation to "
                . "MySQL by writing `'storage' => 'mysql'` in "
                . "internal/config-local.php with its `database` credentials.",
                503);
        }

        $directory = dirname($this->file);
        if (!is_dir($directory)) {
            // 0700: the data belongs to the user PHP runs as and to nobody
            // else. On shared hosting the neighbours are on the same machine.
            if (!@mkdir($directory, 0700, true) && !is_dir($directory)) {
                throw new ApFailure(
                    "The notes tool cannot create its storage directory:\n"
                    . $directory . "\n"
                    . "To pass on to the administrator: grant WRITE permission on the "
                    . "parent directory to the user PHP runs as, or point "
                    . "`database.file` at a directory that is already writable.",
                    503);
            }
        }
        $this->writeGuards($directory);

        $fresh = !is_file($this->file);

        try {
            $this->pdo = new PDO('sqlite:' . $this->file, null, null, array(
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ));
        } catch (PDOException $e) {
            ap_log('sqlite open refused : ' . $e->getMessage());
            throw new ApFailure(
                "The notes database file could not be opened: your notes are NOT saved.\n"
                . "File: " . $this->file . "\n"
                . "The most common cause is a directory the user PHP runs as cannot "
                . "write to.\n"
                . "The technical detail is in the server's PHP error log.",
                503, $e);
        }

        if ($fresh) {
            // The file is the whole database. Nobody but PHP has any business
            // reading it, and the mode is set at creation rather than left to
            // whatever umask the host happens to have.
            @chmod($this->file, 0600);
        }

        // A write locks the file. Without a busy timeout, two reviewers saving
        // at the same instant give one of them "database is locked" and a lost
        // remark; five seconds is longer than any write this tool makes.
        try {
            $this->pdo->exec('PRAGMA busy_timeout = 5000');
        } catch (PDOException $e) {
            ap_log('busy_timeout refused : ' . $e->getMessage());
        }
        // WAL lets a read go through while a write is in flight. It is not
        // available on every filesystem (some network mounts refuse it), and
        // its absence costs concurrency, not correctness -- so a refusal is
        // logged and the default journal is kept.
        try {
            $this->pdo->exec('PRAGMA journal_mode = WAL');
        } catch (PDOException $e) {
            ap_log('WAL refused, default journal kept : ' . $e->getMessage());
        }

        return $this->pdo;
    }

    /**
     * The two guard files, written next to the database whenever the directory
     * is opened. Never overwritten if they are already there: an operator who
     * tightened them keeps their version.
     *
     * NEITHER OF THEM IS THE PROTECTION. The .htaccess does nothing under
     * nginx, and index.php only answers a request for the DIRECTORY, not for
     * the file inside it. The protection is the location -- outside the
     * document root -- and the proof is the HTTP request install.php makes.
     * These two exist for the installation that had nowhere else to go.
     */
    private function writeGuards($directory)
    {
        $htaccess = $directory . '/.htaccess';
        if (!is_file($htaccess)) {
            @file_put_contents($htaccess,
                "# The notes database lives here. Nothing in this directory is meant to\n"
                . "# be served. Under nginx these directives are IGNORED -- which is why\n"
                . "# the directory name is unguessable and why install.php checks the\n"
                . "# real answer over HTTP instead of trusting this file.\n"
                . "\n"
                . "<IfModule mod_authz_core.c>\n"
                . "    Require all denied\n"
                . "</IfModule>\n"
                . "\n"
                . "<IfModule !mod_authz_core.c>\n"
                . "    Order allow,deny\n"
                . "    Deny from all\n"
                . "</IfModule>\n");
        }
        $index = $directory . '/index.php';
        if (!is_file($index)) {
            @file_put_contents($index,
                "<?php\n"
                . "// Answers a request for this directory, whose listing may be enabled.\n"
                . "// It does not protect the database file next to it -- see the\n"
                . "// .htaccess. It stops a directory listing naming that file.\n"
                . "http_response_code(404);\n"
                . "header('Content-Type: text/plain; charset=utf-8');\n"
                . "echo \"404\\n\";\n");
        }
    }

    /* -- Schema ------------------------------------------------------------ */

    /**
     * Prepares the storage, in three steps and with no effect once done:
     *
     *   1. CREATE TABLE IF NOT EXISTS;
     *   2. the columns an EARLIER version of this store did not create;
     *   3. the missing indexes.
     *
     * Step 2 is the one that matters over time. There is no migration
     * mechanism on the hosting this tool targets -- no shell, no install task
     * -- so the catch-up is lazy, idempotent, and runs on every service call.
     *
     * The format-1 rename of the MySQL store is deliberately absent: see this
     * file's header.
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
            ap_log('sqlite table creation refused : ' . $e->getMessage());
            throw new ApFailure(
                "The notes table could not be prepared: your notes are NOT saved.\n"
                . "File: " . $this->file . "\n"
                . "The technical detail is in the server's PHP error log.",
                503, $e);
        }

        $present = $this->presentColumns();
        if ($present !== null) {
            $this->addMissingColumns($present);
        }
        $this->completeIndexes();

        $this->schemaEnsured = true;
    }

    /**
     * Adds the columns an earlier version of this store did not create.
     *
     * ONE STATEMENT PER COLUMN: SQLite's ALTER TABLE takes a single ADD COLUMN
     * at a time, unlike MySQL's comma-separated list. A refusal names the exact
     * SQL, because on this hosting nobody has a shell to go and look.
     */
    private function addMissingColumns(array $present)
    {
        $added = array();
        foreach ($this->expectedColumns() as $name => $definition) {
            if (isset($present[strtolower($name)])) {
                continue;
            }
            $sql = 'ALTER TABLE "' . $this->table . '" ADD COLUMN "' . $name . '" '
                 . $definition . ';';
            try {
                $this->pdo()->exec($sql);
                $added[] = $name;
            } catch (PDOException $e) {
                ap_log('sqlite column add refused : ' . $e->getMessage());
                throw new ApFailure(
                    "The notes table comes from an earlier version of the tool and a "
                    . "column is missing from it.\n"
                    . "The tool could not add it itself.\n"
                    . "To pass on to the administrator -- exact SQL to run once:\n\n"
                    . $sql . "\n",
                    503, $e);
            }
        }
        return $added;
    }

    /**
     * Adds the missing indexes.
     *
     * A FAILURE HERE IS NOT FATAL, exactly as in the MySQL store: a missing
     * index makes the queries slow, not wrong, and a review table holds
     * thousands of rows, not millions. The diagnostic says so.
     */
    private function completeIndexes()
    {
        foreach ($this->expectedIndexes() as $name => $columns) {
            $sql = 'CREATE INDEX IF NOT EXISTS "' . $name . '" ON "' . $this->table
                 . '" (' . $columns . ');';
            try {
                $this->pdo()->exec($sql);
            } catch (PDOException $e) {
                ap_log('sqlite index ' . $name . ' not created : ' . $e->getMessage());
            }
        }
    }

    /**
     * The columns, SINGLE SOURCE: creation, catch-up and diagnostic read it.
     *
     * The names, the defaults and their meaning are the MySQL store's, to the
     * letter -- they are the contract the rest of the server reads. What is not
     * carried over is the WIDTH: SQLite ignores VARCHAR(n), so the bounds of
     * config.php are enforced by input.php and only there. See the header.
     *
     * Every column carries a default, for the same reason as in the MySQL
     * store: SQLite refuses to ADD a NOT NULL column with no default to a table
     * that already holds rows -- that is, precisely where the catch-up is
     * useful.
     */
    private function expectedColumns()
    {
        return array(
            // Grouping, readable by the server in both modes.
            'project'    => "TEXT NOT NULL DEFAULT ''",
            'page_index' => "TEXT NOT NULL DEFAULT ''",
            'format'     => 'INTEGER NOT NULL DEFAULT 1',
            // '' means plain: an absent mode is what a format-1 row has.
            'mode'       => "TEXT NOT NULL DEFAULT ''",
            // Plain payload: filled in plain mode, empty in encrypted mode.
            'page'        => "TEXT NOT NULL DEFAULT ''",
            'selector'    => "TEXT NOT NULL DEFAULT ''",
            'fingerprint' => "TEXT NOT NULL DEFAULT ''",
            'excerpt'     => "TEXT NOT NULL DEFAULT ''",
            'author'      => "TEXT NOT NULL DEFAULT ''",
            'text'        => "TEXT NOT NULL DEFAULT ''",
            'version'     => "TEXT NOT NULL DEFAULT ''",
            'environment' => "TEXT NOT NULL DEFAULT ''",
            'viewport'    => "TEXT NOT NULL DEFAULT ''",
            // Encrypted payload: the other way round. NULL-able, and
            // normalise() brings NULL back to '' once and for all.
            'payload'            => 'TEXT NULL DEFAULT NULL',
            'resolution_payload' => 'TEXT NULL DEFAULT NULL',
            // Resolution, plain part.
            'resolved_at'      => 'TEXT NULL DEFAULT NULL',
            'resolved_by'      => "TEXT NOT NULL DEFAULT ''",
            'resolved_version' => "TEXT NOT NULL DEFAULT ''",
            // UTC, written by PHP and never by the engine: PHP's timezone and
            // the engine's are not aligned by default, and a note dated three
            // hours in the future would cast doubt on everything else.
            'created_at'       => "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
            'reply_to'         => 'INTEGER NULL DEFAULT NULL',
        );
    }

    /**
     * The indexes. Same three as the MySQL store, and the names carry the table
     * name in front: in SQLite an index name is unique across the whole FILE,
     * not per table, so two installations sharing one file with different
     * `table_prefix` values would collide on a bare `idx_page`.
     */
    private function expectedIndexes()
    {
        return array(
            $this->table . '_idx_project_index' => '"project", "page_index"',
            $this->table . '_idx_page'          => '"page"',
            $this->table . '_idx_reply_to'      => '"reply_to"',
        );
    }

    /**
     * `id` stays a counter GLOBAL to the file, as the MySQL AUTO_INCREMENT is:
     * between two notes of the same project, the gap in ids says how many notes
     * the other projects wrote. A thin leak, a real one, and it is reproduced
     * rather than quietly fixed -- a store more virtuous than the other would
     * make the two behave differently for a reader.
     *
     * AUTOINCREMENT, not a bare INTEGER PRIMARY KEY: without it SQLite reuses
     * the id of a deleted row, and retention does delete rows. A reused id
     * would attach an old reply to a new remark.
     */
    private function createSql()
    {
        $lines = array('  "id" INTEGER PRIMARY KEY AUTOINCREMENT');
        foreach ($this->expectedColumns() as $name => $definition) {
            $lines[] = '  "' . $name . '" ' . $definition;
        }
        return 'CREATE TABLE IF NOT EXISTS "' . $this->table . "\" (\n"
            . implode(",\n", $lines) . "\n);";
    }

    /** The rate counter table. Fixed window, same shape as the MySQL one. */
    private function createRateSql()
    {
        return 'CREATE TABLE IF NOT EXISTS "' . $this->rateTable . "\" (\n"
            . "  \"counter_key\" TEXT NOT NULL,\n"
            . "  \"window_index\" INTEGER NOT NULL,\n"
            . "  \"hits\" INTEGER NOT NULL DEFAULT 0,\n"
            . "  PRIMARY KEY (\"counter_key\", \"window_index\")\n"
            . ');';
    }

    /** Columns really present, lowercased, or null if we could not find out. */
    private function presentColumns()
    {
        try {
            $out = array();
            foreach ($this->pdo()->query('PRAGMA table_info("' . $this->table . '")') as $row) {
                $out[strtolower((string) $row['name'])] = true;
            }
            return $out;
        } catch (PDOException $e) {
            ap_log('cannot read the sqlite schema : ' . $e->getMessage());
            return null;
        }
    }

    /** Indexes really present, lowercased, or null. */
    private function presentIndexes()
    {
        try {
            $req = $this->pdo()->prepare(
                "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?");
            $req->execute(array($this->table));
            $out = array();
            foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
                $out[strtolower((string) $row[0])] = true;
            }
            return $out;
        } catch (PDOException $e) {
            ap_log('cannot read the sqlite indexes : ' . $e->getMessage());
            return null;
        }
    }

    /* -- Rate -------------------------------------------------------------- */

    private function ensureRateTable()
    {
        if ($this->rateTableEnsured) {
            return;
        }
        try {
            $this->pdo()->exec($this->createRateSql());
        } catch (PDOException $e) {
            ap_log('sqlite rate table creation refused : ' . $e->getMessage());
            throw new ApFailure(
                "The rate limiting table could not be prepared.\n"
                . "To pass on to the administrator -- exact SQL to run once:\n\n"
                . $this->createRateSql() . "\n",
                503, $e);
        }
        $this->rateTableEnsured = true;
    }

    /**
     * Counts one event and returns the total reached in the current window.
     *
     * INSERT OR IGNORE then UPDATE, and not the shorter ON CONFLICT form: that
     * one needs SQLite 3.24, and this tool is dropped onto whatever the host
     * has. These two statements work on every SQLite that ever shipped with
     * PHP, and the pair is not atomic -- which changes nothing here, exactly as
     * the MySQL store's two queries do not: this is rate limiting, not a till
     * lock, and going one notch over changes nothing about what it protects.
     */
    public function consumeRate($key, $window)
    {
        $this->ensureRateTable();
        $pdo = $this->pdo();

        $pdo->prepare('INSERT OR IGNORE INTO "' . $this->rateTable
            . '" ("counter_key", "window_index", "hits") VALUES (?, ?, 0)')
            ->execute(array((string) $key, (int) $window));
        $pdo->prepare('UPDATE "' . $this->rateTable . '" SET "hits" = "hits" + 1 '
            . 'WHERE "counter_key" = ? AND "window_index" = ?')
            ->execute(array((string) $key, (int) $window));

        $read = $pdo->prepare('SELECT "hits" FROM "' . $this->rateTable . '" '
            . 'WHERE "counter_key" = ? AND "window_index" = ?');
        $read->execute(array((string) $key, (int) $window));
        $count = $read->fetchColumn();

        // Opportunistic housekeeping, one chance in fifty and only on windows
        // already past: there is no scheduled task on this kind of hosting, and
        // a counter table that never empties ends up weighing more than the
        // notes.
        if (mt_rand(1, 50) === 1) {
            try {
                $pdo->prepare('DELETE FROM "' . $this->rateTable . '" WHERE "window_index" < ?')
                    ->execute(array((int) $window - 2));
            } catch (PDOException $e) {
                ap_log('cannot clean up the counters : ' . $e->getMessage());
            }
        }

        return $count === false ? 1 : (int) $count;
    }

    /* -- Reading ----------------------------------------------------------- */

    /**
     * One note of a project, by its id, or null. The project is in the WHERE
     * clause and not checked afterwards: a note of another project must be NOT
     * FOUND, not "found then refused".
     */
    public function note($id, $project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            'SELECT * FROM "' . $this->table . '" WHERE "id" = ? AND "project" = ? LIMIT 1');
        $req->execute(array((int) $id, (string) $project));
        $row = $req->fetch();
        return $row === false ? null : $this->normalise($row);
    }

    /**
     * The notes of one page, replies nested under their parent. One single
     * query: a reply that arrived between two queries would be attached to
     * nothing.
     *
     * Grouping is by `page_index` IN BOTH MODES, as in the MySQL store: a
     * second code path would have diverged, and the encrypted one -- the least
     * exercised -- would have diverged first.
     */
    public function byPage($project, $index)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            'SELECT * FROM "' . $this->table . '" '
            . 'WHERE "project" = ? AND "page_index" = ? ORDER BY "id" ASC');
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
            if (isset($parents[$reply['reply_to']])) {
                $parents[$reply['reply_to']]['replies'][] = $reply;
            }
            // A reply whose parent is not on this page cannot exist: add()
            // forces the parent's index. If it happened anyway we ignore it
            // rather than invent a parent.
        }

        return array_values($parents);
    }

    /**
     * EVERY note of a project, flat, already ordered for the export.
     *
     * Returns an ITERATOR: text-export.php writes as it walks, so the memory
     * allocated does not depend on the number of notes.
     *
     * THE ORDER IS THE MySQL STORE'S, expression for expression, because the
     * text export is a contract and its order is part of it. One difference is
     * unavoidable and it is here rather than hidden: SQLite sorts TEXT with a
     * plain byte comparison, MySQL with utf8mb4_unicode_ci. Two paths that
     * differ only by case or by an accent can therefore come out in a different
     * ORDER between the two stores. No note changes, no grouping changes.
     */
    public function all($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            'SELECT * FROM "' . $this->table . '" WHERE "project" = ? '
            . 'ORDER BY "page" ASC, "page_index" ASC, COALESCE("reply_to", "id") ASC, '
            . '("reply_to" IS NOT NULL) ASC, "id" ASC');
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

    /** Number of notes of a project. Serves the export header. */
    public function count($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            'SELECT COUNT(*) FROM "' . $this->table . '" WHERE "project" = ?');
        $req->execute(array((string) $project));
        return (int) $req->fetchColumn();
    }

    /**
     * How many plain notes and how many encrypted ones, for the `encryption`
     * line of the export header. An installation that changed its mind gives
     * `mixed`, and that is said rather than hidden.
     */
    public function modeBreakdown($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            'SELECT "mode", COUNT(*) FROM "' . $this->table . '" '
            . 'WHERE "project" = ? GROUP BY "mode"');
        $req->execute(array((string) $project));
        $out = array('plain' => 0, 'encrypted' => 0);
        foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
            $key = ((string) $row[0] === 'encrypted') ? 'encrypted' : 'plain';
            $out[$key] += (int) $row[1];
        }
        return $out;
    }

    /* -- Backfill ----------------------------------------------------------
       No SQLite file was ever written by "in-context notes" 1.2.0, so these
       two never have anything to do here. They are implemented anyway, and
       correctly: the contract says the store answers them, and api.php calls
       them. Answering 0 with a wrong query would be worse than answering 0
       with a right one. */

    public function pagesWithoutIndex($project)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            'SELECT DISTINCT "page" FROM "' . $this->table . '" '
            . 'WHERE "project" = ? AND "page_index" = \'\' AND "page" <> \'\' '
            . 'ORDER BY "page" ASC');
        $req->execute(array((string) $project));
        $pages = array();
        foreach ($req->fetchAll(PDO::FETCH_NUM) as $row) {
            $pages[] = (string) $row[0];
        }
        return $pages;
    }

    /**
     * Sets the page index on the rows of a given path. Touches ONLY the rows
     * that have none, so a replayed backfill cannot rewrite the index of a
     * recent note -- a wrong index would make a note disappear from its page
     * without a word.
     */
    public function assignIndex($project, $page, $index)
    {
        $this->ensureSchema();
        $req = $this->pdo()->prepare(
            'UPDATE "' . $this->table . '" SET "page_index" = ?, "format" = ? '
            . 'WHERE "project" = ? AND "page" = ? AND "page_index" = \'\'');
        $req->execute(array((string) $index, AP_FORMAT, (string) $project, (string) $page));
        return $req->rowCount();
    }

    /**
     * Attachment asked for explicitly (the backfill action).
     *
     * Nothing to attach: this store never carried a 1.2.0 database, so there
     * are no rows with an empty `project`. We return 0 rather than throw --
     * the backfill action has to be able to answer.
     */
    public function attachOrphans()
    {
        $this->ensureSchema();
        return 0;
    }

    /* -- Writing ----------------------------------------------------------- */

    /**
     * Saves a note (or a reply) and returns it AS IT WAS SAVED, never as it was
     * sent: the client displays what the server says, so two reviewers cannot
     * each believe they are right.
     *
     * ONE SINGLE INSERT FOR BOTH MODES. The columns the mode does not concern
     * receive the empty string; input.php has already guaranteed that one mode
     * does not fill the other's columns.
     */
    public function add(array $note)
    {
        $this->ensureSchema();

        // UTC, by PHP. See expectedColumns().
        $createdAt = gmdate('Y-m-d H:i:s');

        $req = $this->pdo()->prepare(
            'INSERT INTO "' . $this->table . '" '
            . '("project", "page_index", "format", "mode", '
            . '"page", "selector", "fingerprint", "excerpt", "author", "text", '
            . '"version", "environment", "viewport", "payload", '
            . '"created_at", "reply_to") '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

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
     * Marks a note resolved, or undoes that mark. A note is NEVER deleted: a
     * remark one erases is a remark one can no longer contradict.
     *
     * Reopening clears both forms at once -- the plain columns and the second
     * envelope -- because it is the same information under two modes, and a
     * mixed database must not keep half of a cancelled resolution.
     */
    public function resolve($id, $project, $by, $version, $resolutionPayload, $resolved = true)
    {
        $this->ensureSchema();
        if (!$resolved) {
            $this->pdo()->prepare(
                'UPDATE "' . $this->table . '" SET "resolved_at" = NULL, '
                . '"resolved_by" = \'\', "resolved_version" = \'\', "resolution_payload" = \'\' '
                . 'WHERE "id" = ? AND "project" = ?')
                ->execute(array((int) $id, (string) $project));
            return $this->note($id, $project);
        }
        $this->pdo()->prepare(
            'UPDATE "' . $this->table . '" SET "resolved_at" = ?, '
            . '"resolved_by" = ?, "resolved_version" = ?, "resolution_payload" = ? '
            . 'WHERE "id" = ? AND "project" = ?')
            ->execute(array(gmdate('Y-m-d H:i:s'), (string) $by, (string) $version,
                            (string) $resolutionPayload, (int) $id, (string) $project));
        return $this->note($id, $project);
    }

    /**
     * Expires whole threads whose LAST message is older than $days.
     *
     * A thread and not a note, dated by its most recent message: cutting a
     * reply off its remark leaves a fragment nobody can situate, and cutting an
     * old remark still being answered erases a live conversation. NOBODY
     * CHOOSES which -- age, and nothing else. That is what keeps the
     * append-only promise honest.
     *
     * Housekeeping must never fail a write, so a database error here is logged
     * and swallowed: a server that refused a remark over its own cleanup would
     * be worse than one that grows.
     */
    public function expireOlderThan($days)
    {
        $days = (int) $days;
        if ($days <= 0) {
            return 0;
        }

        // The cutoff is computed by PHP in UTC, like every other date here.
        $cutoff = gmdate('Y-m-d H:i:s', time() - ($days * 86400));
        $table  = $this->table;

        // COALESCE(reply_to, id) is the thread's root: a remark is its own
        // root. SQLite has no objection to naming the table in the subquery,
        // unlike MySQL, so no derived table is needed here.
        $sql = 'DELETE FROM "' . $table . '" WHERE COALESCE("reply_to", "id") IN ('
             . 'SELECT COALESCE("reply_to", "id") FROM "' . $table . '" '
             . 'GROUP BY COALESCE("reply_to", "id") '
             . 'HAVING MAX("created_at") < ?)';

        try {
            $req = $this->pdo()->prepare($sql);
            $req->execute(array($cutoff));
            return (int) $req->rowCount();
        } catch (PDOException $e) {
            ap_log('retention: ' . $e->getMessage());
            return 0;
        }
    }

    /* -- Diagnostic --------------------------------------------------------
       WITH NO EFFECT WHATEVER. A diagnostic that provisions no longer
       diagnoses, it repairs, and hides exactly what one came to measure --
       which is why nothing below calls ensureSchema(). It never throws
       either: a state, even a bad one, is an answer. */

    public function state()
    {
        $state = array(
            'connection'         => false,
            'engine'             => null,
            'file'               => $this->file,
            'file_present'       => is_file($this->file),
            'directory_writable' => is_dir(dirname($this->file))
                                    && is_writable(dirname($this->file)),
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

        // A diagnostic must not CREATE the database it comes looking for. When
        // the file is not there yet we say so and stop: opening it through
        // pdo() would create an empty one and the next line would report a
        // storage that this very request had just invented.
        if (!$state['file_present']) {
            if (!extension_loaded('pdo_sqlite')) {
                $state['message'] = "The PHP extension `pdo_sqlite` is missing on this "
                    . "server. Enable it, or switch to MySQL with `'storage' => 'mysql'`.";
            }
            return $state;
        }

        try {
            $pdo = $this->pdo();
            $state['connection'] = true;
            $state['engine'] = 'SQLite ' . (string) $pdo->query('SELECT sqlite_version()')->fetchColumn();

            $req = $pdo->prepare(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?");
            $req->execute(array($this->table));
            $state['table_present'] = ((int) $req->fetchColumn()) > 0;

            $req->execute(array($this->rateTable));
            $state['rate_table_present'] = ((int) $req->fetchColumn()) > 0;

            if ($state['table_present']) {
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
                    ->query('SELECT COUNT(*) FROM "' . $this->table . '"')->fetchColumn();

                if (is_array($state['missing_columns'])
                    && !in_array('project', $state['missing_columns'], true)) {
                    $state['without_project'] = (int) $pdo
                        ->query('SELECT COUNT(*) FROM "' . $this->table . '" WHERE "project" = \'\'')
                        ->fetchColumn();
                }
                if (is_array($state['missing_columns'])
                    && !in_array('page_index', $state['missing_columns'], true)) {
                    $state['without_index'] = (int) $pdo
                        ->query('SELECT COUNT(*) FROM "' . $this->table . '" WHERE "page_index" = \'\'')
                        ->fetchColumn();
                }
            }
        } catch (ApFailure $e) {
            $state['message'] = $e->getMessage();
        } catch (PDOException $e) {
            ap_log('diagnostic : ' . $e->getMessage());
            $state['message'] = "The database file refused the query. "
                . "Detail truncated in the PHP error log.";
        }

        return $state;
    }

    /**
     * WHAT THE DIAGNOSTIC SAYS OF THE STORAGE, and the entry point knows
     * nothing else about it: it prints "key value" pairs without interpreting
     * them.
     *
     * The one line worth more than all the others here is
     * `storage.inside_document_root`. It is the question this store's whole
     * design turns on, and it is answered by comparing real paths, not by
     * trusting a configuration key.
     */
    public function diagnosticLines()
    {
        $lines = array();
        $directory = dirname($this->file);

        $lines[] = array('storage.type', 'sqlite -- one file, no database server');
        $lines[] = array('storage.file', $this->file);
        $lines[] = array('storage.directory_writable',
            (is_dir($directory) && is_writable($directory))
                ? 'yes' : 'NO -- no note can be saved');
        $lines[] = array('storage.guard_htaccess',
            is_file($directory . '/.htaccess')
                ? 'present -- ignored under nginx, which is why the location matters more'
                : 'MISSING');
        $lines[] = array('storage.guard_index',
            is_file($directory . '/index.php')
                ? 'present -- answers a request for the directory itself'
                : 'MISSING');

        $inside = self::insideDocumentRoot($this->file);
        $lines[] = array('storage.inside_document_root',
            $inside === null
                ? 'unknown -- DOCUMENT_ROOT is not set for this request'
                : ($inside
                    ? 'YES -- the file has a URL. install.php proved that URL is refused; '
                      . 'if the server configuration changed since, check it again'
                    : 'no -- no URL maps to this file, which is the safe case'));
        $lines[] = array('storage.table', $this->table);
        $lines[] = array('storage.rate_table', $this->rateTable);
        $lines[] = array('', '');

        $state = $this->state();
        $lines[] = array('storage.connection', $state['connection'] ? 'SUCCEEDED' : 'FAILED');
        if ($state['engine'] !== null) {
            $lines[] = array('storage.engine', $state['engine']);
        }
        $lines[] = array('storage.file_present',
            $state['file_present'] ? 'yes' : 'NO (created at the first note)');
        if ($state['table_present'] !== null) {
            $lines[] = array('storage.table_present', $state['table_present'] ? 'yes' : 'NO');
        }
        if ($state['rate_table_present'] !== null) {
            $lines[] = array('storage.rate_table_present',
                $state['rate_table_present'] ? 'yes' : 'NO (created on first need)');
        }
        if (is_array($state['missing_columns'])) {
            $lines[] = array('storage.missing_columns',
                $state['missing_columns'] ? implode(', ', $state['missing_columns']) : 'none');
        }
        if (is_array($state['missing_indexes'])) {
            $lines[] = array('storage.missing_indexes',
                $state['missing_indexes'] ? implode(', ', $state['missing_indexes']) : 'none');
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

        if (!$state['file_present']) {
            $lines[] = array('verdict', $state['directory_writable']
                ? 'no database file yet: it is created at the first note.'
                : 'the storage directory is NOT WRITABLE: no note can be saved.');
        } elseif (!$state['connection']) {
            $lines[] = array('verdict',
                'the database file is UNREADABLE: no note can be saved.');
        } elseif ($state['table_present'] === false) {
            $lines[] = array('verdict',
                'file reachable, table missing: it will be created at the first note.');
        } elseif (is_array($state['missing_columns']) && $state['missing_columns']) {
            $lines[] = array('verdict',
                'table INCOMPLETE (created by an earlier version): it will be completed '
                . 'at the next service call, or the message will say why not.');
        } else {
            $lines[] = array('verdict', 'operational.');
        }

        return $lines;
    }

    /**
     * Is this path inside the document root? null when the question cannot be
     * answered -- DOCUMENT_ROOT is absent on the command line, and no answer is
     * better than a guess on the one line that matters.
     *
     * Both sides go through realpath(): a symlinked web root would otherwise
     * compare as "outside" while the web server serves it perfectly well.
     */
    public static function insideDocumentRoot($path)
    {
        $root = isset($_SERVER['DOCUMENT_ROOT']) ? (string) $_SERVER['DOCUMENT_ROOT'] : '';
        if ($root === '') {
            return null;
        }
        $root = realpath($root);
        if ($root === false) {
            return null;
        }
        // The FILE may not exist yet; its directory does, or is about to.
        $target = realpath(is_file($path) ? $path : dirname($path));
        if ($target === false) {
            return null;
        }
        $root = rtrim($root, '/') . '/';
        return strpos($target . '/', $root) === 0;
    }

    /**
     * The single shape of a note, whatever the source -- COPIED from the MySQL
     * store, key for key.
     *
     * It is this file's one accepted duplication and it is deliberate: this
     * shape is the contract between the store and all the rest of the server.
     * If it diverged, half the server would be reading a note that does not
     * exist.
     */
    private function normalise(array $row)
    {
        return array(
            'id'         => (int) $row['id'],
            // `format` absent or zero means 1, an empty `mode` means plain: it
            // is the reader, not the column, that interprets them.
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
            'version'     => isset($row['version']) ? (string) $row['version'] : '',
            'environment' => isset($row['environment']) ? (string) $row['environment'] : '',
            'viewport'    => isset($row['viewport']) ? (string) $row['viewport'] : '',
            'payload'            => isset($row['payload']) && $row['payload'] !== null
                                    ? (string) $row['payload'] : '',
            'resolution_payload' => isset($row['resolution_payload']) && $row['resolution_payload'] !== null
                                    ? (string) $row['resolution_payload'] : '',
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
 * Same function, same name as in the MySQL store: it is defined BY the store,
 * so replacing the store carries the duty of providing it. The guard is there
 * because install.php loads a store to self-test it and must not fall over a
 * redeclaration if it ever loads two.
 */
if (!function_exists('ap_iso_date')) {
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
}
