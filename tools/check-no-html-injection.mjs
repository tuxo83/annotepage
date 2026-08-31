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

const SHIPPED = /^(client\/src|client\/tools|mcp\/src|mcp\/tools|server)\/|^(client|mcp)\/[^/]+\.(mjs|js)$/;

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter(f => SHIPPED.test(f) && /\.(js|mjs|php)$/.test(f));

let hits = 0;
for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
        /* A comment that names the banned call to explain why it is banned is
           not a violation -- and this file is full of them. */
        const code = line.replace(/\/\/.*$|\/\*.*?\*\/|^\s*\*.*$|#.*$/g, '');
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
