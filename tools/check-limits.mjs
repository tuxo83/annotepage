#!/usr/bin/env node
/* check-limits.mjs — THE LIMITS, AGAINST A REAL SERVER.
 *
 * Every bound this server applies was, until this file, described in comments
 * and applied nowhere any test could see it. That is the shape of a limit that
 * quietly stops working: the configuration still names it, the documentation
 * still explains it, and the counter has not incremented in six months.
 *
 * So each one is set to something small here, crossed on purpose, and the
 * refusal is read: the code, the wait, and the sentence that tells whoever hit
 * it whether their text is lost. A limit that refuses without saying which
 * limit it was is a limit nobody can act on.
 *
 * AND THE ONE THAT IS OFF IS PROVED OFF. `rate_reads_per_ip` is 0 by default,
 * and 0 has to mean "no counter is touched" rather than "a counter is touched
 * and ignored" -- otherwise the default costs a database write on every page
 * load, which is exactly what it exists to avoid. It is read out of the
 * database at the end: no row, or the default is a lie.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, cpSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webroot = join(here, '..', 'server', 'webroot');

const php = spawnSync('php', ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
if (php.error || php.status !== 0) {
    console.log('limits: no php on this machine, nothing was run');
    process.exit(0);
}
if ((spawnSync('php', ['-r', 'echo extension_loaded("pdo_sqlite")?"yes":"no";'],
    { encoding: 'utf8' }).stdout || '').trim() !== 'yes') {
    console.log('limits: php has no pdo_sqlite, nothing was run');
    process.exit(0);
}

const failures = [];
const check = (what, ok, detail) => {
    if (!ok) failures.push(what + (detail ? '\n    ' + String(detail).replace(/\n/g, '\n    ') : ''));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});

/* A relay, because a relay is where the limits are for: it takes notes from
   projects nobody declared, which is the only configuration where a stranger
   can reach a counter at all. */
const port = await freePort();
const dir = mkdtempSync(join(tmpdir(), 'annotepage-limits-'));
const root = join(dir, 'web');
cpSync(webroot, root, { recursive: true });

