#!/usr/bin/env node
/* check.mjs — THE CHECKS, WITH NO NETWORK AND NO DATABASE.
 *
 * What is checked here is what, if it were wrong, would be wrong IN SILENCE: a
 * derivation that does not return the same thing as in the browser, an
 * envelope that opens under an AAD which is not its own, an export parser that
 * cuts a note in two at the first empty paragraph. None of those three
 * failures throws; all three return wrong or lost notes.
 *
 * THE DERIVATIONS ARE COMPARED WITH A SECOND IMPLEMENTATION, written here by
 * hand with createHmac, and not with a copied value. A copied value attests
 * that the code does today what it did yesterday; a second implementation
 * attests that it does what the RFC says — and that is exactly the trap
 * FORMAT.md section 1.3 names, where our salt is taken for HKDF's "salt"
 * instead of the input keying material. Both versions work, both encrypt, and
 * neither can read the other.
 */

import { createHmac } from 'node:crypto';

import { b64url, fromB64url, normalisedLines, indent, safeValue } from '../src/format.mjs';
import { derive, saltFromText, seal, open, indexOfPath, normalisedPath } from '../src/crypto.mjs';
import { readExport, writeExport } from '../src/text-export.mjs';
import { projectForCall, absentConfiguration, loadConfiguration, saveProject, chooseProject,
         siteToOrigin, ConfigError } from '../src/config.mjs';
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';

let passed = 0;
const failures = [];

const check = async (name, body) => {
    try {
        await body();
        passed += 1;
    } catch (e) {
        failures.push(name + '\n    ' + ((e && e.message) || String(e)).replace(/\n/g, '\n    '));
    }
};

const equal = (got, expected, what) => {
    if (got !== expected) {
        throw new Error((what || 'value') + '\n  expected : ' + JSON.stringify(expected)
            + '\n  got      : ' + JSON.stringify(got));
    }
};

const truthy = (condition, what) => {
    if (!condition) throw new Error(what || 'false condition');
};

/* -- HKDF-SHA-256 (RFC 5869), written by hand ---------------------------- */

const hkdf = (ikm, salt, info, length) => {
    const prk = createHmac('sha256', salt).update(ikm).digest();
    let previous = Buffer.alloc(0);
    let out = Buffer.alloc(0);
    for (let n = 1; out.length < length; n += 1) {
        previous = createHmac('sha256', prk)
            .update(Buffer.concat([previous, Buffer.from(info), Buffer.from([n])]))
            .digest();
        out = Buffer.concat([out, previous]);
    }
    return out.subarray(0, length);
};

const SALT_TEXT = b64url(new Uint8Array(32).map((v, i) => (i * 7 + 3) & 0xff));

/* -- 1. The groundwork --------------------------------------------------- */

await check('base64url: round trip', () => {
    for (let n = 0; n < 40; n += 1) {
        const bytes = new Uint8Array(n).map((v, i) => (i * 31 + n) & 0xff);
        const decoded = fromB64url(b64url(bytes));
        truthy(decoded !== null, 'decoding of ' + n + ' bytes');
        equal(Buffer.from(decoded).toString('hex'), Buffer.from(bytes).toString('hex'),
            'round trip on ' + n + ' bytes');
    }
});

await check('base64url: refusal of what is not base64url', () => {
    equal(fromB64url('abc+def'), null, '+ is not base64url');
    equal(fromB64url('abc/def'), null, '/ is not base64url');
    equal(fromB64url('ab=='), null, 'padding is not accepted');
    equal(fromB64url('a'), null, 'a remainder of 1 character does not exist');
    equal(fromB64url('ab cd'), null, 'a space is not base64url');
});

await check('salt: the shape is required, never cleaned', () => {
    equal(saltFromText('too-short'), null, 'a short salt is refused');
    equal(saltFromText(SALT_TEXT + 'x'), null, 'a long salt is refused');
    equal(saltFromText(SALT_TEXT.slice(0, 42) + '+'), null, 'alphabet');
    truthy(saltFromText(' ' + SALT_TEXT + ' ') !== null, 'edge spaces are allowed');
    truthy(saltFromText(SALT_TEXT).length === 32, '32 bytes');
});

/* -- 2. The three derivations -------------------------------------------- */

await check('derivation: identical to a second implementation of HKDF', async () => {
    const bytes = saltFromText(SALT_TEXT);
    const keys = await derive(bytes);

    const expectedId = hkdf(Buffer.from(bytes), Buffer.from('annotepage/1'),
                            Buffer.from('id'), 32);
    equal(keys.id, b64url(new Uint8Array(expectedId).subarray(0, 16)), 'project id');
    equal(keys.id.length, 22, 'length of the id');

    /* The trap of FORMAT.md section 1.3, checked rather than described:
       swapping the salt and the fixed string gives a DIFFERENT id. Both
       systems work; neither can read the other. */
    const swapped = hkdf(Buffer.from('annotepage/1'), Buffer.from(bytes),
                         Buffer.from('id'), 32);
    truthy(b64url(new Uint8Array(swapped).subarray(0, 16)) !== keys.id,
        'our salt and HKDF salt are not interchangeable');
});

