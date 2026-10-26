/*
 * The handler, exercised the way a client reaches it: a web Request in, a
 * Response out. These check the six service actions, the response envelope and
 * the refusals -- the wire contract of FORMAT.md section 6, minus the bounds
 * (their own batch) and the text export (its own batch).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createServer } from '../src/index.js';
import { SqliteStore } from '../src/store-sqlite.js';

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const IDX = 'idxHomeHomeHomeHomeHom';
const ENVELOPE = 'ap2.AAAAAAAAAAAAAAAA.Y2lwaGVydGV4dA';

function server(over = {}) {
    return createServer({
        store: new SqliteStore({ file: ':memory:' }),
        projects: { [PROJECT]: { mode: 'plain' } },
        version: '2.0.0',
        reportStatistics: false,
        ...over,
    });
}

const base = 'https://app.example.com/annotepage/api';

function get(api, query) {
    return api.fetch(new Request(`${base}?${query}`));
}
function post(api, query, fields) {
    return api.fetch(new Request(`${base}?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
    }));
}
async function json(res) {
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    return JSON.parse(await res.text());
}

test('an unknown action is 400 with the list of the real ones', async () => {
    const res = await get(server(), 'action=nope');
    assert.equal(res.status, 400);
    const body = await res.text();
    assert.match(body, /Unknown action: nope/);
    assert.match(body, /\?action=list/);
});

test('diagnostic answers text, with tool, version and a verdict', async () => {
    const res = await get(server(), 'action=diagnostic');
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /tool annotepage/);
    assert.match(body, /version 2\.0\.0/);
    assert.match(body, /verdict /);
});

test('diagnostic off makes the action not exist', async () => {
    const res = await get(server({ diagnostic: 'off' }), 'action=diagnostic');
    assert.equal(res.status, 400);
    assert.match(await res.text(), /Unknown action/);
});

test('list of an unknown project is a quiet 200 inactive', async () => {
    const res = await get(server(), `action=list&project=ZZZ1kZ3xNvA9dLpEqKf2Zt&index=${IDX}`);
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.deepEqual([body.ok, body.active], [false, false]);
});

test('list of a known empty project is ok with the envelope and totals', async () => {
    const body = await json(await get(server(), `action=list&project=${PROJECT}&index=${IDX}`));
    assert.equal(body.ok, true);
    assert.equal(body.tool, 'annotepage');
    assert.equal(body.format, 2);
    assert.equal(body.version, '2.0.0');
    assert.deepEqual(body.notes, []);
    assert.deepEqual(body.totals, { notes: 0, open: 0, pages: 0 });
    assert.equal(body.retention, 0);
});

test('a plain note is added and then listed', async () => {
    const api = server();
    const added = await json(await post(api, 'action=add', {
        project: PROJECT, mode: 'plain', index: IDX,
        page: '/en/contact.html', author: 'Reviewer', text: 'The label is wrong',
    }));
    assert.equal(added.ok, true);
    assert.equal(added.note.text, 'The label is wrong');
    assert.equal(added.note.page, '/en/contact.html');
    assert.equal(added.note.mode, 'plain');

    const listed = await json(await get(api, `action=list&project=${PROJECT}&index=${IDX}`));
    assert.equal(listed.notes.length, 1);
    assert.equal(listed.notes[0].id, added.note.id);
    assert.deepEqual(listed.totals, { notes: 1, open: 1, pages: 1 });
});

test('a write requires POST', async () => {
    // A valid project, so the request reaches the method check rather than
    // stopping earlier on a missing project -- the PHP order too.
    const res = await get(server(), `action=add&project=${PROJECT}&index=${IDX}`);
    assert.equal(res.status, 405);
    assert.match(await res.text(), /done with POST/);
});

test('a reply inherits its parent page and nests under it', async () => {
    const api = server();
    const parent = await json(await post(api, 'action=add', {
        project: PROJECT, mode: 'plain', index: IDX,
        page: '/p', author: 'A', text: 'parent',
    }));
    const reply = await json(await post(api, 'action=add', {
        project: PROJECT, mode: 'plain', reply_to: String(parent.note.id),
        author: 'B', text: 'a reply',
    }));
    assert.equal(reply.note.reply_to, parent.note.id);
    assert.equal(reply.note.page, '/p');          // inherited

    const listed = await json(await get(api, `action=list&project=${PROJECT}&index=${IDX}`));
    assert.equal(listed.notes.length, 1);
    assert.equal(listed.notes[0].replies.length, 1);
    assert.equal(listed.notes[0].replies[0].text, 'a reply');
});

test('resolve then reopen', async () => {
    const api = server();
    const n = await json(await post(api, 'action=add', {
        project: PROJECT, mode: 'plain', index: IDX, page: '/p', author: 'A', text: 't',
    }));
    const resolved = await json(await post(api, 'action=resolve', {
        project: PROJECT, id: String(n.note.id), by: 'Fixer', version: '1.1',
    }));
    assert.equal(resolved.note.resolved_by, 'Fixer');
    assert.match(resolved.note.resolved_at, /\+00:00$/);

    const reopened = await json(await post(api, 'action=resolve', {
        project: PROJECT, id: String(n.note.id), resolved: '0',
    }));
    assert.equal(reopened.note.resolved_at, null);
    assert.equal(reopened.note.resolved_by, '');
});

test('title set and cleared', async () => {
    const api = server();
    const n = await json(await post(api, 'action=add', {
        project: PROJECT, mode: 'plain', index: IDX, page: '/p', author: 'A', text: 't',
    }));
    const titled = await json(await post(api, 'action=title', {
        project: PROJECT, id: String(n.note.id), title: 'Broken form',
    }));
    assert.equal(titled.note.title, 'Broken form');
    const cleared = await json(await post(api, 'action=title', {
        project: PROJECT, id: String(n.note.id),
    }));
    assert.equal(cleared.note.title, '');
});

test('plain mode is refused on an encrypted project', async () => {
    const api = server({ projects: { [PROJECT]: { mode: 'encrypted' } } });
    const res = await post(api, 'action=add', {
        project: PROJECT, mode: 'plain', index: IDX, page: '/p', author: 'A', text: 't',
    });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /no going back/);
});

test('an encrypted note takes an envelope and refuses plain fields', async () => {
    const api = server({ projects: { [PROJECT]: { mode: 'encrypted' } } });
    const ok = await json(await post(api, 'action=add', {
        project: PROJECT, mode: 'encrypted', index: IDX, payload: ENVELOPE,
    }));
    assert.equal(ok.note.mode, 'encrypted');
    assert.equal(ok.note.payload, ENVELOPE);

    const refused = await post(api, 'action=add', {
        project: PROJECT, mode: 'encrypted', index: IDX, payload: ENVELOPE, author: 'leaked',
    });
    assert.equal(refused.status, 400);
    assert.match(await refused.text(), /must not be sent/);
});

test('a newer-format envelope is refused with the format message', async () => {
    const api = server({ projects: { [PROJECT]: { mode: 'encrypted' } } });
    const res = await post(api, 'action=add', {
        project: PROJECT, mode: 'encrypted', index: IDX,
        payload: 'ap3.AAAAAAAAAAAAAAAA.Y2lwaGVy',
    });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /newer version of annotepage/);
});

test('the text export answers text/plain (grammar checked in its own suite)', async () => {
    const res = await get(server(), `action=text&project=${PROJECT}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8');
});

test('a page path with .. is refused', async () => {
    const res = await post(server(), 'action=add', {
        project: PROJECT, mode: 'plain', index: IDX, page: '/a/../b', author: 'A', text: 't',
    });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /cannot contain/);
});
