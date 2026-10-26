/*
 * The bounds: the domain lock, rate limiting, the body cap and the note cap.
 * All off by default, so these turn each on through the configuration and check
 * both the refusal and that an allowed request still passes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createServer, ApFailure } from '../src/index.js';
import { SqliteStore } from '../src/store-sqlite.js';

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const IDX = 'idxHomeHomeHomeHomeHom';
const ENVELOPE = 'ap2.AAAAAAAAAAAAAAAA.Y2lwaGVydGV4dA';
const base = 'https://app.example.com/annotepage/api';

function server(over = {}) {
    return createServer({
        store: new SqliteStore({ file: ':memory:' }),
        projects: { [PROJECT]: { mode: 'plain' } },
        version: '2.0.0',
        reportStatistics: false,
        ...over,
    });
}

function req(api, { method = 'GET', query = '', fields = null, headers = {}, address } = {}) {
    const init = { method, headers: { ...headers } };
    if (fields) {
        init.body = new URLSearchParams(fields).toString();
        init.headers['content-type'] = 'application/x-www-form-urlencoded';
        init.headers['content-length'] = String(Buffer.byteLength(init.body));
    }
    return api.fetch(new Request(`${base}?${query}`, init), address ? { address } : {});
}

test('an allowed Origin passes and is echoed back', async () => {
    const api = server({ projects: { [PROJECT]: { mode: 'encrypted', origins: ['https://ok.example.com'] } } });
    const res = await req(api, { query: `action=list&project=${PROJECT}&index=${IDX}`,
        headers: { origin: 'https://ok.example.com' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://ok.example.com');
    assert.equal(res.headers.get('vary'), 'Origin');
});

test('an undeclared Origin is refused, even on list', async () => {
    const api = server({ projects: { [PROJECT]: { mode: 'encrypted', origins: ['https://ok.example.com'] } } });
    const res = await req(api, { query: `action=list&project=${PROJECT}&index=${IDX}`,
        headers: { origin: 'https://evil.example.com' } });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /Origin refused/);
});

test('a subdomain pattern matches a subdomain but not the bare domain', async () => {
    const api = server({ projects: { [PROJECT]: { mode: 'encrypted', origins: ['https://*.example.com'] } } });
    const ok = await req(api, { query: `action=list&project=${PROJECT}&index=${IDX}`,
        headers: { origin: 'https://a.example.com' } });
    assert.equal(ok.status, 200);
    const bare = await req(api, { query: `action=list&project=${PROJECT}&index=${IDX}`,
        headers: { origin: 'https://example.com' } });
    assert.equal(bare.status, 403);
});

test('a relay refuses a write that carries no Origin', async () => {
    const api = server({ selfHosted: false, openRegistration: true });
    const res = await req(api, { method: 'POST', query: 'action=add',
        fields: { project: PROJECT, mode: 'encrypted', index: IDX, payload: ENVELOPE } });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /no Origin header/);
});

test('a relay accepts an open-registration write that carries an Origin', async () => {
    const api = server({ selfHosted: false, openRegistration: true });
    const res = await req(api, { method: 'POST', query: 'action=add',
        fields: { project: PROJECT, mode: 'encrypted', index: IDX, payload: ENVELOPE },
        headers: { origin: 'https://anywhere.example.com' } });
    assert.equal(res.status, 200);
});

test('writes are rate limited per address, with a Retry-After', async () => {
    const api = server({ rateWindowSeconds: 3600, rateWritesPerIp: 2 });
    const fields = { project: PROJECT, mode: 'plain', index: IDX, page: '/p', author: 'A', text: 't' };
    const one = await req(api, { method: 'POST', query: 'action=add', fields, address: '1.1.1.1' });
    const two = await req(api, { method: 'POST', query: 'action=add', fields, address: '1.1.1.1' });
    const three = await req(api, { method: 'POST', query: 'action=add', fields, address: '1.1.1.1' });
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    assert.equal(three.status, 429);
    assert.ok(Number(three.headers.get('retry-after')) > 0);
    // A different address has its own counter.
    const other = await req(api, { method: 'POST', query: 'action=add', fields, address: '2.2.2.2' });
    assert.equal(other.status, 200);
});

test('the body cap refuses an oversized body before reading it', async () => {
    const api = server({ maxBodyBytes: 20 });
    const res = await req(api, { method: 'POST', query: 'action=add',
        fields: { project: PROJECT, mode: 'plain', index: IDX, page: '/p', author: 'A',
            text: 'a remark far longer than twenty bytes' } });
    assert.equal(res.status, 413);
});

test('the note cap refuses the write beyond it', async () => {
    const api = server({ maxNotesPerProject: 1 });
    const fields = { project: PROJECT, mode: 'plain', index: IDX, page: '/p', author: 'A', text: 't' };
    assert.equal((await req(api, { method: 'POST', query: 'action=add', fields })).status, 200);
    const res = await req(api, { method: 'POST', query: 'action=add', fields });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /cap of 1 notes/);
});

test('a malformed declared origin is a configuration failure', () => {
    assert.throws(
        () => server({ projects: { [PROJECT]: { mode: 'encrypted', origins: ['not-an-origin'] } } }),
        (e) => e instanceof ApFailure && e.status === 500);
});