await check('page index: HMAC of the "index" subkey', async () => {
    const bytes = saltFromText(SALT_TEXT);
    const keys = await derive(bytes);
    const indexKey = hkdf(Buffer.from(bytes), Buffer.from('annotepage/1'),
                          Buffer.from('index'), 32);
    const expected = createHmac('sha256', indexKey).update('/en/contact.html').digest();
    equal(await indexOfPath(keys.indexKey, '/en/contact.html'),
        b64url(new Uint8Array(expected).subarray(0, 16)), 'page_index');
});

await check('page index: no normalisation beyond format 1', async () => {
    const keys = await derive(saltFromText(SALT_TEXT));
    const of = (c) => indexOfPath(keys.indexKey, normalisedPath(c));
    truthy(await of('/a') !== await of('/a/'), '"/a" and "/a/" are two pages');
    truthy(await of('/Contact') !== await of('/contact'), 'case matters');
    equal(normalisedPath('//en//x'), '/en//x', 'a single LEADING slash, no more');
    equal(normalisedPath('no-slash'), '/no-slash', 'leading slash added');
    equal(normalisedPath('/a/../b'), '/a/b', '".." segments are stripped');
});

/* -- 3. The envelope ----------------------------------------------------- */

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const INDEX = '9dLpEqKf2Zt8ArC1vXbGhQ';

await check('envelope: round trip and serialised shape', async () => {
    const keys = await derive(saltFromText(SALT_TEXT));
    const object = { author: 'Camille', text: 'The link still points elsewhere.', empty: '' };
    const envelope = await seal(keys.encryptionKey, PROJECT, INDEX, 'note', object);

    const parts = envelope.split('.');
    equal(parts.length, 3, 'three fields separated by dots');
    equal(parts[0], 'ap2', 'the prefix IS the format number');
    equal(parts[1].length, 16, 'nonce of 12 bytes');
    truthy(/^[A-Za-z0-9_.-]+$/.test(envelope), 'ASCII, base64url, no padding');

    const read = await open(keys.encryptionKey, PROJECT, INDEX, 'note', envelope);
    equal(read.author, 'Camille', 'author');
    equal(read.text, object.text, 'text');
    equal(Object.prototype.hasOwnProperty.call(read, 'empty'), false,
        'an empty field is ABSENT, it is not written as ""');
});

await check('envelope: two sealings give two nonces', async () => {
    const keys = await derive(saltFromText(SALT_TEXT));
    const a = await seal(keys.encryptionKey, PROJECT, INDEX, 'note', { text: 'x' });
    const b = await seal(keys.encryptionKey, PROJECT, INDEX, 'note', { text: 'x' });
    truthy(a.split('.')[1] !== b.split('.')[1], 'nonce drawn at every encryption');
    truthy(a !== b, 'two identical plaintexts do not look alike');
});

await check('envelope: the AAD refuses a moved note', async () => {
    const keys = await derive(saltFromText(SALT_TEXT));
    const envelope = await seal(keys.encryptionKey, PROJECT, INDEX, 'note', { text: 'x' });

    const refuses = async (what, promise) => {
        try {
            await promise;
        } catch (e) {
            equal(e.reason, 'unreadable', what);
            return;
        }
        throw new Error(what + ': decryption should have failed');
    };

    await refuses('another page',
        open(keys.encryptionKey, PROJECT, 'OTHER_INDEX_AAAAAAAAAA', 'note', envelope));
    await refuses('another project',
        open(keys.encryptionKey, 'OTHERPROJECTAAAAAAAAAA', INDEX, 'note', envelope));
    await refuses('another role',
        open(keys.encryptionKey, PROJECT, INDEX, 'resolution', envelope));

    const other = await derive(saltFromText(b64url(new Uint8Array(32).fill(9))));
    await refuses('another salt', open(other.encryptionKey, PROJECT, INDEX, 'note', envelope));
});

await check('envelope: a newer format is a FLAT refusal', async () => {
    const keys = await derive(saltFromText(SALT_TEXT));
    const envelope = await seal(keys.encryptionKey, PROJECT, INDEX, 'note', { text: 'x' });
    try {
        await open(keys.encryptionKey, PROJECT, INDEX, 'note',
                   envelope.replace(/^ap2\./, 'ap3.'));
    } catch (e) {
        equal(e.reason, 'newer', 'one does not guess at cryptography');
        return;
    }
    throw new Error('an ap3 envelope should have been refused');
});

