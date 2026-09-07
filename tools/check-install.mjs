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
import { mkdtempSync, cpSync, rmSync, existsSync, readFileSync, readdirSync,
         chmodSync, writeFileSync } from 'node:fs';
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
        /* Counted in ROWS: a discussed thread is two or three, so a real
           project of 122 remarks already holds about 370. 500 left a working
           team a third of a campaign, and past the cap nobody can reply. */
        ['a cap per project', "'max_notes_per_project' => 2000"],
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

/* -- WHAT AN OLDER INSTALLER WROTE MUST GO ON BEING READ ----------------
   internal/install-flow.php travels in the MANIFEST, so every rewrite of it
   lands on every server already installed, at their next update. Their
   configuration does not travel with it: it was written months ago, by a
   version that did not know the keys this one writes. `config.php` merges its
   defaults over whatever it finds, which is what makes that safe -- and this
   is the only place that says so out loud.

   TWO FIXTURES, AND THEY ARE FROZEN ON PURPOSE. One is what the installer
   generated before today; the other is what somebody writes by hand, which
   INSTALL.md tells them they may. Neither is regenerated from the current
   code: a fixture that follows the code proves nothing. */

const fixtures = {
    'the 2.9.1 installer': (file) => `<?php
/* Written by annotepage install.php 2.9.1 -- kept as a fixture. */
return array(
    'active' => true,
    'deployment' => 'relay',
    'open_registration' => true,
    'storage'  => 'sqlite',
    'database' => array('file' => '${file}'),
    'projects' => array(),
    'max_note_age_days'     => 90,
    'max_notes_per_project' => 500,
    'auto_update' => false,
    'update_token' => 'a-token-of-more-than-thirty-two-characters',
    'forward_root_to' => '',
    'diagnostic' => 'minimal',
);
`,
    'five lines written by hand': (file) => `<?php
return array(
    'active' => true,
    'deployment' => 'self-hosted',
    'storage' => 'sqlite',
    'database' => array('file' => '${file}'),
    'projects' => array(),
);
`,
};

