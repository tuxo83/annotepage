/* WHAT IS ALREADY ONLINE UNDER THIS NUMBER IS WHAT IS HERE.

   THE FAILURE THIS ANSWERS, and it happened. 2.14.0 was pushed twice: the
   registry took the bundle from the first push, the site served the one from
   the second, and they were different files. Every local check passed --
   check-sri.mjs compares the bundle with the copy the site serves, and both
   were the same, both new. Nothing here or there could see that the registry
   was holding something else.

   The cost of not seeing it is the silent one: a pinned tag carries the digest
   this repository publishes, the browser fetches the CDN's copy, the two do not
   match, and the script is refused with nothing on the page and nothing in the
   console. Whoever installed it that day has a site where the tool does not
   exist.

   A VERSION NOT YET PUBLISHED IS THE NORMAL CASE, and it passes: that is every
   release being prepared. What is refused is a version the registry ALREADY
   holds whose bytes differ from the bundle here -- which no amount of local
   rebuilding can fix, because a registry does not take a version twice. The
   answer is always a new number, and this says so.

   IT NEEDS THE NETWORK, and it is the only check here that does. Unreachable
   is not "fine": it is "cannot tell", and the thing it cannot tell is whether
   a push is about to publish a digest for bytes nobody will ever be served.
   So it refuses, and says which of the two it is. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(readFileSync('client/package.json', 'utf8'));
const version = pkg.version;
const name = pkg.name;
const local = readFileSync('client/dist/annotepage.js');
const digest = (b) => 'sha384-' + createHash('sha384').update(b).digest('base64');

/* The CDN rather than the registry's tarball: it is the file a browser will
   actually be served from a pinned tag, which is the thing being compared. */
const url = `https://cdn.jsdelivr.net/npm/${name}@${version}/dist/annotepage.js`;

let answer;
try {
    answer = await fetch(url, { redirect: 'follow' });
} catch (e) {
    console.error(`cannot reach ${url}`);
    console.error(`  ${e.message}`);
    console.error('This check cannot tell whether ' + version + ' is already online');
    console.error('with different bytes, which is the one thing it exists to tell.');
    process.exit(1);
}

if (answer.status === 404) {
    console.log(`published: ${name}@${version} is not online yet -- nothing to disagree with`);
    process.exit(0);
}

if (!answer.ok) {
    console.error(`${url} answered ${answer.status}`);
    process.exit(1);
}

const served = Buffer.from(await answer.arrayBuffer());
if (served.equals(local)) {
    console.log(`published: ${name}@${version} is online and identical, ${served.length} bytes`);
    process.exit(0);
}

console.error(`${name}@${version} IS ALREADY ONLINE, AND IT IS NOT THIS FILE.`);
console.error(`  online : ${digest(served)}  ${served.length} bytes`);
console.error(`  here   : ${digest(local)}  ${local.length} bytes`);
console.error('');
console.error('A registry does not take a version twice, so rebuilding changes');
console.error('nothing: the digest published from here would describe bytes the');
console.error('CDN will never serve, and every pinned tag would be refused in');
console.error('silence. Bump the version.');
process.exit(1);
