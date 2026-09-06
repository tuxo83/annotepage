/* THE BUILT BUNDLE IS VALID JAVASCRIPT.

   It was not, once, and everything else passed. A comment in the sources
   contained the two characters that END a block comment; the build concatenated
   it faithfully, every digest matched, every other check was green, and what
   shipped was a file the browser refused to parse -- so the tool did not exist
   on any page carrying it, with nothing in the console but a SyntaxError nobody
   was looking at.

   Nothing here reads the code. It asks the engine to parse it, which is the
   only question worth asking: `new Function` compiles without running, so a
   file that cannot be parsed throws here and a file that can does nothing.

   THE SERVED COPY TOO. check-sri.mjs already proves it is the same bytes as the
   bundle -- but that check would pass just as happily on two identical broken
   files, which is what happened. */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = ['client/dist/annotepage.js'].concat(
    execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
        .split('\n')
        .filter((f) => /^docs\/annotepage-client-[\d.]+\.js$/.test(f)));

let bad = 0;
for (const file of files) {
    if (!existsSync(file)) {
        console.error(`${file}: missing`);
        bad++;
        continue;
    }
    try {
        // eslint-disable-next-line no-new-func
        new Function(readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`${file}: does not parse -- ${e.message}`);
        console.error('The browser would refuse it and the tool would not exist.');
        bad++;
    }
}

if (bad) process.exit(1);
console.log(`bundle: ${files.length} file(s) parse`);
