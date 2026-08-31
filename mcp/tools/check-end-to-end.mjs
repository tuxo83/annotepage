#!/usr/bin/env node
/* check-end-to-end.mjs — THE TWO EXECUTABLES, FOR REAL.
 *
 * The neighbouring file checks the pieces; this one checks that they work
 * together, by running the package's two commands against a fake server that
 * talks like api.php.
 *
 * THE FAKE SERVER DOES NOT PRETEND TO DECRYPT. It holds a list of rows, emits
 * the export in the grammar of the four margins, accepts an "add" and a
 * "resolve" in x-www-form-urlencoded, and understands nothing of what it
 * stores — exactly like the real one. That is what makes the test useful: if
 * the package got the AAD wrong, this server would not notice, and it is the
 * decryption of the next step that would fail.
 *
 * No network access: the server listens on 127.0.0.1, on a port the system
 * picks.
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { b64url } from '../src/format.mjs';
import { derive, saltFromText, seal, indexOfPath } from '../src/crypto.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

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

const truthy = (condition, what) => { if (!condition) throw new Error(what); };
const contains = (text, piece, what) => {
    if (text.indexOf(piece) === -1) {
        throw new Error((what || 'content') + '\n  looked for : ' + JSON.stringify(piece)
            + '\n  in         :\n' + text.replace(/^/gm, '      '));
    }
};

/* -- The fake server ------------------------------------------------------ */

const buildServer = (state) => createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const action = url.searchParams.get('action');

    const text = (code, body) => {
        response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(body);
    };
    const json = (object) => {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(object));
    };

    if (action === 'text') {
        if (url.searchParams.get('project') !== state.project) {
            return json({ ok: false, active: false, message: 'Unknown project.' });
        }
        let out = 'tool annotepage\nformat 2\nversion 2.0.0\nproject ' + state.project
            + '\nencryption yes\nexport 2026-08-31T09:14:22+00:00\nnotes '
            + state.rows.length + '\n\n';
        let first = true;
        for (const row of state.rows) {
            if (row.reply_to === null) {
                if (!first) out += '\n';
                out += 'note ' + row.id + '\npage-index ' + row.page_index + '\n';
            } else {
                out += '\n  reply ' + row.id + '\n  to note ' + row.reply_to + '\n';
            }
            const margin = row.reply_to === null ? '' : '  ';
            out += margin + 'mode encrypted\n' + margin + 'date ' + row.created_at + '\n';
            out += row.resolved_at
                ? margin + 'resolved ' + row.resolved_at + '\n'
                : margin + 'status open\n';
            out += margin + 'payload ' + row.payload + '\n';
            if (row.resolution_payload) {
                out += margin + 'resolution-payload ' + row.resolution_payload + '\n';
            }
            first = false;
        }
        return text(200, out + '\n');
    }

    if (action === 'diagnostic') {
        return text(200, 'tool annotepage\nformat 2\nphp.version 8.2.0 (fake server)\n');
    }

    if (action === 'add' || action === 'resolve') {
        if (request.method !== 'POST') return text(405, 'POST expected.');
        let body = '';
        request.on('data', (m) => { body += m; });
        request.on('end', () => {
            const fields = new URLSearchParams(body);
            state.received.push({ action, fields });
            if (fields.get('project') !== state.project) return text(404, 'Unknown project.');

            if (action === 'add') {
                const parent = state.rows.find(
                    (r) => String(r.id) === fields.get('reply_to'));
                const row = {
                    id: state.next++,
                    reply_to: parent ? parent.id : null,
                    page_index: parent ? parent.page_index : fields.get('index'),
                    created_at: '2026-08-31T10:00:00+00:00',
                    resolved_at: null,
                    payload: fields.get('payload') || '',
                    resolution_payload: '',
                };
                // A reply follows its parent: that is the order of the export.
                const position = parent ? state.rows.indexOf(parent) + 1 : state.rows.length;
                state.rows.splice(position, 0, row);
                return json({ ok: true, tool: 'annotepage', format: 2, note: row });
            }

            const row = state.rows.find((r) => String(r.id) === fields.get('id'));
            if (!row) return text(404, 'Note not found.');
            if (fields.get('resolved') === '0') {
                row.resolved_at = null;
                row.resolution_payload = '';
            } else {
                row.resolved_at = '2026-08-31T11:00:00+00:00';
                row.resolution_payload = fields.get('resolution_payload') || '';
            }
            return json({ ok: true, tool: 'annotepage', format: 2, note: row });
        });
        return undefined;
    }

    return text(400, 'Unknown action.');
});

