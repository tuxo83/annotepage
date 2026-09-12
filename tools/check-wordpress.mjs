#!/usr/bin/env node
/* check-wordpress.mjs -- THE PLUGIN, RUN, AND THE TWO FILES THAT MUST AGREE.
 *
 * A WordPress plugin fails in a way nothing else in this repository does: it is
 * published to a directory that reads `readme.txt` and installs `annotepage.php`,
 * and NOBODY COMPARES THE TWO. A plugin whose header says 1.2.0 and whose readme
 * says `Stable tag: 1.1.0` publishes 1.1.0 to a million sites while its author
 * reads 1.2.0 in their editor. That is not a hypothetical: it is the single most
 * common way a wordpress.org release goes wrong, and the symptom is silence.
 *
 * So the two files are read as one here.
 *
 * The rest is the claims the plugin makes about itself, checked rather than
 * asserted: that it talks to nothing, that it ships no copy of the client, that
 * the key it derives is the key every other component derives -- and that the
 * whole thing actually RUNS, which is what wordpress/tests/run.php does against
 * a stubbed WordPress.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { keyFromText, derive } from '../mcp/src/crypto.mjs';

const read = (p) => readFileSync(p, 'utf8');
const failures = [];
const check = (what, ok, detail) => {
    if (!ok) failures.push(what + (detail ? '\n      ' + String(detail).replace(/\n/g, '\n      ') : ''));
};

const PLUGIN = 'wordpress/annotepage.php';
const README = 'wordpress/readme.txt';
const ADMIN = 'wordpress/admin.js';

const plugin = read(PLUGIN);
const readme = read(README);
const admin = read(ADMIN);

/* -- 1. The header and the readme are one document ----------------------- */

const header = (field) => {
    const m = plugin.match(new RegExp('^\\s*\\*\\s*' + field + ':\\s*(.+?)\\s*$', 'm'));
    return m ? m[1] : '';
};
const readmeField = (field) => {
    const m = readme.match(new RegExp('^' + field + ':\\s*(.+?)\\s*$', 'mi'));
    return m ? m[1] : '';
};

for (const field of ['Plugin Name', 'Description', 'Version', 'Requires at least',
                     'Requires PHP', 'Author', 'License']) {
    check(`the plugin header declares no "${field}"`, header(field) !== '');
}

const version = header('Version');
check(`the plugin header declares version "${version}", which is not x.y.z`,
    /^\d+\.\d+\.\d+$/.test(version), version);

/* THE ONE THAT SHIPS THE WRONG CODE. wordpress.org installs the version named
   by `Stable tag`, and reads it out of readme.txt alone. */
check(`the plugin header says ${version} and readme.txt says `
    + `Stable tag: ${readmeField('Stable tag')} -- wordpress.org installs the `
    + 'readme\'s number, so the directory would serve a version whose code is not this one',
    readmeField('Stable tag') === version);

for (const field of ['Requires at least', 'Requires PHP']) {
    check(`"${field}" is "${header(field)}" in the plugin and `
        + `"${readmeField(field)}" in readme.txt`,
        header(field) === readmeField(field));
}

/* Announced screenshots that do not exist are a blank frame on the plugin's
   page in the directory. The assets live beside the plugin and are uploaded to
   SVN's assets/ directory, not shipped in the zip. */
const shots = (readme.match(/^==\s*Screenshots\s*==\s*\n([\s\S]*?)(?=^==|\Z)/m) || ['', ''])[1];
const announced = (shots.match(/^\d+\.\s/gm) || []).length;
const assets = existsSync('wordpress/assets') ? readdirSync('wordpress/assets') : [];
for (let i = 1; i <= announced; i += 1) {
    check(`readme.txt announces screenshot ${i} and wordpress/assets/ has no `
        + `screenshot-${i}.png or .jpg -- the directory shows an empty frame`,
        assets.some((f) => new RegExp(`^screenshot-${i}\\.(png|jpg|jpeg|gif)$`).test(f)),
        assets.join(', ') || '(no assets directory)');
}

/* -- 2. It talks to nothing ---------------------------------------------- */

const stripPhpComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#).*$/gm, '');

