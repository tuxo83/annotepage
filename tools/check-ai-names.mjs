/* NO ASSISTANT SIGNS ANYTHING HERE.
 *
 * The tools that write in this repository leave their name behind by default:
 * a `Co-Authored-By:` trailer, a session URL, an author field. Ninety-eight
 * commits carried one before anybody looked. This refuses the next one.
 *
 * WHY IT IS IN THE REPOSITORY AND THE OTHER GUARD IS NOT. The leak guard lives
 * outside, because a list of the words that must not be published cannot itself
 * be published. This list is the opposite: every name in it is public, famous,
 * and no secret is spent by writing it down. It belongs where everybody can see
 * what is refused and add to it.
 *
 * FOUR PLACES, because the name arrives by four routes:
 *
 *   message    the commit message and its trailers      hooks/commit-msg
 *   identity   git's user.name and user.email           hooks/pre-commit
 *   staged     the lines a commit adds                  hooks/pre-commit
 *   tracked    everything the repository holds          npm run check
 *
 * WHAT IS NOT REFUSED, and it took measuring rather than guessing:
 *
 *   - `claude mcp add ...` is a COMMAND the reader types into a tool they
 *     already chose, the way `npm install` names npm. Naming the command
 *     somebody runs is not the same act as signing work with a name.
 *   - `cursor` is not on the list. This repository draws a terminal, so the
 *     word appears in twelve files, in CSS and in prose. A guard with a false
 *     positive in twelve files is a guard people learn to skip.
 *   - `devin` is not on the list either: it is inside "deviner" and "devinez",
 *     which the French label file is full of. Word boundaries are not enough
 *     when the word is a fragment of another language's verb.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/* THE LIST HAS TO NAME THE NAMES, so this file fails its own check -- it did,
   on the very commit that introduced it, which is the cheapest possible proof
   that the guard runs.
 *
 * It exempts ITSELF BY PATH, and nothing else. The alternative was to build
 * the names out of fragments so the literals never appear, and that is worse
 * in both directions: unreadable to whoever wants to add a name, and no harder
 * to defeat. What is refused should be legible to anybody who opens the file
 * that refuses it.
 *
 * The exemption is one path, written here rather than passed in, so that
 * widening it is an edit somebody has to make and explain. */
const SELF = 'tools/check-ai-names.mjs';

/* The names that sign work. Word boundaries, case-insensitive. Add to it
   freely: a name that never appears costs one regular expression. */
const NAMES = [
    /* les fournisseurs */
    'claude', 'anthropic', 'openai', 'chatgpt', 'copilot', 'gemini',
    'codex', 'codeium', 'llama', 'bard', 'grok', 'deepseek', 'qwen',
    'kimi', 'windsurf', 'aider', 'tabnine',
    /* les modeles, parce que le trailer qui a fuit ici disait "Opus 5" et
       qu'un outil qui change son gabarit pour le nom du modele seul ne serait
       plus vu. Aucun d'eux n'entre en collision avec un mot de ce depot --
       verifie, un par un, avant d'etre ajoute. */
    'opus', 'sonnet', 'haiku', 'fable', 'mistral',
    /* et les generations, y compris les suffixes que \b rate seul */
    'gpt-?[0-9]+(\\.[0-9]+)?[a-z]?',
];

/* Written out before the scan, so the command survives and the signature does
   not. Anything added here has to be a phrase somebody TYPES, never a phrase
   somebody is called. */
const ALLOWED = [
    /claude\s+mcp\s+add/gi,
];

const NEEDLE = new RegExp(`\\b(${NAMES.join('|')})\\b`, 'gi');

/* THE SHAPE OF A SIGNATURE, WITHOUT ANY NAME IN IT. The list above only ever
   catches a name somebody thought to write; these two catch the FORM, which is
   what actually leaked eighty-five times. A tool that renames its model
   tomorrow still emits a trailer and still emits a session URL. */
const SHAPES = [
    [/session_[A-Za-z0-9_-]{16,}/g, 'a session identifier'],
    [/^\s*Co-Authored-By:.*<[^@>]+@(?!example\.(com|org|net)|users\.noreply\.github\.com)[^>]+>/gim,
     'a co-author trailer'],
];

