/* ============================================================================
   build.mjs -- ASSEMBLES THE SERVED FILE, AND PRINTS ITS DIGEST.

   No dependency: no bundler, no minifier, no plugin. Building consists of
   putting SECTIONS -- not modules -- end to end inside a single anonymous
   function, exactly as the original tool held in one file. They therefore
   share one scope: that is what makes it possible to port the client without
   rewriting it as modules.

   WHY NO MINIFICATION: it would need a dependency, hence one more supply
   chain to watch -- and that is precisely the main risk of this architecture
   (the file goes to a CDN, into somebody else's page). The file stays
   readable, compresses very well in transport, and an SRI digest is checked
   against something one can read.

   The sha384 DIGEST is printed at the end, with the complete tag to paste. It
   is also appended to dist/HASHES.txt, one line per version: that is the file
   published alongside the package.
   ============================================================================ */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

/* The order is the table of contents of the generated file. It is not
   alphabetical by accident: the numbers ARE the order, so that an addition
   cannot slip into the middle without anyone noticing. */
const SECTIONS = [
    '00-preamble.js',
    '10-utils.js',
    '15-labels.js',
    '20-crypto.js',
    '30-state.js',
    '40-api.js',
    '50-anchors.js',
    '60-ui.js',
    '70-setup.js',
    '90-boot.js'
];

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

/* The FORMAT number is the one in FORMAT.md. It does not follow the package
   version and must never follow it: a fix in the client is not a change of
   format, and a change of format cannot be deduced from a package number. */
const FORMAT = 2;

const styles = readFileSync(join(SRC, 'styles.css'), 'utf8');

const indent = (text) => text
    .split('\n')
    .map((l) => (l.trim() === '' ? '' : '    ' + l))
    .join('\n');

const header = [
    '/* ============================================================================',
    '   annotepage -- the annotation layer, browser side.',
    '',
    '   Package version : ' + VERSION,
    '   Format version  : ' + FORMAT + '   (see FORMAT.md)',
    '   Licence : ' + pkg.license,
    '',
    '   GENERATED FILE -- do not edit it by hand. The sources are in src/, and',
    '   "npm run build" remakes this file. A fix made here would be lost at the',
    '   next build, and the published SRI digest would no longer match anything.',
    '   ============================================================================ */',
    ''
].join('\n');

const body = SECTIONS
    .map((name) => {
        const raw = readFileSync(join(SRC, name), 'utf8').replace(/\s*$/, '');
        return indent('/* ==== ' + name + ' ==== */\n\n' + raw);
    })
    .join('\n\n');

const file = [
    header,
    '(function () {',
    '    \'use strict\';',
    '',
    '    /* Injected by the build: they come from package.json and from',
    '       src/styles.css, so that no value is written in two places and can',
    '       therefore diverge. */',
    '    const TOOL_VERSION = ' + JSON.stringify(VERSION) + ';',
    '    const FORMAT = ' + FORMAT + ';',
    '    const STYLES = ' + JSON.stringify(styles) + ';',
    '',
    body,
    '}());',
    ''
].join('\n');

if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

const target = join(DIST, 'annotepage.js');
writeFileSync(target, file, 'utf8');

/* The digest is computed on the BYTES WRITTEN, never on the string in
   memory: it is the served file that the browser will check, and only it. */
const bytes = readFileSync(target);
const digest = 'sha384-' + createHash('sha384').update(bytes).digest('base64');

const tag = [
    '<script src="https://<your-cdn>/annotepage-client@' + VERSION + '/dist/annotepage.js"',
    '        integrity="' + digest + '"',
    '        crossorigin="anonymous"',
    '        data-server="https://<your-server>/annotepage/api.php"',
    '        data-project="<22 characters>"',
    '        defer></' + 'script>'
].join('\n');

const log = join(DIST, 'HASHES.txt');
const previous = existsSync(log) ? readFileSync(log, 'utf8').split('\n') : [];
const kept = previous.filter((l) => l.trim() !== '' && l.indexOf(VERSION + '  ') !== 0);
writeFileSync(log,
    [VERSION + '  ' + digest + '  ' + bytes.length + ' bytes'].concat(kept).join('\n') + '\n',
    'utf8');

process.stdout.write(
    'annotepage-client ' + VERSION + ' -- format ' + FORMAT + '\n'
    + '  ' + target + '\n'
    + '  ' + bytes.length + ' bytes\n'
    + '  ' + digest + '\n\n'
    + tag + '\n'
);
