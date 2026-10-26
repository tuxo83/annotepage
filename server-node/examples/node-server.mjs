/*
 * A minimal self-hosted annotepage server on Node's own http, with nothing but
 * this package. Run it:
 *
 *   node examples/node-server.mjs
 *
 * Then point an annotepage-client tag at http://localhost:3000/annotepage/api.
 * This example keeps the notes in an in-process database, so they are gone when
 * it stops; give SqliteStore a `file` to keep them.
 */

import { createServer as http } from 'node:http';

import { createServer } from '../src/index.js';
import { SqliteStore } from '../src/store-sqlite.js';
import { nodeListener } from '../src/adapters.js';

const api = createServer({
    store: new SqliteStore({ file: ':memory:' }),
    // One project, in plain mode here so the notes are readable in this demo.
    // A real deployment declares `mode: 'encrypted'` and lets the client hold
    // the key. Replace the id with the one your client's tag carries.
    projects: {
        '7Qb1kZ3xNvA9dLpEqKf2Zt': { mode: 'plain' },
    },
    version: '2.0.0',
    // Reporting defaults to on, like the PHP server; turned off here because a
    // throwaway :memory: demo has nothing worth reporting.
    reportStatistics: false,
});

const PREFIX = '/annotepage/api';
const listener = nodeListener(api);

http((req, res) => {
    if ((req.url || '').startsWith(PREFIX)) {
        // Strip the prefix so the handler sees ?action=... at the root. (A
        // framework router does this for you; raw http does not.)
        req.url = req.url.slice(PREFIX.length) || '/';
        return listener(req, res);
    }
    res.statusCode = 404;
    res.end('not here\n');
}).listen(3000, () => {
    process.stdout.write('annotepage server on http://localhost:3000' + PREFIX + '\n');
});