for (const [what, write] of Object.entries(fixtures)) {
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-old-'));
    const root = join(dir, 'web');
    cpSync(webroot, root, { recursive: true });
    writeFileSync(join(root, 'internal', 'config-local.php'),
                  write(join(dir, 'notes.sqlite')));
    const port = await freePort();
    const server = spawn('php', ['-S', '127.0.0.1:' + port], {
        cwd: root, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
    });
    let text = '';
    for (let i = 0; i < 40 && !text; i += 1) {
        await sleep(150);
        try {
            /* The header, because the installed server answers plain http with
               a 308 -- which the case above is there to prove. */
            const r = await fetch('http://127.0.0.1:' + port + '/api.php?action=diagnostic',
                                  { headers: { 'X-Forwarded-Proto': 'https' } });
            text = await r.text();
        } catch (e) { /* not listening yet */ }
    }
    /* WHAT IS BEING PROVED IS THAT IT WAS READ. "no database file yet: it is
       created at the first note" is a healthy verdict on a fixture nobody has
       written a note to -- taking it for a failure would have made this check
       demand that old servers be busy. What must never appear is the sentence
       that says the file could not be loaded at all. */
    const verdict = (text.match(/^verdict (.*)$/m) || [])[1] || '(none)';
    check(`a configuration from ${what} is no longer read`,
        text.includes('tool annotepage') && !text.includes('could not be loaded'),
        text.slice(0, 300));

    /* And it does not merely parse: the store built from it answers. The
       relay fixture serves any well-formed id, so `list` reaches the database
       and creates it -- which is what turns the verdict above into
       "operational" on a real server. */
    if (what.includes('2.9.1')) {
        let listed = '';
        try {
            const r = await fetch('http://127.0.0.1:' + port
                + '/api.php?action=list&project=AAAAAAAAAAAAAAAAAAAAAA'
                + '&index=BBBBBBBBBBBBBBBBBBBBBB',
                { headers: { 'X-Forwarded-Proto': 'https', Origin: 'https://example.com' } });
            listed = await r.text();
        } catch (e) { listed = String(e); }
        check('a store built from that old configuration does not answer',
            listed.includes('"ok":true') && listed.includes('"totals"'), listed.slice(0, 300));
    }
    void verdict;
    try { server.kill('SIGKILL'); } catch (e) { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
}

/* -- THE OTHER FACE, RUN THE WAY SOMEBODY WOULD RUN IT ------------------
   The command line installs the same server through the same code. What is
   checked here is not that it prints nicely: it is that it refuses the four
   things it must refuse, and that a run it accepts really does write a
   configuration. */

const shell = async (dir, args) => {
    const r = spawnSync('php', [join(dir, 'web', 'install.php'), ...args],
        { encoding: 'utf8', cwd: join(dir, 'web') });
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
};

{
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-cli-'));
    const root = join(dir, 'web');
    cpSync(webroot, root, { recursive: true });
    const port = await freePort();
    const server = spawn('php', ['-S', '127.0.0.1:' + port], {
        cwd: root, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
    });
    for (let i = 0; i < 40; i += 1) {
        await sleep(150);
        try { await fetch('http://127.0.0.1:' + port + '/install.php', { redirect: 'manual' }); break; }
        catch (e) { /* not listening yet */ }
    }
    const address = '--api-address=http://127.0.0.1:' + port + '/api.php';

    /* An installer run with no arguments is a script that forgot them: it
       prints what it takes and refuses, rather than installing defaults. */
    const bare = await shell(dir, []);
    check('a bare command line installed something', bare.code === 2 && !existsSync(
        join(root, 'internal', 'config-local.php')), 'exit ' + bare.code);
    check('--help does not answer', (await shell(dir, ['--help'])).code === 0);

    const typo = await shell(dir, [address, '--answers-for=one-site', '--storaje=sqlite']);
    check('a mistyped option was swallowed', typo.code === 2 && /Unknown option/.test(typo.err),
        'exit ' + typo.code + '\n' + typo.err.slice(0, 200));

    /* `relay` is the word the configuration uses and `anyone` the word the form
       sends. Somebody will type the first. The browser face falls back to the
       narrow answer on anything it does not recognise, which is right for a
       radio button and wrong for a typed word. */
    const wrongValue = await shell(dir, [address, '--answers-for=relay']);
    check('a value outside the list was taken anyway',
        wrongValue.code === 2 && /not one of/.test(wrongValue.err),
        'exit ' + wrongValue.code);

    const noAddress = await shell(dir, ['--answers-for=one-site']);
    check('it installed without being told the address',
        noAddress.code === 2 && /api-address is required/.test(noAddress.err),
        'exit ' + noAddress.code);

    const self = await shell(dir, [address, '--answers-for=one-site', '--updated-by=self']);
    check('it accepted an answer it cannot measure from a shell',
        self.code === 2 && /not offered here/.test(self.err), 'exit ' + self.code);

    check('nothing above was supposed to write a configuration',
        !existsSync(join(root, 'internal', 'config-local.php')));

    const done = await shell(dir, [address, '--answers-for=one-site', '--storage=sqlite']);
    check('a correct command line did not install', done.code === 0
        && existsSync(join(root, 'internal', 'config-local.php')),
        'exit ' + done.code + '\n' + done.err.slice(0, 300));
    if (existsSync(join(root, 'internal', 'config-local.php'))) {
        const written = readFileSync(join(root, 'internal', 'config-local.php'), 'utf8');
        check('the command line wrote a different configuration from the form',
            written.includes("'deployment' => 'self-hosted'")
            && written.includes("'max_note_age_days'     => 90")
            && written.includes("'publish_server_totals' => false"));
    }

    const again = await shell(dir, [address, '--answers-for=one-site']);
    check('a second run did not say it had nothing to do',
        again.code === 0 && /Already configured/.test(again.out), 'exit ' + again.code);

    try { server.kill('SIGKILL'); } catch (e) { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
}

/* -- THE ADDRESS HAS TO LEAD TO THE DIRECTORY BEING INSTALLED -----------
   In a browser they are one thing: the request arrived at this file. On a
   command line they are two independent inputs, and nothing compared them.
   Measured before this was tied: a release unpacked one directory down and
   given the site root as its address installed with exit 0, said the database
   was placed where no URL reaches it, and left it answering 200 to a GET. */
{
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-tie-'));
    const site = join(dir, 'html');
    const deeper = join(site, 'apps', 'notes');
    cpSync(webroot, deeper, { recursive: true });
    cpSync(join(webroot, 'install.php'), join(site, 'install.php'));
    cpSync(join(webroot, 'internal'), join(site, 'internal'), { recursive: true });
    const port = await freePort();
    const server = spawn('php', ['-S', '127.0.0.1:' + port], {
        cwd: site, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
    });
    for (let i = 0; i < 40; i += 1) {
        await sleep(150);
        try { await fetch('http://127.0.0.1:' + port + '/install.php', { redirect: 'manual' }); break; }
        catch (e) { /* not listening yet */ }
    }
    /* The site root answers `?probe=` too -- that is exactly why the control
       request alone proved nothing. */
    const lie = spawnSync('php', [join(deeper, 'install.php'),
        '--api-address=http://127.0.0.1:' + port + '/api.php', '--answers-for=one-site'],
        { encoding: 'utf8', cwd: deeper });
    check('an address that leads somewhere else was accepted',
        lie.status === 2 && /does not lead to this directory/.test(lie.stderr || ''),
        'exit ' + lie.status + '\n' + (lie.stderr || '').slice(0, 200));
    check('nothing was written by the refused run',
        !existsSync(join(deeper, 'internal', 'config-local.php')));
    check('the witness file was left behind',
        readdirSync(deeper).filter((f) => f.startsWith('ap-check-')).length === 0
        && readdirSync(site).filter((f) => f.startsWith('ap-check-')).length === 0);

    const right = spawnSync('php', [join(deeper, 'install.php'),
        '--api-address=http://127.0.0.1:' + port + '/apps/notes/api.php',
        '--answers-for=one-site'], { encoding: 'utf8', cwd: deeper });
    check('the address that does lead here was refused', right.status === 0
        && existsSync(join(deeper, 'internal', 'config-local.php')),
        'exit ' + right.status + '\n' + (right.stderr || '').slice(0, 300));

    try { server.kill('SIGKILL'); } catch (e) { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
}

/* -- A FAILED INSTALL MUST NOT TOUCH SOMEBODY ELSE'S DATABASE -----------
   The data file's path is fixed -- <parent of the document root>/
   annotepage-data/notes.sqlite -- so a second installation under the same
   parent lands on the first one's database. Listing that file as "created"
   made the undo delete it: measured, a failed run from a second copy
   destroyed a live installation's notes, and the next request recreated an
   empty file with its schema, so nothing anywhere said a word.

   This is the check that must never pass by accident: it installs for real,
   writes a row, then fails a second installer on purpose. */
{
    const parent = mkdtempSync(join(tmpdir(), 'annotepage-shared-'));
    const first = join(parent, 'html');
    const second = join(parent, 'html2');
    cpSync(webroot, first, { recursive: true });
    cpSync(webroot, second, { recursive: true });
    const port = await freePort();
    const server = spawn('php', ['-S', '127.0.0.1:' + port], {
        cwd: first, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
    });
    for (let i = 0; i < 40; i += 1) {
        await sleep(150);
        try { await fetch('http://127.0.0.1:' + port + '/install.php', { redirect: 'manual' }); break; }
        catch (e) { /* not listening yet */ }
    }
    const ok = spawnSync('php', [join(first, 'install.php'),
        '--api-address=http://127.0.0.1:' + port + '/api.php',
        '--answers-for=one-site'], { encoding: 'utf8', cwd: first });
    const config = existsSync(join(first, 'internal', 'config-local.php'))
        ? readFileSync(join(first, 'internal', 'config-local.php'), 'utf8') : '';
    const file = (config.match(/'file' => '([^']+)'/) || [])[1];
    check('the first installation did not happen', ok.status === 0 && Boolean(file),
        'exit ' + ok.status);

    if (file) {
        /* A row written straight into the file: what a team's notes are, as far
           as this check is concerned. */
        const wrote = spawnSync('php', ['-r',
            '$d = new PDO("sqlite:" . $argv[1]);'
            + ' $d->exec("INSERT INTO notes_notes (project, page, page_index, created_at,'
            + ' mode, format, text, author, selector, fingerprint, excerpt)'
            + ' VALUES (\'P\', \'/x\', \'i\', \'2020-01-01 00:00:00\', \'plain\', 2,'
            + ' \'keep me\', \'somebody\', \'body\', \'f\', \'e\')");'
            + ' echo $d->query("SELECT COUNT(*) FROM notes_notes")->fetchColumn();',
            file], { encoding: 'utf8' });
        check('the row could not be written for the check', (wrote.stdout || '') === '1',
            wrote.stdout + wrote.stderr);

        /* The second one is served too -- it has to be, or it would fail on
           the address tie before ever reaching the data file, and this case is
           about what the UNDO does. It fails at the last step instead: its
           internal/ cannot be written, which is a real hosting state and the
           one the installer already has a sentence for. */
        const port2 = await freePort();
        const server2 = spawn('php', ['-S', '127.0.0.1:' + port2], {
            cwd: second, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' },
            stdio: 'ignore',
        });
        for (let i = 0; i < 40; i += 1) {
            await sleep(150);
            try { await fetch('http://127.0.0.1:' + port2 + '/install.php', { redirect: 'manual' }); break; }
            catch (e) { /* not listening yet */ }
        }
        chmodSync(join(second, 'internal'), 0o555);
        const doomed = spawnSync('php', [join(second, 'install.php'),
            '--api-address=http://127.0.0.1:' + port2 + '/api.php',
            '--answers-for=one-site'], { encoding: 'utf8', cwd: second });
        chmodSync(join(second, 'internal'), 0o755);
        try { server2.kill('SIGKILL'); } catch (e) { /* gone */ }
        check('the second installation was supposed to fail', doomed.status === 1,
            'exit ' + doomed.status);
        check('a failed install deleted a live installation\'s database',
            existsSync(file), file);
        const left = spawnSync('php', ['-r',
            '$d = new PDO("sqlite:" . $argv[1]);'
            + ' echo $d->query("SELECT COUNT(*) FROM notes_notes")->fetchColumn();',
            file], { encoding: 'utf8' });
        check('the notes did not survive a neighbour\'s failed install',
            (left.stdout || '') === '1', JSON.stringify(left.stdout + left.stderr));
        check('the screen did not say the file was left alone',
            /left exactly as it was/.test(doomed.stdout || ''),
            (doomed.stdout || '').slice(0, 200));
    }

    try { server.kill('SIGKILL'); } catch (e) { /* gone */ }
    rmSync(parent, { recursive: true, force: true });
}

/* -- A STORE OLDER THAN THE SERVER AROUND IT ----------------------------
   internal/update.php deliberately keeps a store file it did not ship -- one
   somebody replaced, and also one it cannot recognise because the local
   MANIFEST is gone. That file then stays where it was while the rest of the
   server moves on. Measured before this was guarded: every annotated page
   turned into a 500, `?action=text` went on working, and the diagnostic said
   `operational`. The symptom reached the operator through their reviewers.

   The old store here is the real one from the release before those methods
   existed, taken out of the history rather than written for the occasion. */
{
    const old = spawnSync('git', ['show', 'bcc590f:server/webroot/internal/store-sqlite.php'],
        { encoding: 'utf8', cwd: join(here, '..'), maxBuffer: 8 * 1024 * 1024 });
    if (old.status !== 0) {
        console.log('  (the pre-2.8.0 store is not in this clone, that case was skipped)');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'annotepage-oldstore-'));
        const root = join(dir, 'web');
        cpSync(webroot, root, { recursive: true });
        writeFileSync(join(root, 'internal', 'store-sqlite.php'), old.stdout);
        writeFileSync(join(root, 'internal', 'config-local.php'), `<?php
return array('active' => true, 'allow_plain_http' => true,
    'deployment' => 'self-hosted', 'storage' => 'sqlite',
    'database' => array('file' => '${join(dir, 'notes.sqlite')}'),
    'table_prefix' => 'notes_', 'diagnostic' => 'full',
    'projects' => array('AAAAAAAAAAAAAAAAAAAAAA' => array(
        'origins' => array('http://127.0.0.1'), 'mode' => 'plain')));
`);
        const port = await freePort();
        const server = spawn('php', ['-S', '127.0.0.1:' + port], {
            cwd: root, env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore',
        });
        let listed = null;
        for (let i = 0; i < 40 && listed === null; i += 1) {
            await sleep(150);
            try {
                listed = await fetch('http://127.0.0.1:' + port
                    + '/api.php?action=list&project=AAAAAAAAAAAAAAAAAAAAAA'
                    + '&index=BBBBBBBBBBBBBBBBBBBBBB', { redirect: 'manual' });
            } catch (e) { /* not listening yet */ }
        }
        const body = listed ? await listed.text() : '';
        check('a store older than the server kills every annotated page',
            listed && listed.status === 200, 'HTTP ' + (listed && listed.status)
            + '\n' + body.slice(0, 200));
        check('the missing figure was invented rather than left out',
            /"expired":null/.test(body), body.slice(0, 200));
        const diag = await (await fetch('http://127.0.0.1:' + port
            + '/api.php?action=diagnostic', { redirect: 'manual' })).text();
        check('the diagnostic says nothing about a store that is behind',
            /storage\.contract\s+OLDER/.test(diag),
            (diag.match(/storage\.contract.*/) || ['(no line at all)'])[0]);
        try { server.kill('SIGKILL'); } catch (e) { /* gone */ }
        rmSync(dir, { recursive: true, force: true });
    }
}

/* -- A FAILURE ON A COMMAND LINE HAS TO FAIL ITS CALLER ------------------
   ap_respond_error() ends every uncaught defect. On the web it sets a status
   and writes the sentence; in CLI header() and http_response_code() are
   harmless no-ops, and `exit;` with no code is ZERO -- so a failure printed
   its sentence on stdout and told the caller all was well. */
{
    const errors = join(here, '..', 'server', 'webroot', 'internal', 'errors.php');
    const r = spawnSync('php', ['-r',
        'define("AP_INTERNAL", 1); require ' + JSON.stringify(errors) + ';'
        + ' ap_respond_error(500, "a failure");'], { encoding: 'utf8' });
    check('a failure on a command line exits 0', r.status === 1, 'exit ' + r.status);
    check('a failure on a command line writes to stdout',
        (r.stdout || '') === '', JSON.stringify(r.stdout));
    check('a failure on a command line says nothing on stderr',
        /a failure/.test(r.stderr || ''), JSON.stringify(r.stderr));
}

/* -- THE TWO CRON ENTRIES REPORT, THEY DO NOT CRASH ---------------------
   maintenance.php promises a scheduler "it exits 0 when there was nothing to
   do, so a scheduler that reports failures has something to report on", and
   --help announces 0/1/2. Measured before the nets were installed there: a
   configuration it could not read gave a raw PHP fatal, exit 255, and a stack
   trace naming the path of that configuration on the operator's terminal. */
{
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-cron-'));
    const root = join(dir, 'web');
    cpSync(webroot, root, { recursive: true });
    writeFileSync(join(root, 'internal', 'config-local.php'),
        "<?php\nreturn array('active' => true, 'deployment' => 'nonsense');\n");
    for (const script of ['maintenance.php', 'update.php']) {
        const r = spawnSync('php', [join(root, 'internal', script)], { encoding: 'utf8' });
        check(`${script} crashes on a configuration it cannot read`,
            r.status === 1, 'exit ' + r.status);
        check(`${script} writes its failure on stdout`,
            (r.stdout || '') === '', JSON.stringify((r.stdout || '').slice(0, 120)));
        check(`${script} says nothing about what is wrong`,
            /deployment/.test(r.stderr || ''), JSON.stringify((r.stderr || '').slice(0, 120)));
    }
    rmSync(dir, { recursive: true, force: true });
}

/* -- THE FILE SOMEBODY DOWNLOADS, BEFORE IT HAS DOWNLOADED ANYTHING ------
   Both cases run with no release on disk and touch no network: an aide that
   fetches would be an aide that fails on a host with no way out, which is one
   of the hosts this tool is for. */
{
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-boot-'));
    cpSync(join(here, '..', 'server', 'annotepage-install.php'),
           join(dir, 'annotepage-install.php'));
    const run = (args) => spawnSync('php', [join(dir, 'annotepage-install.php'), ...args],
        { encoding: 'utf8', cwd: dir });

    const help = run(['--help']);
    check('the bootstrap does not answer --help before it has a release',
        help.status === 0 && /one file that installs/.test(help.stdout || ''),
        'exit ' + help.status);
    check('asking for help downloaded something',
        readdirSync(dir).length === 1, readdirSync(dir).join(' '));

    const bare = run([]);
    check('a bare bootstrap command line did not refuse', bare.status === 2);
    check('a bare command line downloaded something',
        readdirSync(dir).length === 1, readdirSync(dir).join(' '));

    rmSync(dir, { recursive: true, force: true });
}

if (failures.length) {
    console.error('install:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log('install: seven installations run end to end, the four refusals a shell owes, '
    + "a neighbour's database left alone by a failed run, a store older than the server "
    + 'around it, and two configurations from older installers');
