# annotepage-client

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is the package's own contract. What annotepage is, and the tag that loads it, are on the site and are not repeated here.**

The annotation layer of annotepage: one file, one `<script>` tag, no
dependency, no bundler, no stylesheet of its own.

`npm install annotepage-client` gives you `dist/annotepage.js` — the file the
tag loads, byte for byte — and `labels/fr.json`.
**[The install page](https://annotepage.com/how-to-install-it.html) builds the
tag**, with your address, your key and the digest for the version you take.

## The tag has to stay a classic script tag

The tool reads its own attributes through `document.currentScript`, which is
`null` inside a module — and just as null once a “combine JS” option, an asset
pipeline or a bundler has concatenated this file with others. There is then no
tag to read: the client writes one line in the console and stands down, having
drawn nothing and sent nothing.

## Declaring the settings without a tag

For those pages, the same settings go in one object, declared **before** the
client is loaded:

```html
<script>
  window.annotepageConfig = {
    server: 'https://example.com/annotepage/api.php',
    key: '<43 characters>'
  };
</script>
```

The names are the ones in the table below, without `data-`. Three differences,
each of them deliberate:

- **`server` is required here.** On a tag, a client served by the site itself
  falls back on `../api.php` *relative to its own file*; with no tag there is
  no file address to deduce one from, and an address guessed wrong sends the
  remarks nowhere at all. Missing, it is refused and said.
- **`setup` is a value**, `true` or `false`, where the attribute is presence.
- **`domains`** takes an array as well as the comma-separated string.

A page may carry both. They must then say the same thing: every setting the
object writes has to be written on the tag, with the same value. Anything else
is refused and named — nothing sent, nothing decrypted, no winner picked, for
the same reason a tag whose key and id disagree is refused. The tag is the
standard way and stays the one the install page hands out;
[the question this answers](https://annotepage.com/questions.html#config) is on
the site.

## The attributes

| Attribute | What it declares |
|---|---|
| `data-server` | the address of `api.php`, the annotepage server. Required as soon as the client comes from a CDN — served from your own origin, one directory above, it falls back to `../api.php` relative to its own `src` |
| `data-key` | **the key itself**, 43 characters. The project is then **public**: the tool derives the id from it and starts, asking nothing |
| `data-project` | the project id, 22 characters. The project is then **confidential**: the key is asked for once per browser. Without either attribute the tool does nothing |
| `data-setup` | opens the setup screen, which creates the project and shows the key once. Remove it afterwards |
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
```

before the tag, or a file of your own declared on it with `data-labels`. A
missing label falls back on English, so a partial translation is usable.

A complete French set ships in the package, ready for `data-labels` — from the
same CDN and range as the client, nothing to copy into your repository:

```html
data-labels="https://cdn.jsdelivr.net/npm/annotepage-client@2/labels/fr.js"
```

Labels your page set before the tag are kept over it. The same set, as JSON, is
`labels/fr.json`.

## What it does not touch

No cookie, no analytics, no third-party request. The interface lives in a
shadow root, so no rule of the site can reach it and no rule of the tool can
reach the site. Outside annotation mode the page is exactly the site's.

## Licence

MIT. Source: [github.com/tuxo83/annotepage](https://github.com/tuxo83/annotepage),
where [`FORMAT.md`](https://github.com/tuxo83/annotepage/blob/main/FORMAT.md)
specifies the envelope, the derivations and the export.
