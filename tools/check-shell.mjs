/* The three pages are written by hand, with no build step and no template. That
   is deliberate -- the site loads nothing, generates nothing, and anybody can
   read one file and see the whole page. What it does not give is any guarantee
   that the frame around the content stays the same from one page to the next.

   It did not. Measured before this check existed: three different headers,
   three different footers, one page with the same menu entry twice pointing at
   two different places, footers still saying "Source" days after the menus said
   "GitHub", and a link list that gained entries on one page and not the others.
   Nothing was broken; the site was simply three sites wearing one name.

   So the frame is compared instead of generated. It is compared WHOLE, menu
   included, and there is exactly one exception: what belongs to one page only
   lives after a `<!-- page-specific -->` marker and is not compared. Anything
   before it is the shared frame, to the byte.

   There used to be a second exception, and it cost a bug. See below.

   This is not a template and does not want to be one: it says when the copies
   have drifted, and leaves the fixing to whoever knows why. */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs';

/* A REDIRECT IS NOT A PAGE OF THE SITE, and there are two again.

   This rule was here, then removed with the two redirects it skipped --
   install.html and example-session.html, left behind by a rename -- on the
   argument that the site had not been public long enough for an old address to
   have been linked or bookmarked. That was true of people and false of
   crawlers: the search engine had already indexed both, and deleting them
   turned two indexed URLs into two 404s. They are back, and so is this.

   Recognised by what it IS rather than by its name: any page whose head carries
   an immediate `refresh` is on its way somewhere else, and has no header to
   compare, no menu to keep in step, and nothing anybody reads for longer than
   it takes to leave. */
