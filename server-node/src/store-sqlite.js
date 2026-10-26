/*
 * store-sqlite.js -- THE DEFAULT STORE, on node:sqlite, no dependency.
 *
 * It is the port of server/webroot/internal/store-sqlite.php, method for
 * method and column for column: the SCHEMA IS IDENTICAL, so a database file
 * this store writes and one the PHP store writes are the same file, readable
 * by either. That is what lets a site move off PHP without touching its notes,
 * and it is what the parity checks lean on.
 *
 * WHY node:sqlite. It is built into Node (>= 22.5), so the module installs with
 * nothing to compile and no native dependency -- the same "upload it and it
 * runs" that made SQLite the PHP server's default, kept in a package meant to
 * be embedded anywhere. ':memory:' as the file gives an in-process database
 * with no extra code, which is the in-memory store the tests and a demo use.
 *
 * WHAT DIFFERS FROM THE PHP STORE, and none of it touches a stored byte:
 *
 *   - NO WEB-ROOT GUARDS. The PHP store writes an .htaccess and an index.php
 *     beside the file and checks whether the file sits under the document root,
 *     because PHP serves from a directory a browser can reach. An embedded Node
 *     app serves what its own routes serve and nothing else; where the database
 *     file lives is the host's choice, and keeping it out of any static-served
 *     directory is the host's job. So those lines are absent rather than ported
 *     into a context where they would check nothing.
 *   - NO FORMAT-1 RENAME. As in the PHP SQLite store: no SQLite file ever
 *     carried the French column names of the 1.2.0 ancestor, which was MySQL.
 *   - all() RETURNS A GENERATOR over a read-all rather than a streaming cursor.
 *     A review table holds thousands of rows, not millions; the shape the
 *     caller sees -- an iterable yielded in order -- is the same.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { ApFailure } from './errors.js';
import { normalise, utcStamp } from './notes.js';

/** The notes table columns, in order. SINGLE SOURCE: creation, catch-up and
 *  the diagnostic all read this. Names, defaults and meaning are the PHP
 *  store's, to the letter -- they are the contract the rest of the server
 *  reads. No width: SQLite ignores it and the bound is input.js's, before the
 *  write. Every column carries a default so ADD COLUMN works on a table that
 *  already holds rows. */
export const EXPECTED_COLUMNS = {
    project: "TEXT NOT NULL DEFAULT ''",
    page_index: "TEXT NOT NULL DEFAULT ''",
    format: 'INTEGER NOT NULL DEFAULT 1',
    mode: "TEXT NOT NULL DEFAULT ''",
    page: "TEXT NOT NULL DEFAULT ''",
    selector: "TEXT NOT NULL DEFAULT ''",
    fingerprint: "TEXT NOT NULL DEFAULT ''",
    excerpt: "TEXT NOT NULL DEFAULT ''",
    author: "TEXT NOT NULL DEFAULT ''",
    text: "TEXT NOT NULL DEFAULT ''",
    version: "TEXT NOT NULL DEFAULT ''",
    environment: "TEXT NOT NULL DEFAULT ''",
    viewport: "TEXT NOT NULL DEFAULT ''",
    payload: 'TEXT NULL DEFAULT NULL',
    resolution_payload: 'TEXT NULL DEFAULT NULL',
    title: "TEXT NOT NULL DEFAULT ''",
    title_payload: 'TEXT NULL DEFAULT NULL',
    resolved_at: 'TEXT NULL DEFAULT NULL',
    resolved_by: "TEXT NOT NULL DEFAULT ''",
    resolved_version: "TEXT NOT NULL DEFAULT ''",
    created_at: "TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'",
    reply_to: 'INTEGER NULL DEFAULT NULL',
};

