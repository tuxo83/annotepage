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
import { mkdtempSync, writeFileSync, readdirSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { b64url } from '../src/format.mjs';
import { derive, keyFromText, seal, indexOfPath } from '../src/crypto.mjs';

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
            state.received.push({ action, fields, origin: request.headers.origin || null });
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

const run = (script, args, input, options) => new Promise((settle) => {
    const child = spawn(process.execPath, [join(root, script)].concat(args),
                        Object.assign({ stdio: ['pipe', 'pipe', 'pipe'] }, options));
    let out = '';
    let errors = '';
    child.stdout.on('data', (m) => { out += m; });
    child.stderr.on('data', (m) => { errors += m; });
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
    child.on('close', (code) => settle({ code, out, errors }));
});

/* -- The set-up ----------------------------------------------------------- */

const KEY = b64url(new Uint8Array(32).map((v, i) => (i * 11 + 5) & 0xff));
const keys = await derive(keyFromText(KEY));
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
            key: KEY,
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
    truthy(out.trim() === keys.id, 'id derived from the key');
    truthy(out.indexOf(KEY) === -1, 'and never the key');
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
                         key: KEY, author: 'Assistant', read_only: true } },
    }), { mode: 0o600 });
    const { code, errors } = await run('annotepage.mjs',
        ['reply', '4', 'no', '--config', readOnly]);
    truthy(code !== 0, 'the command fails');
    contains(errors, 'read-only', 'the message says why');
    contains(errors, 'Nothing was written', 'and what did not happen');
});

await check('cli: a key that does not match the id is refused', async () => {
    const wrong = join(folder, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({
        projects: { r: { api: 'http://127.0.0.1:' + port + '/api.php',
                         key: KEY, id: 'AAAAAAAAAAAAAAAAAAAAAA' } },
    }), { mode: 0o600 });
    const { code, errors } = await run('annotepage.mjs', ['text', '--config', wrong]);
    truthy(code !== 0, 'the command fails');
    contains(errors, 'This key is not the key of this project',
        'the message of section 1.2 of the format');
    contains(errors, 'No request was made', 'and it says so before any network');
});

