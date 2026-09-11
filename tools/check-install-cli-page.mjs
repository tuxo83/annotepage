#!/usr/bin/env node
/* check-install-cli-page.mjs — THE COMMAND THE PAGE WRITES IS ONE THE
 * INSTALLER TAKES.
 *
 * how-to-install-it.html builds, from its dials, the one shell command that
 * installs a server: `php annotepage-install.php --api-address=... --answers-for=...`.
 * A copy of an option list drifts at the first option renamed, and a command
 * that the installer refuses with exit 2 is a command handed to somebody
 * standing on a server. So the options and the values the page writes -- in
 * the example block AND in the script that rewrites it -- are read out of the
 * page and held against ap_i_cli_options(), which is what the installer
 * parses its own command line with.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const flow = join(here, '..', 'server', 'webroot', 'internal', 'install-flow.php');
const page = readFileSync(join(here, '..', 'docs', 'how-to-install-it.html'), 'utf8');

const dump = spawnSync('php', ['-r', 'define("AP_INTERNAL", 1); require '
    + JSON.stringify(flow) + '; echo json_encode(ap_i_cli_options());'], { encoding: 'utf8' });
if (dump.error) {
    console.log('install cli page: no php on this machine, nothing was checked');
    process.exit(0);
}
const options = JSON.parse(dump.stdout);
const failures = [];

/* The example block, as a reader without JavaScript copies it. */
const block = (page.match(/<code id="install-code">([\s\S]*?)<\/code>/) || [])[1];
if (!block) {
    console.error('install cli page: the command block #install-code is gone from the page');
    process.exit(1);
}
const text = block.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const given = [...text.matchAll(/--([a-z-]+)(?:=(\S+))?/g)].map((m) => [m[1], m[2]]);
for (const [name, value] of given) {
    const o = options[name];
    if (!o) { failures.push(`the example passes --${name}, which the installer does not take`); continue; }
    if (o.kind === 'choice' && !o.values.includes(value)) {
        failures.push(`the example passes --${name}=${value}; the installer takes ${o.values.join(', ')}`);
    }
}
for (const needed of ['api-address', 'answers-for']) {
    if (!given.some(([n]) => n === needed)) {
        failures.push(`the example omits --${needed}, which the installer requires`);
    }
}

/* And the script that rewrites it: every opt('<name>', ...) it calls, and the
   literal values it can choose between for the two dials. */
const script = page.slice(page.indexOf('var installCode'));
for (const m of script.matchAll(/opt\('([a-z-]+)'/g)) {
    if (!options[m[1]]) failures.push(`the script writes --${m[1]}, which the installer does not take`);
}
const pick = (re) => ((script.match(re) || [])[1] || '').match(/'([a-z-]+)'/g) || [];
for (const v of pick(/var aud = ([^;]+);/).map((s) => s.slice(1, -1))) {
    if (!options['answers-for'].values.includes(v)) failures.push(`the script writes --answers-for=${v}`);
}
for (const v of pick(/var upd = ([^;]+);/).map((s) => s.slice(1, -1))) {
    if (!options['updated-by'].values.includes(v)) failures.push(`the script writes --updated-by=${v}`);
}
/* The Storage dial joined the page, so its values are held the same way -- and
   an empty pick is a failure, not a pass: a renamed variable would otherwise
   check nothing and say nothing. */
const stored = pick(/var sto = ([^;]+);/).map((s) => s.slice(1, -1));
if (!stored.length) failures.push('the script no longer chooses --storage from a `var sto`');
for (const v of stored) {
    if (!options.storage.values.includes(v)) failures.push(`the script writes --storage=${v}`);
}

if (failures.length) {
    console.error('install cli page:\n  ' + failures.join('\n  '));
    process.exit(1);
}
console.log(`install cli page: ${given.length} options in the example and every one the script `
    + 'writes are options the installer takes, with values it accepts');