await check('envelope: invalid shapes', async () => {
    const keys = await derive(saltFromText(SALT_TEXT));
    const bad = ['', 'x', 'ap2.too-short.abcd', 'ap2..', 'ap.a.b',
                 'ap2.AAAAAAAAAAAAAAAA.@@@'];
    for (const shape of bad) {
        try {
            await open(keys.encryptionKey, PROJECT, INDEX, 'note', shape);
        } catch (e) {
            equal(e.reason, 'unreadable', 'shape ' + JSON.stringify(shape));
            continue;
        }
        throw new Error('shape wrongly accepted: ' + JSON.stringify(shape));
    }
});

/* -- 4. The grammar of the four margins ---------------------------------- */

/* This export is written BY HAND, byte for byte as the PHP emits it.
   Producing it with our own writer would only prove that we agree with
   ourselves. */
const SERVER_EXPORT = [
    'tool annotepage',
    'format 2',
    'version 2.0.0',
    'project ' + PROJECT,
    'encryption no',
    'export 2026-08-31T09:14:22+00:00',
    'notes 3',
    '',
    'note 4',
    'page /en/contact.html',
    'page-index ' + INDEX,
    'element main:nth-of-type(1) > h2:nth-of-type(3)',
    'excerpt Contact us',
    'author Camille',
    'date 2026-08-30T14:02:11+00:00',
    'version 1.4.12',
    'environment staging',
    'viewport 1280x800',
    'status open',
    'text',
    '    The link still points at the old form.',
    '',
    '    Second paragraph, after an empty line.',
    '      quoted indented code',
    '',
    '  reply 7',
    '  to note 4',
    '  author Dominique',
    '  date 2026-08-30T15:00:00+00:00',
    '  status open',
    '  text',
    '      Seen, I am looking at it.',
    '',
    'note 9',
    'page /en/index.html',
    'page-index OTHERINDEXAAAAAAAAAAAA',
    'author Camille',
    'date 2026-08-30T16:00:00+00:00',
    'resolved 2026-08-31T08:00:00+00:00 by Dominique in 1.4.13',
    'text',
    '    The heading overflows at 320 pixels.',
    '',
].join('\n');

await check('export: parsing a document written by the server', () => {
    const read = readExport(SERVER_EXPORT);
    equal(read.header.tool, 'annotepage', 'header tool');
    equal(read.header.format, '2', 'header format');
    equal(read.header.notes, '3', '"notes 3" is not read as the key "note"');
    equal(read.header.project, PROJECT, 'header project');
    equal(read.notes.length, 2, 'two parent notes');

    const note = read.notes[0];
    equal(note.id, 4, 'number');
    equal(note.page, '/en/contact.html', 'page');
    equal(note.page_index, INDEX, 'page-index');
    equal(note.selector, 'main:nth-of-type(1) > h2:nth-of-type(3)', 'element');
    equal(note.excerpt, 'Contact us', 'excerpt');
    equal(note.version, '1.4.12', 'version OF THE NOTE, not the header one');
    equal(note.resolved_at, null, 'status open');
    equal(note.replies.length, 1, 'one reply');
    equal(note.replies[0].id, 7, 'number of the reply');
    equal(note.replies[0].reply_to, 4, '"to note" is two words');
    equal(note.replies[0].text, 'Seen, I am looking at it.', 'text of the reply');

    equal(read.notes[1].resolved_at, '2026-08-31T08:00:00+00:00', 'date of the fix');
    equal(read.notes[1].resolved_by, 'Dominique', 'fixer');
    equal(read.notes[1].resolved_version, '1.4.13', 'version of the fix');
});

await check('export: an empty line inside a text does not cut the note', () => {
    const note = readExport(SERVER_EXPORT).notes[0];
    equal(note.text,
        'The link still points at the old form.\n'
        + '\n'
        + 'Second paragraph, after an empty line.\n'
        + '  quoted indented code',
        'the empty paragraph and the indentation of the code block are kept');
});

await check('export: an unknown key and a newer format still read', () => {
    const newer = SERVER_EXPORT
        .replace('format 2', 'format 3')
        .replace('note 4\n', 'note 4\ntomorrows-key some value\n');
    const read = readExport(newer);
    equal(read.notes.length, 2, 'a newer export reads anyway');
    equal(read.notes[0].page, '/en/contact.html', 'the unknown key is ignored in silence');
});