export class SqliteStore {
    /**
     * @param {object|string} config `{ file, tablePrefix?, log? }`, or the file
     *   path as a string. `file` is an absolute or relative path, or ':memory:'
     *   for an in-process database. `log` is called with one string on a
     *   non-fatal problem; it defaults to doing nothing, so the store never
     *   writes to a console it does not own.
     */
    constructor(config) {
        if (typeof config === 'string') {
            config = { file: config };
        }
        config = config || {};
        this.config = config;
        this.log = typeof config.log === 'function' ? config.log : () => {};

        // The prefix is the one value that enters SQL without a prepared
        // parameter and it comes from a hand-written configuration, never the
        // network -- so it is checked, exactly as in the PHP store.
        const prefix = config.tablePrefix == null ? '' : String(config.tablePrefix);
        if (!/^[A-Za-z0-9_]*$/.test(prefix)) {
            throw new ApFailure(
                'Invalid configuration: tablePrefix can only contain letters, digits '
                + 'and underscores.', 500);
        }
        this.tablePrefixValue = prefix;
        this.tableName = prefix + 'notes';
        this.rateTable = prefix + 'rate';
        this.tallyTableName = prefix + 'tally';
        this.memoryTable = prefix + 'memory';

        const file = config.file;
        if (file == null || file === '') {
            throw new ApFailure(
                "Invalid configuration: a SQLite store needs a `file` -- a path, or "
                + "':memory:' for an in-process database.", 500);
        }
        this.fileValue = String(file);

        this.db = null;
        this.schemaEnsured = false;
        this.rateTableEnsured = false;
    }

    /** What THIS store needs present. Here for symmetry with the PHP store,
     *  which the entry point reads without knowing which store it holds. */
    static requiredExtensions() {
        return [];
    }

    /** Name of the table, for a message aimed at an administrator. */
    table() {
        return this.tableName;
    }

    /** Path of the database file, for the diagnostic. */
    file() {
        return this.fileValue;
    }

    /* -- The connection --------------------------------------------------- */

    pdo() {
        if (this.db !== null) {
            return this.db;
        }
        if (this.fileValue !== ':memory:') {
            const directory = dirname(this.fileValue);
            try {
                // 0o700: the data belongs to the user the process runs as and
                // to nobody else, as in the PHP store.
                mkdirSync(directory, { recursive: true, mode: 0o700 });
            } catch (e) {
                throw new ApFailure(
                    'The notes tool cannot create its storage directory:\n'
                    + directory + '\n'
                    + 'Grant write permission to the user this process runs as, or '
                    + 'point `file` at a directory that is already writable.',
                    503, e);
            }
        }
        try {
            this.db = new DatabaseSync(this.fileValue);
        } catch (e) {
            this.log('sqlite open refused : ' + e.message);
            throw new ApFailure(
                'The notes database file could not be opened: your notes are NOT saved.\n'
                + 'File: ' + this.fileValue, 503, e);
        }
        // A write locks the file; five seconds is longer than any write this
        // tool makes. WAL lets a read go through while a write is in flight and
        // is not available on every filesystem -- its absence costs
        // concurrency, not correctness, so a refusal is swallowed.
        try { this.db.exec('PRAGMA busy_timeout = 5000'); }
        catch (e) { this.log('busy_timeout refused : ' + e.message); }
        try { this.db.exec('PRAGMA journal_mode = WAL'); }
        catch (e) { this.log('WAL refused, default journal kept : ' + e.message); }
        return this.db;
    }

    /* -- Schema ----------------------------------------------------------- */

    ensureSchema() {
        if (this.schemaEnsured) {
            return;
        }
        try {
            this.pdo().exec(this.createSql());
        } catch (e) {
            this.log('sqlite table creation refused : ' + e.message);
            throw new ApFailure(
                'The notes table could not be prepared: your notes are NOT saved.\n'
                + 'File: ' + this.fileValue, 503, e);
        }
        const present = this.presentColumns();
        if (present !== null) {
            this.addMissingColumns(present);
        }
        this.completeIndexes();
        this.ensureTally();
        this.schemaEnsured = true;
    }

    createSql() {
        const lines = ['  "id" INTEGER PRIMARY KEY AUTOINCREMENT'];
        for (const [name, definition] of Object.entries(EXPECTED_COLUMNS)) {
            lines.push(`  "${name}" ${definition}`);
        }
        return `CREATE TABLE IF NOT EXISTS "${this.tableName}" (\n`
            + lines.join(',\n') + '\n);';
    }

