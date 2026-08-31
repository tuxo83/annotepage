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

/* -- Verdict ------------------------------------------------------------- */

if (failures.length === 0) {
    process.stdout.write(passed + ' checks, all passed.\n');
} else {
    process.stdout.write(passed + ' passed, ' + failures.length + ' FAILED:\n\n');
    for (const failure of failures) process.stdout.write('  ' + failure + '\n\n');
    process.exitCode = 1;
}
