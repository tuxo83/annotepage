# annotepage-server

> ### The documentation is [annotepage.com](https://annotepage.com)

The annotepage server as an **embeddable Node module**: the seven addresses,
the store and the bounds, over the web-standard `Request`/`Response`. No PHP, no
framework, no separate server to run beside your app.

It is a port of [`server/`](../server/) (PHP). The wire format is the same one
[`FORMAT.md`](../FORMAT.md) describes, so the [`annotepage-client`](../client/)
that talks to a PHP server talks to this one unchanged, and a database file is
readable by either.

> **Status: in progress.** The store ships; the handler, the bounds, the text
> export and the statistics are being built. This readme is filled in as they
> land.

## The store

```js
import { SqliteStore } from 'annotepage-server/stores/sqlite';

const store = new SqliteStore({ file: './data/notes.sqlite' });
// or an in-process database, for a test or a demo:
const memory = new SqliteStore({ file: ':memory:' });
```

The store is **pluggable**: anything that carries the same methods can back the
server with its own database. The built-in one uses `node:sqlite` (Node >= 22.5,
no dependency to compile) and writes the same schema as the PHP SQLite store.

Keep the database file **out of any directory your app serves statically**: the
notes are encrypted, but page indexes, timestamps and volumes are not, and in
plain mode nothing is.

## Licence

MIT.