await check('cli: a wrong key is counted, it does not keep quiet', async () => {
    const other = join(folder, 'other-key.json');
    writeFileSync(other, JSON.stringify({
        projects: { r: { api: 'http://127.0.0.1:' + port + '/api.php?force=' + state.project,
                         key: b64url(new Uint8Array(32).fill(3)) } },
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

/* -- A CALL THAT CARRIES ITS OWN PROJECT ----------------------------------
 *
 * The point of these: NO CONFIGURATION FILE ANYWHERE. The server is started
 * with no --config, in an empty directory, with HOME pointed at another empty
 * directory, so that none of the three candidate paths exists. What reaches
 * the notes is the "api" and "key" of the call itself — which is what an
 * assistant reads off the annotepage tag of a public page.
 */

const nowhere = mkdtempSync(join(tmpdir(), 'annotepage-nowhere-'));
const noHome = mkdtempSync(join(tmpdir(), 'annotepage-nohome-'));
const bareEnvironment = Object.assign({}, process.env, {
    HOME: noHome, USERPROFILE: noHome, ANNOTEPAGE_CONFIG: '',
});
delete bareEnvironment.ANNOTEPAGE_CONFIG;

/** A dialogue with a server started with no configuration at all. */
const bareDialogue = async (messages) => {
    const input = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    const { out, errors } = await run('mcp-server.mjs', [], input,
        { cwd: nowhere, env: bareEnvironment });
    const read = out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { answers: read, errors };
};

const HERE = { api: 'http://127.0.0.1:' + port + '/api.php', key: KEY };

const bareCall = async (name, args) => {
    const { answers, errors } = await bareDialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
    ]);
    const result = answers[1] && answers[1].result;
    truthy(result !== undefined, 'no result for ' + name + '\n' + errors);
    return { text: result.content[0].text, isError: result.isError === true, errors };
};

/* THE COUNT IS ASSERTED, NOT THE NAMES, and that is on purpose: a tool added
   without being thought about would slip past a list of names nobody rereads,
   where a number has to be edited by whoever adds one. Nine since the title:
   open, read, reply, title, mark_resolved, reopen, export, save_project, and
   the one that lists projects. */
await check('mcp: with no configuration at all, the server still starts', async () => {
    const { answers, errors } = await bareDialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    truthy(answers.length === 2, 'it answered\n' + errors);
    truthy(answers[1].result.tools.length === 9, 'the nine tools are there');
    contains(errors, 'No configuration found', 'and it said so, on stderr');

    for (const tool of answers[1].result.tools) {
        const properties = tool.inputSchema.properties;
        truthy(properties.api && properties.key, 'api and key on ' + tool.name);
        contains(properties.key.description, 'data-key',
            'the key argument of ' + tool.name + ' says where to read it');
        contains(properties.key.description, 'READ IT OFF THE PAGE',
            'and in which order to look');
        contains(properties.key.description, 'ALREADY PUBLIC IN THE PAGE',
            'and the line that must not be crossed');
    }
});

await check('mcp: the assistant writes the project down, and uses it in the same session', async () => {
    /* THE POINT IS THE SECOND CALL. The server reads its configuration once,
       at startup; a project saved mid-conversation that only worked after a
       restart would put back exactly the step this tool removes. */
    const file = join(mkdtempSync(join(tmpdir(), 'annotepage-e2e-')), 'annotepage.json');
    const { answers, errors } = await bareDialogue([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
            name: 'annotepage_save_project',
            arguments: { site: 'staging.example.com', api: HERE.api, key: KEY, path: file } } },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
            name: 'annotepage_projects', arguments: { project: 'staging.example.com' } } },
    ]);
    truthy(answers.length === 3, 'three answers\n' + errors);
    const saved = answers[1].result.content[0].text;
    contains(saved, 'project staging.example.com', 'named after the site');
    contains(saved, 'in use now, with no restart', 'and available at once');
    truthy(!saved.includes(KEY), 'the key is not repeated back');

    const listed = answers[2].result.content[0].text;
    contains(listed, 'staging.example.com', 'the next call in the SAME session sees it');
    contains(listed, 'key present', 'with its key');
    truthy(!listed.includes(KEY), 'and still never the key itself');

    const object = JSON.parse(readFileSync(file, 'utf8'));
    truthy(object.projects['staging.example.com'].key === KEY, 'the file holds it');
    truthy((statSync(file).mode & 0o777) === 0o600, 'and nobody else on the machine reads it');
});

await check('mcp: api + key alone read the notes, no file anywhere', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes', HERE);
    truthy(!isError, 'no error:\n' + text);
    contains(text, 'note 4', 'the open note');
    contains(text, 'page /en/contact.html', 'decrypted with the key of the call');
    contains(text, 'project ' + keys.id, 'under the id DERIVED from that key');
});

await check('mcp: api + key write, and the write reads back', async () => {
    const written = await bareCall('annotepage_reply', Object.assign(
        { id: 4, text: 'Read off the tag, no configuration file.' }, HERE));
    truthy(!written.isError, 'no error:\n' + written.text);
    contains(written.text, 'signed "assistant"', 'signed, and by whom');

    const sent = state.received[state.received.length - 1];
    truthy(sent.fields.get('project') === keys.id, 'the derived id went to the server');
    truthy(sent.fields.get('text') === null, 'nothing in the clear');

    const back = await bareCall('annotepage_read_note', Object.assign({ id: 4 }, HERE));
    contains(back.text, '      Read off the tag, no configuration file.',
        'the reply reads back, so its envelope and its AAD are right');
    contains(back.text, '  author assistant', 'and carries the signature');
});

await check('mcp: origin is sent as the Origin header, canonical', async () => {
    const written = await bareCall('annotepage_reply', Object.assign(
        { id: 4, text: 'With an origin this time.',
          origin: 'HTTPS://Staging.Example.COM:443/' }, HERE));
    truthy(!written.isError, 'no error:\n' + written.text);

    const sent = state.received[state.received.length - 1];
    truthy(sent.origin === 'https://staging.example.com',
        'the header the server received: ' + JSON.stringify(sent.origin));

    // And with no origin, none is invented: FORMAT.md 6.2 refuses that write on
    // a relay, and it must refuse it rather than arrive under a made-up domain.
    await bareCall('annotepage_reply', Object.assign({ id: 4, text: 'None.' }, HERE));
    truthy(state.received[state.received.length - 1].origin === null,
        'no Origin header when the call did not say which site this is');
});

