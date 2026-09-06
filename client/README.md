# annotepage-client

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is the package's own contract — the tag, its attributes, and how to translate the interface. Everything else is on the site.**

The annotation layer of [annotepage](https://annotepage.com). One file, one
`<script>` tag, no dependency, no bundler, no stylesheet of its own.

## The attributes

**The tag itself is built for you by
[the install page](https://annotepage.com/how-to-install-it.html)**, with your
address, your key and the integrity digest for the version you take. What is
here is the part it does not carry: the full list of attributes, which is the
package's own contract rather than a step in an installation.

`npm install annotepage-client` gives you `dist/annotepage.js` — the file that
tag loads, byte for byte — and `labels/fr.json`. Served from your own origin,
one directory below `api.php`, `data-server` may be dropped: the client falls
back to `../api.php` relative to its own `src`. From a CDN it is required,
because a CDN's address says nothing about the site under review.

It must stay a **classic script tag**: the tool reads its own attributes
through `document.currentScript`, which is `null` inside a module. Loaded as a
module it stops, silently, with one line in the console.

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

## What it does not touch

No cookie, no analytics, no third-party request. The interface lives in a
shadow root, so no rule of the site can reach it and no rule of the tool can
reach the site. Outside annotation mode the page is exactly the site's.

## Licence

MIT. Source: [github.com/tuxo83/annotepage](https://github.com/tuxo83/annotepage),
where [`FORMAT.md`](https://github.com/tuxo83/annotepage/blob/main/FORMAT.md)
specifies the envelope, the derivations and the export.
