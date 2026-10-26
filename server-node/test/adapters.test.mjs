/*
 * The Node adapter, over a real localhost round-trip: an http server built
 * from nodeListener, reached with the global fetch. It proves the Request is
 * rebuilt from a Node request (query, headers, urlencoded body) and the
 * Response written back faithfully.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';

import { createServer } from '../src/index.js';
import { SqliteStore } from '../src/store-sqlite.js';
import { nodeListener } from '../src/adapters.js';

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const IDX = 'idxHomeHomeHomeHomeHom';

async function withServer(fn) {
    const api = createServer({
        store: new SqliteStore({ file: ':memory:' }),
        projects: { [PROJECT]: { mode: 'plain' } },
        version: '2.0.0',
        reportStatistics: false,
    });
    const http = createHttpServer(nodeListener(api));
    http.listen(0);
    await once(http, 'listening');
    const port = http.address().port;
    try {
        await fn(`http://127.0.0.1:${port}/annotepage/api`);
    } finally {
        http.close();
        await once(http, 'close');
    }
}

test('GET list and POST add round-trip through the node adapter', async () => {
    await withServer(async (base) => {
        const empty = await fetch(`${base}?action=list&project=${PROJECT}&index=${IDX}`);
        assert.equal(empty.status, 200);
        assert.equal(empty.headers.get('content-type'), 'application/json; charset=utf-8');
        const emptyBody = await empty.json();
        assert.equal(emptyBody.ok, true);
        assert.deepEqual(emptyBody.notes, []);

        const added = await fetch(`${base}?action=add`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                project: PROJECT, mode: 'plain', index: IDX,
                page: '/en/contact.html', author: 'Reviewer', text: 'The label is wrong',
            }).toString(),
        });
        assert.equal(added.status, 200);
        const addedBody = await added.json();
        assert.equal(addedBody.note.text, 'The label is wrong');

        const listed = await (await fetch(`${base}?action=list&project=${PROJECT}&index=${IDX}`)).json();
        assert.equal(listed.notes.length, 1);
    });
});

test('an unknown action comes back 400 text through the adapter', async () => {
    await withServer(async (base) => {
        const res = await fetch(`${base}?action=nope`);
        assert.equal(res.status, 400);
        assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
    });
});
