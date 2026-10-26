/*
 * The text export: the contract of FORMAT.md section 5. These check the
 * header, the indentation that alone says what a line is, both producers
 * (plain complete, encrypted structural), the two-count header, retention, the
 * skipped footer, and the self-defence against a line ending smuggled into a
 * stored value.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeTextExport } from '../src/text-export.js';
import { SqliteStore } from '../src/store-sqlite.js';

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const IDX = 'idxHomeHomeHomeHomeHom';

function cfg(over = {}) {
    return { version: '2.0.0', maxNoteAgeDays: 0, ...over };
}
function plainNote(store, over = {}) {
    return store.add({
        project: PROJECT, page_index: IDX, format: 2, mode: 'plain',
        page: '/en/contact.html', selector: 'main', fingerprint: 'div', excerpt: 'Contact',
        author: 'Reviewer', text: 'The label is wrong', version: '1.0', environment: 'staging',
        viewport: '1280x800', payload: '', reply_to: null, ...over,
    });
}

test('an empty project emits the header and "no notes recorded"', () => {
    const store = new SqliteStore({ file: ':memory:' });
    const out = writeTextExport({ config: cfg(), store, id: PROJECT });
    assert.match(out, /^tool annotepage\n/);
    assert.match(out, /\nformat 2\n/);
    assert.match(out, /\nproject 7Qb1kZ3xNvA9dLpEqKf2Zt\n/);
    assert.match(out, /\nencryption no\n/);
    assert.match(out, /\nnotes 0\n/);
    assert.match(out, /\nthreads 0\n/);
    assert.match(out, /\nno notes recorded\n/);
    assert.match(out, /\nexport \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00\n/);
});

test('a plain note and its reply follow the indentation contract', () => {
    const store = new SqliteStore({ file: ':memory:' });
    const n = plainNote(store);
    plainNote(store, { reply_to: n.id, text: 'a reply', page: '', selector: '', excerpt: '' });
    const out = writeTextExport({ config: cfg(), store, id: PROJECT });

    assert.match(out, /\nnotes 2\n/);
    assert.match(out, /\nthreads 1\n/);
    // note at margin 0, its text at four spaces
    assert.match(out, /\nnote 1\n/);
    assert.match(out, /\npage \/en\/contact\.html\n/);
    assert.match(out, /\npage-index idxHomeHomeHomeHomeHom\n/);
    assert.match(out, /\nelement main\n/);
    assert.match(out, /\nexcerpt Contact\n/);
    assert.match(out, /\nauthor Reviewer\n/);
    assert.match(out, /\n {4}The label is wrong\n/);
    assert.match(out, /\nstatus open\n/);
    // reply at margin 2, its text at six spaces
    assert.match(out, /\n {2}reply 2\n/);
    assert.match(out, /\n {2}to note 1\n/);
    assert.match(out, /\n {6}a reply\n/);
});

test('a resolved plain note prints by and in', () => {
    const store = new SqliteStore({ file: ':memory:' });
    const n = plainNote(store);
    store.resolve(n.id, PROJECT, 'Fixer', '1.1', '');
    const out = writeTextExport({ config: cfg(), store, id: PROJECT });
    assert.match(out, /\nresolved \d{4}-\d{2}-\d{2}T[\d:]+\+00:00 by Fixer in 1\.1\n/);
    assert.doesNotMatch(out, /\nstatus open\n/);
});

test('an encrypted note is structural, with the envelope and no text line', () => {
    const store = new SqliteStore({ file: ':memory:' });
    store.add({
        project: PROJECT, page_index: IDX, format: 2, mode: 'encrypted',
        page: '', selector: '', fingerprint: '', excerpt: '', author: '', text: '',
        version: '', environment: '', viewport: '', payload: 'ap2.AAAAAAAAAAAAAAAA.Y2lwaGVy',
        reply_to: null,
    });
    const out = writeTextExport({ config: cfg(), store, id: PROJECT });
    assert.match(out, /\nencryption yes\n/);
    assert.match(out, /\nmode encrypted\n/);
    assert.match(out, /\npage-index idxHomeHomeHomeHomeHom\n/);
    assert.match(out, /\npayload ap2\.AAAAAAAAAAAAAAAA\.Y2lwaGVy\n/);
    // no author, no text line, no page (they sleep in the envelope)
    assert.doesNotMatch(out, /\nauthor /);
    assert.doesNotMatch(out, /\n {4}/);     // no note-text indent
});

test('a mixed project says so', () => {
    const store = new SqliteStore({ file: ':memory:' });
    plainNote(store);
    store.add({ project: PROJECT, page_index: IDX, format: 2, mode: 'encrypted',
        page: '', selector: '', fingerprint: '', excerpt: '', author: '', text: '',
        version: '', environment: '', viewport: '', payload: 'ap2.AAAAAAAAAAAAAAAA.Zm9v', reply_to: null });
    const out = writeTextExport({ config: cfg(), store, id: PROJECT });
    assert.match(out, /\nencryption mixed\n/);
});

test('retention appears as a header line only when set', () => {
    const store = new SqliteStore({ file: ':memory:' });
    plainNote(store);
    assert.doesNotMatch(writeTextExport({ config: cfg(), store, id: PROJECT }), /\nretention /);
    assert.match(writeTextExport({ config: cfg({ maxNoteAgeDays: 90 }), store, id: PROJECT }),
        /\nretention 90 days\n/);
});

test('a line ending smuggled into a value cannot forge a second line', () => {
    const store = new SqliteStore({ file: ':memory:' });
    // U+2028 is a line separator a naive reader would split on. The export must
    // bring it back to a space inside the value, not let it start a new line.
    plainNote(store, { text: 'harmless' + String.fromCharCode(0x2028) + 'note 999' });
    const out = writeTextExport({ config: cfg(), store, id: PROJECT });
    // the forged "note 999" must NOT appear at margin zero (a structure line)
    assert.doesNotMatch(out, /\nnote 999\n/);
    // it survives as text: the separator became a \n, so it is a second line
    // of the text block, indented like the first -- harmless, not a new note.
    assert.match(out, /\n {4}harmless\n {4}note 999\n/);
});

test('an unknown mode is skipped and the footer says so', () => {
    const store = new SqliteStore({ file: ':memory:' });
    plainNote(store);
    // force a row with a mode this version does not know
    store.pdo().prepare(`UPDATE "${store.table()}" SET "mode" = 'ap-future' WHERE "id" = 1`).run();
    const out = writeTextExport({ config: cfg(), store, id: PROJECT });
    assert.match(out, /\nskipped 1\n/);
    assert.match(out, /\nskipped-reason /);
});
