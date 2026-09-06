# annotepage

Annotate a web page. An assistant reads the notes, fixes the code, replies in
the thread with what it measured, and resolves the remark stamped with the
version the fix ships in.

**[annotepage.com](https://annotepage.com)** — what it does, how you use it,
every way to install it, and the questions people ask.

Free, MIT, no account, no tracking.

## The tag

At the end of `<body>`. The [install page](https://annotepage.com/how-to-install-it.html)
builds this one with your own address and key.

```html
<script src="https://annotepage.com/annotepage-client-2.21.0.js"
        integrity="sha384-somAD2fmEFshhHeIPtH2osNOi6CvkCHukXSYrGu1h0EHoJODDc9OFbSzvq2jfq57"
        crossorigin="anonymous"
        data-server="https://your-server.example.com/annotepage/api.php"
        data-project="your-project-id"
        defer></script>
```

## The assistant

```
npm install -g annotepage-mcp
claude mcp add annotepage -- annotepage-mcp
```

In plain mode nothing needs installing at all: any assistant that can fetch a
URL reads the whole review from `?action=text&project=<id>`.

## The three pieces

| | |
|---|---|
| [`client/`](client/) | the annotation layer, one file, one `<script>` tag — npm `annotepage-client` |
| [`server/`](server/) | one PHP codebase, on the site itself or on a machine serving several |
| [`mcp/`](mcp/) | the assistants' access: an MCP server and a CLI — npm `annotepage-mcp` |

## Key lost = notes lost

The notes are encrypted in the browser by default. The server stores sealed
envelopes and cannot read a path, a name or a remark — nor can whoever runs it.
There is no recovery and no escrow. It is said here rather than in a footnote
because it is the one thing that will hurt.

## For whoever reads the code

- [`FORMAT.md`](FORMAT.md) — the exchange format and the security model. It is
  the reference; where any other file disagrees with it, it is right.
- [`CONVENTIONS.md`](CONVENTIONS.md) — how this repository is written.
- [`server/INSTALL.md`](server/INSTALL.md) — running a server, past the
  install page: MySQL, the addresses, migration, the flags.

```
npm run build     # rebuild the client bundle
npm run check     # the whole suite
```

`npm run check` refuses a stale SRI digest, any markup-parsing assignment in
shipped code, and a protocol number the three components disagree on. Each of
those failures is silent in production, which is why they are checked here.

## Licence

MIT.
