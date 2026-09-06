/* THE INSTALLER IS SERVED FROM TWO PLACES, AND THEY MUST BE ONE FILE.
 *
 * The install page offers two routes to the same file: a `curl` line pointing
 * at the repository, and a download link pointing at this site -- because a
 * cross-origin `download` attribute is ignored by every browser, so the only
 * way to hand somebody a FILE rather than a page of PHP source is to serve it
 * from the same origin.
 *
 * That means a copy, and a copy is how the menus of this site diverged. So it
 * is compared, byte for byte, on every run. There is no tolerance and no
 * "close enough": an installer that differs from the one the curl line fetches
 * is an installer nobody has tested, handed to somebody standing up a server.
 *
 * Fix, when this fails:
 *
 *     cp server/annotepage-install.php docs/annotepage-install.php
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SOURCE = 'server/annotepage-install.php';
const SERVED = 'docs/annotepage-install.php';

if (!existsSync(SERVED)) {
    console.error(`${SERVED} is missing.`);
    console.error('The install page links to it: without it the download is a 404.');
    console.error(`  cp ${SOURCE} ${SERVED}`);
    process.exit(1);
}

const source = readFileSync(SOURCE);
const served = readFileSync(SERVED);
const digest = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

if (!source.equals(served)) {
    console.error(`${SERVED} differs from ${SOURCE}.`);
    console.error(`  ${SOURCE}  ${source.length} bytes, sha256 ${digest(source)}`);
    console.error(`  ${SERVED}  ${served.length} bytes, sha256 ${digest(served)}`);
    console.error('The site would hand out an installer nobody tested.');
    console.error(`  cp ${SOURCE} ${SERVED}`);
    process.exit(1);
}

console.log(`installer: one file, served from two places, ${source.length} bytes, identical`);
