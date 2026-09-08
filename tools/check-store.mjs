#!/usr/bin/env node
/* check-store.mjs — THE STORE, RUN BY PHP, WITH A REAL DATABASE.
 *
 * Everything else in this suite reads the PHP or talks to a server written in
 * node. This one runs `server/webroot/internal/store-sqlite.php` under the PHP
 * that is installed, on a file it creates in a temporary directory, and checks
 * the arithmetic nobody can see from outside: what retention takes, and what
 * it records having taken.
 *
 * WHY THAT PART AND NOT ANOTHER. The counts are shown to a reviewer, on a page,
 * next to the notes they still have -- "seven notes and three pages removed by
 * age". A figure like that is believed. If it drifts, nothing fails and nobody
 * finds out; the panel simply lies. Every other behaviour of the store is
 * visible in the export or in the diagnostic, where a mistake shows.
 *
 * SQLITE ONLY. It is the default store and it needs nothing installed. The
 * MySQL store carries the same methods with the same shape, and the two were
 * measured against each other by hand when they were written; a runner with a
 * database service is what it would take to keep that automatic.
 *
 * Skipped, loudly, where there is no `php` -- a check that cannot run must not
 * report that it passed.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const internal = join(here, '..', 'server', 'webroot', 'internal');

const php = spawnSync('php', ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
if (php.error || php.status !== 0) {
    console.log('store: no php on this machine, nothing was run');
    process.exit(0);
}
const sqlite = spawnSync('php', ['-r', 'echo extension_loaded("pdo_sqlite") ? "yes" : "no";'],
    { encoding: 'utf8' });
if ((sqlite.stdout || '').trim() !== 'yes') {
    console.log('store: php has no pdo_sqlite, nothing was run');
    process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'annotepage-store-'));
const script = join(dir, 'run.php');

/* The scenario, and every number below is arrived at by hand:
 *
 * The server total counts what REMAINS (2 threads on 2 pages, in 1 project --
 * B lost its only one) and what age took across every project: 3 + 1 threads,
 * 1 + 1 pages. A total that only counted what remains would shrink every night.
 *
 *   project A, page 1  two old threads, one of them with an old reply  -> gone
 *   project A, page 2  one old thread, one fresh thread                -> half
 *   project A, page 3  one old thread whose reply is fresh             -> stays
 *   project B, page x  one old thread, its only page                   -> gone
 *
 * So the sweep removes 5 rows; A loses 3 threads and one whole page (page 1 --
 * page 2 keeps a thread, page 3's thread is alive through its reply), B loses
 * 1 thread and its one page. What is left of A is 2 threads on 2 pages.
 */
writeFileSync(script, `<?php
define('AP_INTERNAL', true);
require ${JSON.stringify(join(internal, 'errors.php'))};
require ${JSON.stringify(join(internal, 'config.php'))};
require ${JSON.stringify(join(internal, 'store-sqlite.php'))};

$store = new ApStore(array(
    'table_prefix' => 'ap_',
    'database' => array('file' => ${JSON.stringify(join(dir, 'notes.sqlite'))}),
));
$store->ensureSchema();

$pdo = new PDO('sqlite:' . ${JSON.stringify(join(dir, 'notes.sqlite'))});
$old = gmdate('Y-m-d H:i:s', time() - 200 * 86400);
$new = gmdate('Y-m-d H:i:s', time() - 2 * 86400);
$add = $pdo->prepare('INSERT INTO "ap_notes" '
    . '("project","page","page_index","reply_to","created_at","mode","format") '
    . 'VALUES (?,?,?,?,?,\\'plain\\',2)');
$add->execute(array('A', '/p1', 'i1', null, $old)); $r1 = $pdo->lastInsertId();
$add->execute(array('A', '/p1', 'i1', $r1,  $old));
$add->execute(array('A', '/p1', 'i1', null, $old));
$add->execute(array('A', '/p2', 'i2', null, $old));
$add->execute(array('A', '/p2', 'i2', null, $new));
$add->execute(array('A', '/p3', 'i3', null, $old)); $r3 = $pdo->lastInsertId();
$add->execute(array('A', '/p3', 'i3', $r3,  $new));
$add->execute(array('B', '/x',  'ix', null, $old));

$out = array('removed' => $store->expireOlderThan(90));
$out['A'] = $store->expiredTotals('A');
$out['B'] = $store->expiredTotals('B');
$out['C'] = $store->expiredTotals('C');
$out['left'] = $store->projectTotals('A');
$out['server'] = $store->serverTotals();
$out['compact'] = $store->compact();
/* A sweep with nothing to take must not move the tally. */
$out['again'] = $store->expireOlderThan(90);
$out['A_after'] = $store->expiredTotals('A');
echo json_encode($out);
`);

const run = spawnSync('php', [script], { encoding: 'utf8' });
const noise = (run.stderr || '').trim();
let report = null;
try {
    report = JSON.parse((run.stdout || '').trim());
} catch (e) {
    console.error('store: the run produced no readable result');
    console.error((run.stdout || '') + '\n' + noise);
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
}

