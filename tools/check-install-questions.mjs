#!/usr/bin/env node
/* check-install-questions.mjs — THE PAGE DRAWS THE INSTALLER'S SCREEN. IT HAS
 * TO BE THE SAME SCREEN.
 *
 * how-to-install-it.html draws the installer's questions, so that somebody can
 * see what they are about to meet before they upload anything, and it says in
 * its own markup that those legends are "copied from
 * server/webroot/internal/install-flow.php". Nothing checked the copy, and it
 * had already drifted: the page offered "Anyone -- a relay" where the screen
 * says "Anyone".
 *
 * A drawing of a screen that is not that screen is worse than no drawing: the
 * reader arrives having been told what to expect and does not find it, and the
 * only thing they can conclude is that the documentation is approximate.
 *
 * This reads the questions out of the PHP -- the file that executes, which is
 * the side that is right by construction -- and demands the page carry each
 * legend and each answer verbatim.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const flow = readFileSync(join(here, '..', 'server', 'webroot', 'internal',
                               'install-flow.php'), 'utf8');
const page = readFileSync(join(here, '..', 'docs', 'how-to-install-it.html'), 'utf8');

/* The drawn screen only: the page names these words elsewhere, in prose, where
   a different wording is not a divergence but a sentence. */
const start = page.indexOf('<div class="wiz-body">');
const drawing = start === -1 ? '' : page.slice(start, start + 6000);

const legends = [...flow.matchAll(/<legend>([^<]+)<\/legend>/g)].map((m) => m[1]);
const answers = [...flow.matchAll(/type="radio" name="(audience|storage|updates)"[\s\S]{0,220}?<span>([^<]+)<\/span>/g)]
    .map((m) => m[2]);

const failures = [];
if (legends.length !== 3) {
    failures.push(`the installer no longer asks three questions: it asks ${legends.length}.\n`
        + '    The page says "Three questions" in prose and draws three. Both have to move.');
}
if (answers.length < 6) {
    failures.push(`only ${answers.length} answers were read out of the form -- the shape of`
        + ' the markup changed, and this check is reading the wrong thing.');
}
/* WHOLE LABELS, NOT SUBSTRINGS. The first version of this check asked whether
   the drawing CONTAINED each answer, and "Anyone -- a relay" contains
   "Anyone": it passed on the very divergence it was written for. A label is
   the whole of what the reader sees on that chip. */
const entities = (t) => t
    .replace(/&mdash;/g, '\u2014').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&rsquo;/g, '\u2019')
    .replace(/\s+/g, ' ').trim();

const drawnLegends = [...drawing.matchAll(/<p class="wiz-q">([^<]+)<\/p>/g)]
    .map((m) => entities(m[1]));
const drawnAnswers = [...drawing.matchAll(/<p class="wiz-a">([\s\S]*?)<\/p>/g)]
    .flatMap((m) => [...m[1].matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((x) => entities(x[1])));

const compare = (what, mine, theirs) => {
    for (const text of mine) {
        if (!theirs.includes(text)) {
            failures.push(`the drawn screen has no ${what} reading "${text}", `
                + `which is what the installer shows.\n    It draws: `
                + theirs.map((t) => JSON.stringify(t)).join(', '));
        }
    }
    for (const text of theirs) {
        if (!mine.includes(text)) {
            failures.push(`the drawn screen carries this ${what}, which the installer `
                + `does not show: "${text}"`);
        }
    }
};
compare('question', legends.map(entities), drawnLegends);
compare('answer', answers.map(entities), drawnAnswers);

if (failures.length) {
    console.error('install questions:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log(`install questions: ${legends.length} legends and ${answers.length} answers, `
    + 'the page draws the screen the installer shows');