await check('export: the key is the longest known prefix', () => {
    /* "page" IS a prefix of "page-index": the one place where the list of keys
       is not prefix-free. A reader that scans in declaration order and takes
       the first match reads "page-index" lines as "page" lines and silently
       loses the index. */
    const read = readExport([
        'notes 1', '',
        'note 1',
        'page /en/x.html',
        'page-index ' + INDEX,
        'resolution-payload ap2.AAAAAAAAAAAAAAAA.BBBB',
        'payload ap2.CCCCCCCCCCCCCCCC.DDDD',
        'status open', 'text', '    x', '',
    ].join('\n'));
    equal(read.notes[0].page, '/en/x.html', '"page"');
    equal(read.notes[0].page_index, INDEX,
        '"page-index", and not "page" with the value "-index ..."');
    equal(read.notes[0].payload, 'ap2.CCCCCCCCCCCCCCCC.DDDD', '"payload"');
    equal(read.notes[0].resolution_payload, 'ap2.AAAAAAAAAAAAAAAA.BBBB',
        '"resolution-payload"');
});

await check('export: the footer is not a field of the last note', () => {
    const read = readExport(SERVER_EXPORT + '\nskipped 2\nskipped-reason unknown mode\n');
    equal(read.footer.skipped, '2', 'count of skipped lines');
    equal(read.notes.length, 2, 'no note manufactured by the footer');
});

/* -- 5. Writing, and the round trip -------------------------------------- */

await check('export: writing then reading back gives the same notes', () => {
    const read = readExport(SERVER_EXPORT);
    const written = writeExport(
        { format: 2, version: '2.0.0', project: PROJECT, encryption: 'no' },
        read.notes, {});
    const again = readExport(written);

    equal(again.notes.length, read.notes.length, 'same number of notes');
    for (let i = 0; i < read.notes.length; i += 1) {
        for (const key of ['id', 'page', 'page_index', 'selector', 'excerpt', 'author',
                           'text', 'created_at', 'version', 'environment', 'viewport',
                           'resolved_at', 'resolved_by', 'resolved_version']) {
            equal(again.notes[i][key], read.notes[i][key], 'note ' + i + ' / ' + key);
        }
        equal(again.notes[i].replies.length, read.notes[i].replies.length,
            'note ' + i + ' / number of replies');
    }
    equal(again.notes[0].replies[0].text, 'Seen, I am looking at it.', 'text of the reply');
});

await check('export: one note cannot manufacture another', () => {
    /* The case that motivated the rule. A remark that contains, itself, what
       looks like a structure line — including behind a U+2028, which many
       readers count as an end of line and which is NOT a control character. */
    const trap = 'Look at this:\n\nnote 999\npage /forbidden\nauthor Fake\ntext\n'
        + 'line\u2028note 998\npage /also-forbidden';
    const written = writeExport({ format: 2, project: PROJECT }, [{
        id: 1, reply_to: null, mode: 'plain', page: '/x', page_index: '', selector: '',
        excerpt: '', author: 'Camille', text: trap, created_at: '2026-01-01T00:00:00+00:00',
        version: '', environment: '', viewport: '', resolved_at: null, resolved_by: '',
        resolved_version: '', payload: '', resolution_payload: '', replies: [],
    }], {});
    const again = readExport(written);
    equal(again.notes.length, 1, 'one single note, despite the trap');
    equal(again.notes[0].id, 1, 'and it is the right one');
    truthy(again.notes[0].text.indexOf('note 999') !== -1,
        'the text of the trap is kept, it is simply indented');
    truthy(again.notes[0].text.indexOf('\u2028') === -1,
        'U+2028 is brought back to a plain line feed');
});

await check('values: a line ending does not cross a "key value" line', () => {
    equal(safeValue('Camille\nnote 999'), 'Camille note 999', 'line feed replaced');
    equal(safeValue('a\u0085b'), 'a b', 'U+0085');
    equal(normalisedLines('a\u0000b'), 'ab', 'control characters are stripped');
    equal(indent('a\n\nb', '    '), '    a\n\n    b\n',
        'an empty line stays EMPTY, with no trailing spaces');
});

/* -- 6. The end-to-end path ---------------------------------------------- */

await check('end to end: an encrypted export reads back filled in', async () => {
    const keys = await derive(saltFromText(SALT_TEXT));
    const index = await indexOfPath(keys.indexKey, '/en/contact.html');

    const payload = await seal(keys.encryptionKey, keys.id, index, 'note', {
        page: '/en/contact.html', selector: 'h2', excerpt: 'Contact us',
        author: 'Camille', text: 'The link points elsewhere.', version: '1.4.12',
    });
    const resolution = await seal(keys.encryptionKey, keys.id, index,
                                  'resolution', { by: 'Dominique', version: '1.4.13' });

    // What the server would emit: the structure, plus the envelopes.
    const structural = [
        'tool annotepage', 'format 2', 'version 2.0.0',
        'project ' + keys.id, 'encryption yes',
        'export 2026-08-31T09:14:22+00:00', 'notes 1', '',
        'note 4', 'page-index ' + index, 'mode encrypted',
        'date 2026-08-30T14:02:11+00:00',
        'resolved 2026-08-31T08:00:00+00:00',
        'payload ' + payload,
        'resolution-payload ' + resolution,
        '',
    ].join('\n');

    const read = readExport(structural);
    equal(read.notes.length, 1, 'one note');
    equal(read.notes[0].mode, 'encrypted', 'mode');
    equal(read.notes[0].text, '', 'the server emits no "text" line');
    equal(read.notes[0].resolved_at, '2026-08-31T08:00:00+00:00',
        'the date of the fix is in the clear');
    equal(read.notes[0].resolved_by, '', 'the fixer name is not');

    const object = await open(keys.encryptionKey, keys.id, read.notes[0].page_index,
                              'note', read.notes[0].payload);
    equal(object.text, 'The link points elsewhere.', 'decrypted text');
    equal(object.page, '/en/contact.html', 'the page was in the envelope too');

    const end = await open(keys.encryptionKey, keys.id, read.notes[0].page_index,
                           'resolution', read.notes[0].resolution_payload);
    equal(end.by, 'Dominique', 'decrypted fixer');
});

