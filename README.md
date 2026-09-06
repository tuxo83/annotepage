# annotepage

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is the map of the code. What the tool does, and how you get it running, is on the site and is not repeated here.**

Annotate a web page. A reviewer clicks an element and writes what is wrong. An
assistant reads the notes, fixes the code, replies in the thread with what it
measured, and resolves the remark stamped with the version the fix ships in.

Free, MIT, no account, no tracking.

**Key lost = notes lost.** No recovery, no escrow, no rotation — the server has
never had the key. It is said here, and nowhere else in this repository,
because it is the one thing that will hurt:
[why](https://annotepage.com/questions.html#no-recovery).

## The three pieces

| | |
|---|---|
| [`client/`](client/) | the annotation layer, one file, one `<script>` tag — npm `annotepage-client` |
| [`server/`](server/) | one PHP codebase, on the site itself or on a machine serving several |
| [`mcp/`](mcp/) | the assistants' access: an MCP server and a CLI — npm `annotepage-mcp` |

## For whoever reads the code

- [`FORMAT.md`](FORMAT.md) — the exchange format and the security model. It is
  the reference; where any other file disagrees with it, it is right.
- [`CONVENTIONS.md`](CONVENTIONS.md) — how this repository is written.
- [`server/INSTALL.md`](server/INSTALL.md) — running a server, past the install
  page: MySQL, the addresses, migration, the flags.
- [`ROADMAP.md`](ROADMAP.md) — what is coming, and what is ruled out for good.

```
npm run build     # rebuild the client bundle
npm run check     # the whole suite, and the gate before any release
```

## Licence

MIT.
