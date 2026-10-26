/*
 * annotepage-server -- the server as an embeddable Node module.
 *
 * createServer() ties a store and a configuration into one function from a
 * web-standard Request to a Response. Mount that function wherever your app
 * already answers requests; the adapters (see src/adapters, batch B6) turn it
 * into an Express router, a Node http handler or a Fastify plugin, but none is
 * required -- the function is the whole interface.
 *
 *   import { createServer } from 'annotepage-server';
 *   import { SqliteStore } from 'annotepage-server/stores/sqlite';
 *
 *   const api = createServer({
 *       store: new SqliteStore({ file: './data/notes.sqlite' }),
 *       projects: { '7Qb1kZ3xNvA9dLpEqKf2Zt': { mode: 'encrypted' } },
 *   });
 *   const response = await api.fetch(request);
 */

import { normaliseConfig } from './config.js';
import { createHandler } from './handler.js';
import { createBounds } from './bounds.js';

export { SqliteStore } from './store-sqlite.js';
export { ApFailure } from './errors.js';
export { normaliseConfig } from './config.js';
export { createBounds } from './bounds.js';
export { AP_FORMAT } from './constants.js';

/**
 * @param {object} options the configuration (see config.js) plus:
 *   - `store` (required): the store, e.g. a SqliteStore
 *   - `bounds`: the domain lock / rate limiting / caps (batch B3); the default
 *     enforces none
 *   - `writeTextExport`: the text export producer (batch B4)
 *   - `statistics`: `{ schedule, world }` (batch B5)
 *   - `log`: called with one string on an unexpected error
 * @returns {{ fetch: (r: Request) => Promise<Response>, handler, config, store }}
 */
export function createServer(options = {}) {
    const { store, bounds, writeTextExport, statistics, log, ...rest } = options;
    if (!store) {
        throw new Error('createServer needs a `store` -- e.g. new SqliteStore({ file }).');
    }
    const config = normaliseConfig(rest);
    // The real bounds enforce the domain lock, rate limits and caps -- all off
    // until the configuration turns one on. A host may pass its own `bounds`.
    const handler = createHandler(config, store, {
        bounds: bounds || createBounds({ log }),
        writeTextExport, statistics, log,
    });
    return {
        // `fetch` is the name the edge runtimes expect, so `export default` of
        // this object runs on Bun, Deno and Workers unchanged.
        fetch: handler,
        handler,
        config,
        store,
    };
}

export default createServer;