const isRedirect = (html) =>
    /<meta\s+http-equiv=["']?refresh["']?[^>]*>/i.test(html);

const PAGES = readdirSync(DIR).filter((f) => f.endsWith('.html'))
    .filter((f) => !isRedirect(readFileSync(join(DIR, f), 'utf8')))
    .sort();

const bloc = (html, tag) => {
    const m = html.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`));
    return m ? m[0] : null;
};

/* The three pages of the site, by the address a menu would use to name one.
   No menu names a page any more -- see the block above `normalise` -- so this
   map feeds only the last check in the file, the one that refuses a menu entry
   pointing at the page it sits on. It is kept for the day somebody puts page
   names back in the menu: that day, all three pages get the same entry, the
   header comparison stays happy, and one of them links to itself. */
const INTERNAL = { 'index.html': '/',
                   'how-to-install-it.html': 'how-to-install-it.html',
                   'how-to-use-it.html': 'how-to-use-it.html',
                   'questions.html': 'questions.html' };

/* THE MENU IS COMPARED. It used to be replaced by an empty tag before the
   comparison -- "the one part of the header meant to differ", said the comment
   that stood here -- and that is why this check reported one header across
   three pages while the three menus read:

       index.html               Use . Install . GitHub
       how-to-use-it.html       Home . Install . GitHub
       how-to-install-it.html   Home . A detailed usage example . GitHub

   Three different menus, and the check that exists to catch exactly that was
   throwing them away first. A check that passes over what it was written to
   watch is worse than no check: it is a promise that nobody re-reads.

   The rule it enforces now is the one that was decided and then drifted: the
   menu is the SAME on every page -- Use and Install pointing at the landing
   page's two chapters, then GitHub. No entry names a page, so no page can link
   to itself, and none of the three needs an exception. */
/* ONE ATTRIBUTE IS TAKEN OUT BEFORE COMPARING, AND IT IS CHECKED SEPARATELY
   RATHER THAN FORGIVEN. `aria-current="page"` is per-page by definition: the
   menu names four pages, and on each of them one entry is the one you are
   already on. Removing it here without looking would be the mistake this file
   was rewritten to undo -- so the loop further down asserts that it sits on the
   right entry, on every page, and nowhere else. Normalising and verifying are
   the same act; normalising alone is a promise nobody re-reads. */
const normalise = (text) =>
    text.split('<!-- page-specific -->')[0]
        .replace(/ aria-current="page"/g, '')
        .replace(/\s+/g, ' ').trim();

let bad = 0;
for (const tag of ['header', 'footer']) {
    /* A page may have no footer at all -- they were removed when they had
       nothing left to say. What is refused is SOME pages having one. */
    const compte = PAGES.filter((n) =>
        bloc(readFileSync(join(DIR, n), 'utf8'), tag) !== null).length;
    if (tag === 'footer' && compte === 0) continue;
    const seen = new Map();
    for (const name of PAGES) {
        const html = readFileSync(join(DIR, name), 'utf8');
        const raw = bloc(html, tag);
        if (raw === null) {
            console.error(`${DIR}/${name}: no <${tag}>, but ${compte} page(s) have one.`);
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

/* AND THE OTHER HALF OF THAT REMOVAL. The menu names a page now -- it did not
   before, which is why the rule here used to be the flat "a menu never links to
   the page it is on". That rule cannot survive an entry a reader is meant to
   see marked as current, so it is replaced by the stricter one it was standing
   in for:

     - a menu entry pointing at the page it sits on MUST carry
       aria-current="page". An entry that quietly links to where you already are
       is the dead link the old rule was about;
     - no OTHER entry may carry it. Marked on the wrong entry, it tells a screen
       reader the reader is somewhere they are not;
     - a page the menu does not name carries none at all.

   The landing page is that last case: its two entries are anchors into itself,
   `/#use` and `/#install`, and neither names a page. */
for (const name of PAGES) {
    const head = bloc(readFileSync(join(DIR, name), 'utf8'), 'header') || '';
    /* THE MENU, AND NOT THE WHOLE HEADER. The wordmark beside it links to `/`
       on every page, the landing page included, and that is the convention
       everywhere: the mark goes home, from home too. And an href with a
       FRAGMENT is not a destination -- the landing page's own `/#use` scrolls
       within the page it is on, which is what an anchor is for. What this looks
       at is a menu entry naming a page, plainly, with nothing after it. */
    const nav = (head.match(/<nav>[\s\S]*?<\/nav>/) || [''])[0];
    const liens = [...nav.matchAll(/<a\s([^>]*)>/g)].map((m) => m[1]);
    const soi = liens.filter((a) => a.includes(`href="${INTERNAL[name]}"`));
    const marques = liens.filter((a) => a.includes('aria-current="page"'));

    if (name in INTERNAL) {
        for (const a of soi) {
            if (!a.includes('aria-current="page"')) {
                console.error(`${DIR}/${name}: its menu links to the page it is on `
                    + `without aria-current="page".`);
                bad++;
            }
        }
    }
    for (const a of marques) {
        if (!soi.includes(a)) {
            console.error(`${DIR}/${name}: aria-current="page" on an entry that is `
                + `not this page.`);
            bad++;
        }
    }
    if (marques.length > 1) {
        console.error(`${DIR}/${name}: ${marques.length} entries marked as the current page.`);
        bad++;
    }
}

/* EVERY PAGE IS REACHED FROM ANOTHER ONE. This is the invariant the menu used
   to carry by accident, and losing it is what made the fix above incomplete:
   once no menu entry names a page, the only way from the install page to the
   usage page was gone, and every check in this file still passed -- the three
   headers were identical, which was the whole point. Identical and useless is
   a state worth refusing.

   A link in any OTHER page counts, wherever it sits: the site's own way out of
   a page is the button that ends it, not the menu. */
const ADDRESSES = { 'index.html': ['/', 'index.html'] };
for (const name of PAGES) if (!(name in ADDRESSES)) ADDRESSES[name] = [name, `/${name}`];
for (const name of PAGES) {
    const linkedFrom = PAGES.filter((other) => other !== name
        && ADDRESSES[name].some((a) => new RegExp(`href="${a}(#[^"]*)?"`)
            .test(readFileSync(join(DIR, other), 'utf8'))));
    if (!linkedFrom.length) {
        console.error(`${DIR}/${name}: no other page links to it.`);
        bad++;
    }
}

if (bad) process.exit(1);

/* A LINKED FILTER NAMES A TAG THAT EXISTS. questions.html reads `?tag=` and
   presses the matching chip; the chips are built from the cards' own
   `data-tags`, so nothing on that page can go stale. What CAN is a link from
   another page naming a tag by its slug -- and it fails the way a filter fails,
   which is by quietly showing everything, so the reader lands on fourteen cards
   instead of three and never knows the link was aimed.

   Measured while this was written: renaming a tag broke exactly that link, in
   the same commit that renamed it. */
const SLUG = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const etiquettes = new Set();
for (const name of PAGES) {
    const html = readFileSync(join(DIR, name), 'utf8');
    for (const m of html.matchAll(/data-tags="([^"]+)"/g)) {
        for (const t of m[1].split('|')) if (t.trim()) etiquettes.add(SLUG(t.trim()));
    }
}
for (const name of PAGES) {
    const html = readFileSync(join(DIR, name), 'utf8');
    for (const m of html.matchAll(/questions\.html\?tag=([A-Za-z0-9-]+)/g)) {
        if (etiquettes.has(m[1])) continue;
        const line = html.slice(0, m.index).split('\n').length;
        console.error(`${DIR}/${name}:${line}  links to ?tag=${m[1]}, which no card carries.`);
        bad++;
    }
}

if (bad) process.exit(1);

/* SAY WHAT WAS MEASURED, not what was hoped. This line read "one header and
   one footer" on a site whose pages have no footer at all: the loop above skips
   the tag when no page carries it, and the message announced a comparison that
   never ran. Same failure as the menu, one line further down. */
const pieds = PAGES.filter((n) =>
    bloc(readFileSync(join(DIR, n), 'utf8'), 'footer') !== null).length;
console.log(`shell: ${PAGES.length} page(s), one header (menu included), `
    + (pieds ? `one footer` : `no footer on any page`) + `.`);