await check('end to end: the decrypted path gives back the announced index', async () => {
    /* This is the check notes.mjs makes before writing a reply: the path that
       comes out of the envelope must give back the index the note is filed
       under. Without it, a reply could be sealed under an index whispered by
       the server, and nobody could read it. */
    const keys = await derive(saltFromText(SALT_TEXT));
    const path = '/en/contact.html';
    const index = await indexOfPath(keys.indexKey, path);
    const payload = await seal(keys.encryptionKey, keys.id, index, 'note',
                               { page: path, text: 'x' });
    const object = await open(keys.encryptionKey, keys.id, index, 'note', payload);
    equal(await indexOfPath(keys.indexKey, normalisedPath(object.page)), index,
        'the recomputed index is the one the note is filed under');
});

/* -- A project carried by the call itself -------------------------------- */

/* The configuration that does not exist: the state an MCP server is in when
   no file was found anywhere. Every check below runs against it, which is the
   point — this path must not need one. */
const NO_FILE = absentConfiguration(new ConfigError('No configuration found. Looked '
    + 'for, in order:\n  /nowhere/.annotepage.json'));

const refused = async (what, args, ...pieces) => {
    let message = null;
    try {
        await projectForCall(NO_FILE, args);
    } catch (e) {
        message = e.message;
    }
    truthy(message !== null, what + ': it was accepted');
    for (const piece of pieces) {
        truthy(message.indexOf(piece) !== -1,
            what + '\n  looked for : ' + JSON.stringify(piece)
            + '\n  in         :\n' + message.replace(/^/gm, '      '));
    }
};

await check('call: api + key build a project whose id is DERIVED', async () => {
    const project = await projectForCall(NO_FILE,
        { api: 'https://example.com/api.php', key: SALT_TEXT });
    const keys = await derive(saltFromText(SALT_TEXT));
    equal(project.id, keys.id, 'the id is the one the key derives');
    equal(project.api, 'https://example.com/api.php', 'the address of the call');
    equal(project.mode, 'encrypted', 'a key means encrypted');
    equal(project.read_only, false, 'writing is allowed');
    truthy(project.keys !== null, 'the three derivations are there');
    truthy(project.author !== '', 'and a name to sign with, or writing is refused');
});

await check('call: half a project is a named refusal, never a fallback', async () => {
    await refused('api alone', { api: 'https://example.com/api.php' },
        '"api" without "key"', 'no falling back to the configuration file');
    await refused('key alone', { key: SALT_TEXT },
        '"key" without "api"', 'data-server and data-key');
});

await check('call: a key and a project name together, no winner picked', async () => {
    await refused('key + project', { api: 'https://example.com/api.php',
        key: SALT_TEXT, project: 'review' },
        'we do not pick a winner', 'nothing was written', 'derives the project id');
});

await check('call: a malformed key is refused with its shape, and not echoed', async () => {
    await refused('too short', { api: 'https://example.com/api.php', key: 'abc' },
        '43 characters', 'A-Z a-z 0-9 - _', 'Received: 3 characters');
    await refused('a space inside', { api: 'https://example.com/api.php',
        key: SALT_TEXT.slice(0, 20) + ' ' + SALT_TEXT.slice(21) },
        '43 characters');
    await refused('an http-less address', { api: 'example.com/api.php', key: SALT_TEXT },
        'must start with http:// or https://');
});

await check('call: an origin is canonicalised the way the server does', async () => {
    const of = async (origin) => (await projectForCall(NO_FILE,
        { api: 'https://example.com/api.php', key: SALT_TEXT, origin })).origin;
    equal(await of('https://staging.example.com'), 'https://staging.example.com',
        'already canonical');
    equal(await of('HTTPS://Staging.Example.COM'), 'https://staging.example.com',
        'lowercased, as ap_normalise_origin does');
    equal(await of('https://staging.example.com:443'), 'https://staging.example.com',
        'the default port is dropped');
    equal(await of('http://localhost:8080'), 'http://localhost:8080',
        'a port that is not the default is kept');
    equal(await of(undefined), '', 'none given, none announced, none invented');
});

