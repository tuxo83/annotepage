#!/usr/bin/env node
/* check-install.mjs — AN INSTALLATION, FOR REAL, FROM END TO END.
 *
 * The installer is the most consequential file in this project: it is the one
 * that writes the configuration, and it runs exactly once on somebody's host,
 * where nobody is watching. Until this file existed, nothing tested it. The
 * suite compared its two copies byte for byte and checked nothing about what
 * it DOES.
 *
 * So this runs it: a throwaway copy of webroot/, a real PHP server in front of
 * it, the form answered as a person would answer it, and then the questions
 * that matter -- was a configuration written, does it parse, does it declare
 * what was asked for, is the data file out of reach, and does a second run
 * refuse rather than overwrite.
 *
 * WHY THE WORKER COUNT IS SET, and it is not a detail: the installer proves
 * the data file is unreachable over HTTP by REQUESTING ITS OWN ADDRESS. A
 * single-worker development server cannot answer itself while it is busy
 * serving the installer, so it deadlocks, and the installer -- correctly --
 * refuses to finish and says so. That refusal is the right behaviour and this
 * test would otherwise measure only that. PHP_CLI_SERVER_WORKERS gives the dev
 * server the second worker a real host has.
 *
 * Skipped, loudly, where there is no php: a check that cannot run must not
 * report that it passed.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, cpSync, rmSync, existsSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webroot = join(here, '..', 'server', 'webroot');

const php = spawnSync('php', ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
if (php.error || php.status !== 0) {
    console.log('install: no php on this machine, nothing was run');
    process.exit(0);
}
if ((spawnSync('php', ['-r', 'echo extension_loaded("pdo_sqlite")?"yes":"no";'],
    { encoding: 'utf8' }).stdout || '').trim() !== 'yes') {
    console.log('install: php has no pdo_sqlite, nothing was run');
    process.exit(0);
}

const failures = [];
const check = (what, ok, detail) => {
    if (!ok) failures.push(what + (detail ? '\n    ' + String(detail).replace(/\n/g, '\n    ') : ''));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A PORT NOBODY ELSE HOLDS, ASKED OF THE SYSTEM RATHER THAN CHOSEN. A fixed
   number cost an afternoon: a crashed run left its server listening, the next
   run failed to bind, and every request went to the OLD installation -- which
   answered "already installed" and made the new code look broken. The system
   knows what is free; we do not. */
const freePort = () => new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});

/** A throwaway installation: its own directory, its own server, its own port. */
const rehearse = async (port, body, prepare) => {
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-install-'));
    const root = join(dir, 'web');
    cpSync(webroot, root, { recursive: true });
    if (prepare) prepare(dir, root);
    const server = spawn('php', ['-S', '127.0.0.1:' + port], {
        cwd: root,
        env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' },
        stdio: 'ignore',
    });
    const url = 'http://127.0.0.1:' + port + '/install.php';
    let up = false;
    for (let i = 0; i < 40 && !up; i += 1) {
        await sleep(150);
        try { up = (await fetch(url, { redirect: 'manual' })).ok; } catch (e) { /* not listening yet */ }
    }
    const form = up ? await (await fetch(url, { redirect: 'manual' })).text() : '';
    const done = up ? await (await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
        redirect: 'manual',
    })).text() : '';
    const again = up ? await (await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body,
        redirect: 'manual',
    })).text() : '';
    const configPath = join(root, 'internal', 'config-local.php');
    const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : null;
    /* THE API, OVER PLAIN HTTP, ON THE INSTALLATION IT JUST WROTE. Not
       followed: what is being measured IS the redirect. A configuration that
       let the API answer over http would let a browser reach it without a
       secure context, and WebCrypto -- which is where the notes are sealed --
       does not exist there. */
    const api = up
        ? await fetch('http://127.0.0.1:' + port + '/api.php?action=diagnostic',
                      { redirect: 'manual' })
        : null;
    return { dir, root, port, up, form, done, again, config, configPath, server,
             apiStatus: api ? api.status : 0,
             apiLocation: api ? (api.headers.get('location') || '') : '' };
};

const stop = (run) => {
    try { run.server.kill('SIGKILL'); } catch (e) { /* already gone */ }
    rmSync(run.dir, { recursive: true, force: true });
};

/* -- One site's own server, on a file ----------------------------------- */

const own = await rehearse(await freePort(), 'storage=sqlite&audience=mine&updates=cron');
check('the server under test never came up', own.up);

/* THE THREE QUESTIONS THE SITE PROMISES. how-to-install-it.html says "Answer
   its three questions", and these are them: who it answers for, where the
   notes go, who keeps it current. Everything else on that form belongs to the
   MySQL answer. If a fourth question ever appears here, the page that promises
   three has to change with it. */
for (const field of ['audience', 'storage', 'updates']) {
    check(`the form does not ask "${field}"`, own.form.includes(`name="${field}"`));
}

