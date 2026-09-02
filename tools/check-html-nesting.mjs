/* One `</div>` too many does not break a page. The browser closes what it can,
   swallows what it cannot, and renders something plausible.

   It happened, and it shipped: an extra closing tag in the install chapter put
   the THIRD step inside the second one. The section still rendered, the copy
   buttons still worked, the styles still applied, and the step describing how
   to connect the assistant was simply not in the document. Every check passed.
   It was found by a person looking at the page and saying "that one has no
   picture".

   So the containers are counted. This is not an HTML validator: it walks the
   elements that must be closed by hand and reports the first close that
   matches nothing, with the line to open.

   It assumes explicit closing tags, which is what this repository writes
   everywhere. A page using HTML's optional closes (a bare <li> ended by the
   next <li>) would be reported here, and the answer is to close it, not to
   loosen this. */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs';
const TRACKED = new Set(['div', 'section', 'main', 'header', 'footer', 'aside',
    'nav', 'ol', 'ul', 'li', 'button', 'pre', 'figure', 'table', 'thead',
    'tbody', 'tr', 'form', 'label']);

let bad = 0, files = 0;

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.html'))) {
    const path = join(DIR, name);
    let html = readFileSync(path, 'utf8');

    /* Comments, scripts and styles are blanked rather than cut, so the line
       numbers still point at the file somebody has to open. */
    const blank = (text) => text.replace(/[^\n]/g, ' ');
    html = html.replace(/<!--[\s\S]*?-->/g, blank)
               .replace(/<script\b[\s\S]*?<\/script>/gi, blank)
               .replace(/<style\b[\s\S]*?<\/style>/gi, blank);

    files++;
    const stack = [];
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
    let m, problems = 0;
    while ((m = re.exec(html)) !== null && problems < 3) {
        const tag = m[2].toLowerCase();
        if (!TRACKED.has(tag)) continue;
        if (m[3].trimEnd().endsWith('/')) continue;    // <div/>, not used here
        const line = html.slice(0, m.index).split('\n').length;

        if (!m[1]) { stack.push({ tag, line }); continue; }

        if (!stack.length) {
            console.error(`${path}:${line}: </${tag}> closes nothing.`);
            problems++; bad++; continue;
        }
        const open = stack.pop();
        if (open.tag !== tag) {
            console.error(`${path}:${line}: </${tag}> found, but the element `
                + `still open is <${open.tag}> from line ${open.line}.`);
            problems++; bad++;
        }
    }
    for (const left of stack) {
        console.error(`${path}:${left.line}: <${left.tag}> is never closed.`);
        bad++;
        break;
    }
}

if (bad) process.exit(1);
console.log(`html: ${files} page(s), containers balanced`);