await check('call: what is not an origin is refused, never trimmed', async () => {
    for (const bad of ['https://example.com/prod', 'https://example.com?x=1',
                       'https://example.com#a', 'example.com', 'ftp://example.com',
                       'https://user:secret@example.com']) {
        await refused('origin ' + bad, { api: 'https://example.com/api.php',
            key: SALT_TEXT, origin: bad },
            'is not an origin: ' + bad, 'no path, no query string');
    }
});

await check('call: an origin alone names no project', async () => {
    await refused('origin alone', { origin: 'https://example.com' },
        '"origin" without "api" and "key"', 'it does not name one');
    await refused('origin + project', { api: 'https://example.com/api.php',
        key: SALT_TEXT, origin: 'https://example.com', project: 'review' },
        '"api", "key" and "origin"', 'we do not pick a winner');
});

await check('call: with neither, the missing file speaks at call time', async () => {
    await refused('nothing given', {}, 'No configuration found');
    await refused('a project name given', { project: 'review' }, 'No configuration found');
});

/* -- THE KEY GIVEN IN THE COMMAND THAT PLUGS THE SERVER IN ---------------
 *
 * What would be wrong in silence here is the ORDER: a variable typed by the
 * operator today, quietly losing to a file written some other week, reads
 * another project's notes and says nothing. So the order is checked, and so is
 * the warning that says which one answered.
 */

const withEnvironment = async (variables, body) => {
    const saved = {};
    /* A machine running these checks may well have a real configuration in
       ~/.config; we point the file search at somewhere that does not exist so
       that what is measured is our code, not the tester's home directory. */
    const all = { ANNOTEPAGE_CONFIG: joinPath(tmpdir(), 'annotepage-absent-' + process.pid + '.json'), ...variables };
    for (const name of ['ANNOTEPAGE_CONFIG', 'ANNOTEPAGE_API', 'ANNOTEPAGE_KEY', 'ANNOTEPAGE_ID',
                        'ANNOTEPAGE_MODE', 'ANNOTEPAGE_AUTHOR', 'ANNOTEPAGE_ORIGIN',
                        'ANNOTEPAGE_PROJECT', 'ANNOTEPAGE_READ_ONLY']) {
        saved[name] = process.env[name];
        if (all[name] === undefined) delete process.env[name];
        else process.env[name] = all[name];
    }
    try {
        return await body();
    } finally {
        for (const name of Object.keys(saved)) {
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
        }
    }
};

/* A file, written where nothing else looks, read by the real loader. */
const loadConfigurationOf = async (object) => {
    const directory = mkdtempSync(joinPath(tmpdir(), 'annotepage-check-'));
    const file = joinPath(directory, 'annotepage.json');
    writeFileSync(file, JSON.stringify(object));
    return withEnvironment({ ANNOTEPAGE_CONFIG: file }, () => loadConfiguration());
};

await check('environment: the key given in the command is a whole project', async () => {
    const configuration = await withEnvironment({
        ANNOTEPAGE_API: 'https://staging.example.com/api.php',
        ANNOTEPAGE_KEY: SALT_TEXT,
        ANNOTEPAGE_AUTHOR: 'Assistant',
        ANNOTEPAGE_ORIGIN: 'https://staging.example.com/',
    }, () => loadConfiguration());
    equal(configuration.projects.size, 1, 'one project');
    const project = configuration.projects.get('project');
    equal(configuration.defaultProject, 'project', 'and it is the default one');
    equal(project.api, 'https://staging.example.com/api.php', 'the address');
    equal(project.author, 'Assistant', 'the signature');
    equal(project.origin, 'https://staging.example.com', 'the origin, trailing slash removed');
    equal(project.mode, 'encrypted', 'encrypted unless told otherwise');
    equal(project.read_only, false, 'and it may write');
    equal(project.id, (await derive(saltFromText(SALT_TEXT))).id, 'the id derived from the key');
    truthy(!JSON.stringify(configuration).includes(SALT_TEXT), 'the key is nowhere in what we return');
});

await check('environment: a key with no address arms nothing', async () => {
    /* Alone it would silently borrow the address of a file written for another
       project, and read that one instead. */
    let message = '';
    await withEnvironment({ ANNOTEPAGE_KEY: SALT_TEXT }, async () => {
        try { await loadConfiguration(); } catch (e) { message = e.message; }
    });
    truthy(message.includes('No configuration found'), 'the file is what answers, and there is none');
    truthy(!message.includes(SALT_TEXT), 'and the key is not printed back');
});