check('no configuration was written', own.config !== null, own.done.slice(0, 400));
if (own.config) {
    const parses = spawnSync('php', ['-l', own.configPath], { encoding: 'utf8' });
    check('the configuration it wrote does not parse', parses.status === 0, parses.stdout);

    for (const [what, wanted] of [
        ['deployment', "'deployment' => 'self-hosted'"],
        ['storage', "'storage'  => 'sqlite'"],
        ['retention', "'max_note_age_days'     => 90"],
        ['server totals, off', "'publish_server_totals' => false"],
        ['an empty projects array', "'projects' => array()"],
    ]) {
        check(`the configuration does not declare ${what}`, own.config.includes(wanted));
    }

    /* THE DATA FILE, AND THE ONE THING THAT MATTERS ABOUT IT. Inside the
       document root it can be fetched over HTTP, and an .htaccess does nothing
       under nginx -- so the installer places it above, and only falls back to
       inside with two guard files. Both outcomes are acceptable; a bare file
       inside is not. */
    const file = (own.config.match(/'file'\s*=>\s*'([^']+)'/) || [])[1];
    check('the configuration names no data file', Boolean(file));
    if (file) {
        const inside = file.startsWith(own.root + '/');
        const guarded = inside
            && existsSync(join(dirname(file), '.htaccess'))
            && existsSync(join(dirname(file), 'index.php'));
        check('the data file sits in the document root with no guard', !inside || guarded, file);
    }
}

/* WHAT THE LAST SCREEN HANDS OVER. Both cron lines, with the real path of this
   installation in them: the sweep that keeps the retention promise, and the
   update. An example is a thing to adapt, and the adaptation is where it goes
   wrong on a host whose operator has a control panel and no shell. */
check('the last screen does not hand over the sweep line',
    own.done.includes('internal/maintenance.php'));
check('the last screen does not hand over the update line',
    own.done.includes('internal/update.php'));
check('the last screen does not say how long a remark is kept',
    own.done.includes('How long a remark is kept'));

/* AND IT REFUSES THE SECOND TIME. An installer that rewrote a live
   configuration because somebody reloaded a page would be a way to lose a
   server, and this is the only place that can prove it does not. */
check('a second run did not refuse', own.again.includes('already installed'), own.again.slice(0, 300));
const after = own.config === null ? null : readFileSync(own.configPath, 'utf8');
check('a second run rewrote the configuration', after === own.config);

check('the API answers over plain http after the install',
    own.apiStatus === 308,
    'status ' + own.apiStatus);
check('the redirect does not lead to the same address in https',
    /^https:\/\/127\.0\.0\.1:\d+\/api\.php/.test(own.apiLocation), own.apiLocation);

stop(own);

/* -- A relay, for anybody ------------------------------------------------ */

const relay = await rehearse(await freePort(), 'storage=sqlite&audience=anyone&updates=cron');
check('the relay run never came up', relay.up);
if (relay.config) {
    for (const [what, wanted] of [
        ['a relay', "'deployment' => 'relay'"],
        ['open registration', "'open_registration' => true"],
        ['a cap per project', "'max_notes_per_project' => 500"],
    ]) {
        check(`the relay configuration does not declare ${what}`, relay.config.includes(wanted));
    }
} else {
    check('the relay run wrote no configuration', false, relay.done.slice(0, 400));
}
stop(relay);

/* -- A TYPO MUST NEVER OPEN A RELAY ------------------------------------
   The narrow deployment is what an unrecognised answer produces, and the code
   says why in as many words: a relay opened by a mistyped value would store
   strangers' notes on somebody who never asked for that. This case was written
   because the author of this file mistyped `any` for `anyone` and the run
   quietly did the right thing -- which is exactly the kind of correctness that
   nothing was watching. */

const typo = await rehearse(await freePort(), 'storage=sqlite&audience=Anyone&updates=cron');
check('a mistyped audience never came up', typo.up);
if (typo.config) {
    check('a mistyped audience opened a relay',
        typo.config.includes("'deployment' => 'self-hosted'")
        && !typo.config.includes("'open_registration' => true"));
} else {
    check('the mistyped run wrote no configuration', false, typo.done.slice(0, 300));
}
stop(typo);

/* -- A RUN THAT FAILS LEAVES NOTHING BEHIND -----------------------------
   The data file is created BEFORE the configuration is written, so every
   failure after that point has something to undo. The undo used to live inside
   the storage branch and therefore ran for a failed proof and not for the two
   failures that come later -- and a SQLite database left in the web root,
   belonging to nobody, is the exact outcome this installer's proof exists to
   prevent.

   Made to fail the honest way: internal/ is not writable, which is a real
   hosting configuration and the one the installer already has a sentence
   about. */

const doomed = await rehearse(await freePort(), 'storage=sqlite&audience=mine&updates=cron',
    (dir, root) => chmodSync(join(root, 'internal'), 0o555));
check('the doomed run never came up', doomed.up);
check('a run that could not write its configuration wrote one anyway',
    doomed.config === null);
const leftovers = [];
const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.sqlite(-wal|-shm)?$/.test(entry.name)) leftovers.push(path);
    }
};
walk(doomed.dir);
check('a failed run left a database behind', leftovers.length === 0, leftovers.join('\n'));
chmodSync(join(doomed.root, 'internal'), 0o755);
stop(doomed);

if (failures.length) {
    console.error('install:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log('install: two installations run end to end, self-hosted and relay, '
    + 'configuration written, data file out of reach, second run refused');