await check('mcp: an origin that is not an origin is refused with its shape', async () => {
    const bad = async (value, what) => {
        const { text, isError } = await bareCall('annotepage_open_notes',
            Object.assign({ origin: value }, HERE));
        truthy(isError, what + ': it was accepted');
        contains(text, 'is not an origin: ' + value, what);
        contains(text, 'no path, no query string', what + ' says the shape');
    };
    await bad('https://staging.example.com/review', 'a path');
    await bad('https://staging.example.com?x=1', 'a query string');
    await bad('staging.example.com', 'no scheme');
    await bad('ftp://staging.example.com', 'a scheme that is not http');
});

await check('mcp: "origin" alone is refused, it describes and does not name', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes',
        { origin: 'https://staging.example.com' });
    truthy(isError, 'refused');
    contains(text, '"origin" without "api" and "key"', 'it names what is missing');
    contains(text, 'it does not name one', 'and says what an origin is');
});

await check('mcp: "origin" beside "project" is refused like the rest', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes',
        Object.assign({ project: 'review', origin: 'https://staging.example.com' }, HERE));
    truthy(isError, 'refused');
    contains(text, '"api", "key" and "origin"', 'the refusal lists what was carried');
    contains(text, 'we do not pick a winner', 'and picks no winner');
});

await check('mcp: api + key never write anything to disk', async () => {
    truthy(readdirSync(nowhere).length === 0, 'the working directory stayed empty');
    truthy(readdirSync(noHome).length === 0, 'and so did the home directory');
});

await check('mcp: "api" without "key" is refused, and names what is missing', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes', { api: HERE.api });
    truthy(isError, 'refused');
    contains(text, '"api" without "key"', 'it names the half that is missing');
    contains(text, 'no falling back to the configuration file',
        'and says there is no silent fallback');
});

await check('mcp: "key" without "api" is refused too', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes', { key: KEY });
    truthy(isError, 'refused');
    contains(text, '"key" without "api"', 'it names the half that is missing');
});

await check('mcp: "key" and "project" together: refused, no winner picked', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes',
        Object.assign({ project: 'review' }, HERE));
    truthy(isError, 'refused');
    contains(text, 'we do not pick a winner', 'the refusal of section 1.5, in words');
    contains(text, 'nothing was written', 'and what did not happen');
    contains(text, 'derives the project id', 'and why a key needs no project beside it');
});

await check('mcp: a malformed key is refused with its expected shape', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes',
        { api: HERE.api, key: KEY.slice(0, 20) + ' ' + KEY.slice(21) });
    truthy(isError, 'refused');
    contains(text, '43 characters', 'the expected length');
    contains(text, 'A-Z a-z 0-9 - _', 'the expected alphabet');
    truthy(text.indexOf(KEY.slice(0, 20)) === -1, 'and the key is not echoed back');
});

await check('mcp: with no configuration, a call WITHOUT api+key says which file', async () => {
    const { text, isError } = await bareCall('annotepage_open_notes', {});
    truthy(isError, 'refused');
    contains(text, 'No configuration found', 'the startup error, raised at call time');
    contains(text, '.annotepage.json', 'and the paths it looked in');
});

await check('mcp: the projects tool reports the id a key derives, never the key',
    async () => {
        const { text, isError } = await bareCall('annotepage_projects', HERE);
        truthy(!isError, 'no error:\n' + text);
        contains(text, 'id ' + keys.id, 'the derived id');
        contains(text, 'written to disk no', 'and that nothing was kept');
        truthy(text.indexOf(KEY) === -1, 'the key itself appears nowhere');
    });

/* -- Verdict -------------------------------------------------------------- */

server.close();
rmSync(folder, { recursive: true, force: true });
rmSync(nowhere, { recursive: true, force: true });
rmSync(noHome, { recursive: true, force: true });

if (failures.length === 0) {
    process.stdout.write(passed + ' end-to-end checks, all passed.\n');
} else {
    process.stdout.write(passed + ' passed, ' + failures.length + ' FAILED:\n\n');
    for (const failure of failures) process.stdout.write('  ' + failure + '\n\n');
    process.exitCode = 1;
}
