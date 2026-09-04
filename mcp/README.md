# annotepage-mcp

The assistants' side of [annotepage](https://annotepage.com): read the review
remarks left on a web page, answer them, and mark one resolved with the
version its fix ships in.

Two programs, one library:

- **`annotepage-mcp`** -- an MCP server. Point an assistant at it and the
  notes become seven tools it can call.
- **`annotepage`** -- the same thing on the command line, for a script, a CI
  job, or an assistant that has no MCP client.

Notes are **encrypted in the browser**. The server that stores them cannot
read a path, a name or a remark. This package holds the key, so it is the
only place the plaintext ever comes back -- which is also why the key is
treated the way it is below.

The exchange format and the security model are described in `FORMAT.md` at the
root of the repository. Where this file and `FORMAT.md` disagree, `FORMAT.md`
is right.

## Install

```
npm install -g annotepage-mcp
```

No dependencies. Node 18 or later.

## Configure

There are **three** ways to tell this package which project it is talking to,
and the right one depends on where that project's key lives.

### 1. In the command that plugs the server in -- for one private project

Plugging an MCP server in is already a command, run once. The key rides in
that command, so there is no second step and nothing to write by hand:

```
claude mcp add annotepage \
  -e ANNOTEPAGE_API=https://staging.example.com/notes/api.php \
  -e ANNOTEPAGE_KEY=the-43-characters-the-setup-screen-showed-you \
  -e ANNOTEPAGE_AUTHOR=Assistant \
  -- annotepage-mcp
```

| Variable | What it is |
|---|---|
| `ANNOTEPAGE_API` | the address of `api.php`, the one the browser uses. **It is what arms this path**: with no address, the variables are ignored and the file is read instead |
| `ANNOTEPAGE_KEY` | the 43 characters of the project key |
| `ANNOTEPAGE_AUTHOR` | the name replies are signed with. Required in order to write |
| `ANNOTEPAGE_ORIGIN` | the site the notes are about, facing a relay (see below) |
| `ANNOTEPAGE_MODE` | `plain` or `encrypted`. Encrypted unless said otherwise |
| `ANNOTEPAGE_ID` | the project id, in plain mode with no key |
| `ANNOTEPAGE_READ_ONLY` | `true`, exactly, cuts every write. Anything else leaves writing on |
| `ANNOTEPAGE_PROJECT` | a name for it, if you would rather not read `project` in messages |

The key stays on your machine, exactly as it would in a file, and it never
enters the conversation. It does land in your shell history and in the MCP
client's own configuration; if that bothers you, use the file below instead.

**The environment wins over the file, and says so in a warning.** A variable
was typed by whoever is running the server, now; a file was written some other
day and forgotten. The other order would let a stale file quietly answer a
question you have just answered yourself -- and the notes it reads would be
another project's.

### 2. The configuration file -- for several projects, or no key in a history

Copy `annotepage.example.json` to `.annotepage.json` and fill it in:

```json
{
  "default_project": "review",
  "projects": {
    "review": {
      "api": "https://staging.example.com/notes/api.php",
      "key": "the 43 characters the setup screen showed you",
      "author": "Assistant",
      "read_only": false
    }
  }
}
```

The field used to be called `salt` and that name is still read, so a file
written before this version keeps working. Declaring both is refused rather
than arbitrated: they are two names for one thing, and picking a winner would
read half the notes of one project.

> **This file contains the key, which is to say every note there is.**
> Whoever reads it reads everything. `chmod 600` it, add it to `.gitignore`,
> and never paste it into a ticket or a conversation. There is no rotation: a
> leaked key means starting a fresh project and abandoning the notes already
> written.

Set `"read_only": true` when plugging an assistant onto a review you do not
know yet. It cuts every write.

### 3. `api` + `key` on the call -- for a project whose key is already public

Since client 2.1.0 a page can carry its own key: the `annotepage` tag at the
end of the annotated document has `data-key` beside `data-server`, and such a
project is **public by construction** -- whoever can load the page can read
the notes (`FORMAT.md` 1.5). Nothing has to be configured for it. Every MCP
tool takes three optional arguments:

| Argument | Where it is read from |
|---|---|
| `api` | the `data-server` attribute of the tag |
| `key` | the `data-key` attribute of the tag |
| `origin` | the origin of the page itself -- scheme and host of the address you fetched |

Given **together**, `api` and `key` *are* the project for that one call: the
project id is derived from the key and never declared beside it, no
configuration file is required or read, nothing is written to disk, and the
next call starts from nothing again. A reply written this way is signed
`assistant`, since there is no file to declare a name.

The assistant does not have to be told any of this: it fetches the page it was
given, reads the two attributes off the tag, takes the origin from the address
it just fetched, and calls the tool. That is the whole feature, and the tool
descriptions carry it.

### `origin`: pass it whenever you might write

