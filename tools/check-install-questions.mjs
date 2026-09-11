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

/* THE NUMBER IN A QUESTION IS A PROMISE ABOUT THE FILE THAT WILL BE WRITTEN.
   The relay answer said "bounded at 500 notes each" for two releases after the
   cap became 2000 and then 6000: the screen promised a limit the configuration
   it writes does not carry, and nothing here noticed -- this check compared
   legends and labels, which had not moved. So the sentence is now read against
   the setting it describes. Found by looking at the screen, which is the only
   way that kind of drift is ever found; this is what makes looking unnecessary
   next time. */
const settings = spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require ' + JSON.stringify(flowPath) + ';'
    + ' foreach (ap_i_settings() as $s) { if (isset($s["decided"])) {'
    + ' echo $s["key"], "=", $s["decided"]["anyone"], "\n"; } }'],
    { encoding: 'utf8' });
const decided = new Map((settings.stdout || '').trim().split('\n').filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const relayCap = (decided.get('max_notes_per_project') || '').match(/\d+/);
const relaySay = (questions.find((q) => q.key === 'audience') || { answers: [] })
    .answers.filter((a) => a.value === 'anyone').map((a) => a.say).join(' ');
if (!relayCap) {
    failures.push('no cap could be read from what the installer writes for a relay, so'
        + ' the sentence on the screen cannot be checked against it');
} else if (relaySay.indexOf(relayCap[0]) === -1) {
    failures.push('the relay answer on the screen says "' + relaySay.replace(/<[^>]+>/g, '')
        + '" while this installation writes ' + relayCap[0] + ' notes into the'
        + ' configuration.\n    A screen that names a limit must name the one that will'
        + ' be written.');
}
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

/* THE FILE SOMEBODY DOWNLOADS KNOWS NO OPTION NAME, and that is the same rule
   its own header states about file names and versions: it installs a release
   it knows nothing about. A copy of the option list inside it would be wrong
   at the first option added -- and it would be wrong SILENTLY, since the two
   copies only meet on somebody else's server. */
const bootstrap = readFileSync(join(here, '..', 'server', 'annotepage-install.php'), 'utf8');
const optionNames = [...questions.map((q) => q.legend)];
const derived = spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require ' + JSON.stringify(flowPath) + ';'
    + ' echo implode(" ", array_keys(ap_i_cli_options()));'], { encoding: 'utf8' });
for (const name of (derived.stdout || '').trim().split(/\s+/).filter(Boolean)) {
    /* Its own three flags are its own: --help, --fetch and --version are what
       it answers for, and it says so in its header. */
    if (['help', 'version', 'fetch'].includes(name)) continue;
    if (bootstrap.includes('--' + name)) {
        failures.push(`annotepage-install.php names --${name}, which belongs to the`
            + ' release. It installs a release it knows nothing about, and that has to'
            + ' include the options.');
    }
}
void optionNames;

/* THE FIVE MySQL FIELDS, TWICE: asked in the dials and drawn in the MySQL box
   of the screen. Both carry the installer's labels, in its order, or the
   reader types "Database name" here and meets something else there. An empty
   read is a failure: markup that moved would otherwise check nothing. */
const creds = spawnSync('php', ['-r',
    'define("AP_INTERNAL", 1); require ' + JSON.stringify(flowPath) + ';'
    + ' foreach (ap_i_credential_fields() as $b) { echo $b["label"], "\n"; }'],
    { encoding: 'utf8' });
const credLabels = (creds.stdout || '').trim().split('\n').filter(Boolean);
const dbBox = (page.match(/<div class="dial dial-db[^"]*">([\s\S]*?)<p class="dial-say"/) || [])[1] || '';
const askedLabels = [...dbBox.matchAll(/<label class="db-f[^"]*"><span>([^<]+)<\/span>/g)]
    .map((m) => entities(m[1]));
const wizDb = (drawing.match(/<div class="wiz-creds">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || '';
const drawnLabels = [...wizDb.matchAll(/<p class="wiz-cl">([^<]+)<\/p>/g)].map((m) => entities(m[1]));
if (credLabels.length < 5) {
    failures.push(`ap_i_credential_fields() answered ${credLabels.length} labels; the MySQL`
        + ' fields cannot be checked');
}
for (const [where, got] of [['the dials ask', askedLabels], ['the drawn screen shows', drawnLabels]]) {
    if (got.join('|') !== credLabels.join('|')) {
        failures.push(`for MySQL, ${where} ${JSON.stringify(got)}; the installer asks`
            + ` ${JSON.stringify(credLabels)}`);
    }
}

if (failures.length) {
    console.error('install questions:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
console.log(`install questions: ${legends.length} legends and ${answers.length} answers, `
    + 'the page draws the screen the installer shows');
