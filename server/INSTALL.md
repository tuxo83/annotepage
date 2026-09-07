# annotepage — the server

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **Installing a server is on the site**, which walks it step by step, drops the
> steps that do not apply to you and builds your tag. This file holds only what
> nothing else can tell you.

## Everything here answers for itself — ask it first

| Ask | It tells you |
|---|---|
| `<your server>/api.php?action=diagnostic` | what this installation is doing right now: PHP, storage, projects, origins, updates |
| `php annotepage-install.php --help` | every option the shell face takes, what each answer costs, and the exit codes |
| the installer's screens | what it measured **on your host**, and the three ways to keep the code current, with your real paths in them |
| `internal/config-local.example.php` | every key you can write, commented next to itself |
| `internal/config.php` | the default of every key, and why it is that |
| the configuration the installer wrote | what bounds what, in comments with the numbers already in them: the rate limits, the body size, the cap per project |
| the header of any file under `internal/` | what that file is for |
| [`FORMAT.md`](../FORMAT.md) | the envelope, the derivations, the export, the addresses |

Where any of them disagrees with this file, **they are right**: they ship with
the code and this file does not.

---

## When something is wrong, start here

### The configuration will not load

The diagnostic answers even then — that is the moment it is all you have — and
it is then **`minimal` whatever the file says**, because the key that would
make it `full` lives in the file that will not parse. The verdict names the
state and stops:

```
verdict the configuration could not be loaded: nothing else can be checked until this is fixed.
```

**Three causes, and that is the whole list.** `internal/config-local.php` is
not readable by the user PHP runs as; it does not parse; it returns something
other than an array — it must end with `return array(...);`. A syntax error is
also in the host's PHP error log. And **any other action** — `?action=text`
will do — still fails with the cause in its own message, which is the shortest
way to it.

### The tag loads and the notes do not come

Compare the two strings by eye. The diagnostic prints the declared origins **in
full** — they are public domain names, and they are the line you came to check
character by character against what the browser sends. `http` against `https`,
a port, a trailing slash: those are the three mistakes, and not one of them
shows without both strings side by side.

### The database will not connect

Its host and port appear in the diagnostic **only then**, and never otherwise:
on shared hosting the database host names the hosting company, on a page with
no authentication.

---

## Trying it locally

The common case, and it was documented nowhere. Everything here was measured
against the shipped server, not reasoned about.

**It works with no configuration at all.** `localhost` is a secure context, so
WebCrypto is there. On a relay with open registration your project is
undeclared, there is no origin list to match, and the write is accepted. There
is nothing to declare and nobody to ask.

**Do not put a `localhost` origin in `projects` on a shared relay.** Measured:
`origins => array('http://localhost:3000')` admits a write from every machine
on earth that sends that header — the string is the same everywhere — and three
of them running the write budget down locked the real team out with `429 Too
many writes on this project` for the length of the window. If you want the
lock, declare only real domains, and use a **second project, with its own key**,
for local work.

**Your local notes and your staging notes are the same notes.** The page index
is `HMAC(index_key, path)`, the path alone (§4 of FORMAT.md). Measured: a note
written on `http://localhost:9001/pricing` was read and decrypted on
`http://localhost:9002/pricing`, and on `https://staging.example.com/pricing`.
It is the same property that carries a note across a site going from staging to
production, and it cannot be removed without removing that. **Nothing in a note
records where it was written**, so they cannot be sorted out afterwards. Decide
which you want *before* handing the key out.

**Every developer who pulls the repository gets a blocking screen** asking for
the key, on every page, until somebody gives it to them. Where that is not
wanted in a dev build, `data-domains` on the tag makes it silent instead —
measured at zero requests and zero DOM nodes when the current host is not
listed.

**The failure you will actually hit is not localhost.** It is the LAN address
you use to test on a phone. That is not a secure context, `crypto.subtle` is
absent, and the tool says so on screen rather than failing obscurely. Use an
https tunnel, or forward the port so the phone sees `localhost`.

---

## Taking over an "in-context notes" 1.2.0 database

Point the new server at it and the columns catch up on the first call — no
export, no reimport, **no note lost**. Two things that migration cannot do for
you:

**Declare your project before that first call.** The `project` column is filled
in once, at the moment it appears, and only on a self-hosted server holding one
project. After that it is empty rows and a backfill.