const server = spawn('php', ['-S', '127.0.0.1:' + port], {
    cwd: root, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
});
const done = () => {
    try { server.kill('SIGKILL'); } catch (e) { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
};
for (let i = 0; i < 40; i += 1) {
    await sleep(150);
    try { await fetch('http://127.0.0.1:' + port + '/install.php', { redirect: 'manual' }); break; }
    catch (e) { /* not listening yet */ }
}

/* INSTALLED THE WAY THE OPTIONS ARE MEANT TO BE USED, not by editing a file
   afterwards: what is being checked is that a number typed on the command
   line arrives at the counter. If the installer stopped writing one of these,
   this file would fail here rather than pass on a default. */
const install = spawnSync('php', [join(root, 'install.php'),
    '--api-address=http://127.0.0.1:' + port + '/api.php',
    '--answers-for=anyone', '--storage=sqlite', '--updated-by=cron',
    '--rate-window-seconds=3600',
    '--rate-writes-per-ip=3',
    '--rate-writes-per-project=1000',
    '--rate-exports-per-ip=2',
    '--rate-reads-per-ip=0',
    '--max-notes-per-project=4',
    '--max-body-bytes=2048',
], { encoding: 'utf8', cwd: root });
check('the installer refused a command line made of its own options',
    install.status === 0, 'exit ' + install.status + '\n' + (install.stderr || install.stdout));

const configPath = join(root, 'internal', 'config-local.php');
const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
for (const line of ["'rate_window_seconds' => 3600", "'rate_writes_per_ip' => 3",
                    "'rate_exports_per_ip' => 2", "'max_notes_per_project' => 4",
                    "'max_body_bytes' => 2048"]) {
    check('the configuration does not carry ' + line, config.includes(line));
}

/* AND NOT TWICE. A key the operator set must not also appear as a commented
   default further down: two lines naming the same key, one live and one not,
   is a file whose reader cannot tell which number is in force. */
for (const key of ['rate_window_seconds', 'rate_writes_per_ip', 'rate_exports_per_ip',
                   'max_body_bytes', 'rate_reads_per_ip']) {
    const times = config.split(new RegExp("'" + key + "'\\s*=>")).length - 1;
    check(`the configuration names ${key} ${times} times, not once`, times === 1,
        config.split('\n').filter((l) => l.includes(key)).join('\n'));
}

const project = 'AAAAAAAAAAAAAAAAAAAAAA';
const index = 'BBBBBBBBBBBBBBBBBBBBBB';
const envelope = (size) => 'ap2.AAAAAAAAAAAAAAAA.' + 'A'.repeat(Math.max(4, size));
const head = {
    'X-Forwarded-Proto': 'https',
    Origin: 'https://example.com',
    'Content-Type': 'application/x-www-form-urlencoded',
};
const call = async (query, body) => {
    const r = await fetch('http://127.0.0.1:' + port + '/api.php?' + query, {
        method: body === undefined ? 'GET' : 'POST',
        headers: head,
        body,
        redirect: 'manual',
    });
    return { status: r.status, retry: r.headers.get('retry-after'), text: await r.text() };
};
const add = (size) => call('action=add', 'project=' + project + '&index=' + index
    + '&mode=encrypted&payload=' + envelope(size));

/* -- Reads: the counter that is off has to be off ------------------------ */

const reads = [];
for (let i = 0; i < 12; i += 1) reads.push(await call('action=list&project=' + project + '&index=' + index));
check('a page load was refused on a server whose read counter is off',
    reads.every((r) => r.status === 200), reads.map((r) => r.status).join(' '));

/* -- Writes per address -------------------------------------------------- */

const writes = [];
for (let i = 0; i < 5; i += 1) writes.push(await add(40));
const accepted = writes.filter((r) => r.status === 200).length;
check('the write limit of 3 accepted ' + accepted + ' writes',
    accepted === 3, writes.map((r) => r.status).join(' '));
const refused = writes.find((r) => r.status === 429);
check('crossing the write limit did not answer 429', Boolean(refused),
    writes.map((r) => r.status + ' ' + r.text.slice(0, 80)).join('\n'));
if (refused) {
    check('the refusal does not say how long to wait', Number(refused.retry) > 0,
        'Retry-After: ' + refused.retry);
    check('the refusal does not name the limit it hit', refused.text.includes('3 per 3600'),
        refused.text.slice(0, 200));
    check('the refusal does not tell the reviewer their text is not lost',
        refused.text.includes('not lost'), refused.text.slice(0, 200));
}

/* -- The body cap, which is refused before anything is parsed ------------ */

const fat = await add(4000);
check('a body over the cap was not refused with 413', fat.status === 413,
    fat.status + ' ' + fat.text.slice(0, 120));

/* -- Exports per address ------------------------------------------------- */

const exports = [];
for (let i = 0; i < 4; i += 1) exports.push(await call('action=text&project=' + project));
const exported = exports.filter((r) => r.status === 200).length;
check('the export limit of 2 allowed ' + exported + ' exports', exported === 2,
    exports.map((r) => r.status).join(' '));
const noMore = exports.find((r) => r.status === 429);
if (noMore) {
    check('an export refusal talks about lost text, which nobody typed',
        !noMore.text.includes('you typed'), noMore.text.slice(0, 200));
    check('an export refusal does not say the notes are unharmed',
        noMore.text.includes('unchanged'), noMore.text.slice(0, 200));
}

/* -- The note cap, which erases nothing ---------------------------------- */

/* The write counter is spent by now, so the cap is met from a second address:
   `client_ip_header` is not set on this server, so the header is ignored --
   the counter is restarted instead, by moving the window on. It is the only
   thing here that touches the file rather than the API, and it touches the
   COUNTER, never a bound. */
const storeFile = (readFileSync(configPath, 'utf8').match(/'file'\s*=>\s*'([^']+)'/) || [])[1];
const sqlite = (sql) => spawnSync('php', ['-r',
    '$db = new PDO("sqlite:" . ' + JSON.stringify(storeFile || '')
    + '); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_NUM);'
    + ' foreach ($db->query(' + JSON.stringify(sql)
    + ') as $row) { echo implode("|", $row), "\\n"; }'],
    { encoding: 'utf8' });

const counters = sqlite("SELECT counter_key FROM notes_rate");
check('the read counter wrote a row on a server where it is off, which costs a '
    + 'database write on every page load',
    !(counters.stdout || '').includes('r-ip:'), (counters.stdout || '').trim());
check('no counter row was written at all, so nothing above was really counted',
    (counters.stdout || '').includes('w-ip:'), (counters.stdout || '').trim());

sqlite("DELETE FROM notes_rate");
const more = [];
for (let i = 0; i < 3; i += 1) more.push(await add(40));
const capped = more.find((r) => r.status === 403);
check('the cap of 4 notes per project let a fifth through', Boolean(capped),
    more.map((r) => r.status).join(' '));
if (capped) {
    check('the note cap does not say it erased nothing',
        capped.text.includes('No note was erased'), capped.text.slice(0, 200));
}
const left = sqlite("SELECT COUNT(*) FROM notes_notes");
check('the note cap erased something', (left.stdout || '').trim() === '4',
    (left.stdout || '').trim());

/* -- And the same server, with the read counter turned on ---------------- */

spawnSync('php', ['-r',
    '$p = ' + JSON.stringify(configPath) + '; $t = file_get_contents($p);'
    + ' $t = str_replace("\'rate_reads_per_ip\' => 0,", "\'rate_reads_per_ip\' => 2,", $t);'
    + ' file_put_contents($p, $t);'], { encoding: 'utf8' });
const configNow = readFileSync(configPath, 'utf8');
check('the read limit could not be turned on by editing the configuration',
    configNow.includes("'rate_reads_per_ip' => 2"), 'not replaced');

/* OPCACHE REVALIDATES ON A CLOCK, not on the write. Its default
   revalidate_freq is two seconds, and the first run of this check spent an
   evening looking like a limit that does not work: the file said 2, the
   server was still answering out of the copy it had compiled a moment
   earlier. Whoever edits a configuration by hand meets the same two seconds. */
await sleep(2500);
sqlite("DELETE FROM notes_rate");
const loads = [];
for (let i = 0; i < 4; i += 1) loads.push(await call('action=list&project=' + project + '&index=' + index));
const served = loads.filter((r) => r.status === 200).length;
check('the read limit of 2 served ' + served + ' page loads', served === 2,
    loads.map((r) => r.status).join(' '));
const tooMany = loads.find((r) => r.status === 429);
if (tooMany) {
    check('the read refusal does not say the page itself is unaffected',
        tooMany.text.includes('page is unaffected'), tooMany.text.slice(0, 200));
    check('the read refusal does not say how long to wait', Number(tooMany.retry) > 0,
        'Retry-After: ' + tooMany.retry);
}

/* -- THE LENGTH OF A FIELD IS THE CODE'S, AND NO FILE CHANGES IT ----------
   Nine of these lengths are the width of a MySQL column the day the table is
   created. While they were configuration, raising one afterwards changed what
   the server ACCEPTED and not what the column could HOLD: measured on MySQL 8
   in strict mode, a plain-mode remark with a 500-character excerpt passed
   every check and died at the insert -- HTTP 500, "your notes may not have
   been saved", the text gone, the reason in the PHP log only. They are
   constants now. This proves the two halves of that: the bound still refuses,
   and a file that still sets the old key changes nothing. */
{
    const port2 = await freePort();
    const dir2 = mkdtempSync(join(tmpdir(), 'annotepage-lengths-'));
    const root2 = join(dir2, 'web');
    cpSync(webroot, root2, { recursive: true });
    const server2 = spawn('php', ['-S', '127.0.0.1:' + port2], {
        cwd: root2, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
    });
    for (let i = 0; i < 40; i += 1) {
        await sleep(150);
        try { await fetch('http://127.0.0.1:' + port2 + '/install.php', { redirect: 'manual' }); break; }
        catch (e) { /* not listening yet */ }
    }
    /* One site's own server: plain mode is allowed there, and plain mode is
       the only mode in which the server sees a field at all. */
    const put = spawnSync('php', [join(root2, 'install.php'),
        '--api-address=http://127.0.0.1:' + port2 + '/api.php',
        '--answers-for=one-site', '--storage=sqlite', '--updated-by=cron',
    ], { encoding: 'utf8', cwd: root2 });
    const path2 = join(root2, 'internal', 'config-local.php');
    check('the plain-mode fixture did not install', put.status === 0,
        (put.stderr || put.stdout || '').slice(0, 300));

    /* A declared project, and the retired key set to something wider than the
       column -- which is exactly what an operator would have done while it was
       a field on the install form. */
    spawnSync('php', ['-r',
        '$p = ' + JSON.stringify(path2) + '; $t = file_get_contents($p);'
        + ' $t = str_replace("return array(", "return array(\n'
        + '    \'max_excerpt_length\' => 900,", $t);'
        + ' $t = str_replace("    \'projects\' => array(),",'
        + ' "    \'projects\' => array(\'AAAAAAAAAAAAAAAAAAAAAA\' => array('
        + '\'origins\' => array(\'https://example.com\'), \'mode\' => \'plain\')),", $t);'
        + ' file_put_contents($p, $t);'], { encoding: 'utf8' });
    await sleep(2500);   // opcache revalidates on a clock, not on the write

    const plain = async (excerptLength) => {
        const body = new URLSearchParams({
            project: 'AAAAAAAAAAAAAAAAAAAAAA', index: 'BBBBBBBBBBBBBBBBBBBBBB',
            mode: 'plain', page: '/x.html', selector: 'main > p',
            excerpt: 'e'.repeat(excerptLength), author: 'somebody',
            text: 'the remark itself',
        });
        const r = await fetch('http://127.0.0.1:' + port2 + '/api.php?action=add', {
            method: 'POST', headers: head, body: body.toString(), redirect: 'manual',
        });
        return { status: r.status, text: await r.text() };
    };

    const atBound = await plain(300);
    check('an excerpt of exactly 300 characters was refused', atBound.status === 200,
        atBound.status + ' ' + atBound.text.slice(0, 200));

    const over = await plain(500);
    check('an excerpt of 500 characters was not refused with a 400 -- a 500 here is '
        + 'the column refusing what the check had accepted, which is the whole bug',
        over.status === 400, over.status + ' ' + over.text.slice(0, 200));
    check('the refusal does not name the limit it applied',
        over.text.includes('the limit is 300'), over.text.slice(0, 200));

    /* And the file that sets the retired key is not merely overruled: the key
       is dropped, so it cannot turn up in a diagnostic beside numbers that do
       decide something. */
    const seen = spawnSync('php', ['-r',
        'define("AP_INTERNAL", 1); require "internal/errors.php";'
        + ' require "internal/config.php"; $c = ap_config();'
        + ' echo isset($c["max_excerpt_length"]) ? "still there" : "dropped";'],
        { encoding: 'utf8', cwd: root2 });
    check('a retired length key survives into the configuration',
        (seen.stdout || '').trim() === 'dropped', seen.stdout + seen.stderr);
    check('nothing was logged about the retired key',
        /ignored/.test(seen.stderr || ''), (seen.stderr || '').slice(0, 200));

    try { server2.kill('SIGKILL'); } catch (e) { /* gone */ }
    rmSync(dir2, { recursive: true, force: true });
}

/* -- AND THE ONE REQUEST THIS SERVER MAKES OF SOMEBODY ELSE ---------------
   ?action=diagnostic has no authentication, and in `full` it asks the release
   host for the published version. Unbounded, that is a 200-byte request from
   a stranger turned into an outbound HTTPS connection from this host, as fast
   as they care to ask. It is bounded by a memory of the last answer, and this
   proves the memory rather than the fetch: no network is used here. */
const probe = (state) => spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require "internal/update.php";'
    + ' @mkdir(".update"); file_put_contents(".update/state.json", '
    + JSON.stringify(state) + ');'
    + ' $age = null; $out = ap_update_probe_remembered($age);'
    + ' echo $out === null ? "(nothing remembered)" : $out . " | " . $age;'],
    { encoding: 'utf8', cwd: root });