/* -- Run a command and read what it writes -------------------------------- */

const run = (script, args, input) => new Promise((settle) => {
    const child = spawn(process.execPath, [join(root, script)].concat(args),
                        { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let errors = '';
    child.stdout.on('data', (m) => { out += m; });
    child.stderr.on('data', (m) => { errors += m; });
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
    child.on('close', (code) => settle({ code, out, errors }));
});

/* -- The set-up ----------------------------------------------------------- */

const SALT = b64url(new Uint8Array(32).map((v, i) => (i * 11 + 5) & 0xff));
const keys = await derive(saltFromText(SALT));
const index = await indexOfPath(keys.indexKey, '/en/contact.html');

const state = {
    project: keys.id,
    next: 5,
    received: [],
    rows: [{
        id: 4, reply_to: null, page_index: index,
        created_at: '2026-08-30T14:02:11+00:00', resolved_at: null,
        payload: await seal(keys.encryptionKey, keys.id, index, 'note', {
            page: '/en/contact.html',
            selector: 'main:nth-of-type(1) > h2:nth-of-type(3)',
            excerpt: 'Contact us', author: 'Camille',
            text: 'The link still points at the old form.\n\nSecond paragraph.',
            version: '1.4.12', environment: 'staging', viewport: '1280x800',
        }),
        resolution_payload: '',
    }],
};

const server = buildServer(state);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const folder = mkdtempSync(join(tmpdir(), 'annotepage-'));
const configFile = join(folder, 'annotepage.json');
writeFileSync(configFile, JSON.stringify({
    projects: {
        review: {
            api: 'http://127.0.0.1:' + port + '/api.php',
            salt: SALT,
            mode: 'encrypted',
            author: 'Assistant',
        },
    },
}), { mode: 0o600 });

const cli = (...args) => run('annotepage.mjs', args.concat(['--config', configFile]));

/* -- The checks ----------------------------------------------------------- */

await check('cli: "annotepage text" returns a FILLED export', async () => {
    const { code, out } = await cli('text');
    truthy(code === 0, 'exit code ' + code);
    contains(out, 'tool annotepage', 'header');
    contains(out, 'note 4', 'note number');
    contains(out, 'page /en/contact.html', 'the page was encrypted');
    contains(out, 'element main:nth-of-type(1) > h2:nth-of-type(3)', 'so was the selector');
    contains(out, 'author Camille', 'so was the author');
    contains(out, '    The link still points at the old form.', 'text, margin 4');
    contains(out, '\n\n    Second paragraph.', 'the empty paragraph is kept');
    contains(out, 'mode encrypted', 'the note says it was encrypted');
    truthy(out.indexOf('payload ap2.') === -1,
        'the envelope is not copied next to its own plaintext');
});

await check('cli: "raw" returns what the server sends, without decrypting', async () => {
    const { out } = await cli('raw');
    contains(out, 'payload ap2.', 'the envelopes are there');
    truthy(out.indexOf('/en/contact.html') === -1, 'and nothing is readable');
});

await check('cli: "id" returns what you need to build a curl URL', async () => {
    const { out } = await cli('id');
    truthy(out.trim() === keys.id, 'id derived from the salt');
    truthy(out.indexOf(SALT) === -1, 'and never the salt');
});

await check('cli: reply seals under the index of the parent note', async () => {
    const { code, errors } = await cli('reply', '4', 'Fixed: the link now points '
        + 'at /en/form.html');
    truthy(code === 0, 'exit code ' + code + '\n' + errors);

    const sent = state.received[state.received.length - 1];
    truthy(sent.action === 'add', 'action add');
    truthy(sent.fields.get('mode') === 'encrypted', 'mode inherited from the parent note');
    truthy(sent.fields.get('reply_to') === '4', 'reply_to');
    truthy(sent.fields.get('index') === null, 'a reply sends no index: it inherits one');
    truthy(sent.fields.get('text') === null, 'no text in the clear');
    truthy(sent.fields.get('author') === null, 'no author in the clear');
    truthy(sent.fields.get('payload').startsWith('ap2.'), 'an envelope');

    // And this is the point: the reply must read back, so its AAD is right.
    const { out } = await cli('note', '4');
    contains(out, '  reply 5', 'the reply is in the thread');
    contains(out, '  author Assistant', 'signed with the configuration name');
    contains(out, '      Fixed: the link now points at /en/form.html',
        'text of the reply, margin 6');
});

await check('cli: marking resolved stamps the version', async () => {
    const { code, errors } = await cli('resolve', '4', '1.4.13');
    truthy(code === 0, 'exit code ' + code + '\n' + errors);

    const sent = state.received[state.received.length - 1];
    truthy(sent.action === 'resolve', 'action resolve');
    truthy(sent.fields.get('by') === null, 'the fixer name does not travel in the clear');
    truthy(sent.fields.get('version') === null, 'neither does the version');
    truthy(sent.fields.get('resolution_payload').startsWith('ap2.'), 'second envelope');
    truthy(sent.fields.get('resolution_payload') !== state.rows[0].payload,
        'its own nonce, its own role');

    const { out } = await cli('text');
    contains(out, 'resolved 2026-08-31T11:00:00+00:00 by Assistant in 1.4.13',
        'the resolution reads back, name and version included');

    const open = await cli('open');
    truthy(open.out.indexOf('note 4') === -1, 'the note leaves the list of open ones');
    contains(open.out, 'notes 0', 'nothing open is left');
});

await check('cli: reopening puts the note back in sight, thread intact', async () => {
    truthy((await cli('reopen', '4')).code === 0, 'reopening');
    const { out } = await cli('open');
    contains(out, 'note 4', 'the note is back');
    contains(out, '  reply 5', 'and its thread with it');
    truthy(out.indexOf('resolved ') === -1, 'the resolution mark is gone');
});

await check('cli: a reply to a reply is refused, naming the parent', async () => {
    const { code, errors } = await cli('reply', '5', 'and this?');
    truthy(code !== 0, 'the command fails');
    contains(errors, 'already a reply to note 4', 'the message names the parent note');
});

await check('cli: read-only cuts every write', async () => {
    const readOnly = join(folder, 'read-only.json');
    writeFileSync(readOnly, JSON.stringify({
        projects: { r: { api: 'http://127.0.0.1:' + port + '/api.php',
                         salt: SALT, author: 'Assistant', read_only: true } },
    }), { mode: 0o600 });
    const { code, errors } = await run('annotepage.mjs',
        ['reply', '4', 'no', '--config', readOnly]);
    truthy(code !== 0, 'the command fails');
    contains(errors, 'read-only', 'the message says why');
    contains(errors, 'Nothing was written', 'and what did not happen');
});

await check('cli: a salt that does not match the id is refused', async () => {
    const wrong = join(folder, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({
        projects: { r: { api: 'http://127.0.0.1:' + port + '/api.php',
                         salt: SALT, id: 'AAAAAAAAAAAAAAAAAAAAAA' } },
    }), { mode: 0o600 });
    const { code, errors } = await run('annotepage.mjs', ['text', '--config', wrong]);
    truthy(code !== 0, 'the command fails');
    contains(errors, 'This salt is not the salt of this project',
        'the message of section 1.2 of the format');
    contains(errors, 'No request was made', 'and it says so before any network');
});

await check('cli: a wrong salt is counted, it does not keep quiet', async () => {
    const other = join(folder, 'other-salt.json');
    writeFileSync(other, JSON.stringify({
        projects: { r: { api: 'http://127.0.0.1:' + port + '/api.php?force=' + state.project,
                         salt: b64url(new Uint8Array(32).fill(3)) } },
    }), { mode: 0o600 });
    // The fake server answers "unknown project": that is the right behaviour,
    // and it is what this case checks — we do not return an empty list in
    // silence.
    const { code, errors } = await run('annotepage.mjs', ['text', '--config', other]);
    truthy(code !== 0, 'the command fails');
    contains(errors, 'project', 'the message talks about the project');
});

/* -- The MCP server, through its protocol --------------------------------- */

const dialogue = async (messages) => {
    const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    const { out, errors } = await run('mcp-server.mjs',
        ['--config', configFile], input);
    const read = out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { answers: read, errors };
};

await check('mcp: initialisation and tool list', async () => {
    const { answers } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: '2025-06-18', capabilities: {},
                    clientInfo: { name: 'test', version: '0' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    truthy(answers.length === 2, 'two answers, the notification expects none');
    truthy(answers[0].result.protocolVersion === '2025-06-18',
        'the client version is echoed back');
    truthy(answers[0].result.serverInfo.name === 'annotepage', 'server name');

    const names = answers[1].result.tools.map((t) => t.name);
    for (const expected of ['annotepage_open_notes', 'annotepage_read_note',
                            'annotepage_reply', 'annotepage_mark_resolved',
                            'annotepage_reopen', 'annotepage_export',
                            'annotepage_projects']) {
        truthy(names.includes(expected), 'tool ' + expected);
    }
    for (const tool of answers[1].result.tools) {
        truthy(tool.inputSchema && tool.inputSchema.type === 'object',
            'schema of ' + tool.name);
        truthy(typeof tool.description === 'string' && tool.description.length > 80,
            'description of ' + tool.name);
    }
});

await check('mcp: listing the open notes returns the grammar, decrypted', async () => {
    const { answers } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'annotepage_open_notes', arguments: {} } },
    ]);
    const content = answers[1].result.content[0].text;
    truthy(!answers[1].result.isError, 'no error');
    contains(content, 'note 4', 'the open note');
    contains(content, 'page /en/contact.html', 'its page, decrypted');
    contains(content, '  reply 5', 'and its thread');
});