/* TWO READINGS OF THE SAME TEXT, and a name found in either one is a name.
 *
 * WHY, and it was found by an audit rather than by thinking: the first version
 * deleted every `<...>` before scanning, so that the site's marked-up
 * `<span>claude</span> <span>mcp</span>` could match the one allowed phrase.
 * But the email in a co-author trailer sits in angle brackets too, and that is
 * the CANONICAL shape of a git signature. The guard was blind to the exact
 * thing it exists to stop: a trailer whose visible name says nothing and whose
 * address says everything went straight through.
 *
 * So nothing is deleted any more:
 *
 *   raw       the text as written. Catches a name inside angle brackets.
 *   stripped  element tags removed. Catches a name CUT BY a tag --
 *             `Cla<b>ude</b>` reads as one word to a browser and read as two
 *             to the first version.
 *
 * The allowed phrase is removed from each in the form it takes there, which is
 * why it survives both readings while a signature survives neither. */
const ALLOWED_MARKED = /claude(?:<[^>]*>|\s)+mcp(?:<[^>]*>|\s)+add/gi;

const findings = (text, where) => {
    const raw = String(text).replace(ALLOWED_MARKED, ' ');
    let stripped = String(text).replace(/<\/?[a-zA-Z][^>]*>/g, '');
    for (const phrase of ALLOWED) stripped = stripped.replace(phrase, ' ');

    const seen = new Set();
    const out = [];
    const note = (line, what) => {
        const key = what + '|' + line;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(`${where}: ${what} — ${line.trim().slice(0, 90)}`);
    };
    for (const [pattern, what] of SHAPES) {
        for (const line of String(text).split('\n')) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) note(line, what);
        }
    }
    for (const body of [raw, stripped]) {
        for (const line of body.split('\n')) {
            const hit = line.match(NEEDLE);
            if (hit) note(line, hit[0]);
        }
    }
    return out;
};

const mode = process.argv[2];
const arg = process.argv[3];
let bad = [];

if (mode === 'message') {
    bad = findings(readFileSync(arg, 'utf8'), 'the commit message');
} else if (mode === 'staged') {
    const who = ['user.name', 'user.email'].map((k) => {
        try { return execFileSync('git', ['config', k], { encoding: 'utf8' }).trim(); }
        catch (e) { return ''; }
    }).join(' ');
    bad = findings(who, 'git identity');
    /* Added lines only: a commit that DELETES a name must not be refused, or
       the guard would forbid its own cleanup. */
    const diff = execFileSync('git', ['diff', '--cached', '--unified=0'], { encoding: 'utf8' });
    /* Walked file by file so the exemption can apply to one of them: a `+++`
       line names the file the hunks that follow belong to. */
    const added = [];
    let inSelf = false;
    for (const l of diff.split('\n')) {
        if (l.startsWith('+++ ')) { inSelf = l.slice(4).replace(/^b\//, '') === SELF; continue; }
        if (!inSelf && l.startsWith('+')) added.push(l);
    }
    bad = bad.concat(findings(added.join('\n'), 'a line this commit adds'));
} else if (mode === 'range') {
    const range = arg || 'origin/main..HEAD';
    let log = '';
    /* FAILS CLOSED. This said `exit(0)` on any error, so an unfetched
       origin/main, a renamed remote or a detached repository all read as "no
       assistant named" -- a guard that answers yes when it cannot look is
       worse than none. */
    try { log = execFileSync('git', ['log', '--format=%an%n%ae%n%B', range], { encoding: 'utf8' }); }
    catch (e) {
        console.error(`REFUSED: cannot read the range ${range} -- ${e.message.split('\n')[0]}`);
        console.error('A range that cannot be read has not been checked.');
        process.exit(1);
    }
    bad = findings(log, 'a commit being pushed');
} else {
    const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
        .split('\n').filter(Boolean);
    for (const path of files) {
        if (path === SELF) continue;
        let text;
        try { text = readFileSync(path, 'utf8'); } catch (e) { continue; }
        bad = bad.concat(findings(text, path));
    }
}

if (bad.length) {
    console.error('REFUSED: an assistant is named.\n');
    for (const line of bad.slice(0, 20)) console.error('  ' + line);
    if (bad.length > 20) console.error(`  ... and ${bad.length - 20} more`);
    console.error('\nNothing in this repository is signed by an assistant -- not in a');
    console.error('message, not in a trailer, not in the author field, not in a comment.');
    console.error('A command somebody types is not a signature: see ALLOWED in');
    console.error('tools/check-ai-names.mjs, and add to it rather than working around it.');
    process.exit(1);
}
console.log(mode === 'message' ? 'commit message: no assistant named'
    : mode === 'staged' ? 'staged changes and git identity: no assistant named'
    : mode === 'range' ? 'commits to push: no assistant named'
    : 'tracked files: no assistant named');
