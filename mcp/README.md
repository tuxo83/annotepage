# annotepage-mcp

The assistants' access to [annotepage](https://annotepage.com): an MCP server
and a command line, over the same code.

A reviewer clicks an element of a page and writes what is wrong. This package
is how an assistant reads those remarks, answers in the thread with what it
measured, and resolves them stamped with the version the fix ships in.

**What annotepage is, and how it gets installed, is on the site:**
[how you use it](https://annotepage.com/how-to-use-it.html) ·
[installing it](https://annotepage.com/how-to-install-it.html) ·
[questions](https://annotepage.com/questions.html)

## Install

```
npm install -g annotepage-mcp
claude mcp add annotepage -- annotepage-mcp
```

Node 18+. No dependency: this package holds project keys, and every dependency
would be third-party code in the same process.

## Configure

One file, one entry per site, named after the site — so afterwards you say the
site you are looking at and it is found. The annotation panel on your own page
writes this file for you: **File for your assistant**, in its footer.

`~/.config/annotepage/annotepage.json`, or `.annotepage.json` beside your work:

```json
{
  "projects": {
    "staging.example.com": {
      "api": "https://staging.example.com/notes/api.php",
      "key": "the 43 characters the setup screen showed you",
      "origin": "https://staging.example.com",
      "author": "Assistant"
    }
  }
}
```

> **This file contains the key, which is every note there is.** `chmod 600` it,
> keep it out of git, never paste it into a ticket or a conversation. There is
> no rotation: a leaked key means a fresh project and the notes already written
> abandoned.

`"read_only": true` cuts every write, for plugging an assistant onto a review
you do not know yet. `origin` matters facing a shared relay: it refuses a write
that arrives without one. A project whose key is already public in the page can
skip the file entirely and pass `api` and `key` on the call.

## From the command line

```
annotepage open                     # the remarks still open
annotepage open --untitled          # ...the ones nobody has titled yet
annotepage note 12                  # one note and its thread
annotepage reply 12 "The label holds one line down to 317px." --title "Action label wraps below 380px"
annotepage resolve 12 1.4.13
annotepage reopen 12                # a fix that turned out incomplete
annotepage text                     # the whole review, decrypted
annotepage diagnostic               # what the server thinks of your setup
```

`resolve` is the one that matters. It stamps the note with the version the fix
ships in, so the reviewer sees what became of their remark instead of watching
it vanish.

## From an assistant

Nine tools, the same operations. Two rules are worth knowing before you wire
one up:

**Answer in the thread, not in your own terminal.** The person who wrote the
remark is reading the page, not the console the assistant runs in. A question
asked there is asked of nobody.

**Say what you measured.** "The label holds one line down to 317px" is the
answer; the account of how you found it is not. The reviewer reads it in a
narrow panel beside the page they were looking at.

## Or nothing at all

In plain mode the export needs no package. Any assistant that can fetch a URL
reads the whole review:

```
curl 'https://your-server.example.com/notes/api.php?action=text&project=<id>'
```

That path must never break: it is what makes the tool usable with no
integration. In encrypted mode the server has nothing to give — this package is
the step that decrypts, and `annotepage text` prints exactly what that URL
would have returned in the clear.

## The exchange format

[`FORMAT.md`](https://github.com/tuxo83/annotepage/blob/main/FORMAT.md) — the
envelope, the derivations, the blind index, the text export. It is the
reference; where any other file disagrees with it, it is right.

## Licence

MIT. Source: [github.com/tuxo83/annotepage](https://github.com/tuxo83/annotepage)
