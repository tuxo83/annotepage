/* The landing page derives a project id from a freshly generated key, so that
   a reader obtains a project before installing anything. That makes FOUR
   implementations of the same derivation in this repository: the client, the
   MCP, FORMAT.md, and now a page.

   If the page's version drifts, the tag it hands out carries a project id the
   client will not agree with, and the notes go to a project nobody reads. No
   error is raised anywhere: the reader pastes a tag that looks right.

   So the page's code is not read here, it is EXTRACTED and RUN, and its answer
   compared with the MCP's for the same key. A comment claiming they agree
   would prove nothing. */

import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { keyFromText, derive } from '../mcp/src/crypto.mjs';

/* THREE GENERATORS NOW, AND THE THIRD IS NOT A PAGE. The setup page hands out
   the tag itself -- the block whose whole job is to be copied -- so a drift
   there is a tag pasted into a layout file naming a project the client never
   computes. The WordPress plugin's settings screen draws the same key for
   somebody who will never see a tag at all, which makes a drift there the
   hardest of the three to notice: there is no block to compare by eye.

   Listing them is deliberate: a glob would pass in silence the day somebody
   adds a fourth generator with no markers in it. The extension is not the
   criterion either -- what is read here is the block between the markers, and
   a .js file has one exactly as a page does. */
const GENERATORS = ['docs/index.html', 'docs/how-to-install-it.html',
                    'wordpress/admin.js'];

const blocks = GENERATORS.map((path) => {
    const page = readFileSync(path, 'utf8');
    const between = page.match(
        /---- BEGIN derivation[\s\S]*?----\s*\*\/([\s\S]*?)\/\*\s*---- END derivation/);
    if (!between) {
        console.error(`cannot find the derivation block in ${path}.`);
        console.error('It is delimited by "---- BEGIN derivation" and "---- END derivation".');
        process.exit(1);
    }
    return [path, between[1]];
});

/* The block is browser code: it reaches for window and btoa. We give it both
   rather than rewrite it -- a rewritten copy would be a fifth implementation. */
const shim = `
    const window = { crypto: cryptoImpl };
    const btoa = (s) => Buffer.from(s, 'binary').toString('base64');
    const TextEncoder = TextEncoderImpl;
`;
const derivers = blocks.map(([path, source]) => {
    const factory = new Function('cryptoImpl', 'TextEncoderImpl',
        shim + source + '\nreturn projectIdFromSalt;');
    return [path, factory(webcrypto, TextEncoder)];
});

/* Fixed vectors, not random ones: a failure has to be reproducible by whoever
   reads the output. */
const VECTORS = [
    'UHoSPQTpSizB8GmgSaXlzoGHvxjA9_ZtgfXau7VHGts',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
];

let bad = 0;
for (const [path, fromPage] of derivers) {
    console.log(`  ${path}`);
    for (const key of VECTORS) {
        const bytes = keyFromText(key);
        if (!bytes) { console.error(`vector is not a valid key: ${key}`); process.exit(1); }
        const mine = await fromPage(bytes);
        const theirs = (await derive(bytes)).id;
        if (mine === theirs) {
            console.log(`    ${key.slice(0, 8)}...  ${theirs}`);
        } else {
            console.error(`    ${key.slice(0, 8)}...  page ${mine}  !=  mcp ${theirs}`);
            bad++;
        }
    }
}

if (bad) {
    console.error(`\n${bad} vector(s) disagree. The tag the site hands out would name a`);
    console.error('project the client does not compute. Fix the generator, not this check.');
    process.exit(1);
}
console.log(`landing-derivation: ${derivers.length} generator(s) x ${VECTORS.length} vectors, all agree with the mcp`);