    createRateSql() {
        return `CREATE TABLE IF NOT EXISTS "${this.rateTable}" (\n`
            + '  "counter_key" TEXT NOT NULL,\n'
            + '  "window_index" INTEGER NOT NULL,\n'
            + '  "hits" INTEGER NOT NULL DEFAULT 0,\n'
            + '  PRIMARY KEY ("counter_key", "window_index")\n'
            + ');';
    }

    /** Index names carry the table name in front: in SQLite an index name is
     *  unique across the whole file, so two installations sharing a file with
     *  different prefixes would collide on a bare `idx_page`. */
    expectedIndexes() {
        return {
            [this.tableName + '_idx_project_index']: '"project", "page_index"',
            [this.tableName + '_idx_reply_to']: '"reply_to"',
            [this.tableName + '_idx_project_totals']:
                '"project", "reply_to", "resolved_at", "page_index"',
        };
    }

    addMissingColumns(present) {
        for (const [name, definition] of Object.entries(EXPECTED_COLUMNS)) {
            if (present[name.toLowerCase()]) {
                continue;
            }
            const sql = `ALTER TABLE "${this.tableName}" ADD COLUMN "${name}" ${definition};`;
            try {
                this.pdo().exec(sql);
            } catch (e) {
                this.log('sqlite column add refused : ' + e.message);
                throw new ApFailure(
                    'The notes table comes from an earlier version of the tool and a '
                    + 'column is missing from it.\nThe tool could not add it itself.\n'
                    + 'Exact SQL to run once:\n\n' + sql + '\n', 503, e);
            }
        }
    }

    /** A failure here is not fatal: a missing index makes a query slow, not
     *  wrong, and a review table holds thousands of rows. */
    completeIndexes() {
        for (const [name, columns] of Object.entries(this.expectedIndexes())) {
            const sql = `CREATE INDEX IF NOT EXISTS "${name}" ON "${this.tableName}" (${columns});`;
            try { this.pdo().exec(sql); }
            catch (e) { this.log('sqlite index ' + name + ' not created : ' + e.message); }
        }
    }

    presentColumns() {
        try {
            const out = {};
            for (const row of this.pdo().prepare(`PRAGMA table_info("${this.tableName}")`).all()) {
                out[String(row.name).toLowerCase()] = true;
            }
            return out;
        } catch (e) {
            this.log('cannot read the sqlite schema : ' + e.message);
            return null;
        }
    }

    presentIndexes() {
        try {
            const rows = this.pdo().prepare(
                "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?")
                .all(this.tableName);
            const out = {};
            for (const row of rows) {
                out[String(row.name).toLowerCase()] = true;
            }
            return out;
        } catch (e) {
            this.log('cannot read the sqlite indexes : ' + e.message);
            return null;
        }
    }

    /* -- The three widths that do not exist here -------------------------- */

    widenColumns() {
        return {
            bounded: [], done: true, sql: '', bytes: 0,
            reason: 'SQLite stores text of any length: there is no width to widen, '
                + 'and there never was',
        };
    }

    boundedColumns() {
        return [];
    }

    narrowColumns() {
        return [];
    }

    /* -- Rate ------------------------------------------------------------- */

    ensureRateTable() {
        if (this.rateTableEnsured) {
            return;
        }
        try {
            this.pdo().exec(this.createRateSql());
        } catch (e) {
            this.log('sqlite rate table creation refused : ' + e.message);
            throw new ApFailure(
                'The rate limiting table could not be prepared.\n'
                + 'Exact SQL to run once:\n\n' + this.createRateSql() + '\n', 503, e);
        }
        this.rateTableEnsured = true;
    }