`origin` is the third of the three, and it is not decoration. A **relay**
refuses every write that arrives with no `Origin` header (`FORMAT.md` 6.2, and
that is the domain lock doing its job). Without it, reading works everywhere
and writing does not: no reply in a thread, no note resolved -- half a review
loop.

It is the origin of the **page**, not of the api address; those are two
different domains by construction. Scheme and host, a port only when it is not
the default, nothing else:

```
https://staging.example.com        http://localhost:8080
```

It is sent as the `Origin` header, through the same field and the same two
lines of `api.mjs` as the `origin` of the configuration file. A value that is
not a canonical origin -- a path, a query string, no scheme -- is refused with
the shape expected, and not trimmed into one: `https://example.com/prod` and
`https://example.com/staging` are the same origin, and cutting one into the
other in silence would announce a site nobody named. The rule is the server's
own, `ap_normalise_origin()`.

Refusals, and none of them is a fallback:

- **`api` or `key` alone** -- refused, naming the half that is missing. An
  address paired with somebody else's key reads another project than the one
  you meant;
- **`origin` alone** -- refused: it describes a project, it does not name one;
- **`key` together with `project`** -- refused, and no winner is picked. A key
  already derives its project id, so it never needs a project name beside it;
- **a key that is not 43 base64url characters** -- refused with the shape
  expected, and never echoed back;
- **an `origin` that is not an origin** -- refused with the shape expected.

> **This path is for a key that is ALREADY PUBLIC IN THE PAGE.** A key taken
> out of a configuration file and pasted into a conversation crosses a model
> provider's logs and cannot be taken back: this format has no key rotation,
> so the only repair is a new project and abandoning the notes already
> written. **A private project keeps the file above, and should.**

Where to look, in order -- and the tool descriptions say the same, because
that is where an assistant actually reads it: **the page first** (it carries
both attributes), **then whatever the server was started with** (the
environment, then the configuration file: the private projects), and **asking a
human only as a last resort**, when the page cannot be reached and no
configuration answers.

## Use it from the command line

```
annotepage open                     # the remarks still open
annotepage open --page /pricing     # ...on one page
annotepage note 12                  # one note and its thread
annotepage reply 12 "Reproduced. The label wraps below 380px."
annotepage resolve 12 1.4.13
annotepage reply 12 "Still there on Safari 17." && annotepage reopen 12
annotepage text                     # the whole review, as text
annotepage projects
annotepage diagnostic               # what the server thinks of your setup
```

`resolve` is the one that matters. It stamps the note with the version the fix
ships in and moves it into the history, where the reviewer can see what
happened to their remark instead of watching it vanish.

## Use it from an assistant

Add the server to your MCP client. For Claude Code:

```
claude mcp add annotepage -- annotepage-mcp
```

A private project adds its key to that same command; see **Configure** above.

The seven tools:

| Tool | What it does |
|---|---|
| `annotepage_open_notes` | the remarks still open, optionally for one page |
| `annotepage_read_note` | one note with its replies |
| `annotepage_reply` | answer in the thread |
| `annotepage_mark_resolved` | resolve, stating the version the fix ships in |
| `annotepage_reopen` | put a note back, saying why |
| `annotepage_export` | the whole review as text |
| `annotepage_projects` | the projects this configuration knows, and the id an `api` + `key` pair derives |

## Or use nothing at all

In plain mode the server serves the review as text, and any assistant that can
fetch a URL can read it with no integration whatsoever:

```
curl 'https://staging.example.com/notes/api.php?action=text&project=<id>'
```

```
tool annotepage
format 2
version 2.0.0
project 7Qb1kZ3xNvA9dLpEqKf2Zt
encryption no
export 2026-09-01T07:04:52+00:00
notes 1

note 4
page /trial
page-index JiJMsFqgbCAyO1tq0MNcmw
element main:nth-of-type(1) > div:nth-of-type(1) > section:nth-of-type(2) > a:nth-of-type(1)
excerpt Choose Team
author Camille
date 2026-09-01T07:04:41+00:00
version 1.4.13
environment staging
viewport 1280x800
status open
text
    "Choose Team" wraps onto two lines below 380px and the button grows a second row.
```

That is a real export, copied from a real server, not an illustration. Note
what `element` is: the element's POSITION in the page, as an `nth-of-type`
path. The readable form -- `a.cta` -- is recorded but never exported, so do not
expect a class or an id here. `excerpt` is what carries the human meaning: the
text that was on screen.

One fact per line, `key value`, two-space steps for replies. The same grammar
comes out of this package in encrypted mode, decrypted on the way. A reader
cannot tell which of the two produced it, and does not need to.

That export is not for a public site: filled in, it carries internal names and
internal remarks.

## Answer in the thread, don't just fix

The point of the loop is that the person who wrote the remark sees what
happened to it. Reply with what you measured, not with "done" -- and resolve
with the version, so they know when to look.

## Licence

MIT.
