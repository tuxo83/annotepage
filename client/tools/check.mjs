/* ============================================================================
   check.mjs -- THE VECTORS OF THE FORMAT, CHECKED AT EVERY BUILD.

   This is not an interface test suite: nothing here touches the DOM. We check
   the only part of the client that ANOTHER implementation has to reproduce
   bit for bit -- the derivations, the blind index, the envelope. The PHP
   server and the MCP package can copy the vectors below to make sure they are
   talking about the same format.

   The crypto sections are loaded AS THEY ARE from src/: there is no second
   implementation to maintain, hence no second implementation to diverge.

   The two expected values below were cross-checked against a second
   implementation of HKDF-SHA-256 written by hand from RFC 5869, and not
   copied from the output of the code under test: without that cross-check, a
   test that freezes its own mistake passes for ever. That is how we check, in
   particular, that the salt is the IKM and "annotepage/1" the salt, and not
   the other way round -- both "work", only one is the format.

   No dependency. "node tools/check.mjs".
   ============================================================================ */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

const read = (name) => readFileSync(join(SRC, name), 'utf8');

/* The same assembly as the build, cut down to the two sections that depend
   on no DOM. "window" is cut down to what those sections read: if one of them
   ever starts touching the document, this file falls over, and that is the
   point. */
const window = { crypto: webcrypto };
const code = [
    read('10-utils.js'),
    read('20-crypto.js'),
    'return { b64url, fromB64url, generateSalt, saltFromText, derive,',
    '         indexOfPath, seal, open, compact };'
].join('\n');

/* The same values the build injects, and for the same reason: these sections
   do not declare them, they receive them. */
const FORMAT = 2;
const TOOL_VERSION = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version;
const SITE_VERSION = '';
const module = new Function('window', 'FORMAT', 'TOOL_VERSION', 'SITE_VERSION', code)(
    window, FORMAT, TOOL_VERSION, SITE_VERSION);

let failures = 0;
const check = (name, got, expected) => {
    const ok = got === expected;
    if (!ok) failures += 1;
    process.stdout.write((ok ? '  ok   ' : '  FAIL ') + name + '\n');
    if (!ok) {
        process.stdout.write('        got      : ' + got + '\n');
        process.stdout.write('        expected : ' + expected + '\n');
    }
};

/* The salt of the vector: bytes 0 to 31, in order. Chosen so that another
   implementation can reproduce it without copying a string. */
const vectorBytes = new Uint8Array(32);
for (let i = 0; i < 32; i += 1) vectorBytes[i] = i;
const VECTOR_SALT = module.b64url(vectorBytes);

const main = async () => {
    process.stdout.write('base64url\n');
    check('salt of the vector (43 characters)', VECTOR_SALT,
        'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
    check('round trip', module.b64url(module.fromB64url(VECTOR_SALT)), VECTOR_SALT);
    check('a malformed salt is refused', module.saltFromText(VECTOR_SALT + 'X'), null);
    check('a spaced salt is refused', module.saltFromText('AAEC AwQF'), null);

    process.stdout.write('HKDF-SHA-256 derivations, salt "annotepage/1"\n');
    const keys = await module.derive(vectorBytes);
    check('project id (22 characters)', keys.id, 'Up4tgMk-kJmJl1MUMuC5yA');

    process.stdout.write('blind index HMAC-SHA-256\n');
    check('index of /fr/contact.html',
        await module.indexOfPath(keys.indexKey, '/fr/contact.html'),
        'q4DHRWupkdur4kJu11zQWA');
    check('case matters', await module.indexOfPath(keys.indexKey, '/Contact')
        === await module.indexOfPath(keys.indexKey, '/contact'), false);
    check('the trailing slash matters', await module.indexOfPath(keys.indexKey, '/a/')
        === await module.indexOfPath(keys.indexKey, '/a'), false);

    process.stdout.write('AES-256-GCM envelope\n');
    const project = keys.id;
    const index = await module.indexOfPath(keys.indexKey, '/fr/contact.html');
    const note = { page: '/fr/contact.html', author: 'Camille', text: 'The link points elsewhere.', empty: '' };

    const envelope = await module.seal(keys.encryptionKey, project, index, 'note', note);
    check('format prefix', envelope.slice(0, 4), 'ap2.');
    check('nonce length', envelope.split('.')[1].length, 16);

    const opened = await module.open(keys.encryptionKey, project, index, 'note', envelope);
    check('text round trip', opened.text, note.text);
    check('an empty field is ABSENT', Object.prototype.hasOwnProperty.call(opened, 'empty'), false);

    const second = await module.seal(keys.encryptionKey, project, index, 'note', note);
    check('two encryptions, two nonces', envelope === second, false);

    const reason = async (promise) => {
        try {
            await promise;
            return 'none';
        } catch (e) {
            return e && e.reason ? e.reason : 'unexpected';
        }
    };
    check('note moved to another page: refused',
        await reason(module.open(keys.encryptionKey, project, 'AAAAAAAAAAAAAAAAAAAAAA', 'note', envelope)),
        'unreadable');
    check('role swapped: refused',
        await reason(module.open(keys.encryptionKey, project, index, 'resolution', envelope)),
        'unreadable');
    check('another project: refused',
        await reason(module.open(keys.encryptionKey, 'AAAAAAAAAAAAAAAAAAAAAA', index, 'note', envelope)),
        'unreadable');
    check('a more recent format: FLAT refusal, and distinct',
        await reason(module.open(keys.encryptionKey, project, index, 'note', 'ap9' + envelope.slice(3))),
        'newer');
    check('a nonce of another length: refused',
        await reason(module.open(keys.encryptionKey, project, index, 'note', 'ap2.AAAA.' + envelope.split('.')[2])),
        'unreadable');

    process.stdout.write(failures ? '\n' + failures + ' failure(s)\n' : '\neverything conforms\n');
    process.exit(failures ? 1 : 0);
};

main().catch((e) => {
    process.stdout.write('error: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exit(1);
});
