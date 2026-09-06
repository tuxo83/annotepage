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
    'claude', 'anthropic', 'openai', 'chatgpt', 'gpt-?[345]',
    'copilot', 'gemini', 'codex', 'codeium', 'llama', 'bard',
];

/* Written out before the scan, so the command survives and the signature does
   not. Anything added here has to be a phrase somebody TYPES, never a phrase
   somebody is called. */
const ALLOWED = [
    /claude\s+mcp\s+add/gi,
];

const NEEDLE = new RegExp(`\\b(${NAMES.join('|')})\\b`, 'gi');

const findings = (text, where) => {
    let clean = String(text);
    /* ELEMENT TAGS ARE REMOVED BEFORE THE SCAN, and only element tags. The
       site marks up its code blocks word by word, so the one allowed phrase
       arrives as `<span>claude</span> <span>mcp</span> <span>add</span>` and
       no allowance written in English can match it. Stripping `</?tag>` puts
       the words back together.

       `<!-- ... -->` is NOT stripped: an HTML comment is exactly where a name
       would be signed, and a guard that read past comments would miss the case
       it exists for. The pattern requires a letter after the `<`, which a
       comment's `!` is not. */
    clean = clean.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
    for (const phrase of ALLOWED) clean = clean.replace(phrase, ' ');
    const out = [];
    for (const line of clean.split('\n')) {
        const hit = line.match(NEEDLE);
        if (hit) out.push(`${where}: ${hit[0]} — ${line.trim().slice(0, 90)}`);
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
    try { log = execFileSync('git', ['log', '--format=%an%n%ae%n%B', range], { encoding: 'utf8' }); }
    catch (e) { process.exit(0); }   // no such range: nothing to say
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
