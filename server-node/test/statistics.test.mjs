/*
 * The statistics sender and `world`. fetch is stubbed, so nothing leaves the
 * machine: the tests check what WOULD be sent, the 23-hour gate, that an unused
 * install sends nothing, and how a received sum is shown the day after.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStatistics } from '../src/statistics.js';
import { normaliseConfig } from '../src/config.js';
import { SqliteStore } from '../src/store-sqlite.js';

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const IDX = 'idxHomeHomeHomeHomeHom';

function storeWithNote() {
    const store = new SqliteStore({ file: ':memory:' });
    store.add({
        project: PROJECT, page_index: IDX, format: 2, mode: 'plain',
        page: '/p', selector: '', fingerprint: '', excerpt: '', author: 'A', text: 't',
        version: '', environment: '', viewport: '', payload: '', reply_to: null,
    });
    return store;
}

/** Runs `fn` with fetch replaced by a capturing stub; restores it after. */
async function withFetch(impl, fn) {
    const real = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return impl(url, init);
    };
    try {
        await fn(calls);
    } finally {
        globalThis.fetch = real;
    }
}

const recorded = () => new Response(
    '{"result":"recorded","instances":12,"projects":340,"notes":5210,"day":"2020-01-01"}',
    { status: 200 });

test('off by default: nothing is sent', async () => {
    const stats = createStatistics();
    const config = normaliseConfig({ version: '2.0.0' });   // reportStatistics defaults false
    assert.equal(config.reportStatistics, false);
    await withFetch(recorded, async (calls) => {
        await stats.report(config, storeWithNote());
        assert.equal(calls.length, 0);
    });
});

test('on, with a note: sends the five fields, then the 23h gate holds', async () => {
    const stats = createStatistics();
    const config = normaliseConfig({ version: '2.0.0', reportStatistics: true });
    const store = storeWithNote();
    await withFetch(recorded, async (calls) => {
        await stats.report(config, store);
        assert.equal(calls.length, 1);
        const body = new URLSearchParams(calls[0].init.body);
        assert.match(body.get('id'), /^[A-Za-z0-9_-]{22}$/);
        assert.equal(body.get('version'), '2.0.0');
        assert.equal(body.get('projects'), '1');
        assert.equal(body.get('notes'), '1');
        assert.equal(body.get('pages'), '1');
        // no sixth field
        assert.deepEqual([...body.keys()].sort(), ['id', 'notes', 'pages', 'projects', 'version']);

        // A second report right away is gated: no new request.
        await stats.report(config, store);
        assert.equal(calls.length, 1);
    });
});

test('an unused install sends nothing and draws no id', async () => {
    const stats = createStatistics();
    const config = normaliseConfig({ version: '2.0.0', reportStatistics: true });
    const store = new SqliteStore({ file: ':memory:' });   // no note ever written
    await withFetch(recorded, async (calls) => {
        await stats.report(config, store);
        assert.equal(calls.length, 0);
        // The day's slot is claimed before the count (so the next write does
        // not re-walk the table), but NO identifier is drawn for a server that
        // is not a site.
        const mem = JSON.parse(store.remembered('statistics') || '{}');
        assert.equal(mem.id, '');
    });
});

test('world shows a received sum from the day after, above the thresholds', () => {
    const stats = createStatistics();
    const config = normaliseConfig({ version: '2.0.0', reportStatistics: true });
    const store = new SqliteStore({ file: ':memory:' });
    store.ensureSchema();
    const now = Math.floor(Date.now() / 1000);
    const yesterday = new Date((now - 86400) * 1000).toISOString().slice(0, 10);
    // A sum tagged yesterday: it is the one shown today.
    store.remember('statistics-world', JSON.stringify({
        at: 0, i: 0, p: 0, n: 0, d: yesterday, di: 12, dp: 340, dn: 5210,
    }));
    assert.deepEqual(stats.world(config, store, now), { servers: 12, sites: 340, notes: 5210 });
});

test('world is null below the notes threshold', () => {
    const stats = createStatistics();
    const config = normaliseConfig({ version: '2.0.0', reportStatistics: true });
    const store = new SqliteStore({ file: ':memory:' });
    store.ensureSchema();
    const now = Math.floor(Date.now() / 1000);
    const yesterday = new Date((now - 86400) * 1000).toISOString().slice(0, 10);
    store.remember('statistics-world', JSON.stringify({
        at: 0, i: 0, p: 0, n: 0, d: yesterday, di: 3, dp: 4, dn: 10,
    }));
    assert.equal(stats.world(config, store, now), null);
});

test('world is null when reporting is off', () => {
    const stats = createStatistics();
    const off = normaliseConfig({ version: '2.0.0' });
    const store = new SqliteStore({ file: ':memory:' });
    store.ensureSchema();
    assert.equal(stats.world(off, store), null);
});
