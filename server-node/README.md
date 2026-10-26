# annotepage-server

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)

The annotepage server as an **embeddable Node module**: the seven addresses,
the store and the bounds, over the web-standard `Request`/`Response`. No PHP, no
framework, no separate server to run beside your app.

It is a port of the PHP [`server/`](../server/). The wire format is the one
[`FORMAT.md`](../FORMAT.md) describes, so the
[`annotepage-client`](../client/) that talks to a PHP server talks to this one
**unchanged**, and a SQLite file is readable by either.

## Install

```
npm install annotepage-server
```

Node **>= 22.5** (for the built-in `node:sqlite` store; the core handler itself
needs only the Fetch API, Node >= 18). No native build, no runtime dependency.

## Quick start

```js
import { createServer } from 'annotepage-server';
import { SqliteStore } from 'annotepage-server/stores/sqlite';
import { nodeListener } from 'annotepage-server/adapters';
import { createServer as http } from 'node:http';

const api = createServer({
    store: new SqliteStore({ file: './data/notes.sqlite' }),
    // Declare the project the client's tag carries. Encrypted is the default.
    projects: { '7Qb1kZ3xNvA9dLpEqKf2Zt': { mode: 'encrypted' } },
});

http(nodeListener(api)).listen(3000);
// The client loads from your page and points at http://localhost:3000/...
```

The client is configured exactly as against a PHP server, with the base URL of
wherever you mounted this. Point its tag at the mount and it works as is.

## Mounting it

The module's real interface is **`api.fetch(request)`** -- a standard Request
in, a Response out. Hand it to any runtime that speaks the Fetch API:

```js
// Bun, Deno, Cloudflare Workers:
export default { fetch: api.fetch };
```

For the Node-shaped frameworks, the optional adapters
(`annotepage-server/adapters`) do the glue:

```js
// Node http / Connect / Express -- mount anywhere:
app.use('/annotepage/api', nodeListener(api));

// Fastify:
import { fastifyPlugin } from 'annotepage-server/adapters';
await fastify.register(fastifyPlugin(api), { prefix: '/annotepage/api' });
```

The adapters pass the client address (for rate limiting) from the connection --
`req.ip` behind Express's trust-proxy, else the socket. A proxy header is
trusted only when you name it in `clientIpHeader`.

## The store

```js
new SqliteStore({ file: './data/notes.sqlite' })   // a file
new SqliteStore({ file: ':memory:' })               // in-process, for a test
```

The store is **pluggable**: anything carrying the same methods can back the
server with your own database (the method surface is `src/store-sqlite.js`). The
built-in one uses `node:sqlite` and writes the **same schema** as the PHP SQLite
store, so a file migrates between them untouched.

> **Keep the database file out of any directory your app serves statically.**
> The notes are encrypted, but page indexes, timestamps and volumes are not,
> and in plain mode nothing is.

## Configuration

Everything but `store` is optional. Bounds are **off** until set.

| Key | Default | What it is |
|---|---|---|
| `store` | — | **Required.** The store. |
| `projects` | `{}` | Map `id → { origins?, mode? }`. `mode` is `encrypted` (default) or `plain`. `origins` is a list (`['https://app.example.com']`, `'https://*.example.com'` for subdomains) turning on the domain lock; omit for none. |
| `selfHosted` | `true` | Self-hosted (same door as the site): plain mode allowed, no Origin required on writes. `false` is a relay: plain mode impossible, every write must carry an Origin. |
| `openRegistration` | `false` | Relay only: accept undeclared project ids, always encrypted. |
| `maxNoteAgeDays` | `0` | Retention: expire whole threads older than this. `0` keeps everything. |
| `maxBodyBytes` | `0` | Body cap (Content-Length). |
| `rateWindowSeconds` + `rateWritesPerIp` / `rateWritesPerProject` / `rateReadsPerIp` / `rateExportsPerIp` | `0` | Rate limiting, fixed window. A `0` window or cap touches no counter. |
| `maxNotesPerProject` | `0` | Cap on notes per project. |
| `clientIpHeader` | `null` | Header to read the client address from, behind a proxy (e.g. `x-forwarded-for`). Never trusted unless named. |
| `publishServerTotals` | `false` | Add server-wide totals to `list` (a relay figure; off by design). |
| `reportStatistics` | `false` | Opt in to the once-a-day phone-home (see below). |
| `statisticsAddress` | annotepage.com | Override the statistics receiver (a fork's own). |
| `diagnostic` | `'minimal'` | `?action=diagnostic` detail: `off`, `minimal` or `full`. |
| `version` / `clientVersion` / `mcpVersion` | `'unknown'` | Announced in responses; never gate anything (FORMAT.md 6.1). |

## Statistics

`reportStatistics` is **off by default here**, unlike the PHP server: a library
embedded in your app must not phone home unasked. Turned on, once a day after a
write it sends a random id, the version and three totals (projects, notes,
pages) to `api.annotepage.com` -- no domain, no project id, no page, no note, no
name. See [FORMAT.md §6.5](../FORMAT.md). It is fired after the response and
never blocks it.

## What is not ported from the PHP

- the **`update`** action (a server rewriting its own files): you run
  `npm update`. An `update` request is answered as an unknown action.
- the **https redirect**: your app or its proxy terminates TLS, and the module
  may be mounted under a subpath.
- the **statistics receiver** (the one server the address leads to): an
  embedded module sends, it never receives.

## Licence

MIT.
