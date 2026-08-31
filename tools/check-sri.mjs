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

let wrong = 0, found = 0;
for (const file of files) {
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

if (wrong) {
    console.error(`\nexpected ${expected}`);
    console.error(`${wrong} of ${found} digests do not match ${BUNDLE}.`);
    console.error('Rebuild the client, then copy the digest it prints.');
    process.exit(1);
}
console.log(`sri: ${found} digest(s), all matching ${BUNDLE}`);
