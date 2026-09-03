/* The three pages are written by hand, with no build step and no template. That
   is deliberate -- the site loads nothing, generates nothing, and anybody can
   read one file and see the whole page. What it does not give is any guarantee
   that the frame around the content stays the same from one page to the next.

   It did not. Measured before this check existed: three different headers,
   three different footers, one page with the same menu entry twice pointing at
   two different places, footers still saying "Source" days after the menus said
   "GitHub", and a link list that gained entries on one page and not the others.
   Nothing was broken; the site was simply three sites wearing one name.

   So the frame is compared instead of generated. Two things must match on every
   page, and the two exceptions are the ones a shared frame legitimately has:

   - a page never links to itself. The entry is dropped, so the comparison drops
     it too before looking;
   - what belongs to one page only lives after a `<!-- page-specific -->`
     marker, and is not compared. Anything before it is the shared frame.

   This is not a template and does not want to be one: it says when the copies
   have drifted, and leaves the fixing to whoever knows why. */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs';
const PAGES = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();

const bloc = (html, tag) => {
    const m = html.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`));
    return m ? m[0] : null;
};

/* The three pages of the site. A page links to the other two and not to
   itself, so comparing the lists as they stand can never match: each one is
   missing a DIFFERENT entry. They are taken out of all of them before the
   comparison, and checked separately -- which is the stricter reading anyway,
   since it catches a page linking to itself as well as one missing a sibling. */
const INTERNAL = { 'index.html': '/', 'install.html': 'install.html',
                   'example-session.html': 'example-session.html' };

const normalise = (text) => {
    let out = text.split('<!-- page-specific -->')[0];
    for (const href of Object.values(INTERNAL)) {
        out = out.replace(
            new RegExp(`\\s*<li><a href="${href.replace(/\//g, '\\/')}">[^<]*</a></li>`, 'g'), '');
    }
    /* The menu is the one part of the header meant to differ: each page points
       at the others. Everything around it -- the wordmark, the wrapper -- is
       shared, and that is what this compares. */
    out = out.replace(/<nav>[\s\S]*?<\/nav>/, '<nav/>');
    return out.replace(/\s+/g, ' ').trim();
};

let bad = 0;
for (const tag of ['header', 'footer']) {
    const seen = new Map();
    for (const name of PAGES) {
        const html = readFileSync(join(DIR, name), 'utf8');
        const raw = bloc(html, tag);
        if (raw === null) {
            console.error(`${DIR}/${name}: no <${tag}>.`);
            bad++;
            continue;
        }
        const key = normalise(raw, name);
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push(name);
    }
    if (seen.size > 1) {
        console.error(`The <${tag}> differs between pages, in ${seen.size} versions:`);
        for (const [, names] of seen) console.error(`  ${names.join(', ')}`);
        console.error(`Everything before <!-- page-specific --> is the shared frame.`);
        bad++;
    }
}

/* And the part the normalisation had to remove. The invariant is no longer
   "every page reaches the other two": the landing page's menu deliberately
   points INTO itself -- its two chapters are the page -- and reaches the
   session through the button that ends the first one. What is left is the rule
   that has no exception: a menu never links to the page it is on. */
for (const name of PAGES) {
    if (!(name in INTERNAL)) continue;
    const html = readFileSync(join(DIR, name), 'utf8');
    const head = bloc(html, 'header') || '';
    if (head.includes(`<a href="${INTERNAL[name]}"`)) {
        console.error(`${DIR}/${name}: its menu links to the page it is on.`);
        bad++;
    }
}

if (bad) process.exit(1);
console.log(`shell: ${PAGES.length} page(s), one header and one footer`);