const NETWORK_PHP = /\b(wp_remote_\w+|curl_init|curl_exec|fsockopen|stream_socket_client|wp_safe_remote_\w+)\b|\b(file_get_contents|fopen)\s*\(\s*['"]https?:/;
check('the plugin makes an HTTP call -- its readme says it does not, and that '
    + 'sentence is the reason somebody installs it on a client site',
    !NETWORK_PHP.test(stripPhpComments(plugin)),
    (stripPhpComments(plugin).match(NETWORK_PHP) || [])[0]);

const NETWORK_JS = /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\s*\(|new\s+Image\s*\(/;
const adminCode = admin
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
check('admin.js transmits something. The key is drawn there precisely because '
    + 'nothing in that file reaches the network',
    !NETWORK_JS.test(adminCode), (adminCode.match(NETWORK_JS) || [])[0]);

/* -- 3. It ships no copy of the client ----------------------------------- */

const shipped = readdirSync('wordpress').filter((f) => !f.startsWith('.'));
check('the plugin directory carries a JavaScript file other than admin.js -- a '
    + 'copy of the client here is a release of this plugin every time the client '
    + 'moves, forever', shipped.filter((f) => f.endsWith('.js')).join(',') === 'admin.js',
    shipped.join(', '));

const src = (plugin.match(/ANNOTEPAGE_CLIENT_SRC',\s*'([^']+)'/) || [])[1] || '';
check('the client address is not a floating major range on the CDN, so a fix '
    + 'would reach these sites only when this plugin is released again',
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/annotepage-client@2\//.test(src), src);

/* THE DEFAULT SERVER IS THE ONE THE SITE DOCUMENTS. The plugin fills it in at
   activation, so a wrong one here is a site quietly writing its notes nowhere. */
const relay = (plugin.match(/ANNOTEPAGE_DEFAULT_SERVER',\s*'([^']+)'/) || [])[1] || '';
check('the default server address is not the relay the site documents',
    readFileSync('docs/how-to-install-it.html', 'utf8').includes(relay)
    && /^https:\/\//.test(relay), relay);

/* -- 4. Nothing from a request is echoed -------------------------------- */

stripPhpComments(plugin).split('\n').forEach((line, i) => {
    if (/\becho\b/.test(line) && /\$_(POST|GET|REQUEST|SERVER|COOKIE)/.test(line)) {
        check(`${PLUGIN}:${i + 1} echoes a superglobal`, false, line.trim());
    }
});

/* -- 5. It runs ---------------------------------------------------------- */

const php = spawnSync('php', ['-v'], { encoding: 'utf8' });
if (php.error || php.status !== 0) {
    console.error('wordpress: no php on this machine, and the plugin is PHP. '
        + 'Install php, or this check proves nothing.');
    process.exit(1);
}

for (const file of [PLUGIN, 'wordpress/tests/run.php']) {
    const lint = spawnSync('php', ['-l', file], { encoding: 'utf8' });
    check(`${file} does not parse`, lint.status === 0, lint.stdout + lint.stderr);
}

const run = spawnSync('php', ['wordpress/tests/run.php'], { encoding: 'utf8' });
check('the plugin harness failed', run.status === 0,
    (run.stdout || '') + (run.stderr || ''));

/* -- 6. The key PHP derives is the key everything else derives ----------- */

/* PHP derives the project id so the settings screen can SHOW it -- which is
   how somebody sharing one key between dev, staging and production sees that
   the three landed on the same project. A drift here would show them an id
   the client never computes, and nothing would raise an error: they would
   simply be looking at the wrong 22 characters while believing the sites
   agree. admin.js is compared with the MCP by check-landing-derivation.mjs;
   this is the same comparison for the PHP.  */
const derived = (run.stdout || '').match(/^DERIVED (\S+) (\S*)$/m);
check('the harness printed no derived id for this check to compare', Boolean(derived),
    (run.stdout || '').slice(-300));
if (derived) {
    const bytes = keyFromText(derived[1]);
    const theirs = (await derive(bytes)).id;
    check(`PHP derives ${derived[2]} where the mcp derives ${theirs} -- the `
        + 'settings screen would name a project the client does not compute',
        derived[2] === theirs);
}

/* -- Verdict ------------------------------------------------------------- */

if (failures.length) {
    console.error('wordpress:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log('wordpress: header and readme.txt agree on version, PHP and WordPress; '
    + 'every announced screenshot exists; the plugin and its admin script reach no '
    + 'network; no client code ships with it and the CDN range still floats; the '
    + 'default relay is the documented one; the plugin runs against a stubbed '
    + 'WordPress and the id its PHP derives is the one the mcp derives');
