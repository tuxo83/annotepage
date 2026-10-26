/*
 * PARITY WITH THE PHP SERVER -- the check that keeps this port from drifting.
 *
 * There is no PHP on the test machine, and this does not run any: it reads the
 * PHP source as text (as the repo's own check-store-pair does) and compares the
 * two surfaces a client depends on being the same.
 *
 *   1. the SQLite SCHEMA: the column names, in order. A file written by one
 *      store must be read by the other, which holds only if the columns match.
 *   2. the STORE METHODS api.php calls through its one $store variable: every
 *      one must exist on the Node store, or an action would be a 500 here that
 *      is a 200 there.
 *
 * Skipped, loudly, when the PHP source is not beside this package (a published
 * tarball ships without it): a check that cannot run must not report a pass.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { EXPECTED_COLUMNS, SqliteStore } from '../src/store-sqlite.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..', '..', 'server', 'webroot');
const storePhp = join(serverDir, 'internal', 'store-sqlite.php');
const apiPhp = join(serverDir, 'api.php');

const havePhp = existsSync(storePhp) && existsSync(apiPhp);

test('the SQLite column names match the PHP store, in order', { skip: !havePhp && 'PHP source not beside the package' }, () => {
    const php = readFileSync(storePhp, 'utf8');
    // The expectedColumns() body: from the function to its closing "        );".
    const body = /function expectedColumns\(\)\s*\{[\s\S]*?return array\(([\s\S]*?)\);/.exec(php);
    assert.ok(body, 'could not find expectedColumns() in the PHP store');
    const phpNames = [...body[1].matchAll(/'([a-z_]+)'\s*=>/g)].map((m) => m[1]);
    const nodeNames = Object.keys(EXPECTED_COLUMNS);
    assert.deepEqual(nodeNames, phpNames,
        'the Node schema has drifted from the PHP store-sqlite.php schema');
});

test('every store method api.php calls exists on the Node store', { skip: !havePhp && 'PHP source not beside the package' }, () => {
    const php = readFileSync(apiPhp, 'utf8');
    const called = new Set([...php.matchAll(/\$store->([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));
    assert.ok(called.size > 0, 'found no $store-> calls in api.php -- reading the wrong thing');
    const store = new SqliteStore({ file: ':memory:' });
    const missing = [...called].filter((name) => typeof store[name] !== 'function');
    assert.deepEqual(missing, [],
        'api.php calls store methods the Node store does not have: ' + missing.join(', '));
});

test('the known actions match api.php (update excepted, which is not ported)', { skip: !havePhp && 'PHP source not beside the package' }, async () => {
    const php = readFileSync(apiPhp, 'utf8');
    const m = /\$actions = array\(([^)]*)\)/.exec(php);
    assert.ok(m, 'could not find the $actions list in api.php');
    const phpActions = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).filter((a) => a !== 'update');
    // The handler's list is not exported; reach it through its refusal message,
    // which names each action it accepts.
    const { createServer } = await import('../src/index.js');
    const api = createServer({ store: new SqliteStore({ file: ':memory:' }) });
    const body = await (await api.fetch(new Request('http://x/api?action=__unknown__'))).text();
    for (const action of phpActions) {
        assert.match(body, new RegExp('\\?action=' + action),
            `the handler does not list the action '${action}' that api.php serves`);
    }
});
