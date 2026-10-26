/*
 * The CLI -- the package's application half. Arg parsing and option building
 * are pure and tested directly; one test actually starts the server and stops
 * it, to prove `npx annotepage-server` serves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { parseArgs, buildOptions, run } from '../src/cli.js';

const PROJECT = '7Qb1kZ3xNvA9dLpEqKf2Zt';
const IDX = 'idxHomeHomeHomeHomeHom';

test('parseArgs reads flags, = form, repeats and the stats choice', () => {
    const p = parseArgs(['--port', '8080', '--db=:memory:', '--project', 'a:plain',
        '--project', 'b', '--report-statistics', 'false', '--relay']);
    assert.equal(p.port, 8080);
    assert.equal(p.db, ':memory:');
    assert.deepEqual(p.projects, ['a:plain', 'b']);
    assert.equal(p.reportStatistics, false);
    assert.equal(p.relay, true);
});

test('parseArgs refuses an unknown option', () => {
    assert.throws(() => parseArgs(['--nope']), /Unknown option/);
});

test('buildOptions turns flags into createServer options', () => {
    const parsed = parseArgs(['--project', `${PROJECT}:plain`, '--report-statistics', 'false',
        '--prefix', '/', '--port', '0']);
    const built = buildOptions(parsed, () => { throw new Error('no config read'); });
    assert.deepEqual(built.options.projects, { [PROJECT]: { mode: 'plain' } });
    assert.equal(built.options.reportStatistics, false);
    assert.equal(built.prefix, '');            // '/' normalises to no prefix
    assert.equal(built.port, 0);
    assert.equal(built.dbFile, './annotepage.sqlite');
});

test('buildOptions merges a --config file, flags overriding it', () => {
    const parsed = parseArgs(['--config', 'x.json', '--report-statistics', 'true']);
    const config = JSON.stringify({
        projects: { [PROJECT]: { mode: 'encrypted' } },
        reportStatistics: false, port: 9000, store: { ignored: true },
    });
    const built = buildOptions(parsed, () => config);
    assert.equal(built.port, 9000);                          // from the file
    assert.equal(built.options.reportStatistics, true);      // flag overrode the file
    assert.equal('store' in built.options, false);           // store is never from JSON
});

test('run starts a server that serves, and stops', async () => {
    const http = run(['--project', PROJECT, '--report-statistics', 'false',
        '--db', ':memory:', '--port', '0', '--prefix', '/annotepage/api'],
        { log: () => {} });
    try {
        await once(http, 'listening');
        const port = http.address().port;
        const res = await fetch(`http://127.0.0.1:${port}/annotepage/api?action=list&project=${PROJECT}&index=${IDX}`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
    } finally {
        http.close();
        await once(http, 'close');
    }
});

test('the stats choice is optional: omitting it leaves the default (on)', () => {
    const built = buildOptions(parseArgs(['--project', PROJECT]), () => { throw new Error('no config'); });
    // Not set here, so createServer applies the default, which is on (like PHP).
    assert.equal('reportStatistics' in built.options, false);
});
