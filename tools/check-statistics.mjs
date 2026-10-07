#!/usr/bin/env node
/* check-statistics.mjs -- THE STATISTICS, AT BOTH ENDS, AGAINST REAL SERVERS.
 *
 * A server tells the project, once a day, how much it carries. That is the one
 * thing in this repository that sends something off a machine by default, so
 * what it sends is not left to a comment: it is CAPTURED here, byte for byte,
 * and read.
 *
 * THREE THINGS ARE PROVED, each against php's own server and a real SQLite
 * store, with nothing faked on the side under test:
 *
 *   WHAT LEAVES A SERVER. A receiver written here records the request as it
 *     arrives. Five fields and no sixth; no Origin, no Referer, no cookie; and
 *     nowhere in it the server's own address, a project id or a page index.
 *     Once a day and not once a write, and only after a write that was one.
 *     Nothing from a server nobody used, nothing at all when the key says no
 *     -- between quotes included -- and a receiver that is down, slow or
 *     answering a byte a second costs a bounded time and is said once.
 *
 *   WHICH SERVER RECEIVES, AND WHAT IT DOES WITH WHAT IT IS TOLD. The
 *     receiving code is on every server and answers on one: a server here
 *     proves the address leads to it, writes its own door, and stops
 *     declaring; a stranger who lies about the name opens nothing, and a door
 *     copied by hand opens onto a 404. Then it is declared to: one row per
 *     server and one declaration a day, a new identifier rationed per network,
 *     a first declaration clipped, one step of growth however long the
 *     silence, totals that never go down, a last row, and no address kept.
 *
 *   THAT IT CAN BE REFUSED WHERE IT IS ANNOUNCED. The installer, on both of
 *     its faces: the first screen says it is on without anything being
 *     opened, the field and the option write the line they were asked for,
 *     and a value that is neither yes nor no is refused.
 *
 * AND THIS SUITE DECLARES TO NOBODY. Reporting is on by default, so a test
 * that installs a server and writes a note on it declares to the project's
 * real address -- measured: three declarations per run of `npm run check`.
 * Every server stood here is pointed at a receiver in this process before it
 * can write, and the last section refuses a neighbouring check that installs
 * one without saying no.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, cpSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, utimesSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webroot = join(here, '..', 'server', 'webroot');

const php = spawnSync('php', ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
if (php.error || php.status !== 0) {
    console.log('statistics: no php on this machine, nothing was run');
    process.exit(0);
}
if ((spawnSync('php', ['-r', 'echo extension_loaded("pdo_sqlite")?"yes":"no";'],
    { encoding: 'utf8' }).stdout || '').trim() !== 'yes') {
    console.log('statistics: php has no pdo_sqlite, nothing was run');
    process.exit(0);
}

const failures = [];
const check = (what, ok, detail) => {
    if (!ok) failures.push(what + (detail ? '\n    ' + String(detail).replace(/\n/g, '\n    ') : ''));
};
/* WHAT HAD ALREADY FAILED IS SAID EVEN IF THE FILE THEN FALLS OVER. A check
   that reads a row which was never written throws three lines further down,
   and the stack it leaves names the consequence -- the cause is in the list
   this would otherwise never print. */
process.on('uncaughtException', (error) => {
    console.log('statistics:');
    for (const f of failures) console.log('  ' + f);
    console.log('  and then this file fell over: ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error));
    process.exit(1);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const answered = async (response) => {
    try { await response.arrayBuffer(); } catch (e) { /* the status is what was asked */ }
    return response;
};
const freePort = () => new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});

const standing = [];
const listening = [];
const dirs = [];
const done = () => {
    for (const s of standing) { try { s.kill('SIGKILL'); } catch (e) { /* gone */ } }
    for (const s of listening) { try { s.close(); if (s.closeAllConnections) s.closeAllConnections(); } catch (e) { /* gone */ } }
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
};
process.on('exit', done);

/* -- A receiver that keeps what it is sent, exactly as it arrived -------- */
const received = [];
const listen = async (handler) => {
    const port = await freePort();
    const server = createServer(handler);
    listening.push(server);
    await new Promise((r) => server.listen(port, '127.0.0.1', r));
    return 'http://127.0.0.1:' + port + '/stats.php';
};
const asked = [];
const WORLD = { instances: 412, projects: 1930, notes: 6204 };
const RECEIVER = await listen((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
        // A declaration is a POST. Anything else is somebody asking this
        // address for a file -- the witness of a proof -- and it is not here.
        if (request.method !== 'POST') {
            asked.push(request.method + ' ' + request.url);
            response.writeHead(404);
            return response.end();
        }
        received.push({ method: request.method, url: request.url,
            headers: request.rawHeaders.slice(), body: Buffer.concat(chunks).toString('utf8') });
        // What the real one answers: the word, and the sum of every server.
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(Object.assign({ result: 'recorded' }, WORLD)) + '\n');
    });
});
/* And the receivers nobody wants: one that says a fixed status, one that
   accepts and never answers, one that answers a byte a second for ever. */
const saying = (status) => listen((request, response) => {
    request.resume();
    request.on('end', () => { response.writeHead(status, { 'Content-Type': 'text/plain' }); response.end('no\n'); });
});
const SILENT = await listen((request) => { request.resume(); });
const DRIPPING = await listen((request, response) => {
    request.resume();
    const text = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n';
    let i = 0;
    const drip = setInterval(() => {
        try { response.socket.write(i < text.length ? text[i] : 'X'); i += 1; } catch (e) { clearInterval(drip); }
    }, 1000);
    response.socket.on('close', () => clearInterval(drip));
});
const settle = () => sleep(400);

/** A throwaway server: its own directory, port and store. NOT installed yet. */
const stand = async (name) => {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-statistics-' + name + '-'));
    dirs.push(dir);
    const root = join(dir, 'web');
    cpSync(webroot, root, { recursive: true });
    /* revalidate_freq=0: php's own server runs with the opcode cache, which
       by default looks at a file's date every two seconds. This file changes
       a configuration and asks the next request what it thinks of it; a cache
       two seconds behind answered for the previous one -- measured, as a
       server that went on declaring after being told not to. */
    const server = spawn('php', ['-d', 'opcache.revalidate_freq=0', '-S', '127.0.0.1:' + port], {
        cwd: root, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
    });
    standing.push(server);
    const base = 'http://127.0.0.1:' + port;
    for (let i = 0; i < 40; i += 1) {
        await sleep(150);
        try { await answered(await fetch(base + '/install.php', { redirect: 'manual' })); break; }
        catch (e) { /* not listening yet */ }
    }
    const configPath = join(root, 'internal', 'config-local.php');
    const it = {
        name, port, dir, root, base, configPath,
        /* INSTALLED, AND POINTED AT THE RECEIVER ABOVE IN THE SAME BREATH. No
           server stood by this file exists for an instant with a note on it
           and the project's real address in force. */
        install: (extra, plainHttp) => {
            const run = spawnSync('php', [join(root, 'install.php'),
                '--api-address=' + base + '/api.php', '--answers-for=anyone', '--storage=sqlite',
                '--updated-by=cron', '--diagnostic=full',
                ...(plainHttp === false ? [] : ['--allow-plain-http=true']), ...(extra || [])],
                { encoding: 'utf8', cwd: root });
            if (existsSync(configPath)) it.set(["    'statistics_address' => '" + RECEIVER + "',"]);
            return run;
        },
        config: () => (existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''),
        /* Keys added AFTER the installer, at the end of the array: PHP keeps
           the last of two lines naming one key, so this decides. */
        set: (lines) => {
            const text = readFileSync(configPath, 'utf8');
            const at = text.lastIndexOf(');');
            writeFileSync(configPath, text.slice(0, at) + lines.join('\n') + '\n' + text.slice(at));
        },
        sqlite: (sql) => {
            const file = (readFileSync(configPath, 'utf8').match(/'file'\s*=>\s*'([^']+)'/) || [])[1];
            return spawnSync('php', ['-r',
                '$db = new PDO("sqlite:" . ' + JSON.stringify(file || '')
                + '); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);'
                + ' $q = $db->query(' + JSON.stringify(sql) + ');'
                + ' if ($q) { foreach ($q->fetchAll(PDO::FETCH_NUM) as $row) { echo implode("|", $row), "\\n"; } }'],
                { encoding: 'utf8' }).stdout.trim();
        },
        add: async (project, index) => {
            const r = await fetch(base + '/api.php?action=add', {
                method: 'POST',
                headers: { Origin: 'https://site.example.com', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'project=' + project + '&index=' + index
                    + '&mode=encrypted&payload=ap2.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA',
                redirect: 'manual',
            });
            return { status: r.status, text: await r.text() };
        },
        /* NOT spawnSync: the receivers live in this process, and a synchronous
           child would leave nobody to answer the request it makes. Measured
           -- the request arrived and PHP read no answer. */
        daily: () => new Promise((resolve) => {
            const started = Date.now();
            const child = spawn('php', [join(root, 'internal', 'maintenance.php')], { cwd: root });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (c) => { stdout += c; });
            child.stderr.on('data', (c) => { stderr += c; });
            child.on('close', (status) => resolve({ status, stdout, stderr, took: Date.now() - started }));
        }),
        memory: () => {
            const raw = it.sqlite("SELECT value FROM notes_memory WHERE name = 'statistics'");
            return raw ? JSON.parse(raw) : null;
        },
        /* A day goes by: the date of the last report is moved back. The gate
           is a date, and waiting for it is not a test. */
        aDayLater: () => {
            const memory = it.memory();
            if (!memory) return '';
            memory.last -= 83000;   // twenty-three hours and a little
            it.sqlite("UPDATE notes_memory SET value = '" + JSON.stringify(memory) + "' WHERE name = 'statistics'");
            return memory.id;
        },
        // Said to have come over https, as a proxy would say it: a server
        // nobody installed allows nothing else, and would send this away.
        diagnostic: async () => (await fetch(base + '/api.php?action=diagnostic',
            { headers: { 'X-Forwarded-Proto': 'https' }, redirect: 'manual' })).text(),
    };
    return it;
};

const P1 = 'AAAAAAAAAAAAAAAAAAAAAA';
const P2 = 'CCCCCCCCCCCCCCCCCCCCCC';
const I1 = 'BBBBBBBBBBBBBBBBBBBBBB';
const I2 = 'DDDDDDDDDDDDDDDDDDDDDD';
/* A page index is an HMAC under a key of ITS project, so two projects never
   share one. The second project gets its own here, as it would in life. */
const I3 = 'EEEEEEEEEEEEEEEEEEEEEE';
const VERSION = readFileSync(join(webroot, 'VERSION'), 'utf8').trim();
const statisticsLines = (text) => text.split('\n').filter((l) => /statistics/i.test(l)).join('\n');

/* ======================================================================
   1. WHAT LEAVES A SERVER
   ====================================================================== */

const site = await stand('site');
const installed = site.install();
check('the installer refused its own command line', installed.status === 0,
    installed.stderr || installed.stdout);
