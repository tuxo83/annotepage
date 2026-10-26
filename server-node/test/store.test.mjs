/*
 * The SQLite store, on an in-process ':memory:' database. These check the
 * arithmetic a caller depends on and that nobody can see from outside: what a
 * note comes back as, how replies nest, how retention counts what it takes,
 * and that a project never reads another's rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SqliteStore } from '../src/store-sqlite.js';
import { ApFailure } from '../src/errors.js';

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const OTHER = 'ZZZ1kZ3xNvA9dLpEqKf2Zt';

/** A plain-mode note dict, as the handler would hand add() one. */
function plainNote(over = {}) {
    return {
        project: PROJECT,
        page_index: 'idxHomeHomeHomeHomeHom',
        format: 2,
        mode: 'plain',
        page: '/en/contact.html',
        selector: 'body > main',
        fingerprint: 'div#x.y',
        excerpt: 'Contact us',
        author: 'Reviewer',
        text: 'The label is wrong',
        version: '1.0',
        environment: 'staging',
        viewport: '1280x800',
        payload: '',
        reply_to: null,
        ...over,
    };
}

function fresh() {
    return new SqliteStore({ file: ':memory:' });
}

/** Backdate a row's created_at, the one thing add() will not let a test set,
 *  so retention has something old to find. */
function backdate(store, id, utc) {
    store.pdo().prepare(`UPDATE "${store.table()}" SET "created_at" = ? WHERE "id" = ?`)
        .run(utc, id);
}