    /** Counts one event, returns the total reached in the current window.
     *  INSERT OR IGNORE then UPDATE, not ON CONFLICT: the pair is not atomic,
     *  which changes nothing for rate limiting -- going one notch over changes
     *  nothing about what it protects. */
    consumeRate(key, window) {
        this.ensureRateTable();
        const pdo = this.pdo();
        pdo.prepare(`INSERT OR IGNORE INTO "${this.rateTable}" `
            + '("counter_key", "window_index", "hits") VALUES (?, ?, 0)')
            .run(String(key), Number(window));
        pdo.prepare(`UPDATE "${this.rateTable}" SET "hits" = "hits" + 1 `
            + 'WHERE "counter_key" = ? AND "window_index" = ?')
            .run(String(key), Number(window));
        const row = pdo.prepare(`SELECT "hits" FROM "${this.rateTable}" `
            + 'WHERE "counter_key" = ? AND "window_index" = ?')
            .get(String(key), Number(window));

        // Opportunistic housekeeping, one chance in fifty, on windows already
        // past: there is no scheduled task to lean on.
        if (Math.floor(Math.random() * 50) === 0) {
            try {
                pdo.prepare(`DELETE FROM "${this.rateTable}" WHERE "window_index" < ?`)
                    .run(Number(window) - 2);
            } catch (e) {
                this.log('cannot clean up the counters : ' + e.message);
            }
        }
        return row === undefined ? 1 : Number(row.hits);
    }

    /* -- Reading ---------------------------------------------------------- */

    /** One note of a project, by id, or null. The project is in the WHERE
     *  clause: a note of another project is NOT FOUND, not found-then-refused. */
    note(id, project) {
        this.ensureSchema();
        const row = this.pdo().prepare(
            `SELECT * FROM "${this.tableName}" WHERE "id" = ? AND "project" = ? LIMIT 1`)
            .get(Number(id), String(project));
        return row === undefined ? null : normalise(row);
    }

    /** The notes of one page, replies nested under their parent, in one query:
     *  a reply that arrived between two queries would attach to nothing.
     *  Grouping is by page_index in both modes. */
    byPage(project, index) {
        this.ensureSchema();
        const rows = this.pdo().prepare(
            `SELECT * FROM "${this.tableName}" `
            + 'WHERE "project" = ? AND "page_index" = ? ORDER BY "id" ASC')
            .all(String(project), String(index));

        const parents = new Map();
        const replies = [];
        for (const row of rows) {
            const note = normalise(row);
            if (note.reply_to === null) {
                note.replies = [];
                parents.set(note.id, note);
            } else {
                replies.push(note);
            }
        }
        for (const reply of replies) {
            const parent = parents.get(reply.reply_to);
            if (parent) {
                parent.replies.push(reply);
            }
            // A reply whose parent is not on this page cannot exist: add()
            // forces the parent's index. If it happened we ignore it rather
            // than invent a parent.
        }
        return [...parents.values()];
    }

    /** EVERY note of a project, flat, already ordered for the export. A
     *  generator, so the shape is an iterable walked in order. The ORDER is the
     *  PHP store's, expression for expression: the export is a contract and its
     *  order is part of it. */
    *all(project) {
        this.ensureSchema();
        const rows = this.pdo().prepare(
            `SELECT * FROM "${this.tableName}" WHERE "project" = ? `
            + 'ORDER BY "page" ASC, "page_index" ASC, COALESCE("reply_to", "id") ASC, '
            + '("reply_to" IS NOT NULL) ASC, "id" ASC')
            .all(String(project));
        for (const row of rows) {
            yield normalise(row);
        }
    }

    /** Number of entries (notes and replies) of a project. */
    count(project) {
        this.ensureSchema();
        const row = this.pdo().prepare(
            `SELECT COUNT(*) AS n FROM "${this.tableName}" WHERE "project" = ?`)
            .get(String(project));
        return Number(row.n);
    }

    /** The same count, restricted to notes a reply hangs from (reply_to null). */
    countThreads(project) {
        this.ensureSchema();
        const row = this.pdo().prepare(
            `SELECT COUNT(*) AS n FROM "${this.tableName}" WHERE "project" = ? `
            + 'AND "reply_to" IS NULL')
            .get(String(project));
        return Number(row.n);
    }

    /* -- What this installation remembers --------------------------------- */

    ensureMemory() {
        try {
            this.pdo().exec(
                `CREATE TABLE IF NOT EXISTS "${this.memoryTable}" (`
                + '"name" VARCHAR(40) NOT NULL PRIMARY KEY, '
                + "\"value\" VARCHAR(255) NOT NULL DEFAULT '')");
            return true;
        } catch (e) {
            // Not logged: a store that cannot make this table cannot make it on
            // the next write either, and a line per write is how a log stops
            // being read. The diagnostic is where it shows.
            return false;
        }
    }

