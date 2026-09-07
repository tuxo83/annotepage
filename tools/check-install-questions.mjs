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
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const flowPath = join(here, '..', 'server', 'webroot', 'internal', 'install-flow.php');
const page = readFileSync(join(here, '..', 'docs', 'how-to-install-it.html'), 'utf8');

/* THE QUESTIONS ARE ASKED OF THE PHP, NOT GUESSED OUT OF IT. This check used
   to read the `<legend>` tags out of the source with a regular expression, and
   the day those legends became data rather than markup it read one question
   where there are three -- loudly, which is why it is worth saying: it said
   the shape had changed and refused, instead of passing on nothing.
   ap_i_questions() returns the model; PHP is the only thing that can be
   trusted to read PHP. */
const dump = spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require ' + JSON.stringify(flowPath) + ';'
    + ' echo json_encode(ap_i_questions());'], { encoding: 'utf8' });
if (dump.error) {
    console.log('install questions: no php on this machine, nothing was checked');
    process.exit(0);
}
let questions = null;
try {
    questions = JSON.parse((dump.stdout || '').trim());
} catch (e) {
    console.error('install questions: ap_i_questions() did not answer with a model.\n  '
        + ((dump.stdout || '') + (dump.stderr || '')).slice(0, 400).replace(/\n/g, '\n  '));
    process.exit(1);
}

/* The drawn screen only: the page names these words elsewhere, in prose, where
   a different wording is not a divergence but a sentence. */
const start = page.indexOf('<div class="wiz-body">');
const drawing = start === -1 ? '' : page.slice(start, start + 6000);

const legends = questions.map((q) => q.legend);
const answers = questions.flatMap((q) => q.answers.map((a) => a.label));

const failures = [];
if (legends.length !== 3) {
    failures.push(`the installer no longer asks three questions: it asks ${legends.length}.\n`
        + '    The page says "Three questions" in prose and draws three. Both have to move.');
}
if (answers.length < 6) {
    failures.push(`the model carries only ${answers.length} answers, which is fewer than`
        + ' the three questions can have. Something was removed and this check is the'
        + ' only thing that noticed.');
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
