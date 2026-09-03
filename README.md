# annotepage

Annotate a web page. An AI reads the notes, fixes, replies in the thread, and
archives them.

Someone reviewing a staging site clicks what they see -- a heading, a button,
an image -- and writes what is wrong. The remark is encrypted in the browser
and pinned to that element. An assistant reads the notes as text, fixes the
code, **answers in the thread saying what it measured**, and marks the remark
resolved with the version the fix ships in. The reviewer sees what became of
what they wrote.

That loop is the whole point. Plenty of tools collect feedback; they hand it
off to a tracker and the trail ends there.

## Install it on a site

One tag, at the end of `<body>`:

```html
<script src="https://annotepage.com/annotepage-client-2.0.1.js"
        integrity="sha384-5wrAEkCKCLyEM3YJsVd6H7gFCOHt9f63XTDIM0Eu4fVYEAr3X4wgDWEDXkx/WVb/"
        crossorigin="anonymous"
        data-server="https://your-server.example.com/annotepage/api.php"
        data-project="your-project-id"
        defer></script>
```

No framework, no bundler, no separate stylesheet. One file, no dependencies.

## Plug an assistant onto it

```
npm install -g annotepage-mcp
claude mcp add annotepage -- annotepage-mcp
```

Or with no integration at all -- in plain mode any assistant that can fetch a
URL reads the whole review:

```
curl 'https://your-server.example.com/annotepage/api.php?action=text&project=<id>'
```

## The three pieces

| | |
|---|---|
| [`client/`](client/) | the annotation layer, one file, loaded by a `<script>` tag -- npm `annotepage-client` |
| [`server/`](server/) | one PHP codebase. Drop it on the site itself, or on a machine that serves several sites |
| [`mcp/`](mcp/) | the assistants' access: an MCP server and a CLI -- npm `annotepage-mcp` |

## Where the notes live, and who can read them

You choose the server. On the site itself, or on a separate one that hosts
several projects.

Either way the notes are **encrypted in the browser** by default, with a salt
generated at setup that never leaves it. The server stores sealed envelopes:
it groups notes by project and by page, threads replies and stamps dates
without reading a path, a name or a remark. Whoever runs it -- including you --
cannot read the review.

A staging site is precisely what a company has not published yet. The list of
its URLs, its labels and its reviewers is a leak on its own, even with no
remark attached.

**Salt lost = notes lost.** There is no recovery and no escrow. It is written
here rather than in a footnote because it is the one thing that will hurt.

## What it deliberately does not do

No accounts, no login. No moderation. No notifications. A resolved note moves
to the history and stays -- nobody can delete a remark, which is the point: a
remark one can erase is a remark one can no longer contradict.

The one exception is age, and only a server that is configured for it: a relay
open to strangers can set `max_note_age_days`, and then whole threads expire
once their last message passes that age. Nobody chooses which. A server that
does this says so in its diagnostic and in the header of every export, so a
reader can tell a note that expired from one that was never written.

Saying all of this is more useful than discovering it later.

The domain lock in the server configuration is an **anti-abuse** measure: it
stops a stranger writing into your project. It is not an XSS defence. The XSS
defence is that the tool never parses text as markup -- a check in `npm run
check` enforces it.

## Documentation

- [`FORMAT.md`](FORMAT.md) -- the exchange format and the security model. It
  is the reference; where any other file disagrees with it, it is right.
- [`server/INSTALL.md`](server/INSTALL.md) -- putting the server up.
- [`client/README.md`](client/README.md) -- the tag, the setup screen, the
  options, translating the interface.
- [`mcp/README.md`](mcp/README.md) -- the tools, the CLI, the configuration.
- [`ROADMAP.md`](ROADMAP.md) -- what is coming and what has been ruled out.

## Development

```
npm run build     # rebuild the client bundle
npm run check     # the whole suite
```

`npm run check` refuses a stale SRI digest, any markup-parsing assignment in
shipped code, and a protocol number the three components disagree on. Each of
those failures is silent in production, which is why they are checked here.

## Licence

MIT.