await check('mcp: a failing tool returns isError, not a JSON-RPC error', async () => {
    const { answers } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'annotepage_reply', arguments: { id: 5, text: 'no' } } },
    ]);
    truthy(answers[1].error === undefined, 'not a protocol error');
    truthy(answers[1].result.isError === true, 'a result marked in error');
    contains(answers[1].result.content[0].text, 'already a reply to note 4',
        'the message is written to be read and fixed');
});

await check('mcp: an unknown method does not break the conversation', async () => {
    const { answers } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
        { jsonrpc: '2.0', id: 2, method: 'resources/list' },
        { jsonrpc: '2.0', id: 3, method: 'ping' },
    ]);
    truthy(answers[0].result.protocolVersion === '2024-11-05', 'older version accepted');
    truthy(answers[1].error.code === -32601, 'method not implemented');
    truthy(answers[2].result !== undefined, 'the conversation goes on');
});

await check('mcp: nothing but JSON-RPC goes out on stdout', async () => {
    const { answers, errors } = await dialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    ]);
    truthy(answers.length === 1, 'a single line on stdout');
    contains(errors, '[annotepage-mcp]', 'messages for a human go on stderr');
});

/* -- Verdict -------------------------------------------------------------- */

server.close();
rmSync(folder, { recursive: true, force: true });

if (failures.length === 0) {
    process.stdout.write(passed + ' end-to-end checks, all passed.\n');
} else {
    process.stdout.write(passed + ' passed, ' + failures.length + ' FAILED:\n\n');
    for (const failure of failures) process.stdout.write('  ' + failure + '\n\n');
    process.exitCode = 1;
}