    /** The text remembered under that name, or '' when there is none. Asking
     *  creates no database and no table: a diagnostic must not invent the
     *  storage it comes looking for. */
    remembered(name) {
        try {
            const row = this.pdo().prepare(
                `SELECT "value" FROM "${this.memoryTable}" WHERE "name" = ?`)
                .get(String(name));
            return row === undefined ? '' : String(row.value);
        } catch (e) {
            return '';
        }
    }

    /** Remembers it. False when it could not be written. */
    remember(name, value) {
        const write = () => this.pdo().prepare(
            `INSERT OR REPLACE INTO "${this.memoryTable}" ("name", "value") VALUES (?, ?)`)
            .run(String(name), String(value));
        try { write(); return true; }
        catch (e) { if (!this.ensureMemory()) { return false; } }
        try { write(); return true; }
        catch (e) { return false; }
    }

    /** Everything remembered under names beginning with `prefix`. The prefix is
     *  one this code wrote, never one a request brought. */
    rememberedLike(prefix) {
        const found = {};
        try {
            const rows = this.pdo().prepare(
                `SELECT "name", "value" FROM "${this.memoryTable}" WHERE "name" LIKE ?`)
                .all(String(prefix) + '%');
            for (const row of rows) {
                found[String(row.name)] = String(row.value);
            }
        } catch (e) {
            return {};
        }
        return found;
    }

    /** Forgets it. False when it could not. */
    forget(name) {
        try {
            this.pdo().prepare(`DELETE FROM "${this.memoryTable}" WHERE "name" = ?`)
                .run(String(name));
            return true;
        } catch (e) {
            return false;
        }
    }

    /* -- Totals ----------------------------------------------------------- */

    ensureTally() {
        try {
            this.pdo().exec(
                `CREATE TABLE IF NOT EXISTS "${this.tallyTableName}" (`
                + '"project" VARCHAR(22) NOT NULL PRIMARY KEY, '
                + '"expired_notes" INTEGER NOT NULL DEFAULT 0, '
                + '"expired_pages" INTEGER NOT NULL DEFAULT 0, '
                + '"last_sweep" DATETIME NULL DEFAULT NULL)');
        } catch (e) {
            // Housekeeping must never cost a note: without this table the
            // figures are simply absent, which the client already draws.
            this.log('tally table: ' + e.message);
        }
    }

    recordSweep(perProject) {
        for (const [project, counts] of Object.entries(perProject)) {
            const stamp = utcStamp();
            try {
                this.pdo().prepare(
                    `INSERT INTO "${this.tallyTableName}" `
                    + '("project", "expired_notes", "expired_pages", "last_sweep") '
                    + 'VALUES (?, ?, ?, ?) '
                    + 'ON CONFLICT("project") DO UPDATE SET '
                    + '"expired_notes" = "expired_notes" + ?, '
                    + '"expired_pages" = "expired_pages" + ?, '
                    + '"last_sweep" = ?')
                    .run(String(project), Number(counts.notes), Number(counts.pages), stamp,
                        Number(counts.notes), Number(counts.pages), stamp);
            } catch (e) {
                this.log('tally write: ' + e.message);
            }
        }
    }

    /** The tally of one project, zeroes when it has never been swept. */
    expiredTotals(project) {
        this.ensureSchema();
        try {
            const row = this.pdo().prepare(
                'SELECT "expired_notes", "expired_pages", "last_sweep" FROM '
                + `"${this.tallyTableName}" WHERE "project" = ?`)
                .get(String(project));
            if (!row) {
                return { notes: 0, pages: 0, last_sweep: null };
            }
            return {
                notes: Number(row.expired_notes),
                pages: Number(row.expired_pages),
                last_sweep: row.last_sweep == null ? null : apTallyDate(row.last_sweep),
            };
        } catch (e) {
            return { notes: 0, pages: 0, last_sweep: null };
        }
    }

