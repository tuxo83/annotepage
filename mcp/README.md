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
read a path, a name or a remark. This package holds the salt, so it is the
only place the plaintext ever comes back -- which is also why the salt is
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

Copy `annotepage.example.json` to `.annotepage.json` and fill it in:

```json
{
  "default_project": "review",
  "projects": {
    "review": {
      "api": "https://staging.example.com/notes/api.php",
      "salt": "the 43 characters the setup screen showed you",
      "author": "Assistant",
      "read_only": false
    }
  }
}
```

> **This file contains the salt, which is to say every note there is.**
> Whoever reads it reads everything. `chmod 600` it, add it to `.gitignore`,
> and never paste it into a ticket or a conversation. There is no rotation: a
> leaked salt means starting a fresh project and abandoning the notes already
> written.

Set `"read_only": true` when plugging an assistant onto a review you do not
know yet. It cuts every write.

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

The seven tools:

| Tool | What it does |
|---|---|
| `annotepage_open_notes` | the remarks still open, optionally for one page |
| `annotepage_read_note` | one note with its replies |
| `annotepage_reply` | answer in the thread |
| `annotepage_mark_resolved` | resolve, stating the version the fix ships in |
| `annotepage_reopen` | put a note back, saying why |
| `annotepage_export` | the whole review as text |
| `annotepage_projects` | the projects this configuration knows |

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
