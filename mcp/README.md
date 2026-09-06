# annotepage-mcp

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is the package's own contract — the configuration, the command line, the tools. What annotepage is, and how it gets installed, is on the site.**

The assistants' access to [annotepage](https://annotepage.com): an MCP server
and a command line, over the same code.

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

`.annotepage.json` beside your work, or
`~/.config/annotepage/annotepage.json` — **the first that exists wins**, and
nothing is merged. `ANNOTEPAGE_CONFIG` names one outright, which is what to
reach for when the MCP host starts the server from a directory that is not
yours.

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

`author` is **required for every write**: a reply signed by nobody is a reply
the reviewer cannot answer back to. `"read_only": true` cuts every write, for
plugging an assistant onto a review you do not know yet. `origin` matters
facing a shared relay: it refuses a write that arrives without one.

No file at all also works, and it is the shortest way to try this once:
`ANNOTEPAGE_API`, `ANNOTEPAGE_KEY` and `ANNOTEPAGE_AUTHOR` describe one project
between them, and take precedence over any file. A project whose key is already
public in its page can likewise pass `api` and `key` on the call.

The key itself comes from the client: the tag loaded with `data-setup` draws it
in the browser, once, and it reaches no server in any form.

## From the command line

```
annotepage open                     # the remarks still open
annotepage open --untitled          # ...the ones nobody has titled yet
annotepage note 12                  # one note and its thread
annotepage reply 12 "The label holds one line down to 317px." --title "Action label wraps below 380px"
annotepage resolve 12 1.4.13
annotepage reopen 12                # a fix that turned out incomplete
annotepage text                     # the whole review, decrypted
annotepage projects                 # what the configuration declares
annotepage --project staging.example.com open    # when several are declared
annotepage diagnostic               # what the server thinks of your setup
```

`annotepage --help` lists the rest — `title`, `id`, `raw`, and the options.

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

## Licence

MIT. Source: [github.com/tuxo83/annotepage](https://github.com/tuxo83/annotepage),
where [`FORMAT.md`](https://github.com/tuxo83/annotepage/blob/main/FORMAT.md)
specifies the envelope, the derivations and the export.
