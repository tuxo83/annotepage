/* The three components speak one protocol. Nothing at runtime notices when
   they stop agreeing.

   Publish a client and an MCP built against different protocol numbers and the
   server accepts every write: it stores an envelope it cannot read and has no
   reason to inspect. The notes are already unreadable by the time anyone looks,
   and the only symptom is a reader that quietly skips rows.

   PACKAGE VERSIONS ARE NO LONGER REQUIRED TO MATCH. They were, back when a
   single tag released both and a mismatch meant one of them silently did not
   publish. Publishing is now driven by each package's own declared version, so
   they are MEANT to diverge: fixing the client alone bumps the client alone.
   This is not a check being relaxed to make something pass -- it is a rule
   whose reason stopped existing.

   What still has to agree is the protocol number, and that is the whole point
   of this file. */

import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const one = (label, text, re) => {
    const m = text.match(re);
    if (!m) { console.error(`cannot find ${label}`); process.exit(1); }
    return m[1];
};

const versions = {
    'client package': JSON.parse(read('client/package.json')).version,
    'mcp package':    JSON.parse(read('mcp/package.json')).version,
    'server VERSION': read('server/webroot/VERSION').trim(),
};

const formats = {
    'client build':    one('client build',   read('client/tools/build.mjs'),   /^const FORMAT = (\d+);/m),
    'client bundle':   one('client bundle',  read('client/dist/annotepage.js'), /\bconst FORMAT = (\d+);/),
    'mcp':             one('mcp',            read('mcp/src/format.mjs'),        /\bFORMAT\s*=\s*(\d+)/),
    'server':          one('server',         read('server/webroot/api.php'),    /define\('AP_FORMAT',\s*(\d+)\)/),
};

let bad = 0;
const agree = (what, map) => {
    const values = [...new Set(Object.values(map))];
    if (values.length === 1) { console.log(`${what}: all agree on ${values[0]}`); return; }
    console.error(`${what}: DISAGREEMENT`);
    for (const [k, v] of Object.entries(map)) console.error(`  ${k.padEnd(18)} ${v}`);
    bad++;
};

/* Shown, never compared. Three lines that say what is where beat a rule that
   fires on a state which is now normal. */
console.log('versions: ' + Object.entries(versions)
    .map(([k, v]) => `${k.replace(' package', '').replace(' VERSION', '')} ${v}`)
    .join(', '));

for (const [label, value] of Object.entries(versions)) {
    if (!/^\d+\.\d+\.\d+$/.test(value)) {
        console.error(`${label} is "${value}", which is not x.y.z`);
        bad++;
    }
}

agree('protocol format', formats);

process.exit(bad ? 1 : 0);