const fresh = probe(JSON.stringify({ probe_at: Math.floor(Date.now() / 1000) - 60,
                                     probe_published: '9.9.9' }));
check('a version asked for a minute ago is asked for again',
    (fresh.stdout || '').startsWith('9.9.9 |'), fresh.stdout + fresh.stderr);
check('the line does not say when it was asked',
    (fresh.stdout || '').includes('a minute ago'), fresh.stdout);

const stale = probe(JSON.stringify({ probe_at: Math.floor(Date.now() / 1000) - 5000,
                                     probe_published: '9.9.9' }));
check('an answer from over an hour ago is still served as current',
    (stale.stdout || '').includes('nothing remembered'), stale.stdout);

/* A clock put back, or a directory copied from another machine: a state
   stamped in the future must not pin this line for as long as the difference. */
const ahead = probe(JSON.stringify({ probe_at: Math.floor(Date.now() / 1000) + 5000,
                                     probe_published: '9.9.9' }));
check('a state file stamped in the future is trusted',
    (ahead.stdout || '').includes('nothing remembered'), ahead.stdout);

done();

if (failures.length) {
    console.error('limits:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log('limits: writes, exports, page loads, body size and the note cap each set '
    + 'from the command line, crossed, and refused with the number they name; '
    + "the read counter off writes no row; the diagnostic's outbound probe is "
    + 'remembered, expires, and distrusts a clock from the future; a field length '
    + 'is the code\'s, and a file that still sets one changes nothing');