await check('environment: it wins over a file, and says so', async () => {
    const directory = mkdtempSync(joinPath(tmpdir(), 'annotepage-check-'));
    const file = joinPath(directory, 'annotepage.json');
    writeFileSync(file, JSON.stringify({
        projects: { other: { api: 'https://elsewhere.example.com/api.php', key: SALT_TEXT } },
    }));
    const configuration = await withEnvironment({
        ANNOTEPAGE_CONFIG: file,
        ANNOTEPAGE_API: 'https://staging.example.com/api.php',
        ANNOTEPAGE_KEY: SALT_TEXT,
    }, () => loadConfiguration());
    equal(configuration.projects.get('project').api, 'https://staging.example.com/api.php',
        'the environment answered');
    truthy(!configuration.projects.has('other'), 'and the file was not merged in');
    truthy(configuration.warnings.some((w) => w.includes(file) && w.includes('was NOT read')),
        'a warning names the file that stayed shut');
});

await check('environment: "key" and "salt" are the same field, disagreeing is refused', async () => {
    const other = b64url(new Uint8Array(32).map((v, i) => (i * 11 + 5) & 0xff));
    let message = '';
    try {
        await loadConfigurationOf({ projects: { review: {
            api: 'https://staging.example.com/api.php', key: SALT_TEXT, salt: other } } });
    } catch (e) { message = e.message; }
    truthy(message.includes('BOTH "key" and "salt"'), 'refused rather than arbitrated');
    /* And the old name alone still reads: a file written last month works. */
    const old = await loadConfigurationOf({ projects: { review: {
        api: 'https://staging.example.com/api.php', salt: SALT_TEXT } } });
    equal(old.projects.get('review').id, (await derive(saltFromText(SALT_TEXT))).id,
        '"salt" alone is still understood');
});

await check('environment: a malformed key is refused by the word the reader knows', async () => {
    let message = '';
    await withEnvironment({
        ANNOTEPAGE_API: 'https://staging.example.com/api.php',
        ANNOTEPAGE_KEY: 'obviously not a key',
    }, async () => {
        try { await loadConfiguration(); } catch (e) { message = e.message; }
    });
    truthy(message.includes('The key of'), 'it says key, not salt');
    truthy(!message.includes('salt'), 'the internal name is not shown to anybody');
});

await check('environment: only "true" stops the writing', async () => {
    for (const [value, expected] of [['true', true], ['false', false], ['1', false], ['', false]]) {
        const configuration = await withEnvironment({
            ANNOTEPAGE_API: 'https://staging.example.com/api.php',
            ANNOTEPAGE_KEY: SALT_TEXT,
            ANNOTEPAGE_READ_ONLY: value,
        }, () => loadConfiguration());
        equal(configuration.projects.get('project').read_only, expected,
            'ANNOTEPAGE_READ_ONLY=' + JSON.stringify(value));
    }
});

/* -- WRITING A PROJECT DOWN FROM THE CONVERSATION -------------------------
 *
 * Somebody reviewing five sites cannot be asked to hand-write JSON five times.
 * What would be wrong in silence here: a second project quietly replacing the
 * first, a key overwritten so that the notes under it stop existing as far as
 * anybody can tell, and a file written correctly that nothing reads.
 */

const KEY_TWO = b64url(new Uint8Array(32).map((v, i) => (i * 11 + 5) & 0xff));

const emptyConfiguration = () => ({
    path: null, warnings: [], defaultProject: null, projects: new Map(), error: null,
});

const inADirectory = () => joinPath(
    mkdtempSync(joinPath(tmpdir(), 'annotepage-check-')), 'annotepage.json');

await check('save: a site becomes a project, named after itself', async () => {
    const file = inADirectory();
    const configuration = emptyConfiguration();
    const written = await withEnvironment({}, () => saveProject(configuration, {
        site: 'https://staging.example.com/guide?x=1',
        api: 'https://staging.example.com/notes/api.php',
        key: SALT_TEXT,
        path: file,
    }));
    equal(written.name, 'staging.example.com', 'the host is the name');
    equal(written.id, (await derive(saltFromText(SALT_TEXT))).id, 'the id it derives');
    equal(written.inUse, true, 'and it answers at once');

    const object = JSON.parse(readFileSync(file, 'utf8'));
    equal(object.default_project, 'staging.example.com', 'the only one is the default');
    equal(object.projects['staging.example.com'].origin, 'https://staging.example.com',
        'the origin a relay will want, path and query dropped');
    equal(object.projects['staging.example.com'].author, 'Assistant', 'a name to sign with');
    equal(statSync(file).mode & 0o777, 0o600, 'readable by nobody else');

    /* No restart: the object every tool holds is the one that changed. */
    equal(configuration.projects.size, 1, 'the running configuration has it');
    equal(chooseProject(configuration, 'staging.example.com').api,
        'https://staging.example.com/notes/api.php', 'and it is found by its site');
});