check('the shell installer does not say, once it has installed, that the daily line also tells the project how much this server carries',
    /unless you said no, tells the project how much this server carries/.test(installed.stdout.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')),
    installed.stdout.split('\n').filter((l) => /housekeeping|carries/.test(l)).join('\n'));
check('an untouched installation does not write report_statistics as an active line, switched on',
    /^\s*'report_statistics' => true,/m.test(site.config()), statisticsLines(site.config()));

/* NOBODY HAS WRITTEN A NOTE. The daily command runs, and nothing leaves. */
let ran = await site.daily();
await settle();
check('a server no note was ever written on declared itself', received.length === 0,
    JSON.stringify(received));
check('the daily command failed on a server with no note', ran.status === 0, ran.stderr || ran.stdout);
check('a server no note was ever written on drew an identifier', (site.memory() || { id: '' }).id === '',
    JSON.stringify(site.memory()));
site.sqlite("DELETE FROM notes_memory");

/* A WRITE THAT IS REFUSED IS NOT A NOTE: nothing leaves, and the day is not
   spent -- or a stranger with a project id decides when this server calls. */
const refusedWrite = await site.add(P1, 'not an index');
await settle();
check('a malformed write was accepted', refusedWrite.status === 400, refusedWrite.status + ' ' + refusedWrite.text);
check('a write that was refused sent a declaration, or spent the day',
    received.length === 0 && site.memory() === null, received.length + ' request(s), ' + JSON.stringify(site.memory()));

/* THREE NOTES, TWO PROJECTS, THREE PAGES -- and the first write is what sends. */
const first = await site.add(P1, I1);
check('a first note was refused', first.status === 200, first.status + ' ' + first.text);
await settle();
check('the first write of the day did not send one declaration', received.length === 1,
    received.length + ' request(s)');
await site.add(P1, I2);
await site.add(P2, I3);
await settle();
check('later writes of the same day declared again: the gate is a date, not a write',
    received.length === 1, received.length + ' request(s)');
ran = await site.daily();
await settle();
check('the daily command declared a second time the same day', received.length === 1,
    received.length + ' request(s)');
check('the daily command spoke of statistics on a day it sent nothing',
    !/Statistics:/.test(ran.stdout), ran.stdout);

const one = received[0] || { method: '', url: '', headers: [], body: '' };
const sent = new URLSearchParams(one.body);
const headerNames = one.headers.filter((h, i) => i % 2 === 0).map((h) => h.toLowerCase());
const header = (name) => one.headers[one.headers.findIndex((h, i) => i % 2 === 0 && h.toLowerCase() === name) + 1];
check('the declaration is not a POST to the address configured',
    one.method === 'POST' && one.url === '/stats.php', one.method + ' ' + one.url);
check('the declaration does not carry exactly five fields: id, version, projects, notes, pages',
    [...sent.keys()].sort().join(',') === 'id,notes,pages,projects,version', [...sent.keys()].join(','));
check('the identifier is not 22 characters of base64url', /^[A-Za-z0-9_-]{22}$/.test(sent.get('id') || ''),
    sent.get('id'));
check('the version sent is not the one in VERSION', sent.get('version') === VERSION, sent.get('version'));
/* The first write sent, so it counted what existed then: one note. */
check('the first declaration does not count the one project, one note and one page that existed',
    sent.get('projects') === '1' && sent.get('notes') === '1' && sent.get('pages') === '1', one.body);
check('the body was not sent with its length and its type',
    header('content-length') === String(one.body.length)
        && header('content-type') === 'application/x-www-form-urlencoded', one.headers.join(' | '));
/* A CLOSED LIST, not a list of what is forbidden: a header nobody thought to
   forbid is how a host name would leave. `accept` is curl's own. */
const allowed = ['host', 'user-agent', 'accept', 'content-type', 'content-length', 'connection'];
check('the declaration carries a header that is not one of: ' + allowed.join(', '),
    headerNames.every((h) => allowed.includes(h)), one.headers.join(' | '));
check('a server that was never called by the receiving name asked the receiver for a file',
    asked.length === 0, asked.join(' | '));
check('the user agent does not say what this is', header('user-agent') === 'annotepage-statistics/' + VERSION,
    header('user-agent'));
const whole = one.headers.join('\n') + '\n' + one.body;
for (const [what, text] of [['its own address', '127.0.0.1:' + site.port], ['a project id', P1],
    ['a page index', I1], ['the path of its store', 'notes.sqlite'], ['its directory', site.dir]]) {
    check('the declaration names ' + what, !whole.includes(text), whole);
}

/* THE IDENTIFIER IS DRAWN, NOT DERIVED: a second server, installed the same
   way on the same machine, draws another. */
const twin = await stand('twin');
twin.install();
await twin.add(P1, I1);
await settle();
const twinId = new URLSearchParams((received[1] || { body: '' }).body).get('id');
check('two servers installed the same way did not draw two identifiers',
    received.length === 2 && /^[A-Za-z0-9_-]{22}$/.test(twinId || '') && twinId !== sent.get('id'),
    twinId + ' / ' + sent.get('id'));

/* ON, FOR A SERVER WHOSE CONFIGURATION SAYS NOTHING ABOUT IT -- which is
   every server installed before this existed, on the day it updates. */
const older = await stand('older');
older.install();
writeFileSync(older.configPath, older.config().replace(/^\s*'report_statistics' => true,\n/m, ''));
check('the line could not be taken out of the configuration', !/'report_statistics'/.test(older.config().replace(/\/\/.*$/gm, '')));
let count = received.length;
await older.add(P1, I1);
await settle();
check('a server whose configuration does not name report_statistics did not declare: it is on by default',
    received.length === count + 1, (received.length - count) + ' request(s)');

/* THE NEXT DAY: the same identifier, and what was written since. */
const idBefore = site.aDayLater();
check('the server did not remember the identifier it drew', idBefore === sent.get('id'), idBefore);
count = received.length;
ran = await site.daily();
await settle();
const two = new URLSearchParams((received[count] || { body: '' }).body);
check('a day later the daily command did not declare', received.length === count + 1, (received.length - count) + ' request(s)');
check('a day later the identifier changed: the receiver would count this server twice',
    two.get('id') === sent.get('id'), two.get('id') + ' / ' + sent.get('id'));
check('the second declaration does not count 2 projects, 3 notes and 3 pages',
    two.get('projects') === '2' && two.get('notes') === '3' && two.get('pages') === '3', (received[count] || {}).body);
/* AND NOTHING ON THE ERROR STREAM. A deprecation raised where the file is
   compiled goes there on every run, and to the error log on every request:
   measured on PHP 8.5, with a variable the http wrapper used to leave behind. */
check('the daily command wrote to its error stream', ran.stderr === '', ran.stderr);
check('the daily command does not say everything it sent, and how to stop it',
    /Statistics: sent this server's random identifier, its version and three totals -- 2 projects, 3 notes, 3 pages\. report_statistics => false turns it off\./.test(ran.stdout),
    ran.stdout);
/* AND THE DAY AFTER THAT, from a write: the slot is overwritten, not only
   created, so the gate still holds on the third day and the fourth. */
site.aDayLater();
count = received.length;
await site.add(P1, I1);
await site.add(P1, I1);
await settle();
check('on the third day a write did not declare once, and only once', received.length === count + 1,
    (received.length - count) + ' request(s)');

/* THE GATE IS A DAY, not an hour: twenty-two hours after a report, a write
   and the daily command both send nothing. */
const almost = site.memory();
almost.last -= 79200;
site.sqlite("UPDATE notes_memory SET value = '" + JSON.stringify(almost) + "' WHERE name = 'statistics'");
count = received.length;
await site.add(P1, I1);
ran = await site.daily();
await settle();
check('twenty-two hours after a report, another one was sent: the gate is a day', received.length === count,
    (received.length - count) + ' request(s)');
site.sqlite("DELETE FROM notes_notes WHERE id = (SELECT MAX(id) FROM notes_notes)");

/* AND IT IS ON WRITES. A page that loads its notes on a day a report is owed
   sends nothing: reading is what every visitor does, all day. */
site.aDayLater();
count = received.length;
const read = await fetch(site.base + '/api.php?action=list&project=' + P1 + '&index=' + I1,
    { headers: { Origin: 'https://site.example.com' } });
const listed = JSON.parse(Buffer.from(await read.arrayBuffer()).toString('utf8'));
await settle();
check('a page loading its notes sent the day\'s declaration: that belongs to writes',
    read.status === 200 && received.length === count, read.status + ', ' + (received.length - count) + ' request(s)');

/* WHAT CAME BACK WITH THE YES IS KEPT, AND HANDED TO THE PANEL: the sum of
   every server, three numbers, on the call the page already makes. */
const worldOf = (answer) => (answer && answer.data ? answer.data.world : answer && answer.world);
const lists = async (it, project, index) => JSON.parse(await (await fetch(it.base + '/api.php?action=list&project='
    + (project || P1) + '&index=' + (index || I1), { headers: { Origin: 'https://site.example.com' } })).text());
/* IT IS KEPT TO BE SHOWN FROM THE NEXT DAY, NOT FROM NOW. A page that showed
   a new sum the moment its server received it would say when that server
   reported; every server that reported today starts showing at midnight UTC. */
const utcDay = (back) => new Date(Date.now() - (back || 0) * 86400000).toISOString().slice(0, 10);
const worldRow = () => site.sqlite("SELECT value FROM notes_memory WHERE name = 'statistics-world'");
const setWorld = (row) => site.sqlite("UPDATE notes_memory SET value = '" + JSON.stringify(row) + "' WHERE name = 'statistics-world'");
check('what is kept of the sum received today is not the three numbers and the day, waiting, with nothing shown yet',
    worldRow() === JSON.stringify({ at: 0, i: 0, p: 0, n: 0, d: utcDay(), di: 412, dp: 1930, dn: 6204 }), worldRow());
check('the sum was shown on the day it was received: the moment a page changes would say when its server reported',
    worldOf(listed) === undefined, JSON.stringify(worldOf(listed)));
const keptWorld = JSON.parse(worldRow());
const waitingSince = (days) => setWorld(Object.assign({}, keptWorld, { d: utcDay(days) }));
waitingSince(1);
check('the day after, the list of notes does not carry the three totals of every server',
    JSON.stringify(worldOf(await lists(site))) === JSON.stringify({ servers: 412, sites: 1930, notes: 6204 }), JSON.stringify(await lists(site)).slice(0, 300));
check('showing it wrote something: which sum is shown is decided by the date, on a call that only reads',
    worldRow() === JSON.stringify(Object.assign({}, keptWorld, { d: utcDay(1) })), worldRow());
/* A SUM A MONTH OLD IS NOT THE PRESENT, and is not shown as if it were. */
waitingSince(29);
const stillShown = worldOf(await lists(site));
waitingSince(32);
const tooOld = worldOf(await lists(site));
check('a sum 29 days old was dropped, or one 32 days old is still shown', !!stillShown && tooOld === undefined,
    JSON.stringify(stillShown) + ' / ' + JSON.stringify(tooOld));
/* AND FEW IS NOT SHOWN AS IF IT WERE MANY. Under a thousand notes or fifty
   sites, nothing; under ten servers, the sites and the notes without them. */
const withSum = async (i, p, n) => { setWorld({ at: 0, i: 0, p: 0, n: 0, d: utcDay(1), di: i, dp: p, dn: n }); return JSON.stringify(worldOf(await lists(site))); };
check('a sum of 999 notes is shown, or one of 1000 is not',
    await withSum(50, 60, 999) === undefined && await withSum(50, 60, 1000) === '{"servers":50,"sites":60,"notes":1000}',
    await withSum(50, 60, 999) + ' / ' + await withSum(50, 60, 1000));
check('49 sites are counted out loud, or 50 are not: under fifty the notes are shown without them',
    await withSum(50, 49, 5000) === '{"servers":50,"notes":5000}' && await withSum(50, 50, 5000) === '{"servers":50,"sites":50,"notes":5000}',
    await withSum(50, 49, 5000) + ' / ' + await withSum(50, 50, 5000));
check('nine servers are counted out loud, or ten are not',
    await withSum(9, 300, 5000) === '{"sites":300,"notes":5000}' && await withSum(10, 300, 5000) === '{"servers":10,"sites":300,"notes":5000}',
    await withSum(9, 300, 5000) + ' / ' + await withSum(10, 300, 5000));
check('many notes on few sites and few servers are not shown as the notes alone', await withSum(2, 3, 5000) === '{"notes":5000}', await withSum(2, 3, 5000));
/* THE SUM SHOWN STAYS UNTIL THE ONE THAT WAITS IS A DAY OLD, and a row that
   is not what this server writes shows nothing. */
setWorld({ at: Math.floor(Date.now() / 1000) - 86400, i: 20, p: 70, n: 2000, d: utcDay(), di: 30, dp: 80, dn: 3000 });
check('with a newer sum waiting since today, the one before it was dropped or the new one shown early',
    JSON.stringify(worldOf(await lists(site))) === '{"servers":20,"sites":70,"notes":2000}', JSON.stringify(worldOf(await lists(site))));
for (const bad of [{ at: 0, i: 0, p: 0, n: 0, d: utcDay(1), di: 30, dp: -80, dn: 3000 }, { at: 0, i: 0, p: 0, n: 0, d: utcDay(1), di: '30', dp: 80, dn: 3000 },
    { at: 0, i: 0, p: 0, n: 0, d: 'yesterday', di: 30, dp: 80, dn: 3000 }, { d: utcDay(1), di: 30, dp: 80, dn: 3000 }]) {
    setWorld(bad);
    check('a kept row that is not one was shown: ' + JSON.stringify(bad), worldOf(await lists(site)) === undefined, JSON.stringify(worldOf(await lists(site))));
}
/* THE DAY IT WAITS FROM IS THE LATER OF ITS OWN AND THE RECEIVER'S. A report
   that left a second before midnight is answered a second after it, with the
   sum every other server is only given that new day: tagged with the day it
   left, it would be shown at once, on one site alone. */
const askEarly = (code) => spawnSync('php', ['-r', 'define("AP_INTERNAL", 1); function ap_log($m) {} require '
    + JSON.stringify(join(webroot, 'internal', 'statistics.php')) + '; ' + code], { encoding: 'utf8' }).stdout.trim();
const tagged = (now, sum) => askEarly('class S { public $v = ""; function remembered($n) { return $this->v; } function remember($n, $v) { $this->v = $v; return true; } }'
    + ' $s = new S(); ap_statistics_keep_world($s, json_decode(' + JSON.stringify(JSON.stringify(sum)) + ', true), ' + now + '); echo $s->v;');
const midnight = Math.floor(Date.now() / 86400000) * 86400;
const lateAnswer = JSON.parse(tagged(midnight - 1, { result: 'recorded', instances: 40, projects: 310, notes: 5200, day: utcDay() }) || '{}');
check('a report that left before midnight and was answered after it is tagged with the day it left', lateAnswer.d === utcDay() && lateAnswer.dn === 5200,
    JSON.stringify(lateAnswer));
const noDay = JSON.parse(tagged(midnight - 1, { result: 'recorded', instances: 40, projects: 310, notes: 5200 }) || '{}');
const oddDay = JSON.parse(tagged(midnight + 5, { result: 'recorded', instances: 40, projects: 310, notes: 5200, day: '<b>' }) || '{}');
const earlyDay = JSON.parse(tagged(midnight + 5, { result: 'recorded', instances: 40, projects: 310, notes: 5200, day: utcDay(3) }) || '{}');
check('with no day in the answer, one that is not a day, or one earlier than its own, a server does not tag with its own',
    noDay.d === utcDay(1) && oddDay.d === utcDay() && earlyDay.d === utcDay(), [noDay.d, oddDay.d, earlyDay.d].join(' '));
/* NOTHING RECEIVED NOW CHANGES WHAT IS SHOWN NOW, WHATEVER THE CLOCKS SAY.
   Sixteen thousand reports, a few hours to two days apart, from servers whose
   clock is right, behind, ahead, or jumps by up to forty years either way,
   to a receiver that says any day at all, the year 9999 included: what the
   page is handed just before a report and just after it is the same, every
   time. And none of it leaves a server showing nothing for good: four days of
   right clocks later, each shows what it was last given. */
const steady = askEarly('class S { public $v = ""; function remembered($n) { return $this->v; } function remember($n, $v) { $this->v = $v; return true; } }'
    + ' $changed = 0; $stuck = 0; $pairs = 0;'
    + ' for ($seed = 1; $seed <= 40; $seed++) { mt_srand($seed); $s = new S(); $c = array(); $now = 1800000000; $n = 2000;'
    + '  for ($k = 0; $k < 400; $k++) { $now += mt_rand(3600, 172800); $n += mt_rand(0, 50); $at = $now;'
    // the clock itself, wrong now and then: seconds to forty years, both ways
    + '   $wrong = mt_rand(0, 19); if ($wrong === 0) { $at = $now - mt_rand(1, 1260000000); } if ($wrong === 1) { $at = $now + mt_rand(1, 1260000000); }'
    + '   if ($wrong === 2) { $at = (int) (floor($now / 86400) * 86400) + mt_rand(-2, 2); }'
    + '   $skew = array(0, 0, 0, -1, 1, -3, 3, 40, -40, 20000)[mt_rand(0, 9)]; $day = gmdate("Y-m-d", $at + $skew * 86400);'
    + '   if ($skew === 20000) { $day = "9999-12-31"; }'
    + '   $sum = array("instances" => 40, "projects" => 310, "notes" => $n) + (mt_rand(0, 9) ? array("day" => $day) : array());'
    + '   $before = json_encode(ap_statistics_world($c, $s, $at)); ap_statistics_keep_world($s, $sum, $at);'
    + '   $after = json_encode(ap_statistics_world($c, $s, $at)); $pairs++; if ($before !== $after) { $changed++; } }'
    // and then four days of a clock that is right and a receiver that says so
    + '  for ($k = 0; $k < 4; $k++) { $now += 86400; ap_statistics_keep_world($s, array("instances" => 41, "projects" => 311, "notes" => 9000 + $k, "day" => gmdate("Y-m-d", $now)), $now); }'
    + '  $end = ap_statistics_world($c, $s, $now); if (!is_array($end) || $end["notes"] < 9000) { $stuck++; } }'
    + ' echo $pairs, " pairs, ", $changed, " changed, ", $stuck, " stuck";');
check('a report changed what the page is shown at the moment it was made, or a clock once wrong left a server showing nothing for good',
    steady === '16000 pairs, 0 changed, 0 stuck', steady);
waitingSince(1);
/* AND A SERVER THAT SAYS NO SHOWS NONE, kept or not: it is asked nothing. */
const configBefore = site.config();
site.set(["    'report_statistics' => false,"]);
const afterNo = worldOf(await lists(site));
writeFileSync(site.configPath, configBefore);
check('a server that refused the statistics still shows the sum it once received', afterNo === undefined, JSON.stringify(afterNo));
check('the sum is not shown again once the refusal is lifted', !!worldOf(await lists(site)));
setWorld(keptWorld);
ran = await site.daily();
await settle();

/* EVER CARRIED, NOT HELD TODAY. Every note expires; the total does not move. */
site.set(["    'max_note_age_days' => 1,"]);
site.sqlite("UPDATE notes_notes SET created_at = '2001-01-01 00:00:00'");
site.aDayLater();
ran = await site.daily();
check('the sweep did not remove the five notes', /Swept: 5 rows/.test(ran.stdout), ran.stdout);
check('no note was left to count', site.sqlite('SELECT COUNT(*) FROM notes_notes') === '0');
site.aDayLater();
count = received.length;
ran = await site.daily();
await settle();
const afterSweep = new URLSearchParams((received[count] || { body: '' }).body);
check('with every note expired, nothing was declared: a server that swept is not an empty one',
    received.length === count + 1, (received.length - count) + ' request(s)');
check('once every note had expired, the declaration stopped counting them: a total that shrinks',
    afterSweep.get('notes') === '5' && afterSweep.get('pages') === '3' && afterSweep.get('projects') === '2',
    (received[count] || {}).body);

/* THE KEY THAT SAYS NO -- written as a boolean, and written between quotes. */
for (const [how, line] of [['false', "'report_statistics' => false,"], ["'false' between quotes", "'report_statistics' => 'false',"]]) {
    count = received.length;
    site.set(['    ' + line]);
    site.aDayLater();
    ran = await site.daily();
    await site.add(P1, I1);
    await settle();
    check('with report_statistics ' + how + ', something was sent', received.length === count,
        (received.length - count) + ' request(s)');
    check('with report_statistics ' + how + ', the daily command still speaks of statistics: a line a day to somebody who said no',
        ran.status === 0 && !/Statistics/.test(ran.stdout), ran.stdout);
    check('with report_statistics ' + how + ', the diagnostic does not say that nothing is sent',
        /config\.report_statistics\s+no -- nothing is sent/.test(await site.diagnostic()),
        statisticsLines(await site.diagnostic()));
}

/* A RECEIVER THAT IS NOT THERE costs nothing, is not asked twice a day, and
   is said ONCE -- not every morning to somebody who can do nothing about it. */
const deaf = await stand('deaf');
deaf.install();
const closed = await freePort();
deaf.set(["    'statistics_address' => 'http://127.0.0.1:" + closed + "/stats.php',"]);
let t0 = Date.now();
const written = await deaf.add(P1, I1);
check('with the receiver down, a note was not saved', written.status === 200, written.status + ' ' + written.text);
check('with the receiver down, the visitor waited ' + (Date.now() - t0) + ' ms for their note', Date.now() - t0 < 3000);
const slot = deaf.memory();
check('with the receiver down, the day was not claimed: every write would try again',
    !!slot && Math.abs(slot.last - Date.now() / 1000) < 120, JSON.stringify(slot));
deaf.aDayLater();
/* The write above already failed to declare, after its answer, where nobody
   could be told. That must not have used up the one telling: the daily
   command is the one that can say it, and it does. */
check('a failure nobody could be told of was marked as told', (deaf.memory() || {}).quiet === 0, JSON.stringify(deaf.memory()));
ran = await deaf.daily();
check('with the receiver down, the daily command failed', ran.status === 0, ran.stderr || ran.stdout);
check('with the receiver down, the daily command does not say so, and that it will not say it again',
    /Statistics: not sent -- .* Nothing else depends on it, it is tried again every day, and this is not repeated until one goes through\./.test(ran.stdout),
    ran.stdout);
deaf.aDayLater();
ran = await deaf.daily();
check('with the receiver still down the next day, the daily command said it again',
    ran.status === 0 && !/Statistics:/.test(ran.stdout), ran.stdout);
deaf.set(["    'statistics_address' => '" + RECEIVER + "',"]);
deaf.aDayLater();
ran = await deaf.daily();
check('once the receiver was back, the daily command did not send', /Statistics: sent /.test(ran.stdout), ran.stdout);
deaf.set(["    'statistics_address' => 'http://127.0.0.1:" + closed + "/stats.php',"]);
deaf.aDayLater();
ran = await deaf.daily();
check('a failure after a success was not said: the silence is for a failure already told',
    /Statistics: not sent -- /.test(ran.stdout), ran.stdout);
check('the diagnostic does not say what is sent, and where',
    /config\.report_statistics\s+yes -- once a day: a random id, the version and three totals, to http:\/\/127\.0\.0\.1:/.test(await deaf.diagnostic()),
    statisticsLines(await deaf.diagnostic()));

/* A RECEIVER THAT ANSWERS 404 OR 429 IS NOT NEWS: the file may not be there
   yet, or it is rationing on the day every server updates. Nobody running
   this server can act on either. */
for (const status of [404, 429]) {
    const turned = await stand('turned-away-' + status);
    turned.install();
    turned.set(["    'statistics_address' => '" + await saying(status) + "',"]);
    await turned.add(P1, I1);
    turned.aDayLater();
    // Whatever the write above made of it, the daily command starts with
    // nothing already said -- so that a line here would be one it chose.
    turned.sqlite("UPDATE notes_memory SET value = REPLACE(value, '\"quiet\":1', '\"quiet\":0')");
    ran = await turned.daily();
    check('a receiver that answers ' + status + ' was taken for a failure to say once: it is not one',
        (turned.memory() || {}).quiet === 0, JSON.stringify(turned.memory()));
    check('a receiver that answers ' + status + ' made the daily command fail or complain',
        ran.status === 0 && ran.stderr === '' && !/Statistics:/.test(ran.stdout), ran.status + ' ' + ran.stdout + ran.stderr);
}

/* A REDIRECT IS NOT FOLLOWED: it is a second address nobody chose, and the
   classic way from https down to http. The receiver below points at the real
   one of this file; nothing may arrive there. */
const elsewhere = await listen((request, response) => {
    request.resume();
    request.on('end', () => { response.writeHead(307, { Location: RECEIVER }); response.end(); });
});
const sentAway = await stand('sent-away');
sentAway.install();
sentAway.set(["    'statistics_address' => '" + elsewhere + "',"]);
count = received.length;
await sentAway.add(P1, I1);
sentAway.aDayLater();
ran = await sentAway.daily();
await settle();
check('a redirect was followed: the declaration went to an address the configuration does not name',
    received.length === count && /Statistics: not sent -- the receiver answered HTTP 307/.test(ran.stdout),
    (received.length - count) + ' request(s) ' + ran.stdout);

/* A RECEIVER THAT ACCEPTS AND SAYS NOTHING, AND ONE THAT ANSWERS A BYTE A
   SECOND FOR EVER. The deadline is the clock: two seconds where a visitor
   waits, five from the daily command. A timeout counted per read never ends
   on the second one -- measured at 40 s and still held, before the socket was
   read here against a deadline. */
for (const [name, address] of [['says nothing', SILENT], ['answers a byte a second', DRIPPING]]) {
    const slow = await stand('slow');
    slow.install();
    slow.set(["    'statistics_address' => '" + address + "',"]);
    t0 = Date.now();
    const kept = await slow.add(P1, I1);
    const waited = Date.now() - t0;
    check('with a receiver that ' + name + ', the note was not saved', kept.status === 200, kept.status + ' ' + kept.text);
    check('with a receiver that ' + name + ', the visitor waited ' + waited + ' ms: the deadline is two seconds'
        + ' -- and it is a deadline, not a first second of silence', waited > 1500 && waited < 3700);
    slow.aDayLater();
    ran = await slow.daily();
    check('with a receiver that ' + name + ', the daily command took ' + ran.took + ' ms: the deadline is five seconds',
        ran.status === 0 && ran.took > 4000 && ran.took < 7000, ran.stdout + ran.stderr);
    check('with a receiver that ' + name + ', the daily command does not say it got no answer',
        /Statistics: not sent -- /.test(ran.stdout), ran.stdout);
}

/* THE ADDRESS IS HTTPS, the default is the project's, and a no is a no. */
const ask = (code) => spawnSync('php', ['-r', 'define("AP_INTERNAL", 1); function ap_log($m) {} require '
    + JSON.stringify(join(webroot, 'internal', 'statistics.php')) + '; ' + code], { encoding: 'utf8' }).stdout.trim();
check('the default address is not the project\'s own, over https',
    ask('echo ap_statistics_address(array());') === 'https://api.annotepage.com/stats.php',
    ask('echo ap_statistics_address(array());'));
check('a plain http address is taken on a server that does not allow plain http',
    ask('var_export(ap_statistics_address(array("statistics_address" => "http://example.com/stats.php"), $why)); echo " ", $why;')
        === 'NULL `statistics_address` must begin with https://.');
check('an address with a line break in it is taken',
    ask('var_export(ap_statistics_address(array("statistics_address" => "https://example.com/\\nstats.php")));') === 'NULL');
/* THE SAME WAYS OUT AS THE UPDATER, and no third: where the installer and the
   diagnostic say there is no way out, there is none for this either. */
const wayOut = spawnSync('php', ['-d', 'allow_url_fopen=0', '-d', 'disable_functions=curl_init,curl_exec', '-r',
    'define("AP_INTERNAL", 1); function ap_log($m) {} require ' + JSON.stringify(join(webroot, 'internal', 'statistics.php'))
    + '; var_export(ap_statistics_transport()); echo "|"; var_export(ap_statistics_able(array()));'], { encoding: 'utf8' }).stdout.trim();
check('with no curl and allow_url_fopen off, this file still finds a way out the updater does not have',
    wayOut === 'NULL|false', wayOut);
check('report_statistics is not on when nothing says otherwise',
    ask('var_export(ap_statistics_reports(array()));') === 'true');
for (const no of ['false', '"false"', '"FALSE"', '"no"', '"off"', '"0"', '0', '""', 'null']) {
    check('report_statistics => ' + no + ' is read as a yes',
        ask('var_export(ap_statistics_reports(array("report_statistics" => ' + no + ')));') === 'false');
}
check('a store that cannot remember is still asked to report, or its totals are counted',
    ask('class Old { public $counted = 0; function serverTotals() { $this->counted++; return array("projects"=>1,"notes"=>1,"pages"=>1); } }'
        + ' $o = new Old(); $r = ap_statistics_run(array("report_statistics" => true), $o); var_export($r["sent"]); echo "|", $r["line"], "|", $o->counted;')
        === 'false||0');
check('the diagnostic does not say REFUSED for an address that is not https',
    /yes, but REFUSED -- `statistics_address` must begin with https/.test(
        ask('$l = ap_statistics_diagnostic_lines(array("statistics_address" => "http://example.com/s")); echo $l[0][1];')));
/* A STORE THAT CANNOT RECORD THE SLOT COSTS A READ, NEVER THE COUNT. The count
   walks the whole notes table; done before the slot is claimed, a store that
   refuses the record would pay it on every single write. */
check('a store that cannot record the day still had its whole table counted',
    ask('class Mute { public $counted = 0; function remembered($n) { return ""; } function remember($n, $v) { return false; }'
        + ' function serverTotals() { $this->counted++; return array("projects"=>1,"notes"=>1,"pages"=>1); } }'
        + ' $o = new Mute(); $r = ap_statistics_run(array("report_statistics" => true, "allow_plain_http" => true,'
        + ' "statistics_address" => "' + RECEIVER + '"), $o); var_export($r["sent"]); echo "|", $o->counted;')
        === 'false|0');

/* AN UPDATE CAUGHT HALFWAY. The updater puts files in place one at a time and
   api.php comes before internal/statistics.php: for an instant, and for ever
   if the process dies there, the new api.php stands without it. */
const halfway = await stand('halfway');
halfway.install();
rmSync(join(halfway.root, 'internal', 'statistics.php'));
const stillWrites = await halfway.add(P1, I1);
const stillReads = await fetch(halfway.base + '/api.php?action=list&project=' + P1 + '&index=' + I1,
    { headers: { Origin: 'https://site.example.com' } });
ran = await halfway.daily();
check('without internal/statistics.php, a note is refused: an update caught halfway is an outage',
    stillWrites.status === 200, stillWrites.status + ' ' + stillWrites.text);
check('without internal/statistics.php, a page is not served its notes', stillReads.status === 200, stillReads.status);
check('without internal/statistics.php, the daily command fails', ran.status === 0 && ran.stderr === '', ran.stdout + ran.stderr);
check('without internal/statistics.php, the diagnostic fails',
    (await fetch(halfway.base + '/api.php?action=diagnostic')).status === 200);

/* AND STATISTICS THAT FAIL OUTRIGHT DO NOT STOP THE HOUSEKEEPING. The file is
   replaced by one whose every function throws -- an Error, which is not an
   Exception and which a `catch (Exception)` lets through. */
const thrown = await stand('thrown');
thrown.install();
await thrown.add(P1, I1);
thrown.set(["    'max_note_age_days' => 1,"]);
thrown.sqlite("UPDATE notes_notes SET created_at = '2001-01-01 00:00:00'");
writeFileSync(join(thrown.root, 'internal', 'statistics.php'),
    '<?php function ap_statistics_run() { throw new Error("statistics are broken"); }\n');
ran = await thrown.daily();
check('statistics that throw stopped the sweep: retention is a promise, statistics are not',
    ran.status === 0 && /Swept: 1 row/.test(ran.stdout), ran.status + ' ' + ran.stdout + ran.stderr);

/* THE DIAGNOSTIC ASKS THE STORE WHICH END THIS SERVER IS -- and that question
   must never cost the page. Asked of a server nobody installed, it created
   the storage it was asking about; asked of a database that cannot be
   reached, it lost the verdict that says so. Both measured, before the
   question was put behind an active configuration and a catch. */
const untouchedServer = await stand('not-installed');
const firstLook = await untouchedServer.diagnostic();
check('the diagnostic of a server nobody installed lost its verdict', /^verdict\s+.*INACTIVE/m.test(firstLook), firstLook);
check('asking a server nobody installed for its diagnostic created something in its directory',
    readdirSync(untouchedServer.root).filter((f) => /^ap-data|sqlite|^stats\.php$|^ap-witness/.test(f)).length === 0,
    readdirSync(untouchedServer.root).join(','));
/* And on an installed server whose database file is not there yet -- a
   configuration written by hand, a file somebody removed -- the question
   creates nothing: the page goes on saying there is no file. */
const fileless = await stand('fileless');
fileless.install();
const itsFile = (fileless.config().match(/'file'\s*=>\s*'([^']+)'/) || [])[1];
rmSync(itsFile, { force: true });
const filelessLook = await fileless.diagnostic();
check('the diagnostic created the database file it was asked about', !existsSync(itsFile));
check('with no database file yet, the diagnostic does not say so any more',
    /^verdict\s+.*no database file yet/m.test(filelessLook), filelessLook.split('\n').filter((l) => /verdict/.test(l)).join('\n'));
const blind = await stand('blind');
blind.install();
await blind.add(P1, I1);
chmodSync((blind.config().match(/'file'\s*=>\s*'([^']+)'/) || [])[1], 0o000);
const blindLook = await blind.diagnostic();
check('with a store that cannot be read, the diagnostic lost its verdict or its line about statistics',
    /^verdict\s+\S/m.test(blindLook) && /config\.report_statistics\s+\S/.test(blindLook),
    blindLook.split('\n').filter((l) => /verdict|ERROR|statistics/.test(l)).join('\n'));
chmodSync((blind.config().match(/'file'\s*=>\s*'([^']+)'/) || [])[1], 0o644);

/* ======================================================================
   2. WHICH SERVER RECEIVES, AND HOW IT FINDS OUT
   ====================================================================== */

/* A RECEIVER FROM BEFORE THE SUM ANSWERS ONE WORD, and one that is somebody
   else's answers what it likes. The declaration went through either way; what
   is kept is three whole numbers or nothing, and never what was not asked for. */
const answering = async (name, body) => {
    let heard = 0;
    const address = await listen((request, response) => { request.resume(); request.on('end', () => {
        heard += 1; response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end(body); }); });
    const it = await stand(name);
    it.install();
    it.set(["    'statistics_address' => '" + address + "',"]);
    const wrote = await it.add(P1, I1);
    await settle();
    return { wrote: wrote.status, heard, kept: it.sqlite("SELECT value FROM notes_memory WHERE name = 'statistics-world'"),
        list: await (await fetch(it.base + '/api.php?action=list&project=' + P1 + '&index=' + I1, { headers: { Origin: 'https://site.example.com' } })).text() };
};
const worded = await answering('worded', 'recorded\n');
check('a receiver that answers the one word of before was not declared to, or left something kept',
    worded.wrote === 200 && worded.heard === 1 && worded.kept === '' && !/"world"/.test(worded.list), JSON.stringify(worded).slice(0, 300));
for (const [what, body] of [
    ['numbers that are text', '{"result":"recorded","instances":"12","projects":"3","notes":"5000"}'],
    ['a negative number', '{"result":"recorded","instances":12,"projects":-3,"notes":5000}'],
    ['a number with no end', '{"result":"recorded","instances":12,"projects":3,"notes":' + '9'.repeat(40) + '}'],
    ['one number missing', '{"result":"recorded","instances":12,"notes":5000}'],
    ['markup where a number goes', '{"result":"recorded","instances":12,"projects":3,"notes":"<b>many</b>"}'],
    ['an answer with no end', '{"result":"recorded","pad":"' + 'x'.repeat(4000) + '","instances":12,"projects":3,"notes":5000}'],
]) {
    const odd = await answering('odd', body);
    check('a receiver answering ' + what + ' stopped the note, or had it kept and shown',
        odd.wrote === 200 && odd.heard === 1 && odd.kept === '' && !/"world"/.test(odd.list), JSON.stringify(odd).slice(0, 300));
}

/* THE RECEIVING CODE IS ON EVERY SERVER AND ANSWERS ON ONE. Nothing ships the
   door: it is written by the server that proved the address leads to it. */
check('stats.php is part of what every server installs', !existsSync(join(webroot, 'stats.php')));
check('stats.php is in the manifest the updater installs from',
    !/(^|\s)stats\.php$/m.test(readFileSync(join(webroot, 'MANIFEST'), 'utf8')));
check('the receiving code is not in the manifest: the one server that needs it would never get it',
    /\sinternal\/statistics-receiver\.php$/m.test(readFileSync(join(webroot, 'MANIFEST'), 'utf8')));

const relay = await stand('relay');
relay.install();
const STATS = relay.base + '/stats.php';
const doorOf = (it) => join(it.root, 'stats.php');
const witnesses = (it) => readdirSync(it.root).filter((f) => f.startsWith('ap-witness-'));
/* The header a test can speak through. On the real machine nothing sets it,
   and the address is the connection's. */
relay.set(["    'statistics_address' => '" + STATS + "',", "    'client_ip_header' => 'HTTP_X_FORWARDED_FOR',"]);
const get = async (it) => { const r = await fetch((it || relay).base + '/stats.php'); return { status: r.status, headers: r.headers, text: await r.text() }; };

let absent = await get();
check('a server nobody has written to answers something at stats.php', absent.status === 404, absent.status);
const direct = await fetch(relay.base + '/internal/statistics-receiver.php');
check('the receiving code answers when asked for directly', direct.status === 404, direct.status);

/* THE FIRST WRITE IT RECEIVES UNDER THAT NAME: a hint, then the proof -- it
   writes a witness beside api.php, fetches it at the receiving address, and
   that address is its own. It becomes the receiver, writes its door, and
   declares to nobody. */
/* A proof that got NO ANSWER leaves the question open for an hour, by design.
   A server that calls itself can miss once -- php's own server does, now and
   then, when the worker asked is the one asking -- so where this file needs a
   server to have found out, the hour is taken away and the next write asks
   again. What is being proved is the answer, not how fast it came. */
const untilItKnows = async (it, write) => {
    for (let i = 0; i < 4; i += 1) {
        const memory = it.memory() || {};
        if (memory.role === 'receiver' || memory.role === 'sender') return;
        if (memory.tried) it.sqlite("UPDATE notes_memory SET value = REPLACE(value, '\"tried\":" + memory.tried + "', '\"tried\":0') WHERE name = 'statistics'");
        await write();
        await settle();
    }
};
count = received.length;
await relay.add(P1, I1);
await relay.add(P1, I2);
await settle();
await untilItKnows(relay, async () => { await relay.add(P1, I2); relay.sqlite("DELETE FROM notes_notes WHERE id = (SELECT MAX(id) FROM notes_notes)"); });
const DOOR = ask('echo AP_STATISTICS_DOOR;');
check('a server the receiving address leads to did not write its door, exactly as the code spells it',
    existsSync(doorOf(relay)) && readFileSync(doorOf(relay), 'utf8').trim() === DOOR, existsSync(doorOf(relay)) ? 'different content' : 'no stats.php');
check('the witness of the proof was left beside api.php', witnesses(relay).length === 0, witnesses(relay).join(','));
check('the server does not remember that it receives, and for which version',
    (relay.memory() || {}).role === 'receiver' && (relay.memory() || {}).for === VERSION, JSON.stringify(relay.memory()));
ran = await relay.daily();
await settle();
check('the receiving server declared: it would be counted twice, once counted and once declared',
    received.length === count && !/Statistics:/.test(ran.stdout) && (relay.memory() || {}).id === '',
    (received.length - count) + ' request(s) ' + ran.stdout + JSON.stringify(relay.memory()));
check('the diagnostic of the receiving server does not say that it counts itself',
    /config\.report_statistics\s+no -- this server receives the statistics of the others and counts itself/.test(await relay.diagnostic()),
    statisticsLines(await relay.diagnostic()));

const alone = await get();
check('the sum of one server that counts itself is not that server, as JSON',
    alone.status === 200 && /^\{"instances":1,"active":1,"projects":1,"notes":2,"pages":2,"as_of":"[0-9T:Z-]+"\}\s*$/.test(alone.text), alone.text);
check('the sum is not readable from a page served elsewhere',
    alone.headers.get('access-control-allow-origin') === '*', alone.headers.get('access-control-allow-origin'));
check('the sum is not cacheable for five minutes', alone.headers.get('cache-control') === 'public, max-age=300',
    alone.headers.get('cache-control'));

/* A DOOR SOMEBODY DELETED COMES BACK, and one somebody ELSE put there stays. */
rmSync(doorOf(relay));
await relay.add(P1, I1);
await settle();
check('a door that was deleted did not come back at the next write', existsSync(doorOf(relay)));
relay.sqlite("DELETE FROM notes_notes WHERE id = (SELECT MAX(id) FROM notes_notes)");

/* A STRANGER WHO LIES ABOUT THE NAME. `victim` declares to the relay like any
   server; somebody sends it a request CLAIMING the relay's name. That costs
   the victim one witness and one request, it learns it is not the receiver,
   and nothing opens on it. */
const victim = await stand('victim');
victim.install();
victim.set(["    'statistics_address' => '" + STATS + "',"]);
const claiming = (it, host) => new Promise((resolve) => {
    const body = 'project=' + P1 + '&index=' + I1 + '&mode=encrypted&payload=ap2.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA';
    const r = httpRequest(it.base + '/api.php?action=add', { method: 'POST', headers: { Host: host,
        Origin: 'https://site.example.com', 'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body) } },
        (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    r.on('error', () => resolve(0));
    r.end(body);
});
const lied = await claiming(victim, '127.0.0.1:' + relay.port);
await settle();
check('a write claiming another name was refused: the claim is a hint, not a fault', lied === 200, lied);
check('a server told by a stranger that it is the receiver wrote a door',
    !existsSync(doorOf(victim)) && (await get(victim)).status === 404);
check('a server told by a stranger that it is the receiver did not conclude that it is not, and forget the hint',
    (victim.memory() || {}).role === 'sender' && (victim.memory() || {}).for === VERSION && (victim.memory() || {}).hint === 0
        && (victim.memory() || {}).tried === 0,
    JSON.stringify(victim.memory()));
check('the failed proof left its witness on the victim', witnesses(victim).length === 0, witnesses(victim).join(','));
/* And a door COPIED there by hand opens onto the same refusal: the receiving
   code asks for itself whether this server is the receiver. */
writeFileSync(doorOf(victim), DOOR + '\n');
const copied = await get(victim);
check('a door copied onto a server that is not the receiver opens', copied.status === 404 && copied.text === '',
    copied.status + ' ' + copied.text);
rmSync(doorOf(victim));

/* AND AN ADDRESS THAT ANSWERS 200 TO EVERYTHING PROVES NOTHING. What comes
   back has to be what the server wrote in its witness: a site that serves a
   page for any path -- most of them -- is not this server. */
const wanted = [];
const anything = await listen((request, response) => {
    request.resume();
    wanted.push(request.url);
    request.on('end', () => { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('welcome\n'); });
});
const fooled = await stand('fooled');
fooled.install();
// An address WITH NO PATH, which is where a careless one would build the
// witness's address out of nothing -- and a witness a killed process left.
fooled.set(["    'statistics_address' => '" + new URL(anything).origin + "',"]);
writeFileSync(join(fooled.root, 'ap-witness-0000.txt'), 'left behind');
utimesSync(join(fooled.root, 'ap-witness-0000.txt'), new Date(Date.now() - 3600000), new Date(Date.now() - 3600000));
await claiming(fooled, '127.0.0.1:' + new URL(anything).port);
await settle();
check('the witness was not asked for at the receiving host, under its own name',
    wanted.length === 1 && /^\/ap-witness-[0-9a-f]{32}\.txt$/.test(wanted[0]), wanted.join(' | '));
check('a witness left behind an hour ago by a process that died is still there', witnesses(fooled).length === 0, witnesses(fooled).join(','));
check('a server took an address that answers 200 to everything for its own',
    !existsSync(doorOf(fooled)) && (fooled.memory() || {}).role === 'sender', JSON.stringify(fooled.memory()));

/* A SERVER NOBODY EVER CALLED BY THAT NAME TRIES NOTHING: no witness is
   written and no question is asked. `site`, from the first section, has
   written many notes and was never named. */
check('a server that was never called by the receiving name tried the proof, or thinks it has a role',
    (site.memory() || {}).role === '' && (site.memory() || {}).hint === 0 && !existsSync(doorOf(site)), JSON.stringify(site.memory()));

/* THE PROOF IS REDONE WHEN THE VERSION CHANGES, and the door follows the
   answer: the name can move to another machine. Here it moves away. */
const moved = await stand('moved');
moved.install();
moved.set(["    'statistics_address' => '" + moved.base + '/stats.php' + "',"]);
await moved.add(P1, I1);
await settle();
await untilItKnows(moved, () => moved.add(P1, I1));
check('a server reached under the receiving name did not become the receiver', existsSync(doorOf(moved)) && (moved.memory() || {}).role === 'receiver');
moved.set(["    'statistics_address' => '" + STATS + "',"]);
writeFileSync(join(moved.root, 'VERSION'), '9.9.9\n');
await claiming(moved, '127.0.0.1:' + relay.port);
await settle();
check('after an update, a server the name no longer leads to kept its door and its role',
    !existsSync(doorOf(moved)) && (moved.memory() || {}).role === 'sender' && (moved.memory() || {}).for === '9.9.9',
    JSON.stringify(moved.memory()) + ' door: ' + existsSync(doorOf(moved)));

/* AND A CONFIGURATION CAN SAY IT, both ways, without the proof. */
const told = await stand('told');
told.install();
told.set(["    'collect_statistics' => true,"]);
await told.add(P1, I1);
await settle();
check('collect_statistics => true did not make the server a receiver, door included',
    existsSync(doorOf(told)) && (await get(told)).status === 200, 'door: ' + existsSync(doorOf(told)));
told.set(["    'collect_statistics' => 'false',"]);
await told.add(P1, I1);
await settle();
check('collect_statistics => false, between quotes, left the door or the answer in place',
    !existsSync(doorOf(told)) && (await get(told)).status === 404);

/* ONLY AN ANSWER SETTLES IT. An address that says NOTHING leaves the question
   open -- a server that timed out once must not decide it is not the receiver
   and stay wrong until the next release -- and it is asked again no more than
   once an hour, not at every write. */
const unanswered = await stand('unanswered');
unanswered.install();
unanswered.set(["    'statistics_address' => '" + SILENT + "',"]);
t0 = Date.now();
await claiming(unanswered, '127.0.0.1:' + new URL(SILENT).port);
const claimTook = Date.now() - t0;
await settle();
await sleep(2500);
const open1 = unanswered.memory() || {};
/* ONE CALL OUT PER REQUEST: the proof spent the deadline, so the day's report
   waits for the next write. Both in one request made a visitor wait twice. */
check('a write that tried the proof also declared, in the same request: the visitor waited ' + claimTook + ' ms',
    claimTook < 3600 && (unanswered.memory() || {}).last === 0, JSON.stringify(unanswered.memory()));
check('an address that did not answer was taken for a no: the server decided it is not the receiver',
    open1.role === '' && open1.hint === 2 && open1.tried > 0 && !existsSync(doorOf(unanswered)), JSON.stringify(open1));
await claiming(unanswered, '127.0.0.1:' + new URL(SILENT).port);
await settle();
await sleep(2500);
/* This second write is the one that declares -- to an address that says
   nothing, so it waits its own two seconds. What it must not do is try the
   proof again: the try and the tries left are what they were. */
check('the proof was tried again within the hour: every write would wait on it',
    (unanswered.memory() || {}).tried === open1.tried && (unanswered.memory() || {}).hint === open1.hint
        && (unanswered.memory() || {}).last > 0, JSON.stringify(unanswered.memory()));
// Fifty minutes later: still not. The hour is an hour.
unanswered.sqlite("UPDATE notes_memory SET value = REPLACE(value, '\"tried\":" + open1.tried + "', '\"tried\":" + (open1.tried - 3000) + "') WHERE name = 'statistics'");
t0 = Date.now();
await unanswered.add(P1, I1);
check('the proof was tried again fifty minutes after one that got no answer', Date.now() - t0 < 1200
    && (unanswered.memory() || {}).hint === 2, (Date.now() - t0) + ' ms ' + JSON.stringify(unanswered.memory()));
unanswered.sqlite("UPDATE notes_memory SET value = REPLACE(value, '\"tried\":" + (open1.tried - 3000) + "', '\"tried\":" + open1.tried + "') WHERE name = 'statistics'");
// An hour later, and the address now leads here: this time it answers.
unanswered.set(["    'statistics_address' => '" + unanswered.base + '/stats.php' + "',"]);
unanswered.sqlite("UPDATE notes_memory SET value = REPLACE(value, '\"tried\":" + open1.tried + "', '\"tried\":" + (open1.tried - 4000) + "') WHERE name = 'statistics'");
await unanswered.add(P1, I1);
await settle();
await untilItKnows(unanswered, () => unanswered.add(P1, I1));
check('an hour after a proof that got no answer, it was not tried again',
    (unanswered.memory() || {}).role === 'receiver' && existsSync(doorOf(unanswered)), JSON.stringify(unanswered.memory()));

/* A DIRECTORY THAT CANNOT BE WRITTEN: the proof cannot be tried, nothing
   breaks, and the question stays open for the day it can. */
const sealed = await stand('sealed');
sealed.install();
sealed.set(["    'statistics_address' => '" + sealed.base + '/stats.php' + "',"]);
spawnSync('chmod', ['555', sealed.root]);
const sealedWrite = await sealed.add(P1, I1);
await settle();
check('where the directory cannot be written, a note was refused or a role invented',
    sealedWrite.status === 200 && !existsSync(doorOf(sealed)) && (sealed.memory() || {}).role === ''
        && (sealed.memory() || {}).hint > 0, sealedWrite.status + ' ' + JSON.stringify(sealed.memory()));
spawnSync('chmod', ['755', sealed.root]);

/* AN ERROR IS NOT AN ANSWER ABOUT THE FILE. A receiving address that says 503
   -- itself, on a bad day -- leaves the question open exactly as silence
   does; only "not there" or another content says this server is not it. */
const busy = await stand('busy');
busy.install();
const failing = await saying(503);
busy.set(["    'statistics_address' => '" + failing + "',"]);
await claiming(busy, '127.0.0.1:' + new URL(failing).port);
await settle();
check('a 503 from the receiving address was taken for "you are not the receiver"',
    (busy.memory() || {}).role === '' && (busy.memory() || {}).hint === 2 && !existsSync(doorOf(busy)), JSON.stringify(busy.memory()));

/* AND THE TRIES RUN OUT. An address that never answers is asked a few times,
   an hour apart, and then no more until somebody claims the name again: a
   stranger's lie must not cost a server a wait every hour for ever. */
const forgotten = await stand('forgotten');
forgotten.install();
forgotten.set(["    'statistics_address' => '" + failing + "',"]);
await claiming(forgotten, '127.0.0.1:' + new URL(failing).port);
await settle();
for (let i = 0; i < 4; i += 1) {
    const m = forgotten.memory() || {};
    forgotten.sqlite("UPDATE notes_memory SET value = REPLACE(value, '\"tried\":" + m.tried + "', '\"tried\":" + (m.tried - 4000) + "') WHERE name = 'statistics'");
    await forgotten.add(P1, I1);
    await settle();
}
check('an address that never answers is still being asked after three tries, an hour apart, for ever',
    (forgotten.memory() || {}).hint === 0 && (forgotten.memory() || {}).role === '', JSON.stringify(forgotten.memory()));

/* A SERVER THAT REFUSED TRIES NOTHING, whatever name it is called by. It was
   possible to make one call out by claiming the receiver's name -- a witness
   written, a request sent to the project's address from a server whose
   configuration says nothing is. Three reviews found it; this is the check. */
const closedDoor = await stand('refused-and-named');
closedDoor.install(['--report-statistics=false']);
const askedBefore = asked.length;
await claiming(closedDoor, '127.0.0.1:' + new URL(RECEIVER).port);
await settle();
ran = await closedDoor.daily();
check('a server that refused, called by the receiving name, asked that address for something',
    asked.length === askedBefore, asked.slice(askedBefore).join(' | '));
check('a server that refused, called by the receiving name, gained a memory table, a witness or a door',
    closedDoor.sqlite("SELECT name FROM sqlite_master WHERE name = 'notes_memory'") === ''
        && witnesses(closedDoor).length === 0 && !existsSync(doorOf(closedDoor)));

/* ======================================================================
   2 bis. WHAT THE RECEIVER DOES WITH WHAT IT IS TOLD
   ====================================================================== */

/* The addresses are BUILT, not written: a dotted address in a file of this
   repository is refused by check-shapes, whatever it is an example of. */
const v4 = (c, d) => [203, 0, c, d].join('.');
/* What the receiver keeps is in the store's memory. Read and changed here
   through the database itself, the way a day going by would change it. */
const memo = (name) => relay.sqlite("SELECT value FROM notes_memory WHERE name = '" + name + "'");
const setMemo = (name, value) => relay.sqlite("INSERT OR REPLACE INTO notes_memory (name, value) VALUES ('"
    + name + "', '" + (typeof value === 'string' ? value : JSON.stringify(value)) + "')");
const names = () => relay.sqlite('SELECT name FROM notes_memory ORDER BY name').split('\n').filter(Boolean);
const dump = () => relay.sqlite('SELECT name, value FROM notes_memory ORDER BY name');
const totals = async () => { relay.sqlite("DELETE FROM notes_memory WHERE name = 'statistics-sum'"); return JSON.parse((await get()).text); };
const declare = async (fields, opts) => {
    const r = await fetch(STATS, { method: (opts && opts.method) || 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded',
            'X-Forwarded-For': (opts && opts.from) || v4(113, 7) },
        body: typeof fields === 'string' ? fields : new URLSearchParams(fields).toString() });
    // A declaration that was heard is answered in JSON: the word, and the
    // sum beside it. `text` is the word, as every check below reads it.
    const raw = (await r.text()).trim();
    let answer = null;
    try { answer = JSON.parse(raw); } catch (e) { /* a refusal is a sentence */ }
    return { status: r.status, text: answer && typeof answer.result === 'string' ? answer.result : raw, answer, raw };
};
const id = (n) => ('instance' + String(n).padStart(14, '0')).slice(0, 22);
const row = (n, more) => Object.assign({ id: id(n), version: VERSION, projects: 1, notes: 10, pages: 2 }, more || {});
const kept = (n) => { const raw = memo('s:' + id(n)); return raw ? JSON.parse(raw) : null; };
const patch = (n, change) => { const r = kept(n); change(r); setMemo('s:' + id(n), r); };
const day = (back) => new Date(Date.now() - (back || 0) * 86400000).toISOString().slice(0, 10);

/* What the sum was before anything is declared below: this server's own
   notes, and the servers of the section above that declared to it. */
const base = await totals();

/* ONE ROW PER SERVER, AND ONE DECLARATION A DAY. */
let said = await declare(row(1));
check('a well-formed declaration was not recorded', said.status === 200 && said.text === 'recorded', said.status + ' ' + said.text);
let sum = await totals();
check('one declaration is not one more instance with its numbers',
    sum.instances === base.instances + 1 && sum.active === base.active + 1 && sum.projects === base.projects + 1
        && sum.notes === base.notes + 10 && sum.pages === base.pages + 2, JSON.stringify(base) + ' -> ' + JSON.stringify(sum));
check('with no day before this one, a declaration was answered with more than the word',
    said.raw === '{"result":"recorded"}', said.raw);
const rowsAtStart = names().filter((n) => n.startsWith('s:')).length;
let before = dump();
said = await declare(row(1, { notes: 400 }));
check('the same identifier, the same day, was listened to again', said.text === 'kept', said.status + ' ' + said.text);
check('a declaration that changed nothing wrote something', dump() === before);
check('the row holds anything but a version, three totals and two DAYS',
    Object.keys(kept(1)).sort().join(',') === 'f,g,l,n,p,v' && kept(1).f === day() && kept(1).l === day()
        && kept(1).n === 10 && kept(1).p === 1 && kept(1).g === 2 && kept(1).v === VERSION, memo('s:' + id(1)));

/* ITS OWN DECLARATION IS NOT ONE. A request that began before this server
   knew it was the receiver can still declare, to its own door, under its own
   identifier; kept, the receiver would count itself twice for ever. */
const ownMemory = relay.memory();
relay.sqlite("UPDATE notes_memory SET value = REPLACE(value, '\"id\":\"\"', '\"id\":\"" + id(77) + "\"') WHERE name = 'statistics'");
before = dump();
said = await declare(row(77), { from: v4(130, 1) });
check('the receiver recorded a declaration made under its own identifier: it would count itself twice',
    said.status === 200 && said.text === 'kept' && dump() === before && !kept(77), said.status + ' ' + said.text);
relay.sqlite("UPDATE notes_memory SET value = '" + JSON.stringify(ownMemory) + "' WHERE name = 'statistics'");

/* WHAT IS NOT A DECLARATION. */
for (const [what, fields, status] of [
    ['an identifier that is not 22 characters', row(1, { id: 'short' }), 400],
    ['an identifier followed by a line break', 'id=' + id(8) + '%0A&version=' + VERSION + '&projects=1&notes=1&pages=1', 400],
    ['a total that is not a number', row(2, { notes: 'many' }), 400],
    ['a negative total', row(2, { notes: '-5' }), 400],
    ['a total of twelve digits', row(2, { notes: '999999999999' }), 400],
    ['a missing field', { id: id(2), version: VERSION, projects: 1, notes: 1 }, 400],
    ['a version that is not one', row(2, { version: '<script>' }), 400],
    ['a body of two kilobytes', 'id=' + id(2) + '&pad=' + 'x'.repeat(2000), 413],
    ['a body of 1100 bytes: the limit is 1024', 'id=' + id(2) + '&pad=' + 'x'.repeat(1070), 413],
]) {
    const r = await declare(fields);
    check(what + ' was not refused with ' + status, r.status === status, r.status + ' ' + r.text);
}
const put = await declare(row(2), { method: 'PUT' });
check('a PUT was not refused', put.status === 405, put.status);
const chunked = await new Promise((resolve) => {
    const r = httpRequest(STATS, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    r.on('error', () => resolve(0));
    r.write('id=' + id(2) + '&version=' + VERSION);
    r.end('&projects=1&notes=1&pages=1');
});
check('a declaration that does not say its length was not refused with 411', chunked === 411, chunked);
check('a refused declaration left a row', names().filter((n) => n.startsWith('s:')).length === rowsAtStart, names().join(','));

/* A FIRST DECLARATION STARTS SMALL. */
said = await declare(row(2, { projects: 5000, notes: 9000000, pages: 800000 }));
check('a first declaration of nine million was refused rather than clipped', said.text === 'recorded', said.status + ' ' + said.text);
check('a first declaration was not clipped to 10 projects, 1000 notes and 200 pages',
    kept(2).p === 10 && kept(2).n === 1000 && kept(2).g === 200, memo('s:' + id(2)));

/* A NEW IDENTIFIER IS RATIONED PER NETWORK -- not per address, which rations
   nothing: one machine holds a whole /24 and a whole /64. Two so far. */
said = await declare(row(3), { from: v4(113, 200) });
check('a third new server from one network was refused', said.text === 'recorded', said.status + ' ' + said.text);
before = dump();
said = await declare(row(4), { from: v4(113, 9) });
check('a fourth new server from the same /24, from another address in it, was not refused with 429',
    said.status === 429, said.status + ' ' + said.text);
check('a refused new server wrote something: a flood of them would buy a write each', dump() === before);
said = await declare(row(4), { from: v4(114, 9) });
check('a new server from another network was refused with them', said.text === 'recorded', said.status + ' ' + said.text);
for (const n of [20, 21, 22]) await declare(row(n), { from: '2001:db8:1:1::' + n });
said = await declare(row(23), { from: '2001:db8:1:1:ffff::1' });
check('a fourth new server from one IPv6 /64 was not refused with 429', said.status === 429, said.status + ' ' + said.text);
said = await declare(row(23), { from: '2001:db8:1:2::1' });
check('a new server from another IPv6 /64 was refused with them', said.text === 'recorded', said.status + ' ' + said.text);
said = await declare(row(24), { from: '::ffff:' + v4(113, 50) });
check('an IPv4 address written the IPv6 way escaped the ration of its network', said.status === 429, said.status + ' ' + said.text);

/* AND NO ADDRESS IS KEPT, nor anything that leads back to one. THE LIST OF
   WHAT IS KEPT IS CLOSED: every name in the memory is one of these, and a
   name that is not is something somebody started keeping. */
const everything = dump();
check('the memory holds an address a declaration came from',
    !everything.includes(v4(113, 7)) && !everything.includes([203, 0, 113].join('.')) && !everything.includes('2001:db8')
        && !everything.includes('cb0071'), everything);
check('the receiver keeps something under a name that is not on its closed list',
    names().every((n) => /^(statistics|statistics-day|statistics-own|statistics-sum|statistics-retired|statistics-world|statistics-last|statistics-closed|h:[0-9]{4}-[0-9]{2}-[0-9]{2}|s:[A-Za-z0-9_-]{22}|b:[0-9a-f]{4})$/.test(n)),
    names().join(','));
check('what is kept of where a request came from is more than 16 bits and a count',
    names().filter((n) => n.startsWith('b:')).length >= 4
        && names().filter((n) => n.startsWith('b:')).every((n) => new RegExp('^' + day() + '\\|[1-3]$').test(memo(n))),
    names().filter((n) => n.startsWith('b:')).map((n) => n + '=' + memo(n)).join(','));
check('the day keeps anything but its date, its key and its count',
    Object.keys(JSON.parse(memo('statistics-day'))).sort().join(',') === 'date,key,new', memo('statistics-day'));

/* THE NEXT DAY: a new key -- so the same network falls in another bucket, and
   yesterday's cannot be matched to it -- and the counters start again. */
const dayBefore = JSON.parse(memo('statistics-day'));
const bucketsBefore = names().filter((n) => n.startsWith('b:'));
setMemo('statistics-day', Object.assign({}, dayBefore, { date: '2001-01-01' }));
said = await declare(row(5));
const dayAfter = JSON.parse(memo('statistics-day'));
check('the next day, a new server from the same network was still refused', said.text === 'recorded', said.status + ' ' + said.text);
check('the next day, the key the networks are digested with was kept, or the count went on',
    dayAfter.key !== dayBefore.key && dayAfter.date === day() && dayAfter.new === 1, memo('statistics-day'));
check('the same network fell in the same bucket two days running: the digest is not keyed by the day',
    names().filter((n) => n.startsWith('b:') && !bucketsBefore.includes(n)).length === 1,
    bucketsBefore.join(',') + ' / ' + names().filter((n) => n.startsWith('b:')).join(','));
check('yesterday\'s buckets were kept: something about addresses is still lying around',
    names().filter((n) => n.startsWith('b:')).length === 1, names().filter((n) => n.startsWith('b:')).join(','));
/* And a reader is enough to throw them away: nobody has to declare. */
setMemo('statistics-day', Object.assign({}, dayAfter, { date: '2001-01-01' }));
await totals();
check('a day later, somebody reading the sum did not throw away the key and the buckets',
    names().filter((n) => n.startsWith('b:') || n === 'statistics-day').length === 0, names().join(','));
setMemo('statistics-day', dayAfter);

/* EVERYBODY TOGETHER HAS A CEILING TOO. */
setMemo('statistics-day', Object.assign({}, dayAfter, { new: 200 }));
said = await declare(row(6), { from: v4(120, 1) });
check('the two-hundred-and-first new server of the day was not refused with 429', said.status === 429, said.status + ' ' + said.text);
setMemo('statistics-day', Object.assign({}, dayAfter, { new: 199 }));
said = await declare(row(6), { from: v4(120, 1) });
check('the two-hundredth new server of the day was refused: the ceiling is 200', said.text === 'recorded', said.status + ' ' + said.text);
setMemo('statistics-day', Object.assign({}, dayAfter, { new: 1 }));

/* ONE STEP, HOWEVER LONG THE SILENCE -- and never down. */
patch(1, (r) => { r.l = day(20); });
said = await declare(row(1, { projects: 900, notes: 50000, pages: 9000 }));
check('a server silent for twenty days came back with twenty days of growth instead of one step',
    said.text === 'recorded' && kept(1).n === 10 + 200 && kept(1).p === 1 + 2 && kept(1).g === 2 + 50
        && kept(1).l === day() && kept(1).f === day(), said.text + ' ' + memo('s:' + id(1)));
patch(1, (r) => { r.l = day(1); });
said = await declare(row(1, { projects: 1, notes: 4, pages: 1 }));
check('a server that declares less than before lost what it had carried: a total went down',
    said.text === 'recorded' && kept(1).n === 210 && kept(1).p === 3 && kept(1).g === 52, memo('s:' + id(1)));

/* A SERVER THAT STOPS DECLARING STAYS IN THE SUM. Only `active` forgets it,
   and it forgets after thirty days, not twenty-nine. */
sum = await totals();
patch(3, (r) => { r.l = day(30); });
const stillActive = await totals();
patch(3, (r) => { r.l = day(31); });
const later = await totals();
check('a server silent for 31 days left the sum: the totals went down on their own',
    later.instances === sum.instances && later.notes === sum.notes && later.pages === sum.pages
        && later.projects === sum.projects, JSON.stringify(sum) + ' -> ' + JSON.stringify(later));
check('a server silent for 30 days no longer counts as active, or one silent for 31 still does',
    stillActive.active === sum.active && later.active === sum.active - 1,
    sum.active + ' -> ' + stillActive.active + ' -> ' + later.active);

/* THE SUM IS NOT COUNTED ON EVERY REQUEST: this address is public, and
   counting reads every row. A declaration throws the kept sum away. */
const cached = JSON.parse((await get()).text);
patch(1, (r) => { r.n = 999999; });
const stillCached = JSON.parse((await get()).text);
check('the sum was counted again on the very next request', stillCached.notes === cached.notes, cached.notes + ' -> ' + stillCached.notes);
patch(1, (r) => { r.n = 210; });
await declare(row(7), { from: v4(121, 1) });
const recounted = JSON.parse((await get()).text);
check('a declaration did not make the next reader count again', recounted.instances === cached.instances + 1,
    cached.instances + ' -> ' + recounted.instances);

/* EACH DAY'S SUM IS KEPT, one row a day, and the rows of the days before are
   never touched: that is what the history is read from. A sum and nothing
   under it. */
const history = async () => JSON.parse(await (await fetch(STATS + '?history')).text());
const now = await totals();
check('the day has no row of its own in the history, or it is not the sum as last counted',
    memo('h:' + day()) === JSON.stringify({ i: now.instances, a: now.active, p: now.projects, n: now.notes, g: now.pages }),
    memo('h:' + day()) + ' / ' + JSON.stringify(now));
/* GIVEN OUT ONLY FOR DAYS THAT COUNTED TEN SERVERS: between two rows of a
   handful, the difference is one server's day. */
setMemo('h:' + day(3), { i: 9, a: 9, p: 20, n: 300, g: 40 });
setMemo('h:' + day(2), { i: 10, a: 9, p: 22, n: 330, g: 44 });
setMemo('h:' + day(1), { i: 12, a: 11, p: 23, n: 340, g: 45 });
setMemo('h:not-a-day', { i: 99, a: 9, p: 9, n: 9, g: 9 });
await declare(row(8), { from: v4(122, 1) });
const pastDays = await history();
const todayListed = now.instances + 1 >= 10 ? [day()] : [];
check('the history is not the days of ten servers or more, in order, each with its five figures',
    Array.isArray(pastDays.days) && pastDays.days.map((d) => d.day).join(',') === [day(2), day(1)].concat(todayListed).join(',')
        && JSON.stringify(pastDays.days[0]) === JSON.stringify({ day: day(2), instances: 10, active: 9, projects: 22, notes: 330, pages: 44 }),
    JSON.stringify(pastDays));
check('a declaration today did not enter the day\'s row, or rewrote the row of a day before',
    JSON.parse(memo('h:' + day())).i === now.instances + 1 && JSON.parse(memo('h:' + day())).n === now.notes + 10
        && memo('h:' + day(1)) === JSON.stringify({ i: 12, a: 11, p: 23, n: 340, g: 45 }), memo('h:' + day()) + ' ' + memo('h:' + day(1)));
check('a row of the history holds something other than five numbers: it must not be able to name a server',
    names().filter((n) => n.startsWith('h:')).every((n) => n === 'h:not-a-day' || /^\{"i":[0-9]+,"a":[0-9]+,"p":[0-9]+,"n":[0-9]+,"g":[0-9]+\}$/.test(memo(n))),
    names().filter((n) => n.startsWith('h:')).map(memo).join(' '));
relay.sqlite("DELETE FROM notes_memory WHERE name = 'h:not-a-day' OR name IN ('h:" + day(1) + "', 'h:" + day(2) + "', 'h:" + day(3) + "')");

/* A DECLARATION IS ANSWERED WITH THE SUM OF THE DAY BEFORE, the same for
   every server that declares today -- never with the sum it has just entered,
   which would mark the moment it declared. The day before is closed by the
   first count of a new day. */
setMemo('statistics-last', { day: day(1), i: 40, p: 310, n: 5200 });
relay.sqlite("DELETE FROM notes_memory WHERE name = 'statistics-closed' OR name = 'statistics-world'");
said = await declare(row(9), { from: v4(124, 1) });
const sumThen = await totals();
check('a declaration was not answered with the last count of the day before',
    said.raw === '{"result":"recorded","instances":40,"projects":310,"notes":5200,"day":"' + day() + '"}', said.raw);
check('a declaration was answered with the sum it had just entered', said.answer.notes !== sumThen.notes && said.answer.instances !== sumThen.instances,
    said.raw + ' / ' + JSON.stringify(sumThen));
const again = await declare(row(1));
check('a second server the same day, or the same one again, was answered something else', again.raw === '{"result":"kept","instances":40,"projects":310,"notes":5200,"day":"' + day() + '"}', again.raw);
check('the count that followed took the place of the closed day', JSON.parse(memo('statistics-closed')).day === day(1)
    && JSON.parse(memo('statistics-last')).day === day() && JSON.parse(memo('statistics-last')).n === sumThen.notes,
    memo('statistics-closed') + ' ' + memo('statistics-last'));
/* AND THE RECEIVER SHOWS ITS OWN READERS THE SAME CLOSED DAY, though it
   declares to nobody and so is answered by nobody. */
const homeRow = () => JSON.parse(memo('statistics-world') || '{}');
check('the receiving server did not keep, to show from tomorrow, the sum it answers declarations with',
    homeRow().d === day() && homeRow().di === 40 && homeRow().dp === 310 && homeRow().dn === 5200
        && worldOf(await lists(relay, P1, I1)) === undefined, memo('statistics-world'));
setMemo('statistics-world', Object.assign(homeRow(), { d: day(1) }));
const atHome = worldOf(await lists(relay, P1, I1));
check('the day after, the receiving server does not hand its own panel that sum',
    JSON.stringify(atHome) === '{"servers":40,"sites":310,"notes":5200}', JSON.stringify(atHome));
/* A REQUEST THAT BEGAN BEFORE MIDNIGHT AND COUNTS AFTER THE NEW DAY WAS OPENED
   writes nothing about days: the day ahead of its clock is left as it is. */
const closedBefore = memo('statistics-closed');
setMemo('statistics-last', { day: day(-1), i: 77, p: 777, n: 7777 });
await totals();
check('a count whose clock is behind the last day counted closed that day or put its own back',
    memo('statistics-closed') === closedBefore && memo('statistics-last') === JSON.stringify({ day: day(-1), i: 77, p: 777, n: 7777 }),
    memo('statistics-closed') + ' ' + memo('statistics-last'));
/* AND A DAY IS CLOSED ONCE. Two requests astride midnight can each read the
   last count before the other writes; a second closing, with other numbers,
   would leave the first server answered that day holding a sum of its own. */
setMemo('statistics-last', { day: day(1), i: 55, p: 555, n: 5555 });
await totals();
check('a day already closed was closed again, with other numbers', memo('statistics-closed') === closedBefore
    && JSON.parse(closedBefore).for === day(), memo('statistics-closed'));
setMemo('statistics-last', { day: day(), i: sumThen.instances, p: sumThen.projects, n: sumThen.notes });

/* THERE IS A LAST ROW. Full, the silent rows are folded into one running
   total -- nothing leaves the sum -- and when none is silent, a newcomer is
   refused rather than the table growing without end. */
const savedRows = relay.sqlite("SELECT name || '=' || value FROM notes_memory WHERE name LIKE 's:%'").split('\n');
const fill = (silent) => {
    const file = (relay.config().match(/'file'\s*=>\s*'([^']+)'/) || [])[1];
    spawnSync('php', ['-r', '$db = new PDO("sqlite:" . ' + JSON.stringify(file) + '); $db->beginTransaction();'
        + ' $db->exec("DELETE FROM notes_memory WHERE name LIKE \'s:%\' OR name = \'statistics-retired\' OR name LIKE \'b:%\'");'
        + ' $q = $db->prepare("INSERT INTO notes_memory (name, value) VALUES (?, ?)");'
        + ' for ($n = 0; $n < 5000; $n++) { $q->execute(array("s:" . substr("instance" . str_pad((string) (100000 + $n), 14, "0", STR_PAD_LEFT), 0, 22),'
        + ' json_encode(array("f" => ' + JSON.stringify(day(60)) + ', "l" => $n < ' + silent + ' ? ' + JSON.stringify(day(40)) + ' : ' + JSON.stringify(day())
        + ', "v" => "1.0.0", "p" => 1, "n" => 3, "g" => 2)))); } $db->commit();'], { encoding: 'utf8' });
    setMemo('statistics-day', Object.assign({}, dayAfter, { new: 0 }));
};
fill(2);
const full = await totals();
said = await declare(row(9), { from: v4(122, 1) });
const retired = JSON.parse(memo('statistics-retired') || '{}');
const afterFold = await totals();
check('a full table with two silent rows refused a newcomer instead of folding them', said.text === 'recorded', said.status + ' ' + said.text);
check('the two silent rows were not folded into the running total, numbers kept and identifiers gone',
    retired.instances === 2 && retired.notes === 6 && retired.projects === 2 && retired.pages === 4
        && names().filter((n) => n.startsWith('s:')).length === 4999 && !kept(100000), JSON.stringify(retired));
check('folding lowered a total',
    afterFold.instances === full.instances + 1 && afterFold.notes === full.notes + 10
        && afterFold.projects === full.projects + 1 && afterFold.pages === full.pages + 2,
    JSON.stringify(full) + ' -> ' + JSON.stringify(afterFold));
fill(0);
/* Refused before the day has a row at all, so that a refusal that wrote
   anything -- the day, its key, a bucket -- would show. */
relay.sqlite("DELETE FROM notes_memory WHERE name = 'statistics-day' OR name LIKE 'b:%'");
before = dump();
said = await declare(row(10), { from: v4(123, 1) });
check('a full table with no silent row took one more',
    said.status === 429 && names().filter((n) => n.startsWith('s:')).length === 5000, said.status + ' ' + names().filter((n) => n.startsWith('s:')).length);
check('a newcomer refused by a full table left a trace: a refusal writes nothing', dump() === before);
relay.sqlite("DELETE FROM notes_memory WHERE name LIKE 's:%' OR name = 'statistics-retired'");
for (const line of savedRows) { if (line.includes('=')) setMemo(line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)); }

/* THIS SERVER COUNTS ITSELF, EXACTLY -- and what it swept is still what it
   carried. */
sum = await totals();
await relay.add(P2, I3);
relay.sqlite("DELETE FROM notes_memory WHERE name = 'statistics-own'");
const withOwn = await totals();
check('the receiving server did not count its own new note, unclipped',
    withOwn.instances === sum.instances && withOwn.notes === sum.notes + 1 && withOwn.pages === sum.pages + 1
        && withOwn.projects === sum.projects + 1, JSON.stringify(sum) + ' -> ' + JSON.stringify(withOwn));
relay.set(["    'max_note_age_days' => 1,"]);
relay.sqlite("UPDATE notes_notes SET created_at = '2001-01-01 00:00:00'");
ran = await relay.daily();
relay.sqlite("DELETE FROM notes_memory WHERE name = 'statistics-own'");
const swept = await totals();
check('the receiving server swept its notes and its own total went down',
    /Swept: 3 rows/.test(ran.stdout) && swept.notes === withOwn.notes && swept.pages === withOwn.pages
        && swept.projects === withOwn.projects && swept.instances === withOwn.instances,
    ran.stdout + JSON.stringify(withOwn) + ' -> ' + JSON.stringify(swept));

/* OVER HTTPS, like everything else here. */
const strict = await stand('strict');
strict.install([], false);
strict.set(["    'collect_statistics' => true,"]);
writeFileSync(doorOf(strict), DOOR + '\n');
const overHttp = await fetch(strict.base + '/stats.php', { redirect: 'manual' });
check('the receiver answers over plain http on a server that requires https', overHttp.status === 308, overHttp.status);

/* FROM ONE END TO THE OTHER: a real server declares to the real receiver. */
const far = await stand('far');
far.install();
far.set(["    'statistics_address' => '" + STATS + "',"]);
const sumBefore = await totals();
await far.add(P2, I2);
await settle();
const sumAfter = await totals();
const farId = (far.memory() || {}).id;
check('a real server writing its first note was not added to the sum by the real receiver',
    sumAfter.instances === sumBefore.instances + 1 && sumAfter.notes === sumBefore.notes + 1,
    JSON.stringify(sumBefore) + ' -> ' + JSON.stringify(sumAfter));
check('the receiver does not hold the identifier that server remembers', !!farId && !!memo('s:' + farId), farId);
const farRow = JSON.parse(far.sqlite("SELECT value FROM notes_memory WHERE name = 'statistics-world'") || '{}');
check('a real server did not keep the sum of the day before, as the real receiver answered its declaration',
    farRow.d === day() && farRow.di === 40 && farRow.dp === 310 && farRow.dn === 5200 && worldOf(await lists(far, P2, I2)) === undefined,
    JSON.stringify(farRow));
far.sqlite("UPDATE notes_memory SET value = '" + JSON.stringify(Object.assign(farRow, { d: day(1) })) + "' WHERE name = 'statistics-world'");
check('and the day after, it does not show it', JSON.stringify(worldOf(await lists(far, P2, I2))) === '{"servers":40,"sites":310,"notes":5200}',
    JSON.stringify(worldOf(await lists(far, P2, I2))));

/* ======================================================================
   3. THE INSTALLER, ON BOTH FACES
   ====================================================================== */

const help = spawnSync('php', [join(webroot, 'install.php'), '--help', '--verbose'], { encoding: 'utf8' });
check('--help does not list --report-statistics', /--report-statistics=true\|false/.test(help.stdout),
    statisticsLines(help.stdout));

const refusing = await stand('refusing');
const no = refusing.install(['--report-statistics=false']);
check('the command line refused --report-statistics=false', no.status === 0, no.stderr || no.stdout);
const noConfig = refusing.config();
check('--report-statistics=false did not write the line', /^\s*'report_statistics' => false,/m.test(noConfig),
    statisticsLines(noConfig));
check('--report-statistics=false wrote the key twice: the second line would decide',
    noConfig.split(/'report_statistics'\s*=>/).length - 1 === 1, statisticsLines(noConfig));
count = received.length;
await refusing.add(P1, I1);
await refusing.daily();
await settle();
check('a server installed with --report-statistics=false sent something', received.length === count);
check('a server that refused from the start has a memory table, and perhaps an identifier in it',
    refusing.sqlite("SELECT name FROM sqlite_master WHERE name = 'notes_memory'") === '');

const typo = await stand('typo');
const bad = typo.install(['--report-statistics=maybe']);
check('--report-statistics=maybe was not refused', bad.status !== 0 && !existsSync(typo.configPath),
    'exit ' + bad.status + '\n' + bad.stdout);
check('the refusal does not name the option', /report-statistics/.test(bad.stderr + bad.stdout), bad.stderr + bad.stdout);

/* THE FORM. Read first, then posted three ways. */
const webForm = async (body) => {
    const it = await stand('web');
    const url = it.base + '/install.php';
    const form = await (await fetch(url, { redirect: 'manual' })).text();
    const posted = await (await fetch(url, { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' })).text();
    return { it, form, posted, config: it.config() };
};
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const untouchedForm = await webForm('storage=sqlite&audience=mine&updates=cron');
/* THE FIRST SCREEN SAYS IT, with nothing opened. The field is behind a
   switch like every other setting; that the default sends something must not
   be. The table under the switch, the one shown while it is SHUT, is where
   that is said. */
const shut = (untouchedForm.form.match(/<div class="shut-only">[\s\S]*?<\/table>/) || [''])[0];
check('the first screen does not say, without the switch being opened, that statistics are sent',
    /Send daily statistics/.test(shut)
        && /yes: a random identifier, the version and three totals, to the project, once a day/.test(plain(shut)),
    plain(shut));
const field = (untouchedForm.form.match(/<select name="report_statistics"[\s\S]*?<\/select>/) || [''])[0];
check('the form has no field for report_statistics', field !== '');
check('the field does not say that its default is true', /<option value="">Default: true -- sent daily<\/option>/.test(field), field);
check('the field does not offer true and false', /<option value="true"/.test(field) && /<option value="false"/.test(field), field);
check('the installer calls the statistics anonymous: the identifier is the same every day',
    !/anonymous/i.test(untouchedForm.form) && !/anonymous/i.test(help.stdout));
check('the form does not carry the long sentence, with what the receiver sees anyway',
    /Never a domain name, a project id, a page, a line of a note or a key; the receiver sees the address the request comes from/
        .test(plain(untouchedForm.form)));
check('a form left untouched did not write report_statistics true, as an active line',
    /^\s*'report_statistics' => true,/m.test(untouchedForm.config), statisticsLines(untouchedForm.config));

const declined = await webForm('storage=sqlite&audience=mine&updates=cron&report_statistics=false');
check('the form, with the field on false, did not write report_statistics false',
    /^\s*'report_statistics' => false,/m.test(declined.config)
        && declined.config.split(/'report_statistics'\s*=>/).length - 1 === 1, statisticsLines(declined.config));

const nonsense = await webForm('storage=sqlite&audience=mine&updates=cron&report_statistics=perhaps');
check('the form took report_statistics=perhaps and installed', nonsense.config === '', statisticsLines(nonsense.config));
check('the form does not say which field it refused', /report_statistics|daily statistics/i.test(nonsense.posted));

/* ======================================================================
   4. THIS SUITE DECLARES TO NOBODY
   ====================================================================== */

/* Every check that installs a real server AND writes a note on it would
   declare to the project's address. Each installation it makes says no. */
for (const name of readdirSync(here).filter((f) => /^check-.*\.mjs$/.test(f) && f !== 'check-statistics.mjs')) {
    const text = readFileSync(join(here, name), 'utf8');
    if (!text.includes('action=add')) continue;
    // An installation given `...args` -- one value for every setting, this
    // one included -- has already answered, and holds no note.
    const installs = (text.match(/--answers-for=[a-z-]+'(?![^\n]*\.\.\.args)|audience=[a-z]+&storage=/g) || []).length;
    // As an argument or a form field, between quotes -- not as a word in a
    // comment about it, which says no to nothing.
    const refusals = (text.match(/'--report-statistics=false'|&report_statistics=false'/g) || []).length;
    check(name + ' installs ' + installs + ' server(s), writes notes, and says no to statistics ' + refusals
        + ' time(s): the others declare to the real address', installs > 0 && refusals >= installs);
}

done();
if (failures.length) {
    console.log('statistics:');
    for (const f of failures) console.log('  ' + f);
    process.exit(1);
}
console.log('statistics: five fields leave a server once a day, after a write that was one, and nothing '
    + 'else does; none from a server nobody used or one that said no; a receiver that is down, slow or '
    + 'dripping costs a bounded time; the one server the address leads to proves it, writes its own '
    + 'door and declares to nobody, and no claim or copied door opens one elsewhere; it replaces, '
    + 'rations by network, clips, never lowers a total and keeps no address; the installer says it '
    + 'on its first screen and writes what it was told');
