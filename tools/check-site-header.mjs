#!/usr/bin/env node
/* check-site-header.mjs -- THE HEADER IS COPIED BY HAND ONTO FOUR PAGES.
 *
 * This repository keeps a guard on every other duplication it has: the SRI
 * digests written across six files, the installer's copy on the site, the three
 * protocol numbers, the derivation in four implementations. The site's own
 * header had none -- and it is the duplication a human is most likely to break,
 * because it is edited by hand, on four files, for a change that always looks
 * trivial.
 *
 * The failure is silent and it is ugly: one page keeps a menu the others have
 * lost, or gains an entry the others never get. Nothing errors. The reader who
 * lands on the wrong page simply cannot reach what the site offers, and the
 * maintainer, who came from the page they just edited, sees it work.
 *
 * It was written the day a fourth entry was about to be added to that menu --
 * which is the right day: the guard goes in BEFORE the copy is made a fifth
 * time, not after somebody notices it drifted.
 *
 * ONE THING LEGITIMATELY DIFFERS, AND IT IS CHECKED RATHER THAN IGNORED.
 * Each page marks its own entry with aria-current="page" -- that is what tells
 * a screen reader which of the four you are on, and it MUST differ from page to
 * page. The first version of this file compared the raw bytes and failed on a
 * healthy repository, which is the worst kind of guard: one that cries on
 * correct code teaches everyone to switch it off. So the attribute is removed
 * before the blocks are compared, and then verified on its own: exactly one per
 * page, on that page's own entry. The exception is narrower than the rule it
 * carves out of.
 *
 * WHY A DECLARED LIST AND NOT A GLOB. A glob over docs/*.html would pass in
 * silence the day somebody adds a page with no header at all -- which is
 * exactly the mistake this file exists to catch. So the pages of the site are
 * named here, and the pages that deliberately have no header are named too,
 * with the reason. A new page has to be put in one list or the other, by a
 * person, which is the point.
 */

import { readFileSync } from 'node:fs';

/* The site: a header, a menu, the Source panel. Four pages, one block.
   The value beside each one is the href its own menu entry carries, which is
   what aria-current must sit on. */
const PAGES = new Map([
    ['docs/index.html', '/'],
    ['docs/how-to-use-it.html', 'how-to-use-it.html'],
    ['docs/how-to-install-it.html', 'how-to-install-it.html'],
    ['docs/questions.html', 'questions.html'],
]);

/* Not the site's pages, and not oversights. Both are standalone documents of
   about forty lines: `install.html` is the redirect that serves the installer,
   and `example-session.html` is a replay opened from one link. Giving either a
   menu would be giving it a second purpose. */
const APART = [
    'docs/example-session.html',
    'docs/install.html',
];

const OPEN = '<a class="mark"';
const CLOSE = '</nav>';
const CURRENT = ' aria-current="page"';

/* Bytes, not a parse. What is compared is what is served, and two headers that
   differ by one space differ. */
const headerOf = (path) => {
    const lines = readFileSync(path, 'utf8').split('\n');
    const from = lines.findIndex((l) => l.includes(OPEN));
    if (from === -1) return null;
    const to = lines.findIndex((l, i) => i > from && l.includes(CLOSE));
    if (to === -1) return null;
    return { text: lines.slice(from, to + 1).join('\n'), from: from + 1, to: to + 1 };
};

const failures = [];
const blocks = new Map();

for (const page of PAGES.keys()) {
    const block = headerOf(page);
    if (!block) {
        failures.push(`${page} is declared a page of the site and has no header: `
            + `nothing between "${OPEN}" and "${CLOSE}".`);
        continue;
    }
    blocks.set(page, block);
}

/* -- The block, once the one legitimate difference is set aside ----------- */

/* The first declared page is the reference, so a diff names a line of a real
   file rather than of an abstract "expected" block. */
const [reference] = [...blocks.keys()];
if (reference) {
    const plain = (block) => block.text.split(CURRENT).join('').split('\n');
    const theirs = plain(blocks.get(reference));

    for (const [page, block] of blocks) {
        if (page === reference) continue;
        const mine = plain(block);
        if (mine.join('\n') === theirs.join('\n')) continue;

        const at = mine.findIndex((l, i) => l !== theirs[i]);
        failures.push(
            `${page} lines ${block.from}-${block.to} differ from ${reference}.\n`
            + `      first difference at line ${block.from + (at === -1 ? mine.length : at)}:\n`
            + `        ${page}: ${(mine[at] ?? '(the block ends here)').trim().slice(0, 100)}\n`
            + `        ${reference}: ${(theirs[at] ?? '(the block ends here)').trim().slice(0, 100)}\n`
            + '      The header is copied by hand onto every page of the site. '
            + 'Change it on all of them, or none.');
    }
}

/* -- And the difference that is allowed has to be the right one ----------- */

for (const [page, block] of blocks) {
    const marked = [...block.text.matchAll(/<a\s+href="([^"]*)"[^>]*aria-current="page"/g)]
        .map((m) => m[1]);

    if (marked.length !== 1) {
        failures.push(`${page} marks ${marked.length} menu entries with aria-current="page", `
            + 'not one. That attribute is what tells a screen reader which of the four '
            + `pages you are on.${marked.length ? ' Marked: ' + marked.join(', ') : ''}`);
        continue;
    }
    const wanted = PAGES.get(page);
    if (marked[0] !== wanted) {
        failures.push(`${page} marks "${marked[0]}" as the current page, and it is `
            + `"${wanted}". A reader using a screen reader is told they are somewhere `
            + 'they are not.');
    }
}

/* AND THE EXEMPTIONS ARE CHECKED TOO. A page listed as having no header, which
   grows one, must move into the group that is compared -- otherwise it is
   exempt from the rule while looking as though it obeys it. That is how an
   allowlist rots. */
for (const page of APART) {
    if (headerOf(page)) {
        failures.push(`${page} is listed as having no header, and it has one now. `
            + 'Move it into PAGES so that its header is compared, or take the header out.');
    }
}

if (failures.length) {
    console.error('site-header:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log(`site-header: ${PAGES.size} pages carry the same header, byte for byte `
    + `(${blocks.get(reference)?.text.split('\n').length ?? 0} lines), each marking its own `
    + `entry as the current page, and the ${APART.length} standalone pages still carry none`);
