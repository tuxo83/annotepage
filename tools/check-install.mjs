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
import { createHash } from 'node:crypto';
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

/* EVERY RESPONSE IS READ TO THE END, EVEN WHEN ONLY ITS STATUS IS WANTED. A
   body left unread keeps the socket with its parser paused -- the installer's
   page is 90 KB, more than a socket buffers -- and when the test server is
   killed under it, the fetch of Node 24 (the one GitHub's runners use) dies on
   `assert(!this.paused)` and takes the whole suite with it. Node 22 did not,
   which is how it went unseen on a workstation and red in CI. */
const answered = async (response) => {
    try { await response.arrayBuffer(); } catch (e) { /* the status is what was asked */ }
    return response;
};

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
        try { up = (await answered(await fetch(url, { redirect: 'manual' }))).ok; } catch (e) { /* not listening yet */ }
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
        ? await answered(await fetch('http://127.0.0.1:' + port + '/api.php?action=diagnostic',
                      { redirect: 'manual' }))
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

/* AND THE ADDRESS, WHICH IS NOT A QUESTION BUT MUST BE VISIBLE. The browser
   face reads it off the request that opened the page -- right almost always,
   invisible always -- and the two cases where it is wrong are ordinary: a
   proxy or CDN whose public name is not the one PHP sees, and an installation
   done through a temporary address. It goes into `data-server` on every page,
   so getting it silently wrong is a tag that loads nothing under a screen that
   said everything went well. */
check('the form does not show the address it will write into the tag',
    own.form.includes('name="api_address"'));
check('the address field is not pre-filled with the address this request arrived at',
    own.form.includes('name="api_address" value="http://127.0.0.1:' + own.port
        + '/api.php"'),
    (own.form.match(/name="api_address" value="[^"]*"/) || ['(absent)'])[0]);

/* EVERY KEY THERE IS, AND A FIELD FOR IT. The form asks three questions and
   folds the rest, which is a way of not frightening anybody -- but a person
   looking for one setting must be able to find out whether it exists at all,
   and the answer cannot be "read config.php". So: every key of
   ap_config_defaults() is either a field on this form and an option on the
   command line, or it is in the list below, which names what the three
   questions and the MySQL box already decide. A key added to config.php and
   to neither lands here, loudly, on the day it is added.
   The exemptions are exempt for a reason each, and none of them is "it is
   specific": `projects` descends from a key this server never receives, and
   the rest are what the questions answered. */
const decidedByTheQuestions = {
    active: 'written true by the act of installing',
    storage: 'the storage question',
    database: 'the MySQL box, field by field',
    allow_plain_mode: 'the audience question',
    require_origin_on_writes: 'the audience question',
    open_registration: 'the audience question',
    auto_update: 'the updates question',
    update_token: 'generated by the updates question, shown once',
    deployment: 'read from older files, never written by this one',
    projects: 'descends from a key the browser generates and this server never sees',
};
const askPhp = (code) => spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require '
    + JSON.stringify(join(webroot, 'internal', 'install-flow.php')) + '; ' + code],
    { encoding: 'utf8' }).stdout.trim();
const everyKey = askPhp('echo implode(" ", array_keys(ap_config_defaults()));').split(/\s+/);
const options = askPhp('echo implode(" ", array_keys(ap_i_cli_options()));').split(/\s+/);
for (const key of everyKey.filter(Boolean)) {
    if (decidedByTheQuestions[key]) continue;
    check(`config.php has "${key}" and the form has no field for it`
        + ' -- every key is either asked or in the list of what the questions decide',
        own.form.includes(`name="${key}"`));
    check(`config.php has "${key}" and the command line has no option for it`,
        options.includes(key.replace(/_/g, '-')));
}

/* AND THE EXAMPLE FILE NAMES THEM TOO. --help sends whoever wants the rest to
   internal/config-local.example.php, "with every key there is"; that sentence
   was true when it was written and had stopped being true thirteen keys later.
   `deployment` is the exception and stays one: it is read from files older
   installers wrote and is never written again, so naming it in an example
   would be offering it. */
const example = readFileSync(join(webroot, 'internal', 'config-local.example.php'), 'utf8');
for (const key of everyKey.filter(Boolean)) {
    if (key === 'deployment') continue;
    check(`config-local.example.php does not name "${key}", and --help says it names`
        + ' every key there is', example.includes("'" + key + "'"));
}

