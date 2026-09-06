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

/* WHAT THE SERVER TELLS ITS CLIENTS IS THE CLIENT THAT EXISTS.
   server/webroot/CLIENT_VERSION is what a server announces on every `list`, and
   it is the only way a client served by a CDN learns that a newer one is out.
   Nothing wrote it and nothing compared it: it said 2.2.0 while the released
   client was 2.14.1, so the mechanism had been inert for twelve minor versions
   -- a client compares three numbers, sees an older one, and keeps quiet. The
   failure of a version that LIES is silence, which is why it needs a rule and
   not a glance.

   Compared, unlike the three above: those are three products released on their
   own days, and this is one product's version written down twice. */
const announced = readFileSync('server/webroot/CLIENT_VERSION', 'utf8').trim();
const released = versions['client package'];
if (announced !== released) {
    console.error(`server/webroot/CLIENT_VERSION announces ${announced}, `
        + `the released client is ${released}.`);
    console.error('  A server saying so tells every client the wrong thing, and');
    console.error('  a client that hears an older number than its own says nothing.');
    bad++;
} else {
    console.log(`announced client: ${announced}, which is the released one`);
}

process.exit(bad ? 1 : 0);
