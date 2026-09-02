/* A stray closing brace in a <style> block does not raise anything. The parser
   discards it, and then discards the NEXT rule with it -- silently, with no
   console message and nothing in the markup to look at.

   It happened: an edit removed a media query's opening line and left its
   closing brace behind, `.snip` was the rule that followed, and every code
   block on the landing page lost its frame and its background. The page still
   validated, still scored, still rendered something plausible. It shipped, and
   it was found by eye three commits later.

   So the braces of every style block are counted. This does not lint CSS; it
   catches the one failure mode that deletes a rule you can still read in the
   source. */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs';
let bad = 0, blocks = 0;

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.html'))) {
    const path = join(DIR, name);
    const html = readFileSync(path, 'utf8');
    const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        blocks++;
        /* Comments are blanked rather than removed, so a line number still
           points at the line somebody has to open. */
        const css = m[1].replace(/\/\*[\s\S]*?\*\//g,
            (c) => c.replace(/[^\n]/g, ' '));
        const before = html.slice(0, m.index).split('\n').length;
        let depth = 0, line = before;
        for (const text of css.split('\n')) {
            for (const ch of text) {
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
                if (depth < 0) break;
            }
            if (depth < 0) {
                console.error(`${path}:${line}: a closing brace that closes `
                    + `nothing. The CSS rule after it is discarded by the browser.`);
                bad++;
                break;
            }
            line++;
        }
        if (depth > 0) {
            console.error(`${path}: ${depth} unclosed brace(s) in a <style> block.`);
            bad++;
        }
    }
}

if (bad) process.exit(1);
console.log(`css: ${blocks} style block(s), braces balanced`);