/* THE MySQL FIELDS FOLLOW THE ANSWER, WITH NO JAVASCRIPT. Choosing MySQL used
   to change nothing on the screen: the five fields the installation cannot do
   without sat behind a fold somebody had to think to open. They are a box now,
   hidden by the OTHER answer -- `form:has(#s-sqlite:checked) .if-mysql-box`.
   That order matters and is what this checks: a browser too old for `:has()`
   ignores the rule and shows the fields, which is what everybody had before.
   Never the reverse, which would hide them from the browser that cannot know
   they should come back. */
check('the MySQL fields are not in a box of their own', own.form.includes('if-mysql-box'));
check('the box is hidden by anything other than the SQLite answer being checked',
    own.form.includes('form:has(#s-sqlite:checked) .if-mysql-box { display: none; }'),
    (own.form.match(/[^\n]*if-mysql-box[^\n]*display[^\n]*/) || ['(no rule)'])[0]);
for (const field of ['host', 'port', 'name', 'user', 'password']) {
    check(`the form no longer asks for the MySQL ${field}`,
        own.form.includes(`name="${field}"`));
}

/* AND EVERY SETTING IS UNDER A NAMED SECTION, not in one fold called "change
   anything else" -- which says a list exists without saying what is in it, so
   whoever came to set a retention has to open it and read fifteen fields to
   find one. The sections are data, like the settings themselves; this refuses
   a setting that belongs to none of them, which is what a new key added
   without a thought would be. */
const sections = askPhp('echo implode(" ", array_keys(ap_i_setting_sections()));')
    .split(/\s+/).filter(Boolean);
check('the installer declares no sections at all', sections.length >= 3, sections.join(' '));
const grouped = askPhp('foreach (ap_i_settings() as $s) { echo $s["key"], "=",'
    + ' isset($s["group"]) ? $s["group"] : "(none)", "\n"; }')
    .split('\n').filter(Boolean).map((l) => l.split('='));
for (const [key, group] of grouped) {
    check(`the setting "${key}" is in no section, so the form would drop it`,
        sections.includes(group), group);
}
for (const title of askPhp('foreach (ap_i_setting_sections() as $s) { echo $s["title"], "\n"; }')
        .split('\n').filter(Boolean)) {
    check(`the form does not carry the section "${title}"`,
        own.form.includes(title.replace(/&/g, '&amp;')), title);
}

/* AND WHAT IS FOLDED STAYS THE EXCEPTION. A fold says "you may ignore this",
   which is false of the numbers an operator came to set: retention, the caps,
   the counters. Those are headings now, always on screen. What is left behind
   a summary is what is genuinely extra -- and its title has to say so, so that
   nobody has to open it to find out whether it matters.
   Three folds: the environment report, the rarely-needed settings, and the two
   that can undo the tool. A fourth means somebody folded something that should
   be read. */
const folds = [...own.form.matchAll(/<summary>([\s\S]*?)<\/summary>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&mdash;/g, '--').trim());
check(`the form has ${folds.length} folds, more than the three that earn one`,
    folds.length <= 3, folds.join(' | '));
/* AND NO SECTION OF SETTINGS IS A FOLD OF ITS OWN. One control opens the
   panel; inside it the sections are headings, drawn in the order the table
   declares them. A section behind a second summary puts a setting two clicks
   away and makes the list of titles unreadable. */
const sectionTitles = askPhp('foreach (ap_i_setting_sections() as $s) {'
    + ' echo $s["title"], "\n"; }').split('\n').filter(Boolean);
for (const title of sectionTitles) {
    check(`the section "${title}" is behind a fold of its own`,
        !folds.some((f) => f.includes(title)));
}
const drawn = [...own.form.matchAll(/<p class="part-title">([^<]*)<\/p>/g)]
    .map((m) => m[1].replace(/&mdash;/g, '--').trim());
const declared = sectionTitles.map((t) => t.replace(/&mdash;/g, '--').trim());
check('the sections are not drawn in the order the table declares them',
    drawn.join('|') === declared.join('|'),
    drawn.join(' | ') + '   against   ' + declared.join(' | '));

/* AND IT STAYS A FORM, NOT A BOOK. Every setting used to print the whole
   paragraph that --help prints, and the screen measured 1756 words -- more
   than the entire install page of the website. A fold that opens onto a book
   is a fold nobody reads, so the settings that matter get skipped along with
   the rest. The form prints the short line; --help prints the paragraph.
   Two rules, because prose comes back one sentence at a time: a ceiling on
   the whole screen, and a ceiling on any one line under a field. */
