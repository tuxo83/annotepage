/* The tool renders text written by other people -- remarks, names, page paths,
   and in relay mode text that arrives from a server the site does not own.
   Its whole defence is that this text is only ever assigned through
   textContent, never parsed as markup.

   One innerHTML is enough to lose that. It would not be a subtle bug either:
   it turns every note into a script the visitor's browser runs.

   The domain lock does NOT cover this. It is an anti-abuse measure that stops
   a stranger writing into someone else's project; it says nothing about what
   happens to the text once it comes back. */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/* insertAdjacentHTML and outerHTML parse markup exactly like innerHTML.
   document.write too. Naming them all is the point: banning one and forgetting
   its siblings is how this rule usually fails. */
const BANNED = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML)\b/;

const SHIPPED = /^(client\/src|client\/tools|mcp\/src|mcp\/tools|server|wordpress)\/|^(client|mcp)\/[^/]+\.(mjs|js)$/;

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter(f => SHIPPED.test(f) && /\.(js|mjs|php)$/.test(f));

/* A comment that names the banned call to explain why it is banned is not a
   violation -- and this file is full of them.

   BLOCK COMMENTS ARE BLANKED WHOLE, not line by line. Line by line was the
   first version and it had a hole in the middle of its own rule: it stripped a
   comment that opened and closed on one line, and a continuation line starting
   with `*`, but NOT the opening line of a multi-line comment. So

       /* textContent and never innerHTML: ...
          ... /*

   was reported as a markup-parsing assignment, in a file whose whole point was
   that it does not do that. A guard that fires on the sentence explaining it is
   a guard somebody eventually silences by rewording the sentence -- which
   changes nothing about the code and teaches everyone the wrong lesson.

   Blanked rather than removed: every newline is kept, so the line numbers
   reported below are still the file's own. */
const blankComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

let hits = 0;
for (const file of files) {
    const lines = blankComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$|^\s*\*.*$|#.*$/g, '');
        if (BANNED.test(code)) {
            console.error(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
            hits++;
        }
    });
}

if (hits) {
    console.error(`\n${hits} markup-parsing assignment(s) in shipped code.`);
    console.error('Use textContent. The tool renders text written by other people.');
    process.exit(1);
}
console.log(`no-html-injection: ${files.length} shipped file(s), none parse markup`);
