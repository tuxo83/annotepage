/* A stray closing brace in a <style> block does not raise anything. The parser
   discards it, and then discards the NEXT rule with it -- silently, with no
   console message and nothing in the markup to look at.

   It happened: an edit removed a media query's opening line and left its
   closing brace behind, `.snip` was the rule that followed, and every code
   block on the landing page lost its frame and its background. The page still
   validated, still scored, still rendered something plausible. It shipped, and
   it was found by eye three commits later.

   So the braces of every style block are counted. This does not lint CSS; it
   catches the one failure mode that deletes a rule you can still read in the
   source. */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs';
let bad = 0, blocks = 0;

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.html'))) {
    const path = join(DIR, name);
    const html = readFileSync(path, 'utf8');
    const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        blocks++;
        /* Comments are blanked rather than removed, so a line number still
           points at the line somebody has to open. */
        const css = m[1].replace(/\/\*[\s\S]*?\*\//g,
            (c) => c.replace(/[^\n]/g, ' '));
        const before = html.slice(0, m.index).split('\n').length;
        let depth = 0, line = before;
        for (const text of css.split('\n')) {
            for (const ch of text) {
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
                if (depth < 0) break;
            }
            if (depth < 0) {
                console.error(`${path}:${line}: a closing brace that closes `
                    + `nothing. The CSS rule after it is discarded by the browser.`);
                bad++;
                break;
            }
            line++;
        }
        if (depth > 0) {
            console.error(`${path}: ${depth} unclosed brace(s) in a <style> block.`);
            bad++;
        }
    }
}

/* AND THE FILE THE PAGES SHARE, counted the same way. It is not a <style>
   block, so the loop above never saw it -- and it is now the biggest
   stylesheet on the site and the only one a stray brace would break on four
   pages at once. */
{
    const css = readFileSync(join(DIR, 'base.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    blocks++;
    let depth = 0, line = 1;
    for (const text of css.split('\n')) {
        for (const ch of text) {
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            if (depth < 0) break;
        }
        if (depth < 0) {
            console.error(`docs/base.css:${line}: a closing brace that closes `
                + `nothing. The CSS rule after it is discarded by the browser.`);
            bad++;
            break;
        }
        line++;
    }
    if (depth > 0) {
        console.error(`docs/base.css: ${depth} unclosed brace(s).`);
        bad++;
    }
}

/* == AND A CUSTOM PROPERTY THAT RESOLVES NOWHERE =========================

   The second silent failure, and the one that put this half here. Rules were
   moved out of a page into base.css so that a second page could use them; the
   three colours they referred to stayed behind on the first page. Nothing
   broke on that page -- it still defined them -- and on the second page the
   band behind a sent line was simply painted with nothing. `var(--x)` where
   --x is defined nowhere is not an error: the declaration is dropped, and the
   property keeps whatever it inherited.

   THE RULE IS NOT "DEFINED IN base.css". Every page paints its own theme, so
   base.css legitimately reads properties no stylesheet of its own sets. What
   it may never do is read one that some page it serves does not define. So a
   property used in base.css has to be defined in base.css, or defined in EVERY
   page that links it -- and the page missing it is named.

   A `var(--x, something)` carries its own answer and is not counted. */

const BASE = join(DIR, 'base.css');
const base = readFileSync(BASE, 'utf8');
const stripped = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

const defined = (css) => {
    const set = new Set();
    const re = /(--[A-Za-z0-9_-]+)\s*:/g;
    let m;
    while ((m = re.exec(stripped(css))) !== null) set.add(m[1]);
    return set;
};

/* Only the pages that actually link it: a page that does not is not evidence
   about anything, and would be a false alarm the day one stops. */
const pages = readdirSync(DIR).filter((f) => f.endsWith('.html'))
    .map((name) => ({ name, html: readFileSync(join(DIR, name), 'utf8') }))
    .filter((p) => /<link[^>]+href="\/?base\.css"/.test(p.html))
    .map((p) => ({ name: p.name, has: defined(p.html) }));

const inBase = defined(base);
const used = new Set();
const useRe = /var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g;
let u;
while ((u = useRe.exec(stripped(base))) !== null) used.add(u[1]);

for (const name of [...used].sort()) {
    if (inBase.has(name)) continue;
    const missing = pages.filter((p) => !p.has.has(name)).map((p) => p.name);
    if (!missing.length) continue;
    console.error(`docs/base.css reads ${name}, and ${missing.join(', ')} `
        + `${missing.length > 1 ? 'do' : 'does'} not define it. `
        + `The declaration is dropped there, in silence.`);
    bad++;
}

if (bad) process.exit(1);
console.log(`css: ${blocks} style block(s), braces balanced; `
    + `${used.size} custom propert${used.size === 1 ? 'y' : 'ies'} read by base.css, `
    + `all of them defined where it is used`);