const failures = [];
const is = (what, got, wanted) => {
    if (JSON.stringify(got) !== JSON.stringify(wanted)) {
        failures.push(`${what}\n  expected ${JSON.stringify(wanted)}\n  got      ${JSON.stringify(got)}`);
    }
};

is('rows the sweep removed', report.removed, 5);
is('what A lost', [report.A.notes, report.A.pages], [3, 1]);
is('what B lost', [report.B.notes, report.B.pages], [1, 1]);
is('a project that lost nothing', [report.C.notes, report.C.pages, report.C.last_sweep], [0, 0, null]);
is('what A has left', report.left, { notes: 2, open: 2, pages: 2 });
/* TWO projects, not one: B lost its only thread to the sweep, so it has no row
   left among the notes -- and it is still a project this server carries, with
   a tally saying what it lost. Counting it on the notes table alone said "1
   site, 1 note removed by age", which reads as one team that lost a note
   rather than two teams of which one is now empty. */
is('what the server holds', report.server,
   { projects: 2, notes: 2, pages: 2, expired_notes: 4, expired_pages: 2 });
is('the second sweep took nothing', report.again, 0);
is('and did not move the tally', [report.A_after.notes, report.A_after.pages], [3, 1]);
if (typeof report.A.last_sweep !== 'string') {
    failures.push('the sweep left no date on the tally');
}

/* A WARNING IS A FAILURE HERE. This store creates its schema on the fly; an
   undefined variable in a column definition is exactly the kind of thing that
   works until the day it does not, and it is invisible unless the run is
   read. */
if (noise !== '') {
    failures.push('php wrote to stderr, which a clean run does not:\n  '
        + noise.replace(/\n/g, '\n  '));
}

/* -- WHAT THE WIDENING JOB DOES WHERE THERE IS NOTHING TO WIDEN -----------
   internal/maintenance.php asks the store to bring its columns up to TEXT
   before it sweeps. SQLite has never had a column width, so the answer here
   must be "nothing to do" -- and it must be an ANSWER: a store that has no
   such method at all makes the diagnostic drop a line, and a missing line
   reads as "fine" when it means "this version cannot look". */
const widen = spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require ' + JSON.stringify(join(internal, 'errors.php')) + ';'
    + ' require ' + JSON.stringify(join(internal, 'config.php')) + ';'
    + ' require ' + JSON.stringify(join(internal, 'store-sqlite.php')) + ';'
    + ' $s = new ApStore(array("storage" => "sqlite", "table_prefix" => "notes_",'
    + ' "database" => array("file" => ' + JSON.stringify(join(dir, 'notes.sqlite')) + ')));'
    + ' $r = $s->widenColumns();'
    + ' echo ($r["done"] ? "done" : "not-done"), "|", count($r["bounded"]), "|",'
    + ' count($s->narrowColumns()), "|", count($s->boundedColumns());'],
    { encoding: 'utf8' });
if ((widen.stdout || '').trim() !== 'done|0|0|0') {
    failures.push('the SQLite store answers the widening job with '
        + JSON.stringify((widen.stdout || '') + (widen.stderr || ''))
        + ' instead of "done|0|0|0" -- nothing to widen, nothing too narrow');
}

/* -- AND THE UPDATE PATH ASKS THE SAME QUESTION --------------------------
   The objective in one sentence: a server with automatic updates on must get
   its storage brought along with its code, because that is exactly the host
   with no shell and no cron -- "the nightly job will do it" is an answer that
   never arrives there. So ap_update_run() calls into the store after a
   successful swap, and this proves the call is reachable and silent when
   there is nothing to do. It must never throw: a storage step that could undo
   a successful code update would be a worse bargain than the widths it
   fixes. */
/* A COPY OF internal/ WITH A CONFIGURATION BESIDE IT, because config.php reads
   config-local.php from its OWN directory: pointing the real one at a
   throwaway database is not something a check gets to do. */
const copy = join(dir, 'internal');
cpSync(internal, copy, { recursive: true });
writeFileSync(join(copy, 'config-local.php'),
    '<?php\nif (!defined("AP_INTERNAL")) { http_response_code(404); exit; }\n'
    + 'return array("active" => true, "storage" => "sqlite", "table_prefix" => "notes_",\n'
    + '  "database" => array("file" => ' + JSON.stringify(join(dir, 'notes.sqlite')) + '),\n'
    + '  "projects" => array(), "auto_update" => true);\n');
const brought = spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require ' + JSON.stringify(join(copy, 'errors.php')) + ';'
    + ' require ' + JSON.stringify(join(copy, 'config.php')) + ';'
    + ' require ' + JSON.stringify(join(copy, 'update.php')) + ';'
    + ' $said = array(); $say = function ($l) use (&$said) { $said[] = $l; };'
    + ' ap_update_bring_storage_along(ap_config(), $say);'
    + ' echo count($said), "|", implode(" ", $said);'],
    { encoding: 'utf8' });
if (!/^0\|/.test((brought.stdout || '').trim())) {
    failures.push('the update path had something to say about a storage with nothing '
        + 'to widen, or could not be called at all: '
        + JSON.stringify((brought.stdout || '') + (brought.stderr || '')));
}

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
    console.error('store:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log('store: retention removed 5 rows, 4 threads and 2 pages counted, tally stable on replay');