test('a stored note comes back in the single note shape', () => {
    const store = fresh();
    const saved = store.add(plainNote());
    assert.equal(saved.id, 1);
    assert.equal(saved.project, PROJECT);
    assert.equal(saved.mode, 'plain');
    assert.equal(saved.format, 2);
    assert.equal(saved.text, 'The label is wrong');
    assert.equal(saved.reply_to, null);
    assert.equal(saved.resolved_at, null);
    // created_at is ISO 8601 with an explicit +00:00 offset, never a Z.
    assert.match(saved.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
    // every payload column is a string, never null.
    assert.equal(saved.payload, '');
    assert.equal(saved.title, '');
    assert.equal(saved.title_payload, '');
});

test('note() of another project is not found, not found-then-refused', () => {
    const store = fresh();
    const saved = store.add(plainNote());
    assert.ok(store.note(saved.id, PROJECT));
    assert.equal(store.note(saved.id, OTHER), null);
});

test('byPage nests replies under their parent, in one list', () => {
    const store = fresh();
    const parent = store.add(plainNote());
    store.add(plainNote({ text: 'reply one', reply_to: parent.id }));
    store.add(plainNote({ text: 'reply two', reply_to: parent.id }));
    // a note on another page of the same project
    store.add(plainNote({ page_index: 'idxOtherOtherOtherOth', text: 'elsewhere' }));

    const page = store.byPage(PROJECT, 'idxHomeHomeHomeHomeHom');
    assert.equal(page.length, 1);
    assert.equal(page[0].id, parent.id);
    assert.equal(page[0].replies.length, 2);
    assert.deepEqual(page[0].replies.map((r) => r.text), ['reply one', 'reply two']);
});

test('count is entries, countThreads is roots', () => {
    const store = fresh();
    const parent = store.add(plainNote());
    store.add(plainNote({ reply_to: parent.id }));
    store.add(plainNote({ page_index: 'idxOtherOtherOtherOth' }));
    assert.equal(store.count(PROJECT), 3);
    assert.equal(store.countThreads(PROJECT), 2);
});

test('projectTotals counts threads, open threads and distinct pages', () => {
    const store = fresh();
    const a = store.add(plainNote());
    store.add(plainNote({ reply_to: a.id }));               // a reply, not a note
    store.add(plainNote({ page_index: 'idxOtherOtherOtherOth' }));
    const totals = store.projectTotals(PROJECT);
    assert.deepEqual(totals, { notes: 2, open: 2, pages: 2 });

    store.resolve(a.id, PROJECT, 'Fixer', '1.1', '');
    assert.deepEqual(store.projectTotals(PROJECT), { notes: 2, open: 1, pages: 2 });
});

test('resolve marks and reopen clears both forms', () => {
    const store = fresh();
    const n = store.add(plainNote());
    const resolved = store.resolve(n.id, PROJECT, 'Fixer', '1.1', '');
    assert.match(resolved.resolved_at, /\+00:00$/);
    assert.equal(resolved.resolved_by, 'Fixer');
    assert.equal(resolved.resolved_version, '1.1');

    const reopened = store.resolve(n.id, PROJECT, '', '', '', false);
    assert.equal(reopened.resolved_at, null);
    assert.equal(reopened.resolved_by, '');
    assert.equal(reopened.resolved_version, '');
});

test('setTitle writes a title and an empty one takes it off', () => {
    const store = fresh();
    const n = store.add(plainNote());
    assert.equal(store.setTitle(n.id, PROJECT, 'Broken contact form', '').title,
        'Broken contact form');
    assert.equal(store.setTitle(n.id, PROJECT, '', '').title, '');
});

test('modeBreakdown separates plain and encrypted', () => {
    const store = fresh();
    store.add(plainNote());
    store.add(plainNote({ mode: 'encrypted', page: '', selector: '', fingerprint: '',
        excerpt: '', author: '', text: '', version: '', environment: '', viewport: '',
        payload: 'ap2.envelope' }));
    assert.deepEqual(store.modeBreakdown(PROJECT), { plain: 1, encrypted: 1 });
});

test('retention expires a whole old thread, counts it, and keeps a live one', () => {
    const store = fresh();
    // An old thread: parent and reply both older than the cutoff.
    const old = store.add(plainNote());
    const oldReply = store.add(plainNote({ reply_to: old.id }));
    backdate(store, old.id, '2000-01-01 00:00:00');
    backdate(store, oldReply.id, '2000-01-02 00:00:00');
    // A thread kept alive by a recent reply, on its own page.
    const live = store.add(plainNote({ page_index: 'idxLiveLiveLiveLiveLi' }));
    backdate(store, live.id, '2000-01-01 00:00:00');
    store.add(plainNote({ page_index: 'idxLiveLiveLiveLiveLi', reply_to: live.id }));

    const removed = store.expireOlderThan(30);
    assert.equal(removed, 2);                       // the two rows of the old thread
    assert.equal(store.count(PROJECT), 2);          // the live thread's two rows remain

    const expired = store.expiredTotals(PROJECT);
    assert.equal(expired.notes, 1);                 // one thread
    assert.equal(expired.pages, 1);                 // one whole page
    assert.match(expired.last_sweep, /\+00:00$/);
});

test('serverTotals keeps a project that has entirely expired', () => {
    const store = fresh();
    const only = store.add(plainNote());
    backdate(store, only.id, '2000-01-01 00:00:00');
    store.expireOlderThan(30);
    const totals = store.serverTotals();
    assert.equal(totals.projects, 1);               // still a site this server carried
    assert.equal(totals.notes, 0);
    assert.equal(totals.expired_notes, 1);
});

test('what the installation remembers survives and can be forgotten', () => {
    const store = fresh();
    store.ensureSchema();
    assert.equal(store.remembered('stats/id'), '');
    assert.equal(store.remember('stats/id', 'abc'), true);
    assert.equal(store.remembered('stats/id'), 'abc');
    store.remember('stats/day', '2026-10-26');
    assert.deepEqual(store.rememberedLike('stats/'),
        { 'stats/id': 'abc', 'stats/day': '2026-10-26' });
    store.forget('stats/id');
    assert.equal(store.remembered('stats/id'), '');
});

test('consumeRate counts up within a window', () => {
    const store = fresh();
    assert.equal(store.consumeRate('ip:1.2.3.4', 100), 1);
    assert.equal(store.consumeRate('ip:1.2.3.4', 100), 2);
    assert.equal(store.consumeRate('ip:1.2.3.4', 101), 1);   // a new window restarts
});

test('a bad table prefix is refused', () => {
    assert.throws(() => new SqliteStore({ file: ':memory:', tablePrefix: 'bad-prefix!' }),
        (e) => e instanceof ApFailure && e.status === 500);
});

test('a missing file configuration is refused', () => {
    assert.throws(() => new SqliteStore({}), (e) => e instanceof ApFailure);
});