await check('save: a second site joins the first, it does not evict it', async () => {
    const file = inADirectory();
    const configuration = emptyConfiguration();
    await withEnvironment({}, async () => {
        await saveProject(configuration, { site: 'staging.example.com',
            api: 'https://staging.example.com/notes/api.php', key: SALT_TEXT, path: file });
        await saveProject(configuration, { site: 'shop.example.com',
            api: 'https://shop.example.com/notes/api.php', key: KEY_TWO,
            author: 'Reviewer', path: file });
    });
    equal(configuration.projects.size, 2, 'both are declared');
    equal(configuration.defaultProject, 'staging.example.com',
        'and the first stays the default: the second must be named');
    equal(chooseProject(configuration, 'https://shop.example.com/pricing').author,
        'Reviewer', 'a page address names its project');
});

await check('save: another key on the same name is refused, not arbitrated', async () => {
    const file = inADirectory();
    const configuration = emptyConfiguration();
    const first = { site: 'staging.example.com',
        api: 'https://staging.example.com/notes/api.php', key: SALT_TEXT, path: file };
    await withEnvironment({}, () => saveProject(configuration, first));

    let message = '';
    try {
        await withEnvironment({}, () => saveProject(configuration,
            { ...first, key: KEY_TWO }));
    } catch (e) { message = e.message; }
    truthy(message.includes('already declared'), 'refused');
    truthy(message.includes('nothing points at them any more'), 'and it says what it costs');
    equal(JSON.parse(readFileSync(file, 'utf8')).projects['staging.example.com'].key,
        SALT_TEXT, 'the file was not touched');

    /* Asked twice, it goes through: whoever passes "replace" has read why. */
    const again = await withEnvironment({}, () => saveProject(configuration,
        { ...first, key: KEY_TWO, replace: true }));
    equal(again.replaced, true, 'and it says it replaced something');
    equal(again.id, (await derive(saltFromText(KEY_TWO))).id, 'the new id');

    /* The same key twice is not a replacement and needs no permission: an
       assistant repeating a call must not have to ask for one. */
    const idempotent = await withEnvironment({}, () => saveProject(configuration,
        { ...first, key: KEY_TWO }));
    equal(idempotent.id, again.id, 'writing the same thing again is not a conflict');
});

await check('save: a key that is not a key writes nothing at all', async () => {
    const file = inADirectory();
    const configuration = emptyConfiguration();
    let message = '';
    try {
        await withEnvironment({}, () => saveProject(configuration, {
            site: 'staging.example.com', api: 'https://staging.example.com/api.php',
            key: 'not a key', path: file }));
    } catch (e) { message = e.message; }
    truthy(message.includes('Nothing was written'), 'and it says so');
    truthy(!message.includes('not a key'), 'without echoing what it was given');
    let readable = true;
    try { readFileSync(file, 'utf8'); } catch (e) { readable = false; }
    equal(readable, false, 'no file was created');
    equal(configuration.projects.size, 0, 'and nothing entered the running configuration');
});

await check('save: written correctly, and read by nothing', async () => {
    /* ANNOTEPAGE_API in force means the file is not what answers. Saying
       "saved" and stopping there sends somebody hunting a bug in their key. */
    const file = inADirectory();
    const configuration = emptyConfiguration();
    const written = await withEnvironment({
        ANNOTEPAGE_API: 'https://elsewhere.example.com/api.php',
        ANNOTEPAGE_KEY: SALT_TEXT,
    }, () => saveProject(configuration, { site: 'staging.example.com',
        api: 'https://staging.example.com/notes/api.php', key: KEY_TWO, path: file }));
    equal(written.inUse, false, 'the file was written and is not in use');
    truthy(JSON.parse(readFileSync(file, 'utf8')).projects['staging.example.com'] !== undefined,
        'the file itself is right');
});

await check('site: what a person types becomes an origin, or nothing', async () => {
    equal(siteToOrigin('staging.example.com'), 'https://staging.example.com',
        'a bare host is https');
    equal(siteToOrigin('https://staging.example.com/guide#a'), 'https://staging.example.com',
        'a page address keeps its site');
    equal(siteToOrigin('http://localhost:8080/x'), 'http://localhost:8080',
        'a port that is not the default stays');
    equal(siteToOrigin('ftp://example.com'), null, 'another scheme is not a site');
    equal(siteToOrigin(''), null, 'and nothing is nothing');
});

/* -- Verdict ------------------------------------------------------------- */

if (failures.length === 0) {
    process.stdout.write(passed + ' checks, all passed.\n');
} else {
    process.stdout.write(passed + ' passed, ' + failures.length + ' FAILED:\n\n');
    for (const failure of failures) process.stdout.write('  ' + failure + '\n\n');
    process.exitCode = 1;
}
