# annotepage-client

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is the package's own contract — the tag, its attributes, and how to translate the interface. Everything else is on the site.**

The annotation layer of [annotepage](https://annotepage.com). One file, one
`<script>` tag, no dependency, no bundler, no stylesheet of its own.

A reviewer clicks an element of the page and writes what is wrong. The remark
is encrypted in their browser and pinned to that element. An assistant reads
the notes, fixes the code, replies in the thread with what it measured, and
resolves the remark stamped with the version the fix ships in.

## The tag

At the end of `<body>`. Needs a **secure context** — https, or localhost —
because the encryption is WebCrypto's.

```html
<script src="https://cdn.jsdelivr.net/npm/annotepage-client@2.23.0/dist/annotepage.js"
        integrity="sha384-3N2cyMhzg3iB8eohex9kcKadMt7xjORkxpv/BA7+jqrjhZSPnt6DwRFgDjBZPWkb"
        crossorigin="anonymous"
        data-server="https://api.annotepage.com/api.php"
        data-setup
        defer></script>
```

`data-server` is the address of an **annotepage server** — a small PHP
codebase that stores the notes. `api.annotepage.com` is a shared one, free and
already running, so there is nothing to install anywhere in order to try this:
it stores sealed envelopes and can read none of them. To run your own instead,
the install page walks it, and `server/INSTALL.md` is the reference.

`data-setup` opens the setup screen, once. It creates the project, shows you
the key — 43 characters, written down nowhere else — and prints the tag to
keep, with `data-project` in its place. A button, *Annotate this page*, then
sits at the foot of the page.

It must stay a **classic script tag**: the tool reads its own attributes
through `document.currentScript`, which is `null` inside a module. Loaded as a
module it stops, silently, with one line in the console.

## From npm

`npm install annotepage-client` gives you `dist/annotepage.js` — the file the
tag above loads, byte for byte — and `labels/fr.json`. Served from your own
origin, one directory below `api.php`, `data-server` may be dropped: the client
falls back to `../api.php` relative to its own `src`. From a CDN it is
required, because a CDN's address says nothing about the site under review.

## The attributes

The only thing here the site does not say, because it is the package's own
contract rather than a step in an installation.

| Attribute | What it declares |
|---|---|
| `data-server` | the address of `api.php`, the annotepage server. Required as soon as the client comes from a CDN |
| `data-key` | **the key itself**, 43 characters. The project is then **public**: the tool derives the id from it and starts, asking nothing |
| `data-project` | the project id, 22 characters. The project is then **confidential**: the key is asked for once per browser. Without either attribute the tool does nothing |
| `data-setup` | opens the setup screen. Remove it once the project exists |
| `data-mode` | `encrypted` (default) or `plain` |
| `data-path` | path prefix: which pages belong to the project. `/fr/` does not annotate `/en/` |
| `data-domains` | origins of the project, separated by commas |
| `data-version` | the version really being served, as the site names it |
| `data-environment` | the name of the environment, written into the note as it stands |
| `data-labels` | a label file belonging to the site, resolved against the document |

`data-version` earns its place: when a note is resolved, the tool compares the
version of the fix with this one to tell "resolved and online" — which folds
into the history — from "resolved, not deployed yet" — which stays in front of
the reviewer, because the defect is still on their screen. Missing: the fix is
taken as not deployed and the note stays visible.

## Translating it

Every text is in `src/15-labels.js`, a flat object, in English. Replace what
you like without touching the code:

```html
<script>window.Annotepage = { labels: { 'button.open': 'Annoter la page' } };</script>
<script src="https://annotepage.com/annotepage-client-2.23.0.js" ... defer></script>
```

A missing label falls back on English, so a partial translation is usable. A
complete French set ships in the package, in `labels/fr.json`.

## Key lost = notes lost

The notes are encrypted in the browser. The server stores sealed envelopes and
cannot read a path, a name or a remark — nor can whoever runs it. There is no
recovery and no escrow.

## What it does not touch

No cookie, no analytics, no third-party request. The interface lives in a
shadow root, so no rule of the site can reach it and no rule of the tool can
reach the site. Outside annotation mode the page is exactly the site's.

## The exchange format

[`FORMAT.md`](https://github.com/tuxo83/annotepage/blob/main/FORMAT.md) — the
envelope, the derivations, the blind index, the text export. It is the
reference; where any other file disagrees with it, it is right.

## Licence

MIT. Source: [github.com/tuxo83/annotepage](https://github.com/tuxo83/annotepage)