**The page index cannot be computed by the server.** It is `HMAC(index_key,
path)` and the server has never had the key. Until it is set, the old notes do
come out of `?action=text` but do not group under their page in the panel —
`backfill.notes_without_index` in the diagnostic counts them. One pass fixes
it, and this is the only place that pass is written down:

```
GET  api.php?action=backfill&project=<id>
     -> { "pages": ["/en/contact.html", "/en/pricing.html", ...],
          "attached": 128 }

POST api.php?action=backfill
     project=<id>&page=/en/contact.html&index=<index computed by the client>
     -> { "updated": 7, "remaining": 12 }
```

The client computes the index of each path — it has the key — and sends it
back, one path per request. It is **idempotent**: only rows with no index are
touched, so a replayed backfill cannot rewrite the index of a recent note. The
action is refused on a relay, which never had a 1.2.0 database and would be
enumerating somebody's paths in the clear; it may disappear the day no such
database runs any more.

---

## Updating, and undoing one

The three ways to stay current are on the installer's last screen, ranked, with
your real path and your real address already in them; what each costs is beside
the key in `internal/config-local.example.php`. What is written nowhere else:

- an installation done by hand is verified with a command the host already has:
  `cd webroot && sha256sum -c MANIFEST`;
- an update moves the files it replaces into
  `webroot/.update/previous-<version>-<date>/`. **To undo an update, put them
  back.** Nothing else has to be undone: the configuration, `install.php` and
  the store files are never touched.

---

## What is in the directory

`webroot/` is the whole served part, and the only part that goes online.
`annotepage-install.php` is the route in — it carries no file list and no
version of its own, it reads the manifest. Every other file says what it is for
in its own header. Three things those headers cannot say:

- **`VERSION` is inside `webroot/`**, not beside it, so that the diagnostic can
  read it over the web. A second file at the root would end up disagreeing with
  it.
- **`storage` names a FILE, not an engine.** `'mysql'` selects
  `internal/store.php` and `'sqlite'` selects `internal/store-sqlite.php`,
  whatever either of them really talks to. **You may replace either file with
  a store of your own**: write it, put it at one of those two paths, and
  nothing upstream knows — three comments in the code point here for that
  permission. The updater then leaves your file alone, which means it also
  stops gaining what later versions add: `?action=diagnostic` says under
  `storage.contract` what a kept store can no longer answer.
- **`index.php` exists so that a bare visit is a 404** and not a directory
  listing.

---

## Two behaviours that look like bugs

**Cross-origin headers are on the error responses too**, deliberately: a 503
that the browser hides because it lacks them is a silent failure on the
reviewer's screen, and the reviewer is the person who has to know.

**An unknown project id on a self-hosted server is an error worth reporting.**
It is most often a tag copied from another site.

---

## The same install, from a shell

The file you upload answers on a terminal too, and installs in one command:
it fetches the release, verifies every file against the published manifest,
and hands your options to it.

```
php annotepage-install.php --api-address=https://example.com/notes/api.php \
                           --answers-for=one-site --storage=sqlite
```

`--help` lists what it takes and is the only place that list exists — this
file will not carry a second copy of it. Two things are worth knowing before
you read it: the address is **required**, because a browser reads it off the
request that reached it and a shell has no request; and `--help` never fetches
anything, so it answers on a host with no way out to HTTPS.

## Appendix — writing the configuration by hand

For a relay, several projects, credentials outside the document root, or an
existing MySQL database:

1. copy `webroot/` under your web root, under any name you like — over FTP or
   SFTP, and then open `install.php` inside it, if this host has no way out to
   the network for the one-file installer to use. Nothing else in the release
   belongs online;
2. write `internal/config-local.php`. **Without it the tool is inactive and
   answers nothing** — the safe default is silence. Start from
   `internal/config-local.example.php`, which is a working file with every key
   commented beside itself; `server/relay/config-local.php` is the same thing
   already filled in for a public relay. There is no schema to create: the
   tables are built on the first call;
3. the tag on your pages is documented by the client package. Note that the
   client derives the API address from its own `src` when it is served from
   your origin, so the directory you mount this under is free.

The project id comes from the client's setup screen, in the browser: the server
does not compute it, it recognises it. Both sides must carry the same one.
