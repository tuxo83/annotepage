# annotepage-mcp

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is the package's own contract. What annotepage is, how it is installed, and what the configuration file looks like are on the site and are not repeated here.**

An assistant's access to annotepage: an MCP server and a command line, over the
same code. Node 18 or newer, and **no dependency** — a decision rather than an
accident, since this package holds project keys and every dependency would be
third-party code in the same process.

The [install page](https://annotepage.com/how-to-install-it.html) has the two
commands that plug it in, and the annotation panel on your own page writes the
configuration file for you: *File for your assistant*, in its footer.

## Three things that are not on the site, and each one is a first attempt failing

**Where the configuration is looked for, in this order:** `.annotepage.json`
beside your work, then `~/.config/annotepage/annotepage.json`, then
`~/.annotepage.json`. The **first that exists wins** and nothing is merged —
two half-filled files would make a configuration nobody can reread.
`ANNOTEPAGE_CONFIG` names one outright, which is what to reach for when the MCP
host starts the server from a directory that is not yours.

**`author` is required for every write.** A reply signed by nobody is a reply
the reviewer cannot answer back to, so this package publishes nothing anonymous
rather than inventing a name.

**No file at all also works**, and it is the shortest way to try this once:
`ANNOTEPAGE_API`, `ANNOTEPAGE_KEY` and `ANNOTEPAGE_AUTHOR` describe one project
between them, and take precedence over any file.

Two fields worth knowing beyond those: `"read_only": true` cuts every write,
for plugging an assistant onto a review you do not know yet, and `origin` is
what a shared relay demands — it refuses a write that arrives without one.

> The file holds the key, which is every note there is. `chmod 600` it, keep it
> out of git, and never paste it into a ticket or a conversation.

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

Nine tools, the same operations. Two rules are worth knowing before wiring one
up:

**Answer in the thread, not in your own terminal.** The person who wrote the
remark is reading the page, not the console the assistant runs in. A question
asked there is asked of nobody.

**Say what you measured.** "The label holds one line down to 317px" is the
answer; the account of how it was found is not. The reviewer reads it in a
narrow panel beside the page they were looking at.

## Or nothing at all

In plain mode the export needs no package. Any assistant that can fetch a URL
reads the whole review:

```
curl 'https://your-server.example.com/notes/api.php?action=text&project=<id>'
```

That path must never break: it is what makes the tool usable with no
integration at all. In encrypted mode the server has nothing to give — this
package is the step that decrypts, and `annotepage text` prints exactly what
that URL would have returned in the clear.

## Licence

MIT. Source: [github.com/tuxo83/annotepage](https://github.com/tuxo83/annotepage),
where [`FORMAT.md`](https://github.com/tuxo83/annotepage/blob/main/FORMAT.md)
specifies the envelope, the derivations and the export.
