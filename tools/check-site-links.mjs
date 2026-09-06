/* THE MARKDOWN FILES DELEGATE TO THE SITE, SO THE DELEGATION IS CHECKED.
 *
 * Every markdown file in this repository now opens by saying the documentation
 * is annotepage.com, and several of them replace a paragraph with a link to a
 * page or to one card of the questions page. That is the right trade -- one
 * copy of a fact instead of three, which had already drifted into three
 * wordings of the key warning -- and it buys a new way to fail: a link that
 * points at a page that was renamed, or at an anchor that was.
 *
 * A dead link in a README is worse than the paragraph it replaced. The
 * paragraph was merely stale; the link sends somebody to the top of a page and
 * lets them believe they read the answer.
 *
 * So: every https://annotepage.com/... link written in a tracked markdown file
 * has to resolve against docs/, which is the site. The page has to be a file,
 * and its `#anchor` has to be an id in that file. Nothing else is checked --
 * this is not a link checker, it is the guard on ONE decision.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SITE = 'https://annotepage.com/';
const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);

let bad = 0, checked = 0;

for (const path of files) {
    const text = readFileSync(path, 'utf8');
    const re = /https:\/\/annotepage\.com\/([A-Za-z0-9._/-]*)(#[A-Za-z0-9_-]+)?/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const page = m[1] === '' ? 'index.html' : m[1];
        const anchor = m[2] ? m[2].slice(1) : null;
        checked += 1;

        const onDisk = join('docs', page);
        if (!existsSync(onDisk)) {
            console.error(`${path}: links to ${SITE}${page}, and docs/${page} `
                + `does not exist.`);
            bad += 1;
            continue;
        }
        if (!anchor) continue;

        const html = readFileSync(onDisk, 'utf8');
        /* `id="x"` anywhere in the page. Not a parser: an id is written one way
           in this site, and a check that needed a parser to find one would be
           checking the parser. */
        if (html.indexOf(`id="${anchor}"`) === -1) {
            console.error(`${path}: links to ${SITE}${page}#${anchor}, and `
                + `docs/${page} carries no id="${anchor}".`);
            console.error('    A link to a missing anchor lands at the top of the '
                + 'page, and the reader believes they read the answer.');
            bad += 1;
        }
    }
}

if (bad) process.exit(1);
console.log(`site links: ${checked} from markdown into docs/, every page and `
    + `every anchor found`);