    /** What this server holds altogether, across every project. Projects are
     *  counted on both tables: a project whose every thread expired has no row
     *  left among the notes but is still a site this server carried. */
    serverTotals() {
        this.ensureSchema();
        try {
            const projects = Number(this.pdo().prepare(
                `SELECT COUNT(*) AS n FROM (SELECT "project" FROM "${this.tableName}" `
                + `UNION SELECT "project" FROM "${this.tallyTableName}")`).get().n);
            const row = this.pdo().prepare(
                'SELECT COUNT(*) AS notes, COUNT(DISTINCT "page_index") AS pages '
                + `FROM "${this.tableName}" WHERE "reply_to" IS NULL`).get();
            const gone = this.pdo().prepare(
                'SELECT SUM("expired_notes") AS n, SUM("expired_pages") AS p FROM '
                + `"${this.tallyTableName}"`).get();
            return {
                projects,
                notes: Number(row.notes),
                pages: Number(row.pages),
                expired_notes: gone && gone.n != null ? Number(gone.n) : 0,
                expired_pages: gone && gone.p != null ? Number(gone.p) : 0,
            };
        } catch (e) {
            return null;
        }
    }

    /** Gives freed pages back to the filesystem. SQLite keeps the file's size
     *  otherwise, for ever. */
    compact() {
        try { this.pdo().exec('VACUUM'); return true; }
        catch (e) { this.log('vacuum: ' + e.message); return false; }
    }

    /** What a project holds: notes, still open, distinct pages. Called on every
     *  `list`. Replies are not notes. */
    projectTotals(project) {
        this.ensureSchema();
        const row = this.pdo().prepare(
            'SELECT COUNT(*) AS notes, '
            + 'SUM(CASE WHEN "resolved_at" IS NULL THEN 1 ELSE 0 END) AS open, '
            + 'COUNT(DISTINCT "page_index") AS pages '
            + `FROM "${this.tableName}" WHERE "project" = ? AND "reply_to" IS NULL`)
            .get(String(project));
        if (!row) {
            return { notes: 0, open: 0, pages: 0 };
        }
        return {
            notes: Number(row.notes),
            open: row.open == null ? 0 : Number(row.open),
            pages: Number(row.pages),
        };
    }

    /** How many plain notes and how many encrypted, for the export header's
     *  `encryption` line. An installation that changed its mind gives both. */
    modeBreakdown(project) {
        this.ensureSchema();
        const rows = this.pdo().prepare(
            `SELECT "mode", COUNT(*) AS n FROM "${this.tableName}" `
            + 'WHERE "project" = ? GROUP BY "mode"')
            .all(String(project));
        const out = { plain: 0, encrypted: 0 };
        for (const row of rows) {
            const key = String(row.mode) === 'encrypted' ? 'encrypted' : 'plain';
            out[key] += Number(row.n);
        }
        return out;
    }

    /* -- Writing ---------------------------------------------------------- */