const words = (html) => {
    const text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
        .replace(/<[^>]+>/g, ' ');
    return (text.match(/[A-Za-z'\u2019-]+/g) || []).length;
};
/* TWO CEILINGS, AND THE TIGHT ONE IS ON THE THING THE RULE WAS WRITTEN FOR.
   It was one number over the whole document, which measured the wrong thing
   the moment the page gained a heading that says what is about to be written
   and a table of what an untouched install will write -- 89 and 107 words of
   fact that nobody should cut. The defect was never "words on the page", it
   was a PARAGRAPH UNDER EVERY FIELD: 1756 words of which 1214 sat in those
   notes. So the prose under the fields has its own ceiling, close to what it
   costs today, and the document keeps a looser one that still catches the
   day somebody prints `say` again. */
/* MEASURED ON WHAT IS SHOWN, NOT ON WHAT IS SENT. The page carries both
   registers of every sentence since the reader stopped having to reload for
   the long one; counting the markup would count a paragraph nobody is looking
   at and read as a page twice as wordy as it is. The long spans come out
   first -- and the check above refuses a page that has lost them, so this
   cannot become a way of hiding prose from the count. */
const shown = own.form.replace(/<span class="l-long">[\s\S]*?<\/span>/g, '');
const noteWords = [...shown.matchAll(/<p class="note[^"]*">([\s\S]*?)<\/p>/g)]
    .reduce((n, m) => n + words(m[1]), 0);
check(`the sentences under the fields are ${noteWords} words, over the 450 they`
    + ' are allowed -- that is where the 1214 were when this screen was a book',
    noteWords <= 450);
const onScreen = words(shown);
check(`the install screen is ${onScreen} words, over the 1200 it is allowed`
    + ' -- it printed 1756 once, and a screen that opens onto a book is not read',
    onScreen <= 1200);

for (const line of askPhp('foreach (ap_i_settings() as $s) { echo $s["key"], "=",'
        + ' $s["hint"], "\n"; }').split('\n').filter(Boolean)) {
    const [key, hint] = [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)];
    check(`the line under "${key}" is ${hint.length} characters, over the 140 a form`
        + ' owes: what does not fit belongs in --help', hint.length <= 140, hint);
}

/* AND THE THIRD UPDATE ANSWER IS OFFERED ON BOTH FACES. It was refused by the
   shell and drawn as unavailable on a host whose PHP interface cannot hand the
   response over -- which reads as prudence and is a refusal: `auto_update` is
   the answer for a host with neither a shell nor a scheduler, and on such a
   host it was the only route there was. It is not broken there, it is a wait:
   0.3 s for the daily check, 2.3 s for an update that replaces nine files,
   measured against the real release. The installer says the number instead of
   taking the choice away. */
check('the form does not offer "It updates itself"',
    own.form.includes('value="self"') && !own.form.includes('id="u-self" disabled'));
const self = spawnSync('php', [join(webroot, 'install.php'), '--help', '--verbose'],
    { encoding: 'utf8' }).stdout || '';
check('--help says the third answer is not offered',
    !/There is no --updated-by=self/.test(self));

check('no configuration was written', own.config !== null, own.done.slice(0, 400));
if (own.config) {
    const parses = spawnSync('php', ['-l', own.configPath], { encoding: 'utf8' });
    check('the configuration it wrote does not parse', parses.status === 0, parses.stdout);

    for (const [what, wanted] of [
        /* The word that used to say both is gone; the two things it decided
           are written as themselves. An older configuration still carrying it
           is read as before -- there are two such fixtures below. */
        ['plain mode allowed', "'allow_plain_mode' => true"],
        ['no Origin required', "'require_origin_on_writes' => false"],
        ['storage', "'storage'  => 'sqlite'"],
        ['retention', "'max_note_age_days'     => 90"],
        ['server totals, off', "'publish_server_totals' => false"],
        ['an empty projects array', "'projects' => array()"],
        /* TURNED OFF, NOT LEFT TO BE MET. On a server carrying one site's own
           notes there is nobody to defend against: everybody who can write is
           already behind the same door as the site. A limit that can only ever
           refuse honest work is friction wearing a security shape. */
        ['the project write limit switched off', "'rate_writes_per_project' => 0"],
        ['the export limit switched off', "'rate_exports_per_ip' => 0"],
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

/* WHAT THE LAST SCREEN HANDS OVER. ONE daily line, with the real path of this
   installation in it -- the update, which maintains after it updates. It
   handed over two, update and sweep, and a reader asked why a server needs two
   jobs; a second line on this screen now would be that question coming back.
   An example is a thing to adapt, and the adaptation is where it goes wrong on
   a host whose operator has a control panel and no shell. */
check('the last screen hands over a second cron line for the sweep',
    !own.done.includes('internal/maintenance.php'));
check('the last screen does not hand over the update line',
    own.done.includes('internal/update.php'));
check('the last screen does not say the update line also sweeps',
    own.done.includes('--only-maintenance'));
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

/* ONE SCRIPT, AND THE POLICY ADMITS THAT SCRIPT AND NOTHING ELSE. The page
   had no script for thirty releases; it has the copy button now, and what
   keeps an installer from running somebody else's code is that the header
   names the one it runs by its bytes. So: exactly one <script>, exactly one
   script source in the policy, that source is the sha256 of those bytes as
   the browser computes it, and nothing like 'unsafe-inline' next to it. */
{
    const head = await fetch('http://127.0.0.1:' + own.port + '/install.php');
    const policy = head.headers.get('content-security-policy') || '';
    /* THE BODY IS READ, EVEN THOUGH ONLY THE HEADER IS WANTED. Left unread, the
       response holds the socket open with its parser paused, the test server
       is killed a few lines down, and the Node on GitHub's runners dies inside
       fetch with `assert(!this.paused)` -- the whole suite red, the publish
       workflow with it, while the newer Node on a workstation shrugged. */
    await answered(head);
    const scripts = [...own.form.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const sources = ((policy.match(/script-src ([^;]*)/) || [])[1] || '').trim().split(/\s+/);
    const digest = scripts.length === 1
        ? "'sha256-" + createHash('sha256').update(scripts[0], 'utf8').digest('base64') + "'"
        : '(not one script)';
    check(`the page runs ${scripts.length} inline scripts, and it runs exactly one`,
        scripts.length === 1);
    check('the policy admits something other than the one script it runs, by its hash',
        sources.length === 1 && sources[0] === digest, policy + '\n    page script: ' + digest);
    check('the policy lets inline scripts or evaluated code run',
        !/unsafe-inline'[^;]*;|unsafe-eval/.test(policy.replace(/style-src[^;]*;/, '')), policy);
    check('the policy stopped refusing everything else by default',
        policy.startsWith("default-src 'none';"), policy);
    /* AND IT READS THE TEXT BEFORE IT PUTS THE BUTTON IN. The button is a
       child of the block, so a textContent taken at click time ended in the
       word "Copy" -- measured on the screen after the install, where the first
       block copied `data-server="..."Copy`. No browser runs in this suite, so
       the order is held on the source: the read comes before the append. */
    const script = scripts[0] || '';
    check('the copy button reads its text after it has put itself inside the block',
        script.indexOf('pre.textContent') !== -1
        && script.indexOf('pre.textContent') < script.indexOf('pre.appendChild(button)'));
    /* And what the crontab block copies is the line, not the comment header
       drawn over it -- a header pasted twice into a crontab is harmless and
       looks like a mistake. */
    const cron = own.form.match(/<pre data-copy="([^"]*)"><code># m h dom mon dow/);
    check('the crontab block copies something other than the line alone',
        cron && /^\d+ \d+ \* \* \* php \/.*\/internal\/update\.php$/.test(cron[1]),
        cron ? cron[1] : '(no data-copy on the crontab block)');
}

stop(own);

/* -- A relay, for anybody ------------------------------------------------ */

const relay = await rehearse(await freePort(), 'storage=sqlite&audience=anyone&updates=cron');
check('the relay run never came up', relay.up);
if (relay.config) {
    /* And on a relay they stay ON: there, an export is bandwidth a stranger can
       ask for, and a project id is public. Written nowhere means the default
       is in force, which is what "on" looks like in this file. */
    check('a relay had its export limit switched off',
        !relay.config.includes("'rate_exports_per_ip' => 0"));
    for (const [what, wanted] of [
        ['plain mode refused', "'allow_plain_mode' => false"],
        ['Origin required', "'require_origin_on_writes' => true"],
        ['open registration', "'open_registration' => true"],
        /* Counted in ROWS: a discussed thread is three, so a real project of
           122 remarks already holds about 370, and a simulated team of six
           over three months writes 3600. 500, then 2000, both stopped a
           working team mid-campaign -- and past the cap nobody can reply. */
        ['a cap per project', "'max_notes_per_project' => 6000"],
        /* And on a relay they stay ON: there, an export is bandwidth a
           stranger can ask for, and a project id is public. */

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
        typo.config.includes("'allow_plain_mode' => true")
        && !typo.config.includes("'open_registration' => true"));
} else {
    check('the mistyped run wrote no configuration', false, typo.done.slice(0, 300));
}
stop(typo);

/* -- AN ADDRESS THE OPERATOR TYPED IS PROVEN, NOT BELIEVED ---------------
   The field is pre-filled and normally left alone -- the request that opened
   the page IS the proof that this directory answers there. Typed differently,
   it is proven the way the command line proves it: a file with a random name
   written HERE and asked for THERE. What it stops is not a typo, it is a
   measurement about somebody else's directory -- including the one that
   claims the database cannot be downloaded. So a bad address must install
   NOTHING, and say which address it asked for. */

const elsewhere = await freePort();
const wrong = await rehearse(elsewhere,
    'storage=sqlite&audience=mine&updates=cron'
    + '&api_address=' + encodeURIComponent('http://127.0.0.1:' + elsewhere + '/nowhere/api.php'));
check('the run with a foreign address never came up', wrong.up);
check('an address that does not lead to this directory installed something',
    wrong.config === null, (wrong.config || '').slice(0, 200));
check('it does not say that nothing was installed',
    wrong.done.includes('does not lead to this directory'), wrong.done.slice(0, 400));
check('it does not name the address it asked for',
    wrong.done.includes('/nowhere/ap-check-'), wrong.done.slice(0, 400));
stop(wrong);

/* And an address that is not one at all is refused before anything is fetched:
   there is nothing to probe, and "http://" is not a shape to guess at. */
const malformed = await rehearse(await freePort(),
    'storage=sqlite&audience=mine&updates=cron&api_address=' + encodeURIComponent('pas une url'));
check('a malformed address installed something', malformed.config === null);
check('a malformed address was not refused with the shape it wants',
    malformed.done.includes('full URL beginning with http'), malformed.done.slice(0, 300));
/* THE SAME TWO REGISTERS ON BOTH FACES, FROM THE SAME TABLE. Short is what
   each shows first; the long sentence is a checkbox away here and a flag away
   there. What this refuses is the state the tool was in twice -- one face
   carrying a paragraph the other cannot show, or a short line that exists
   nowhere else. */
/* THE TWO READINGS ARE BOTH IN THE PAGE, AND A CHECKBOX SHOWS ONE. It used to
   be ?long=1: two variants of one address, so switching reloaded and cost the
   reader their typed values, their scroll and their place -- and the file
   could not be looked at on its own, which is what a page saved to disk has to
   be. Both sentences are in the markup now and the CSS picks. What this
   refuses is the page losing either of them, or the control that swaps them. */
check('the page carries no control for the long sentences',
    malformed.form.includes('id="ap-explain"'));
/* AND IT IS AT THE TOP, WITH THE TITLE, AS A PAIR OF CHIPS. It is not a
   setting -- nothing of it is posted or written -- so it belongs above
   everything the form asks, and two chips say which reading you are in where a
   checkbox left that to be inferred from its own label. */
check('the reading is chosen by something other than a pair of chips',
    /id="ap-simple"/.test(malformed.form) && /name="ap-view"/.test(malformed.form));

/* EVERY FIELD SAYS WHAT AN EMPTY FIELD IS WORTH. Four of them did -- the ones
   this installation decides itself -- and the other eleven left it to a grey
   placeholder, or, in a select, to `(leave it as it is)`, which names the
   gesture and not the state: a reader looking at `Answer over plain http` with
   an untouched select beside it had no way to know whether that was on. */
const settingKeys = askPhp('foreach (ap_i_settings() as $s) { echo $s["key"], "\n"; }')
    .split('\n').filter(Boolean);
const emptySays = (malformed.form.match(/Empty: /g) || []).length
    + (malformed.form.match(/>Default: /g) || []).length;
check(`${emptySays} fields say what an empty field is worth, and there are`
    + ` ${settingKeys.length + 4} sentences to write (four of them say it twice,`
    + ' once per audience)', emptySays >= settingKeys.length);
check('a select still names the gesture instead of the state',
    !malformed.form.includes('(leave it as it is)'));
/* AND IT CALLS IT WHAT EVERY OTHER FORM CALLS IT. `Leave it: false` names the
   state, which was the fix for `(leave it as it is)`, and still asks the
   reader to work out that leaving it is what happens by default. */
check('the untouched option does not say `Default:`',
    malformed.form.includes('>Default: ') && !malformed.form.includes('>Leave it: '));

/* THE PARAGRAPH IS REACHABLE WITHOUT LEAVING THE SHORT READING. A reader
   stopped on one box should not have to switch the whole page to verbose to
   find out what that box does. The mark carries `--help --verbose`'s own
   sentence in `title`, so there is one string and not a second copy. */
const marks = (malformed.form.match(/class="q" title="/g) || []).length;
const withSay = askPhp('$n = 0; foreach (ap_i_settings() as $s) {'
    + ' if ($s["say"] !== "") { $n++; } } echo $n;');
check(`${marks} settings offer their paragraph on hover, and ${withSay} have one`,
    marks >= Number(withSay), String(marks));

/* `thread` IS THIS CODEBASE'S WORD, NOT THE READER'S. store.php, FORMAT.md and
   the export all say it; the client's own labels say note and reply, and so
   does the site. It had reached the one screen written for somebody who has
   read none of those. */
check('the install screen calls a note a thread',
    !/\bthreads?\b/i.test(shown.replace(/<[^>]+>/g, ' ')),
    (shown.replace(/<[^>]+>/g, ' ').match(/[^.]*\bthreads?\b[^.]*/i) || [''])[0].trim());

/* THE LIST OF SITES IS ASKED FOR, NOT DISCOVERED. The left-hand answer is
   `the ones I list`, and for four releases there was nowhere to write the
   list: it lived in a commented block at the bottom of the generated file,
   which people found the day their first note was refused. */
check('the form does not ask for the sites the notes will be written from',
    malformed.form.includes('name="origins"'));
check('--origins is not an option of the other face',
    options.includes('origins'), options.join(' '));

/* THE THREE STEPS SAY WHAT THEY COST. Three words in small type is a
   breadcrumb: it gives the order and nothing about the size of any of it. */
const railSays = (malformed.form.match(/class="rail-s"/g) || []).length;
check(`the rail carries ${railSays} subtitles and there are three steps`,
    railSays === 3);

/* AND THE ONE PRESS IS THE END OF THE PAGE. It was a chip-sized control hard
   left under the last card -- the only irreversible thing on the screen, drawn
   smaller than the switch that reveals the settings. */
check('the Install button is not in a band of its own',
    /<div class="go">[\s\S]*?<button type="submit">Install<\/button>/.test(malformed.form));

/* AND THE THINGS A BROWSER MEASURED, HELD BY THE SOURCE THAT PRODUCED THEM.
   A reviewer opened this page at four widths in both themes and measured it;
   what it found is fixed, and these three lines are what stop each one coming
   back through an edit that looks harmless.

   THE CONNECTOR IS THE ONLY GRAPHIC ON THE RAIL THAT MEANS "in this order",
   and it was drawn in --line-soft: 1.26:1 against the page in light, 1.34:1 in
   dark, where WCAG 1.4.11 asks for 3. --control-line is 3.62 and 4.0. */
check('the rail connector is drawn in a hairline nobody can see',
    !/\.rail-link \{[^}]*background: var\(--line-soft\)/.test(malformed.form)
    && malformed.form.includes('height: 1px; background: var(--control-line);'));
/* THE THREE COLUMNS OF THE SETTINGS PANEL ARE DECLARED, NOT DERIVED. `auto` on
   the middle one sized it to the widest control of THAT section, so the column
   of sentences jogged 77.8px sideways halfway down the panel. */
check('the settings grid sizes its middle column to whatever is in it',
    /grid-template-columns: minmax\(9rem, 19rem\) 19rem minmax\(11rem, 1fr\);/
        .test(malformed.form));
/* A TICKED BOX ASSERTS WHAT IT SAYS. Open, it was ticked and read "Hide the
   other 15 settings" -- a checked control naming the opposite of its state. */
check('the switch says the opposite of the state it is in',
    !/Hide the other \d+ settings/.test(malformed.form));

/* THE PAGE IS AS WIDE AS THE SITE AND THE SENTENCES ARE NOT. One cap for both
   gave the box of dials 704px where how-to-install-it.html draws the same box
   at 1344 -- measured at 1408 -- so the whole screen read as a narrow strip. */
check('the sheet caps the page at the reading measure instead of the site width',
    malformed.form.includes('max-width: calc(85rem + 4rem);')
    && malformed.form.includes('body > *, form > * { max-width: var(--measure); }'));
/* AND THE SWITCH SAYS HOW MANY IT HIDES: it said fifteen while hiding thirteen
   for one release, because two sections had been lifted out of it and the
   count still came from the whole table. */
const hidden = (malformed.form.match(/Set the other (\d+) settings myself/) || [])[1];
check(`the switch offers ${hidden} settings and the table has ${settingKeys.length}`,
    Number(hidden) === settingKeys.length);

/* AND THE PAGE SAYS WHAT IT IS AT A GLANCE. It was headed `annotepage`, which
   names the tool and not what this screen is for -- and titled
   `annotepage -- install`, which is the same thing with punctuation. */
check('the page does not name the act and the tool in its heading',
    /<h1>Install annotepage<\/h1>/.test(malformed.form),
    (malformed.form.match(/<h1>[^<]*<\/h1>/) || ['(none)'])[0]);
check('the browser tab does not say what this page is',
    /<title>Install annotepage<\/title>/.test(malformed.form),
    (malformed.form.match(/<title>[^<]*<\/title>/) || ['(none)'])[0]);
const shortSpans = (malformed.form.match(/<span class="l-short">/g) || []).length;
const longSpans = (malformed.form.match(/<span class="l-long">/g) || []).length;
check(`the page carries ${shortSpans} short sentences and ${longSpans} long ones,`
    + ' and it needs both of each', shortSpans >= 8 && longSpans >= 12);
check('a long sentence is missing from the page, so the switch would show nothing',
    malformed.form.includes('is how an assistant READS'));
/* And it is the RULE that hides the long one, not the rule that shows it: a
   browser without :has() must end up with both sentences, never with none. */
check('the long sentences are shown by a rule rather than hidden by one',
    malformed.form.includes('body:has(#ap-explain:not(:checked)) .l-long { display: none; }'),
    (malformed.form.match(/[^\n]*l-long[^\n]*display[^\n]*/g) || ['(no rule)']).join(' | '));

const short = spawnSync('php', [join(webroot, 'install.php'), '--help'],
    { encoding: 'utf8' }).stdout || '';
const verbose = spawnSync('php', [join(webroot, 'install.php'), '--help', '--verbose'],
    { encoding: 'utf8' }).stdout || '';
check('--help is not the short list any more',
    words(short) < 900, words(short) + ' words');
check('--help --verbose says no more than --help',
    words(verbose) > words(short) + 800,
    words(short) + ' words short, ' + words(verbose) + ' verbose');
check('--help does not point at --verbose', short.includes('--help --verbose'));
/* An option that is ignored installs the default and reads as a success --
   the rule this installer applies to every other option applies to this one. */
const alone = spawnSync('php', [join(webroot, 'install.php'), '--verbose'],
    { encoding: 'utf8' });
check('--verbose alone was accepted rather than refused', alone.status === 2,
    'exit ' + alone.status);
/* Entities belong to the form. A hint written with an apostrophe reached the
   terminal as `&rsquo;` on the day this was added. */
check('the shell help still carries HTML entities', !/&[a-z]+;/.test(short + verbose),
    ((short + verbose).match(/&[a-z]+;/g) || []).slice(0, 3).join(' '));

stop(malformed);

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
        try { await answered(await fetch('http://127.0.0.1:' + port + '/install.php', { redirect: 'manual' })); break; }
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

    /* WHAT WAS TYPED COMES BACK AS TYPED. The messages go through the same
       tag stripper as the browser's, and a path in angle brackets -- the
       shape of a placeholder somebody forgot to replace -- was removed from
       the one sentence that named it: "Could not read ." */
    const bracketed = await shell(dir, [address, '--answers-for=one-site', '--storage=mysql',
        '--mysql-name=n', '--mysql-user=u', '--mysql-password-file=<the password file>']);
    check('a refused value in angle brackets vanished from its own error',
        bracketed.code === 2 && /Could not read <the password file>\./.test(bracketed.err),
        'exit ' + bracketed.code + '\n' + bracketed.err.slice(0, 300));

    const noAddress = await shell(dir, ['--answers-for=one-site']);
    check('it installed without being told the address',
        noAddress.code === 2 && /api-address is required/.test(noAddress.err),
        'exit ' + noAddress.code);

    check('nothing above was supposed to write a configuration',
        !existsSync(join(root, 'internal', 'config-local.php')));

    /* AND THE THIRD UPDATE ANSWER IS ACCEPTED HERE TOO. The shell used to
       refuse it -- "not offered here", because whether it costs a visitor
       anything depends on the interface the WEB server runs and a command line
       cannot see that. But it is the answer for a host with neither a shell nor
       a scheduler, and refusing it left that host with no update route at all.
       Whoever types the command is the person who knows what that host is; the
       cost is measured and said, in --help and on the form. */
    const self = await shell(dir, [address, '--answers-for=one-site',
                                   '--storage=sqlite', '--updated-by=self']);
    const selfConfig = existsSync(join(root, 'internal', 'config-local.php'))
        ? readFileSync(join(root, 'internal', 'config-local.php'), 'utf8') : '';
    check('the shell refused "it updates itself"', self.code === 0,
        'exit ' + self.code + '\n' + (self.err || '').slice(0, 200));
    check('it installed without turning the key on',
        selfConfig.includes("'auto_update' => true"),
        (selfConfig.match(/[^\n]*auto_update[^\n]*/) || ['(absent)'])[0]);
    /* Taken back so the run below meets the empty directory it expects: this
       fixture is shared, and an installer that finds a configuration refuses
       to do anything at all -- which is the behaviour two checks down. */
    rmSync(join(root, 'internal', 'config-local.php'), { force: true });
    for (const leftover of readdirSync(dir)) {
        if (leftover.startsWith('annotepage-data')) {
            rmSync(join(dir, leftover), { recursive: true, force: true });
        }
    }

    const done = await shell(dir, [address, '--answers-for=one-site', '--storage=sqlite']);
    check('a correct command line did not install', done.code === 0
        && existsSync(join(root, 'internal', 'config-local.php')),
        'exit ' + done.code + '\n' + done.err.slice(0, 300));
    if (existsSync(join(root, 'internal', 'config-local.php'))) {
        const written = readFileSync(join(root, 'internal', 'config-local.php'), 'utf8');
        check('the command line wrote a different configuration from the form',
            written.includes("'allow_plain_mode' => true")
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
        try { await answered(await fetch('http://127.0.0.1:' + port + '/install.php', { redirect: 'manual' })); break; }
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
        try { await answered(await fetch('http://127.0.0.1:' + port + '/install.php', { redirect: 'manual' })); break; }
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
            try { await answered(await fetch('http://127.0.0.1:' + port2 + '/install.php', { redirect: 'manual' })); break; }
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

/* -- ONE DAILY LINE, AND THE OLD SECOND ONE STILL WORKS -------------------
   update.php maintains after it updates, and each half runs alone on request.
   maintenance.php stays runnable on its own because every server installed
   before carries it in a crontab. Checked with no network: --only-maintenance
   fetches nothing, and a refused command line fetches nothing either. */
{
    const dir = mkdtempSync(join(tmpdir(), 'annotepage-daily-'));
    const root = join(dir, 'web');
    cpSync(webroot, root, { recursive: true });
    writeFileSync(join(root, 'internal', 'config-local.php'),
        "<?php\nreturn array('active' => true, 'allow_plain_mode' => true,"
        + " 'require_origin_on_writes' => false, 'storage' => 'sqlite',"
        + " 'database' => array('file' => " + JSON.stringify(join(dir, 'notes.sqlite')) + "),"
        + " 'projects' => array(), 'max_note_age_days' => 90);\n");
    const run = (script, args) => spawnSync('php', [join(root, 'internal', script), ...args],
        { encoding: 'utf8' });
    for (const [script, args] of [['update.php', ['--only-maintenance']], ['maintenance.php', []]]) {
        const r = run(script, args);
        check(`${script} ${args.join(' ')} does not maintain`,
            r.status === 0 && /^Swept: 0 rows/m.test(r.stdout || ''),
            'exit ' + r.status + ' ' + JSON.stringify((r.stdout || '') + (r.stderr || '')).slice(0, 200));
        check(`${script} ${args.join(' ')} fetched something`,
            !/published version|source:/.test(r.stdout || ''), (r.stdout || '').slice(0, 200));
    }
    for (const args of [['--bogus'], ['--only-update', '--only-maintenance']]) {
        const r = run('update.php', args);
        check(`update.php ${args.join(' ')} is not refused with exit 2`, r.status === 2,
            'exit ' + r.status);
        check(`update.php ${args.join(' ')} did something anyway`,
            (r.stdout || '') === '' && /Nothing was done/.test(r.stderr || ''),
            JSON.stringify((r.stdout || '') + (r.stderr || '')).slice(0, 200));
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
console.log('install: seven installations run end to end, the three refusals a shell owes, '
    + "a neighbour's database left alone by a failed run, a store older than the server "
    + 'around it, and two configurations from older installers');
