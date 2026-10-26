/*
 * cli.js -- the SAME package as a runnable application.
 *
 * annotepage-server is a library first: you mount api.fetch inside your app
 * (see index.js). But the same package also runs on its own -- `npx
 * annotepage-server` -- for whoever wants the server without writing any Node:
 * a reviewer, a demo, a container, a side process. One package, two uses.
 *
 * This file is the standalone half: it parses a few flags (and an optional
 * JSON config for the rest), builds a store and a server from the library, and
 * listens on Node's own http. It adds no capability the library lacks -- it is
 * a thin front over createServer().
 */

import { createServer as httpServer } from 'node:http';
import { readFileSync } from 'node:fs';

import { createServer } from './index.js';
import { SqliteStore } from './store-sqlite.js';
import { nodeListener } from './adapters.js';

const USAGE = `annotepage-server -- run an annotepage server on its own.

Usage:
  annotepage-server --project <id> [options]

Options:
  --port <n>                 Port to listen on (default 3000).
  --db <path>                SQLite file (default ./annotepage.sqlite;
                             ':memory:' keeps nothing).
  --prefix <path>            Mount path (default '/'); e.g. /annotepage/api.
  --project <id[:mode]>      Declare a project; mode is encrypted (default) or
                             plain. Repeatable.
  --report-statistics <b>    Report once a day? On by default, like the PHP
                             server; pass false to turn it off (a random id,
                             the version and three totals -- nothing else).
  --relay                    Run as a relay (not self-hosted): plain mode off,
                             an Origin required on every write.
  --open-registration        Accept undeclared project ids (relay only).
  --config <file.json>       Base options (the createServer object, without
                             'store'); flags above override it.
  --version                  Print the server-node version and exit.
  --help                     Print this and exit.

Examples:
  annotepage-server --project 7Qb1kZ3xNvA9dLpEqKf2Zt
  annotepage-server --config ./annotepage.json --port 8080
`;

/** Parse argv (without node/script) into a structured request. Pure: it reads
 *  nothing and starts nothing, so it is testable on its own. */
export function parseArgs(argv) {
    const out = {
        help: false, version: false,
        port: undefined, db: undefined, prefix: undefined,
        projects: [], reportStatistics: undefined,
        relay: false, openRegistration: false, config: undefined,
    };
    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        let value;
        const eq = arg.indexOf('=');
        if (arg.startsWith('--') && eq !== -1) {
            value = arg.slice(eq + 1);
            arg = arg.slice(0, eq);
        }
        const next = () => (value !== undefined ? value : argv[++i]);
        switch (arg) {
            case '--help': case '-h': out.help = true; break;
            case '--version': case '-v': out.version = true; break;
            case '--port': out.port = Number(next()); break;
            case '--db': out.db = next(); break;
            case '--prefix': out.prefix = next(); break;
            case '--project': out.projects.push(next()); break;
            case '--config': out.config = next(); break;
            case '--relay': out.relay = true; break;
            case '--open-registration': out.openRegistration = true; break;
            case '--report-statistics': {
                const v = (value !== undefined ? value : argv[++i]);
                out.reportStatistics = v === 'true' ? true : v === 'false' ? false : v;
                break;
            }
            case '--no-report-statistics': out.reportStatistics = false; break;
            default:
                throw new Error(`Unknown option: ${arg}\n\n${USAGE}`);
        }
    }
    return out;
}

/** Turn a --project entry ("id" or "id:plain") into a [id, {mode}] pair. */
function projectEntry(spec) {
    const [id, mode] = String(spec).split(':');
    return [id, { mode: mode === 'plain' ? 'plain' : 'encrypted' }];
}

/**
 * Build the createServer options and the listen settings from parsed args and
 * an optional JSON config file. Flags override the file. Does not start
 * anything; returns `{ options, port, prefix, dbFile }`.
 *
 * @param {object} parsed from parseArgs
 * @param {(path: string) => string} readFile reads the config file (injected
 *   so this stays pure and testable)
 */
export function buildOptions(parsed, readFile) {
    let base = {};
    if (parsed.config) {
        base = JSON.parse(readFile(parsed.config));
        if (base.store) {
            delete base.store;   // the CLI makes the store from --db, not JSON
        }
    }
    const projects = parsed.projects.length
        ? Object.fromEntries(parsed.projects.map(projectEntry))
        : base.projects;

    const options = { ...base };
    if (projects) {
        options.projects = projects;
    }
    if (parsed.relay) {
        options.selfHosted = false;
    }
    if (parsed.openRegistration) {
        options.openRegistration = true;
    }
    if (parsed.reportStatistics !== undefined) {
        options.reportStatistics = parsed.reportStatistics;
    }
    // Omitted, it keeps createServer's default: on, like the PHP server.

    const dbFile = parsed.db !== undefined ? parsed.db
        : (base.dbFile || './annotepage.sqlite');
    const port = parsed.port !== undefined ? parsed.port : (base.port || 3000);
    let prefix = parsed.prefix !== undefined ? parsed.prefix : (base.prefix || '');
    if (prefix === '/') {
        prefix = '';
    }
    return { options, port, prefix, dbFile };
}

/** Builds the api and a Node request listener that honours the mount prefix. */
export function buildServer({ options, prefix, dbFile }) {
    const api = createServer({ store: new SqliteStore({ file: dbFile }), ...options });
    const listener = nodeListener(api);
    const handler = (req, res) => {
        if (prefix && (req.url || '').startsWith(prefix)) {
            req.url = req.url.slice(prefix.length) || '/';
        } else if (prefix) {
            res.statusCode = 404;
            res.end('not here\n');
            return;
        }
        return listener(req, res);
    };
    return { api, handler };
}

/** The entry point: parse, build, listen. Returns the http server (so a test
 *  can close it). `log` and `fatal` are injected. */
export function run(argv, { log = console.log, fatal = (m) => { console.error(m); process.exit(1); }, readFile } = {}) {
    let parsed;
    try {
        parsed = parseArgs(argv);
    } catch (e) {
        return fatal(e.message);
    }
    if (parsed.help) {
        log(USAGE);
        return null;
    }
    if (parsed.version) {
        log(VERSION);
        return null;
    }
    let built;
    try {
        built = buildOptions(parsed, readFile || ((p) => readFileSync(p, 'utf8')));
    } catch (e) {
        return fatal('Could not read --config: ' + e.message);
    }

    let server;
    try {
        server = buildServer(built);
    } catch (e) {
        // createServer can throw on a bad store or configuration.
        return fatal(e.message);
    }

    const http = httpServer(server.handler);
    http.listen(built.port, () => {
        const where = (built.prefix || '') + '/';
        log(`annotepage-server listening on http://localhost:${http.address().port}${where}`);
        log(`  store: ${built.dbFile}`);
        const ids = Object.keys(built.options.projects || {});
        log(`  projects: ${ids.length ? ids.join(', ') : '(none declared)'}`);
        // From the resolved config, not the raw options: omitting the flag
        // keeps the default (on), and the line must say what actually runs.
        log(`  statistics: ${server.api.config.reportStatistics ? 'on' : 'off'}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, () => http.close(() => process.exit(0)));
    }
    return http;
}

// Resolved at load from the package manifest, once.
const VERSION = (() => {
    try {
        return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    } catch (e) {
        return 'unknown';
    }
})();