    /** Saves a note (or reply) and returns it AS SAVED, never as sent: the
     *  client displays what the server says. One INSERT for both modes; the
     *  columns the mode does not concern get the empty string, which input.js
     *  has already guaranteed. */
    add(note) {
        this.ensureSchema();
        const createdAt = utcStamp();
        const result = this.pdo().prepare(
            `INSERT INTO "${this.tableName}" `
            + '("project", "page_index", "format", "mode", '
            + '"page", "selector", "fingerprint", "excerpt", "author", "text", '
            + '"version", "environment", "viewport", "payload", '
            + '"created_at", "reply_to") '
            + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(
                note.project,
                note.page_index,
                Number(note.format),
                note.mode,
                note.page ?? '',
                note.selector ?? '',
                note.fingerprint ?? '',
                note.excerpt ?? '',
                note.author ?? '',
                note.text ?? '',
                note.version ?? '',
                note.environment ?? '',
                note.viewport ?? '',
                note.payload ?? '',
                createdAt,
                note.reply_to == null ? null : Number(note.reply_to));
        return this.note(Number(result.lastInsertRowid), note.project);
    }

    /** Marks a note resolved, or undoes it. A note is NEVER deleted.
     *  Reopening clears both forms -- plain columns and envelope -- because it
     *  is one fact under two modes. */
    resolve(id, project, by, version, resolutionPayload, resolved = true) {
        this.ensureSchema();
        if (!resolved) {
            this.pdo().prepare(
                `UPDATE "${this.tableName}" SET "resolved_at" = NULL, `
                + "\"resolved_by\" = '', \"resolved_version\" = '', \"resolution_payload\" = '' "
                + 'WHERE "id" = ? AND "project" = ?')
                .run(Number(id), String(project));
            return this.note(id, project);
        }
        this.pdo().prepare(
            `UPDATE "${this.tableName}" SET "resolved_at" = ?, `
            + '"resolved_by" = ?, "resolved_version" = ?, "resolution_payload" = ? '
            + 'WHERE "id" = ? AND "project" = ?')
            .run(utcStamp(), String(by), String(version),
                String(resolutionPayload), Number(id), String(project));
        return this.note(id, project);
    }

    /** Writes a remark's title, or clears it (empty takes it off). One field,
     *  its own action, no other field reachable: a note's own envelope is
     *  written once and nothing here can touch it. Both forms written together,
     *  as resolve() clears both. */
    setTitle(id, project, title, titlePayload) {
        this.ensureSchema();
        this.pdo().prepare(
            `UPDATE "${this.tableName}" SET "title" = ?, "title_payload" = ? `
            + 'WHERE "id" = ? AND "project" = ?')
            .run(String(title), String(titlePayload), Number(id), String(project));
        return this.note(id, project);
    }

    /** Expires whole threads whose LAST message is older than `days`. A thread,
     *  dated by its most recent message, never a single note. Nobody chooses
     *  which -- age, and nothing else. A failure is logged and swallowed: a
     *  server that refused a remark over its own cleanup would be worse. */
    expireOlderThan(days) {
        days = Number(days);
        if (!(days > 0)) {
            return 0;
        }
        const cutoff = utcStamp(Math.floor(Date.now() / 1000) - days * 86400);
        const t = this.tableName;

        // What is about to go, per project, MEASURED BEFORE THE DELETE.
        const swept = this.sweepCounts(cutoff);

        let rows;
        try {
            const result = this.pdo().prepare(
                `DELETE FROM "${t}" WHERE COALESCE("reply_to", "id") IN (`
                + `SELECT COALESCE("reply_to", "id") FROM "${t}" `
                + 'GROUP BY COALESCE("reply_to", "id") '
                + 'HAVING MAX("created_at") < ?)')
                .run(cutoff);
            rows = Number(result.changes);
        } catch (e) {
            this.log('retention: ' + e.message);
            return 0;
        }
        if (rows > 0 && swept) {
            this.recordSweep(swept);
        }
        return rows;
    }

    /** How many threads, and how many whole pages, the cutoff is about to take,
     *  per project. A page counts as gone when its newest row is older than the
     *  cutoff. */
    sweepCounts(cutoff) {
        const t = this.tableName;
        const out = {};
        try {
            const threads = this.pdo().prepare(
                'SELECT "project" AS project, COUNT(*) AS n FROM ('
                + 'SELECT "project", COALESCE("reply_to", "id") AS "root", '
                + `MAX("created_at") AS "last" FROM "${t}" `
                + 'GROUP BY "project", COALESCE("reply_to", "id")'
                + ') WHERE "last" < ? GROUP BY "project"')
                .all(cutoff);
            for (const row of threads) {
                out[String(row.project)] = { notes: Number(row.n), pages: 0 };
            }
            const pages = this.pdo().prepare(
                'SELECT "project" AS project, COUNT(*) AS n FROM ('
                + `SELECT "project", "page_index" FROM "${t}" `
                + 'GROUP BY "project", "page_index" HAVING MAX("created_at") < ?'
                + ') GROUP BY "project"')
                .all(cutoff);
            for (const row of pages) {
                const key = String(row.project);
                if (!out[key]) {
                    out[key] = { notes: 0, pages: 0 };
                }
                out[key].pages = Number(row.n);
            }
        } catch (e) {
            this.log('tally count: ' + e.message);
            return {};
        }
        return out;
    }

    /* -- Diagnostic ------------------------------------------------------- */

    /** WITH NO EFFECT WHATEVER: nothing here calls ensureSchema(), a diagnostic
     *  that provisions no longer diagnoses. It never throws: a state, even a
     *  bad one, is an answer. */
    state() {
        const state = {
            connection: false,
            engine: null,
            file: this.fileValue,
            table: this.tableName,
            table_present: null,
            missing_columns: null,
            missing_indexes: null,
            notes: null,
            rate_table: this.rateTable,
            rate_table_present: null,
            tally_table_present: null,
            message: null,
        };
        try {
            const pdo = this.pdo();
            state.connection = true;
            state.engine = 'SQLite ' + String(pdo.prepare('SELECT sqlite_version() AS v').get().v);

            const seen = pdo.prepare(
                "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?");
            state.table_present = Number(seen.get(this.tableName).n) > 0;
            state.rate_table_present = Number(seen.get(this.rateTable).n) > 0;
            state.tally_table_present = Number(seen.get(this.tallyTableName).n) > 0;

            if (state.table_present) {
                const present = this.presentColumns();
                if (present !== null) {
                    state.missing_columns = Object.keys(EXPECTED_COLUMNS)
                        .filter((name) => !present[name.toLowerCase()]);
                }
                const presentIdx = this.presentIndexes();
                if (presentIdx !== null) {
                    state.missing_indexes = Object.keys(this.expectedIndexes())
                        .filter((name) => !presentIdx[name.toLowerCase()]);
                }
                state.notes = Number(pdo.prepare(
                    `SELECT COUNT(*) AS n FROM "${this.tableName}"`).get().n);
            }
        } catch (e) {
            this.log('diagnostic : ' + e.message);
            state.message = 'The database refused the query.';
        }
        return state;
    }

    /** What the diagnostic says of the storage, as "key value" pairs the entry
     *  point prints without interpreting. The web-root lines of the PHP store
     *  have no meaning in an embedded Node process and are absent (see header). */
    diagnosticLines() {
        const lines = [];
        lines.push(['storage.type', 'sqlite (node:sqlite) -- one file, no database server']);
        lines.push(['storage.file', this.fileValue]);
        lines.push(['storage.table', this.tableName]);
        lines.push(['storage.rate_table', this.rateTable]);
        lines.push(['', '']);

        const state = this.state();
        lines.push(['storage.connection', state.connection ? 'SUCCEEDED' : 'FAILED']);
        if (state.engine !== null) {
            lines.push(['storage.engine', state.engine]);
        }
        if (state.table_present !== null) {
            lines.push(['storage.table_present', state.table_present ? 'yes' : 'NO']);
        }
        if (state.tally_table_present !== null) {
            lines.push(['storage.tally_table_present', state.tally_table_present ? 'yes' : 'NO']);
        }
        if (state.rate_table_present !== null) {
            lines.push(['storage.rate_table_present',
                state.rate_table_present ? 'yes' : 'NO (created on first need)']);
        }
        if (Array.isArray(state.missing_columns)) {
            lines.push(['storage.missing_columns',
                state.missing_columns.length ? state.missing_columns.join(', ') : 'none']);
        }
        if (Array.isArray(state.missing_indexes)) {
            lines.push(['storage.missing_indexes',
                state.missing_indexes.length ? state.missing_indexes.join(', ') : 'none']);
        }
        if (state.notes !== null) {
            lines.push(['storage.notes', state.notes]);
        }
        if (state.message !== null) {
            lines.push(['', '']);
            lines.push(['', state.message]);
        }
        lines.push(['', '']);
        if (!state.connection) {
            lines.push(['verdict', 'the database is UNREADABLE: no note can be saved.']);
        } else if (state.table_present === false) {
            lines.push(['verdict', 'reachable, table missing: it is created at the first note.']);
        } else if (Array.isArray(state.missing_columns) && state.missing_columns.length) {
            lines.push(['verdict', 'table INCOMPLETE (earlier version): completed at the next call.']);
        } else {
            lines.push(['verdict', 'operational.']);
        }
        return lines;
    }
}

/** The tally's last_sweep is written as "Y-m-d H:i:s" UTC and read back as an
 *  ISO date, like every other date the store returns. */
function apTallyDate(value) {
    const raw = String(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00` : raw;
}

export default SqliteStore;
