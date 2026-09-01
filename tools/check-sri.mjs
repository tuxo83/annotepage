/* Every SRI digest written anywhere must match the file that is actually
   shipped.

   This is the cheapest catastrophe in the project. The digest appears in the
   README that people copy from, and in the website. If it does not match the
   published bundle, the browser refuses the script -- for every visitor, with
   no message on the page and nothing in the server logs. The tool simply does
   not appear, and the site owner has no way to guess why.

   It goes stale on its own: any edit to a source file changes the bundle, and
   the digest written in prose does not follow. */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const BUNDLE = 'client/dist/annotepage.js';

if (!existsSync(BUNDLE)) {
    console.error(`missing ${BUNDLE} -- run "npm run build" in client/ first`);
    process.exit(1);
}

const expected = 'sha384-' + createHash('sha384')
    .update(readFileSync(BUNDLE)).digest('base64');

/* Files are listed by git rather than walked, so an ignored build artefact or
   a stray copy never enters the comparison. --others is not optional: without
   it a file that is written but not yet committed is skipped, which is exactly
   the file most likely to carry a digest someone just pasted by hand. */
const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
    .split('\n').filter(Boolean);

/* client/dist/HASHES.txt is a HISTORY -- one line per version, older ones kept
   on purpose so a digest found in an old page can still be identified. Only its
   first line describes the bundle that exists now. Sweeping the whole file would
   flag every past release and block every future one. */
const HISTORY = 'client/dist/HASHES.txt';
if (existsSync(HISTORY)) {
    const written = (readFileSync(HISTORY, 'utf8').split('\n')[0] || '')
        .match(/sha384-[A-Za-z0-9+/=]+/)?.[0];
    if (written !== expected) {
        console.error(`${HISTORY}:1  says ${String(written).slice(0, 24)}...`);
        console.error('Its first line must describe the bundle as it is now. Rebuild.');
        process.exit(1);
    }
}

let wrong = 0, found = 0;
for (const file of files) {
    if (file === HISTORY) continue;
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/sha384-[A-Za-z0-9+/=]+/g)) {
        found++;
        if (m[0] !== expected) {
            const line = text.slice(0, m.index).split('\n').length;
            console.error(`${file}:${line}  stale digest ${m[0].slice(0, 24)}...`);
            wrong++;
        }
    }
}

/* The site serves the client itself, from docs/, under a versioned filename.
   That copy is what visitors actually load -- so if it drifts from the built
   bundle, every digest in the repository still agrees with the bundle and
   disagrees with the file being served. The page would look right and the
   script would be refused by every browser. Compare the bytes, not the name. */
const served = files.filter(f => /^docs\/annotepage-client-[\d.]+\.js$/.test(f));
for (const copy of served) {
    /* Tracked but gone from disk: exactly what a release looks like halfway
       through, once the previous version's file is removed and before the commit.
       Not an error -- it is simply not being served any more. */
    if (!existsSync(copy)) continue;
    if (!readFileSync(copy).equals(readFileSync(BUNDLE))) {
        console.error(`${copy} differs from ${BUNDLE}.`);
        console.error('It is the file the site actually serves. Copy the built bundle over it.');
        wrong++;
    }
}
const declared = JSON.parse(readFileSync('client/package.json', 'utf8')).version;
const wanted = `docs/annotepage-client-${declared}.js`;
if (!existsSync(wanted)) {
    console.error(`${wanted} is missing -- the site links to the DECLARED version.`);
    console.error('A release that bumped package.json and forgot the served copy');
    console.error('would otherwise pass this check.');
    wrong++;
} else if (!readFileSync(wanted).equals(readFileSync(BUNDLE))) {
    console.error(`${wanted} differs from ${BUNDLE}.`);
    wrong++;
}

if (!served.filter(existsSync).length) {
    console.error(`no docs/annotepage-client-<version>.js found -- the site links to one.`);
    wrong++;
}

if (wrong) {
    console.error(`\nexpected ${expected}`);
    console.error(`${wrong} of ${found} digests do not match ${BUNDLE}.`);
    console.error('Rebuild the client, then copy the digest it prints.');
    process.exit(1);
}
console.log(`sri: ${found} digest(s) and ${served.filter(existsSync).length} served copy, all matching ${BUNDLE}`);
