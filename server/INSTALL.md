# annotepage — the server

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is the server operator's reference — MySQL, the addresses, migration, the flags. **Installing a server is on the site**, which walks it step by step and builds your tag: [how you install it](https://annotepage.com/how-to-install-it.html). Come here for what that page does not cover.**

annotepage's PHP server. It saves the notes, groups them by project and by page,
and returns them — in JSON to the client, in plain text to an assistant.

---

## Installing it: one file, one page, one line to paste

1. **Drop `annotepage-install.php`** onto your server, anywhere under the web
   root, under whatever name you like — over FTP, over SFTP, through the host's
   file manager. One file, and it is the only thing you upload. It is
   `server/annotepage-install.php` in the release, and on GitHub it is
   [raw.githubusercontent.com/tuxo83/annotepage/main/server/annotepage-install.php](https://raw.githubusercontent.com/tuxo83/annotepage/main/server/annotepage-install.php).

2. **Open it** in a browser: `https://<site>/<where-you-put-it>/annotepage-install.php`.
   It shows one button. Press it and it downloads the rest of the server from
   the published release over HTTPS with certificate verification on, checking
   every file against the release's own `MANIFEST` — one SHA-256 per file —
   after it has landed on disk and before it is put in place. One bad hash
   abandons the whole thing and leaves the directory exactly as it was.

3. **Answer the form.** One page, three questions — who the server is for, the
   storage, and whether the server may update itself — and all three already
   carry the answer that works. It needs no JavaScript.

   The first one is the one to read: **One site, mine** is the default and gives
   you a server that answers only about projects you declare by hand.
   **Anyone** gives you a public relay, which answers about any project id it is
   given — see [Running a public relay](#running-a-public-relay) for what that
   opens and what it costs. Nothing but that exact answer opens it.

4. **Paste the line it prints** into the tag on the pages you want to annotate:

   ```
   data-server="https://<site>/<where-you-put-it>/api.php"
   ```

Then **delete `annotepage-install.php`**. The last screen offers to delete it
for you and says whether it managed.

There is no archive to extract — deliberately: shared hosting commonly has
neither the zip nor the phar extension. There is no database to create, no
`config-local.php` to write by hand, and nothing to install on your machine.

### What the installer does while you wait

- **downloads the release and verifies it**, file by file, against the
  published `MANIFEST`. It carries no list of its own: it reads that manifest
  at install time and installs exactly what it names, so a file added to the
  server later needs no new installer. The code doing the downloading is
  `internal/update.php` — the same code that updates an installed server, which
  is why there is only one of it to get right;
- **reports what this PHP offers** — the version really served, `pdo_sqlite`,
  `pdo_mysql`, `mbstring`, `json`, whether the directory is writable, and
  whether the server can reach the outside over HTTPS. Each line says what it
  means, not just whether it is there;
- **creates the database as a file**, SQLite, one file, nothing to provision.
  `pdo_sqlite` is compiled into PHP on nearly every host, which is the whole
  reason it is the default. If it is missing here, the page says so in one
  sentence and MySQL is one radio button away;
- **puts that file where the web server does not serve it** — outside the
  document root when it can find a writable directory there, otherwise inside,
  in a directory with an unguessable name carrying its own `.htaccess` and an
  `index.php` that exits;
- **proves it**, and this is the part that matters. It asks the web server for
  that file's own URL over HTTP and reads the status code. Anything other than
  a refusal and it deletes what it created, writes no configuration, and tells
  you what came back. It does not reason about protection, because reasoning is
  exactly what fails here: an `.htaccess` denying the file does nothing under
  nginx, and plenty of cheap hosting is nginx;
- **writes `internal/config-local.php`**, with a comment saying it was
  generated, when, and by what. It never overwrites an existing one. If one is
  there, the form is not even shown.

### One thing is still yours to do

The generated configuration declares **no project**, and it cannot: a project
id descends from a key the browser generates and the server never receives.
Add the tag to a page, open it, and the client's setup screen hands you the id
and the block to paste under `projects`. Until then `?action=list` answers
`active: false` and the panel stays quiet — which is the correct behaviour for
a server nobody has told anything to yet.

### If the installer refuses to finish

It refuses for exactly four reasons, and each one names itself on screen:

- **the host has no way out to HTTPS.** Then it cannot download anything, and
  it says so on the first screen, before writing a byte. That is the fallback
  route below, and it is the reason that route exists;
- **it could not request its own address.** Then it cannot prove anything, and
  a check that could not run must never be read as a check that passed. A
  single-worker development server deadlocks here; a real host does not;
- **the data file came back over HTTP.** The database would be downloadable.
  Nothing was configured and the file it had just created is gone;
- **it could not write `internal/config-local.php`.** Grant write permission on
  `internal/` to the user PHP runs as, install, then take it away again.

A download that fails for any reason — a bad hash, a short read, a source that
answers something else — removes everything it had created before drawing the
page. Reloading and pressing the button again costs nothing.

### The fallback: copy the directory, for a host with no way out

Some cheap hosting has neither the curl extension nor `allow_url_fopen`, and
such a host cannot make an outbound HTTPS request at all. The one-file
installer says exactly that on its first screen and names this route, which
needs no network:

1. **Copy `webroot/`** onto the server, anywhere under the web root, under
   whatever name you like. Copy `webroot/` only: the rest of this directory has
   no business online;
2. **open `https://<site>/<where-you-put-it>/install.php`** and carry on from
   step 3 above.

It is the same files, the same one-page form, the same proof that the data file
cannot be downloaded — `install.php` and `annotepage-install.php` are both a
short entry point onto `internal/install-flow.php`, which is the installation.
Only the copying is done by you.

---

**One code, two places to drop it.** That is the point to understand before
anything else:

| | self-hosted | relay |
|---|---|---|
| where | on the site under review itself | on a third-party machine |
| projects | one only | as many as you like |
| encryption | on by default, can be switched off | on, **cannot be switched off** |
| `Origin` header | optional | required on writes |
| backfill of a 1.2.0 database | available | refused |

There are not two implementations: it is the same table and the same query. The
configuration declares `deployment`, and that value changes only the three
lines of the table above. Which STORAGE holds that table is a separate choice
(`storage`), and it is the next section but one.

The server is **not** an npm package. It gets dropped on a host, and it
fetches itself.

---

## What it requires, and nothing more

- Apache, nginx, or any server that runs PHP;
- **PHP 7.4 or newer**, with `json` and `mbstring`;
- **one of two storage extensions**: `pdo_sqlite`, which is compiled into PHP
  on nearly every host and needs nothing else, or `pdo_mysql` with a database
  and a user that can write to it.

No dependency to install, no build step, no package, nothing to compile. Drop
one file, open it, add a tag.

The one-file route needs one thing more, and only it: a way out to HTTPS —
the curl extension, or `allow_url_fopen` with openssl. Without it the copied
directory installs the same server, and the installer says so rather than
failing halfway.

---

## What the server does not know, and never will

**The key.** It is generated at setup, in the browser, over 256 bits. It does
not leave the browser: the server does not receive it at any point, in any form,
in any mode. Nothing written in this document asks you to put it there.

**Key lost = notes lost.** There is no recovery, no security question, no escrow
third party. The server can do nothing about it, and that is the price of what
it buys: a relay operator cannot read the notes it hosts.

What the server does know is the **project id**: 22 characters, derived from the
key by HKDF, with no way back. It is public — it appears in the tag of every
annotated page — and it is what you write into the configuration.

---

## Where the notes actually live

**SQLite, by default: one file.** `internal/store-sqlite.php`. The installer
picks its path, creates it, and writes that path into `database.file`. There is
nothing to provision and nothing to back up but that one file.

**The file must not be downloadable, and that is the whole difficulty.** A
SQLite file inside the web root can be fetched over HTTP. An `.htaccess`
denying it does nothing under nginx. The notes are encrypted, so the damage is
bounded — but page indexes, timestamps and volumes leak, and in plain mode
everything leaks. So, in this order:

1. **outside the document root**, when the installer finds a writable directory
   there. No URL maps to it and there is nothing to defeat;
2. **inside**, in a directory whose name is sixteen random hex characters,
   carrying its own `.htaccess` and an `index.php` that exits.

Whichever it is, `install.php` **requests that file's URL over HTTP** and
refuses to finish on anything but a refusal. `?action=diagnostic` reports the
path and answers `storage.inside_document_root` on every later call — under
`'diagnostic' => 'full'`, see below — so a server configuration that changes
afterwards is visible.

Writing `database.file` by hand works too, and then it is your job to put it
somewhere no URL reaches. The store writes the two guard files next to whatever
path it is given; they are a fallback, not the plan.

**A busy relay wants MySQL instead.** SQLite locks the whole file for each
write. For a review team that is invisible; for a public relay taking writes
from strangers it is not, and that is what the section below is for.

---

## Installing it by hand, and the MySQL route

Everything `install.php` does can be done with a text editor, and this is what
it writes. Use this when you want something the installer does not ask about: a
relay, several projects, credentials read from outside the web root, or MySQL
with a database you already have.

### 1. Copy `webroot/`

Somewhere under the web root, under whatever name you like:

```
/var/www/<site>/html/notes/         <- webroot/ copied here
```

Copy `webroot/` only. The rest of the directory (this file) has no business
online, and the split is made here so that an exclusion list does not have to be
made elsewhere.

### 2. Drop in `internal/config-local.php`

Starting from `internal/config-local.example.php`. **Without it, the tool is
INACTIVE**: the safe default is silence, not a connection attempted at random. A
directory copied in by mistake therefore does strictly nothing.

Four things to write in it:

```php
'deployment' => 'self-hosted',      // or 'relay'

'projects' => array(
    '7Qb1kZ3xNvA9dLpEqKf2Zt' => array(
        'origins' => array('https://staging.example.com',
                           'https://www.example.com'),
        'mode'    => 'encrypted',
    ),
),

'storage'  => 'sqlite',
'database' => array('file' => '/path/outside/the/web/root/notes.sqlite'),
```

**The MySQL route** is the same file with the other two lines:

```php
'storage'  => 'mysql',
'database' => array( /* host, port, name, user, password */ ),
```

Create the database and a user that can write to it; there is **no schema to
create**. The server builds its tables on the first call and adds anything
missing on later ones — see *Updating the server where it has already run*
below, which has not changed.

`storage` may be left out entirely, and it is then deduced: a `database.name`
means MySQL. That is what keeps every installation configured before this key
existed pointing at its own database — flipping such a server to an empty
SQLite file on an update would read as three months of review erased.

The **project id** (`7Qb1kZ...`) is the one the client's setup screen shows after
generating the key. Copy it: the server does not compute it, it recognises it.
The same id must appear on both sides — in this file and in the page's tag.

Each database credential is written either in the clear or in the form
`array('file' => '/absolute/path')`, which makes it possible to READ a secret
dropped outside the web root without ever copying it into a served file.

**The origins** are the ones the browser sends: `scheme://host[:port]`, with no
path and no trailing slash. A project may declare several, and that is intended:
a staging site and the production it becomes are the same project, with the same
notes.

### 3. Add the client's tag on the pages to annotate

It is the `annotepage-client` package that documents that tag. What matters for
the server: it carries the **same project id** as the configuration above, and
the client derives the API address from its own. The mount prefix is therefore
free.

---

## Checking, in one single request

```
https://<site>/notes/api.php?action=diagnostic
```

**Four lines, by default** — and that is a change from every version before this
one:

```
tool annotepage
version 2.0.1
format 2
verdict operational.
```

The tool, its version, the format it speaks, and the verdict: running, or not,
and what to do about it. Nothing else — no PHP version, no storage, no update
source, no caps, no projects, no path on disk.

**Why the default changed.** That page has no authentication and never had. It
is written for whoever operates the server, and it answered whoever else asked
in exactly the same words: the PHP version really served, the MariaDB version,
the path of `config-local.php` on disk, the table names, the update source, the
caps, the declared projects and their origins. None of that is a hole on its
own. All of it shortens the afternoon of somebody who arrives with a working
exploit and is looking for a version to use it on. An existing installation gets
the short page as soon as it updates, with nothing to write and nothing to
choose — that is the point of a default.

**The whole report, for the length of a diagnosis**, in
`internal/config-local.php`:

```php
'diagnostic' => 'full',
```

Reload the same URL, read it, then put the line back to `'minimal'` or delete it
— the two are the same thing. `'full'` returns, in plain text: the PHP version
REALLY served, the extensions present, the deployment mode, whether https is
required and what the request itself arrived as, the declared projects with their
origins, whether the credential files are readable, the state of the storage —
table present, missing columns, missing indexes, number of notes — and what is
left to backfill from a 1.2.0 database. Everything quoted from this page in the
rest of this file is `'full'`.

**Or not at all:**

```php
'diagnostic' => 'off',
```

The action then does not exist. `?action=diagnostic` is refused exactly as
`?action=banana` is — same 400, same body, the same list of available actions —
so the page cannot be told apart from a typo by whoever goes looking for it.
Nothing else changes: the notes are served as before.

Three rules are kept there without exception:

- no database credential **value** ever appears, not even its length: we say
  where it comes from and whether it is readable;
- the database **host and port** appear only when the connection FAILED. That is
  the only moment they help — and on shared hosting the database host names the
  hosting company, on an endpoint that is public and needs no credential. A
  connection that succeeded has already proved the host; printing it then only
  tells the world where the site is hosted;
- a **project** id appears only through its first six characters. Six are enough
  to confirm you are looking at the right one, and the whole id is what gives
  access to the rows;
- **no effect**. The diagnostic does not create the table it comes looking for,
  does not complete a schema, does not attach any row.

It answers EVEN when the local configuration is unreadable, malformed, or
declares an invalid project. That is precisely the moment when it is all you
have, and it is the reason `'off'` should be a decision and not a habit.

It is then **`minimal` whatever the file says** — the key lives in that file, and
nothing can be read out of a file that does not parse. The verdict names the
state:

```
verdict the configuration could not be loaded: nothing else can be checked until this is fixed.
```

The cause in full — which file, and whether it is a read permission, a PHP
syntax error, or a file that returns something other than an array — is a
`'full'` line, and `'full'` cannot be reached while that same file is broken.
Those three are the whole list: check that `internal/config-local.php` is
readable by the user PHP runs as, that it parses, and that it ends with
`return array(...);`. A syntax error is also in the host's PHP error log — and
any OTHER action, `?action=text` for one, still fails with the cause in its
message, which is unchanged and is the shortest way to it.

The origins, on the other hand, are shown **in full**: they are public domain
names, and they are the line you come to compare character by character with what
the browser sends. `http` against `https`, a port, a trailing slash: those are
the three mistakes, and none of them shows without the two strings side by side.

---

## Updating the server where it has already run

Nothing to do: copying `webroot/` over the top is enough. At the first call, the
tool completes its storage — the columns AND the indexes an earlier version had
not created are added, and the format-1 column names are renamed.

If the database user has no right to do it, the message returns **the exact SQL**
to run once, and `?action=diagnostic` lists what is missing under
`'diagnostic' => 'full'`.

An index that cannot be created interrupts nothing: it makes the queries slow,
not wrong, and refusing to serve the notes for that would be a manufactured
outage. The diagnostic does say so.

---

## Running the candidate instead of the release

One line, and it is the same address with one word changed:

```php
'update_source' => 'https://raw.githubusercontent.com/tuxo83/annotepage/next/server/webroot/',
```

`main` is what everybody runs. `next` is where a version is validated before
they do — the same files, the same manifest, the same hash check on every one
of them before anything is put in place. A candidate is verified exactly as a
release is; what differs is who has looked at it.

Put `main` back and the next check returns the server to the release. There is
nothing to undo by hand: the update is a whole release or none of it.

The client half is the same word, on the tag rather than in a file:
`annotepage-client@next` instead of `annotepage-client@2`. The two are
independent — a server on the candidate serves whatever client its pages ask
for, and a page on the candidate talks to whatever server it is pointed at.

---

## Letting the server update itself

Optional, **off**, and it stays off until you write the key. Nothing below adds
a step for anyone who does not want it: an installation that ignores this
section behaves exactly as it always has.

### What ships with the release

`webroot/MANIFEST` lists every shipped file with its SHA-256. It is the
integrity check — there is no archive to extract, because shared hosting often
has neither the zip nor the phar extension. It also verifies an installation by
hand, with a command your host already has:

```
cd webroot && sha256sum -c MANIFEST
```

It is also what the one-file installer reads: `annotepage-install.php` carries
no list of files and no version of its own, it downloads this manifest and
installs exactly what it names. Adding a file to the server therefore needs no
change to the installer — `tools/build-server-manifest.mjs` regenerates the
manifest and `npm run check` fails on a stale one, and the install side follows
on its own.

### The way that costs nothing: from a shell or from cron

```
php webroot/internal/update.php
```

It reads the running version, asks the repository for the published one, and
**stops there if they match** — which is what most runs do. Otherwise it fetches
the manifest over HTTPS with certificate verification on, downloads only the
files whose hash differs, verifies each one **after** it has landed on disk, and
only then moves the current files aside into
`webroot/.update/previous-<version>-<date>/` and moves the new ones in. One bad
hash abandons the whole update and changes nothing. To undo an upgrade, move
that directory's files back.

Typing the command is the consent, so this works whether or not the key below is
set — and the code directory then has to be writable **by you**, not by the web
server. If you have a shell, this is the path to use, and you can stop reading
here.

### The way that costs something: `auto_update`

```php
'auto_update' => true,
```

in `internal/config-local.php`. The check then happens on its own, at most once
a day, never on a read, and only after the response has been handed to the
visitor — a note being saved never waits on a network fetch. On a PHP interface
that cannot guarantee that hand-off (anything other than php-fpm or LiteSpeed)
the deferred half declines to run and says so in `?action=diagnostic`; use the
cron line above instead.

**What it costs, and it is not nothing.** The code directory has to be writable
by the user PHP runs as. From that moment any bug anywhere on that account that
can write a file — in this code, in a neighbouring application, in a plugin
nobody remembers installing — stops being a defacement and becomes permanent
code execution. That was WordPress's largest attack surface for a decade, and it
has nothing to do with where the update comes from. Turning the key back off
does not undo it: the permission stays until somebody takes it away.

**What it never touches**: `internal/config-local.php`, which holds your
projects, origins and credential paths and is not in the manifest at all;
`install.php`, which is not in the manifest either, so that deleting it is
final rather than undone at the next update; and either store —
`internal/store.php` or `internal/store-sqlite.php` — when it differs from the
one we shipped, because this file tells you that you may replace the store and
restoring ours would take your database with it. Files we no longer ship are
left in place, never deleted.

**A host with no way out** — no curl, and `allow_url_fopen` off — cannot use any
of this. It is told so in one sentence rather than failing blank.

### What the diagnostic says, on every installation

Under `'diagnostic' => 'full'`, `?action=diagnostic` reports the running version,
the published one, and whether outbound HTTPS works at all, on **every**
installation including those that will never turn the key on. That part writes
nothing and needs no permission:

```
update.running_version    2.0.0
update.auto_update        off -- this server never rewrites itself from a web request
update.transport          allow_url_fopen + openssl
update.code_writable      no -- ... is read-only to the PHP user (the safe state)
update.https_outbound     yes -- certificate verified
update.published_version  2.0.1 -- NEWER than what runs here
```

It is the one place that makes one deliberate outbound request, because the
published version cannot be known without one, and only when a human asks for
the page. The short report skips that block rather than hiding its lines: a
public page that reaches out on every hit is a page somebody else can aim.

---

## Taking over an "in-context notes" 1.2.0 database

**No note is lost, ever, and there is nothing to export or reimport.** A table
written by the original tool is a format-2 table in plain mode whose twelve
columns carry French names and whose six other columns are missing. The catch-up
**renames** the first and **adds** the second at the first call, and the existing
rows then read as what they are: format-1 rows, in the clear.

The rename happens **before** the add, and that order is not negotiable: adding
first would create an empty `text` column next to the `texte` column that holds
every remark, and the data would be lost in silence. `id`, `page` and `version`
are spelled the same in both languages and are left alone. The operation is safe
to run twice — the second time there is nothing left to rename.

Two columns do not fill the same way:

- **`project`**: the server fills it on its own, but only when self-hosted with
  **one single** declared project — that is the only case where the owner of the
  rows is known without ambiguity. It is done once, at the moment the column
  appears. So declare your project **before** the first call after the update;
- **`page_index`**: the server **cannot** compute it. It is
  `HMAC(index_key, path)`, and the key descends from the key, which never leaves
  the browser. That is the accepted price of the blind index.

Until the index is set, the old notes **do come out** of `?action=text` but **do
not group** under their page in the panel. That is unpleasant, it is visible in
the diagnostic (`backfill.notes_without_index`), and it is fixed in one pass:

```
GET  api.php?action=backfill&project=<id>
     -> { "pages": ["/en/contact.html", "/en/pricing.html", ...],
          "attached": 128 }

POST api.php?action=backfill
     project=<id>&page=/en/contact.html&index=<index computed by the client>
     -> { "updated": 7, "remaining": 12 }
```

The client computes the index of each path — it has the key — and sends it back,
one path per request. The operation is **idempotent**: only the rows that do not
have an index yet are touched, so a replayed backfill cannot rewrite the index of
a recent note.

This action is refused in relay mode: a relay never had a 1.2.0 database to take
over, and it enumerates page paths **in the clear**, which only makes sense on
the site under review itself. It can disappear the day no 1.2.0 database runs any
more.

**Switching a backfilled database to encrypted mode** does not apply
retroactively: the notes already written stay plain, the following ones are
encrypted, and each row says what it is itself. The export announces it with
`encryption mixed`. That is the normal case of an installation that changed its
mind; it is said, it is not hidden.

---

## The addresses

Relative to the mount prefix.

```
GET  <base>/api.php?action=list&project=<id>&index=<index>  the notes of a page (JSON)
POST <base>/api.php?action=add                              write a note or a reply
POST <base>/api.php?action=resolve                          mark resolved, or reopen
GET  <base>/api.php?action=text&project=<id>                every note (plain text)
GET  <base>/api.php?action=diagnostic                       state of the server (plain text)
GET|POST <base>/api.php?action=backfill                     maintenance, see above
```

The two writes are POST, never GET: an action that changes state must not start
from a link somebody follows or a crawler explores. An unknown action returns 400
and the list above, never an empty body.

**The real path is never sent to `list`, in any mode** — only the blind index is.
Sending the path in plain mode and the index in encrypted mode would make two
code paths, and the second would be the less tested one.

The body of the writes is `application/x-www-form-urlencoded`, not JSON: it is a
"simple request" in the CORS sense, which triggers no preflight. The relay
therefore has no `OPTIONS` machinery to maintain. If you see `OPTIONS` going past
in a log, a client is sending a header it should not.

`?action=text` is made to be read by a human or by an assistant fetching the page
over HTTP: one piece of information per line, no decorative punctuation, four
margins that state the structure. The grammar is a contract and it is described
in `FORMAT.md`. In plain mode it returns the complete export; in encrypted mode
it returns the structure **plus the envelopes**, which only `annotepage-mcp` can
open. It exposes names and internal remarks: it has no business on an open site.

---

## Trying it locally

The common case, and it was undocumented. Everything below was measured against
the shipped server, not reasoned about.

**It works with no configuration at all.** `localhost` is a secure context, so
WebCrypto is there. On a relay with `open_registration`, your project is
undeclared, there is no origin list to match, and the write is accepted. There
is nothing to declare and nobody to ask.

**Do not put a `localhost` origin in `projects` on a shared relay.** Measured:
`origins => array('http://localhost:3000')` admits a write from every machine on
earth that sends that header -- the string is the same everywhere -- and three
of them running the write budget down locked the real team out with
`429 Too many writes on this project` for the length of the window. If you want
the lock, declare only real domains, and use a SECOND project, with its own
key, for local work.

**Your local notes and your staging notes are the same notes.** The page index
is `HMAC(index_key, path)` -- the path alone, no scheme, no host, no port
(section 4 of FORMAT.md). Measured: a note written on
`http://localhost:9001/pricing` was read and decrypted on
`http://localhost:9002/pricing`, and the same holds for
`https://staging.example.com/pricing`. That is the same property that lets a
note survive a site going from staging to production, and it cannot be removed
without removing that. Nothing in a note records where it was written, so you
cannot sort them out afterwards. Decide which behaviour you want BEFORE handing
the key out.

**Every developer who pulls the repository gets a blocking screen** asking for
the key, on every page, until somebody gives it to them. If that is not what
you want in a dev build, `data-domains` makes the tag silent instead -- measured
at zero requests and zero DOM nodes when the current host is not listed.

**The failure you will actually hit is not localhost.** It is the LAN address
you use to test on a phone -- your machine's address on the local network, port
included. That is NOT a secure context, `crypto.subtle` is absent, and the tool says so on screen rather than failing
obscurely. Use an https tunnel, or forward the port so the phone sees
`localhost`.

## Running a public relay

A relay that serves projects nobody declared, so that a tag copied from a web
page works with nothing to ask and nobody to ask it of. This is what makes the
shortest path short. It is off by default, and it is wrong on a server that
hosts one team's notes.

### The installer writes it, if you ask it to

The form's first question is *Who this server is for*, and its second answer
— **Anyone** — is this. Choosing it writes `deployment => 'relay'`,
`open_registration => true`, and the two caps that keep the disk bounded
(`max_note_age_days => 90`, `max_notes_per_project => 500`), each with the
reason in a comment. There is nothing left to edit for the door to open.

Two things it deliberately does not do. It leaves `forward_root_to` **empty**:
it does not know which page explains your relay, and a guessed redirect sends
strangers somewhere you did not choose. And it writes the SQLite it proved
unreachable rather than switching you to MySQL behind your back — the generated
file says, where the storage is set, why that is the part which gives first
here.

The default answer is **One site, mine**, and only the exact **Anyone** answer
opens the relay: a value the form did not send — mistyped, stale, hand-made —
produces a self-hosted server. A relay is never opened by accident.

### Or write the file by hand

Nothing about the route above is required. `server/relay/config-local.php` in
the repository is the ready-made version of the same file, with the same keys
and the same reasons; drop it in `webroot/internal/`, or write the four lines
yourself:

```php
'deployment'        => 'relay',
'open_registration' => true,
'projects'          => array(),   // stays empty; nothing is declared
'storage'           => 'mysql',   // not the SQLite default: see below
```

### What it opens

Any well-formed project id is served. No registration, no account, no
approval. And such a project has **no domain lock** -- it cannot have one:
nobody declared its origins, and there is no way to learn them that an abuser
could not use as well. The project id sits in the tag of every annotated page,
where anyone who reads the source finds it.

So: a stranger can write notes into your project.

### Why that is survivable

They can write bytes; they cannot write a note that **decrypts**. The key
never reached this server, so what a stranger inserts comes back to the reader
as unreadable rows -- counted, shown as such, and obviously not theirs. That is
a nuisance, not a disclosure.

What it really costs is storage, and that is what the rate limit and the
per-project cap are for. Set them before opening the door, not after:

```php
// The defaults, which are already sane. What changes on an open relay is
// `max_notes_per_project`: it ships as 0, meaning no limit, which is right
// for a server serving one team and wrong for one serving strangers.
'rate_window_seconds'     => 300,
'rate_writes_per_ip'      => 120,
'rate_writes_per_project' => 300,
'rate_exports_per_ip'     => 20,
'max_notes_per_project'   => 500,   // 0 = no limit. Do not leave 0 here.
```

A cap on notes per project is the one that decides how much a single abuser
can cost you, since they cannot be told apart from a legitimate project.
`internal/config.php` is the reference for every key and its default.

**And use MySQL here**, not the SQLite default. SQLite locks the whole file for
each write; a relay takes concurrent writes from people who have never heard of
each other. `server/relay/config-local.php` is the ready-made configuration and
it declares `storage => 'mysql'` for that reason.

### What it refuses, and will keep refusing

Plain mode. A public relay storing plaintext would hand its operator every
path, every label and every remark of every site using it -- see FORMAT.md
section 2.3. A plain write is refused with a 400 whatever the caller asks for,
and that refusal predates this option.

Self-hosted deployment ignores the flag entirely. There, an id nobody declared
is a mistake worth reporting -- most often a tag copied from another site,
which open registration would silently accept and store forever.

### For a team that wants the lock back

Declare its project in `projects` with its origins. Declared projects keep the
domain lock on a relay that is otherwise open. Or host their own server. Both
paths stay open; open registration buys zero setup and pays for it in that one
coin.

### Confirming it is on

```
GET <base>/api.php?action=diagnostic      # with 'diagnostic' => 'full'
```

```
config.deployment          relay
config.open_registration   yes -- any project id is served, no origin lock
```

A relay that is open without saying so is a trap for whoever operates it. The
line is always printed.

## https, and the one flag that turns it off

**https is required, and that is the default.** Every request that arrives over
plain `http` is answered with a **308** towards the same URL over `https`.

```php
'allow_plain_http' => false,   // true: serve over http as well
```

**308, and not 301 or 302.** Those two turn a `POST` into a `GET` in many
clients. The note being written would arrive with no body, the server would
refuse it, and the failure would read as a bug in the client — which is the one
place nobody would look. 308 keeps the method and the body.

It is sent with `Cache-Control: no-store`: the code has to be permanent to
preserve the method, but an operator who later sets `allow_plain_http` must not
find the redirect burned into every browser that ever saw it.

**The scheme is detected, not assumed.** `$_SERVER['HTTPS']` alone is the wrong
answer: on shared hosting the TLS is very often terminated by a load balancer or
a CDN and PHP is reached over plain `http` from the machine next door, so
`HTTPS` is empty — or the literal `off` — while the visitor's address bar says
`https`. Five sources are read, most direct first:

| Source | Set by |
|---|---|
| `HTTPS` | the web server, when **it** terminated the TLS |
| `REQUEST_SCHEME` | Apache, from the same knowledge |
| `SERVER_PORT` = 443 | the port **we** listen on |
| `X-Forwarded-Proto` | the proxy in front — first value of the list |
| `X-Forwarded-Ssl` | the same, in the other spelling |

The last two are request headers, so a caller can write them itself and skip the
redirect. That is accepted deliberately: this redirect authorises nothing and
hides nothing — a caller who wants plain `http` can already just not follow it —
while refusing to read them produces an **infinite redirect loop** on a large
share of real hosting, and a loop takes the API down for every caller. Contrast
`client_ip_header`, which is off by default precisely because rate limiting *is*
a boundary.

The `Host` header is validated before it reaches the `Location`: a host name and
nothing else. Unchecked it would be a header injection and an open redirect at
once. A host that does not match redirects nothing and the request is served.

**`allow_plain_http` is not a security preference. It is the way out when the
detection is wrong on this host.** If every request loops, set it to `true`, set
`'diagnostic' => 'full'` next to it, read `?action=diagnostic`, and report the
host:

```
config.https_required   yes -- plain http gets a 308 to the same URL over https
request.scheme          https -- X-Forwarded-Proto: https
```

The two lines are printed together on purpose. Apart, neither settles anything:
"https required" plus "arrived as http" **on a request you made over https** is
the detection being wrong, and this page is where you see it, because the loop
leaves nothing else to look at.

Turning it on does **not** make plain `http` usable by the client. The browser
gives WebCrypto only in a secure context, so over `http` the widget cannot derive
a key or open an envelope at all — the tool is inert there whatever this flag
says.

`install.php` is deliberately not covered: the bootstrap installer probes it over
plain `http` to establish that it can reach its own web server, before anything
is known about TLS on that host.

---

## Where a bare visit goes

```php
'forward_root_to' => 'https://annotepage.com',
```

Empty by default, and nothing redirects until somebody types a URL. It sends a
visit to **the directory itself**, and to **install.php once the configuration
exists**, to that address with a **302**.

It is for a public relay: somebody who reaches the bare host has usually just
read a project id in the source of a page and wants to know what the thing is,
and a blank page answers nothing. It is the operator's decision, on the
operator's server; nothing ships with a destination.

Three rules, each of which is the reason it is safe rather than surprising:

- **it never touches `api.php`** — not an action, not the diagnostic, not a
  call from a client. A redirect on an API endpoint breaks every caller, and a
  browser that follows it silently turns that into an afternoon;
- **302, not 301.** A permanent redirect is cached by browsers and would
  outlive the operator changing their mind;
- **it is validated** before it reaches a `Location` header: absolute `http` or
  `https` only, no control character. A relative path, a `javascript:` scheme
  or an embedded newline is refused — the value is typed by hand, which is
  exactly the input one is tempted to trust, and an unvalidated string in that
  header is a header injection. A refused value redirects nothing and shows as
  `REFUSED` in `?action=diagnostic` under `'diagnostic' => 'full'`.

`install.php?stay=1` — any query string, in fact — shows the page instead of
redirecting, so the "delete this file" button stays reachable on a server that
forwards.

---

## The domain lock

Every project declares its origins. The rule applied:

- `Origin` present and **absent** from the list: **403**, in `text/plain` —
  including on `list`. The rule of silence protects the installation that is not
  configured yet; it does not have to protect the site trying to consume somebody
  else's project;
- `Origin` present and **recognised**: the response carries
  `Access-Control-Allow-Origin: <the verified origin>`, **never** `*`;
- `Origin` **absent**: allowed when self-hosted (a same-origin request does not
  send one). On a relay, every **write** is refused — a browser always sends
  `Origin` on a cross-origin request.

**What this lock is**: an **anti-abuse** measure. It stops another site from
picking up a project id in the source of a page, writing noise into it and
burning the relay's quota.

**What it is not, and it must never be presented as such**: a protection against
XSS. An XSS runs **inside** the target page, so with the legitimate origin: it
goes through the lock without effort, and it has access to that origin's
`localStorage` anyway, hence to the key. An XSS on an annotated page compromises
the notes of the project, full stop.

---

## Rate limiting and caps

A public relay will see abuse from day one.

**What is counted**: the writes (`add`, `resolve`) and the exports (`text`), over
a fixed window, with two counters — one per address, one per project. **What is
not**: `list`. Counting it would cost one database write per page load, to defend
against a request that makes nothing grow. The consequence is written rather than
hidden: a loop of `list` on a known index is bounded by nothing here; if that ever
became a problem, the answer would be a cap in front of PHP, not a database
counter on every read.

Defaults, all configurable, `0` disabling the matching counter:

```php
'rate_window_seconds'     => 300,
'rate_writes_per_ip'      => 120,
'rate_writes_per_project' => 300,
'rate_exports_per_ip'     => 20,
'max_body_bytes'          => 65536,
'max_notes_per_project'   => 0,     // 0 = no limit
```

Going over returns **429** with a `Retry-After` header and a sentence saying how
long to wait. Nothing is saved, and the text typed is not lost.

The counter lives in the database, table `<prefix>rate`: the tool writes no file,
and there is neither a shared cache nor a scheduled task on this kind of hosting.
Cleaning up windows already past is opportunistic.

**When the counter itself is broken**: we refuse on a relay — a relay with no
counter is a relay that will be filled, and its operator answers for it; we let
it through when self-hosted, where the interruption costs more than the risk.
Both cases are logged.

Behind a proxy, `REMOTE_ADDR` is the proxy's and every client shares one counter.
Declare `client_ip_header` then, **and only if the proxy rewrites that header on
every request**: a header the client writes itself would make the limit
bypassable in one line.

Quota and retention in relay mode stay **open**: `FORMAT.md` section 8.6 does not
settle them. `max_notes_per_project` is a tool, not a policy — it erases nothing,
expires nothing, and refuses the write beyond, saying so.

---

## What the server learns anyway, in encrypted mode

Encrypting the fields is not invisibility. An honest relay operator must be able
to read the following without feeling betrayed, and a client must know it
**before** choosing the relay:

- the number of projects, and for each one the number of notes;
- the number of distinct pages annotated, and the number of notes per page — a
  page that collects forty remarks is visible;
- the time of every write, hence the rhythm of the review, the days worked, the
  date of the last note;
- the shape of the threads, the fix rate and the fix delay;
- the approximate length of every remark, through the size of the envelope;
- the IP address and user agent of every reviewer, like any HTTP server;
- **in relay mode, the domain of the site under review**, through the `Origin`
  header — which the domain lock has to read precisely. Let us say it plainly:
  the promise is not "the relay does not know which site you are reviewing". It
  is "the relay can read neither your paths, nor your names, nor your remarks".

A note id is a counter **global to the server**. Between two notes of the same
project, the gap in ids says how many notes all the other projects have written.
A thin leak, a real one, kept: fixing it would require per-project numbering and
its share of races.

---

## What it does not do

That is a choice, not an oversight:

- **no authentication.** The project id is a bearer token: whoever has it can
  read the project's rows and write to it. In encrypted mode those rows are
  unusable without the key. In plain mode they are readable — and that is
  exactly why plain mode is reserved for self-hosting, where the API sits behind
  the same access restriction as the site under review. The two sentences close
  the loop: plain mode is impossible on a relay because a relay has no access
  restriction to offer;
- **no moderation, and no deletion.** A note that is posted stays. The only state
  it can change is "resolved", and that mark can be undone. A note's text is
  never modified, which is what lets several people annotate at the same time
  with no lock and no conflict;
- **no notification, no export anywhere else**;
- **no pagination of `?action=text`.** A project with ten thousand notes returns
  a document nobody reads. No limits, no filter by status, no filter by date:
  `FORMAT.md` section 8.5 does not settle it;
- **no key rotation.** There is no mechanism, here or anywhere else. A leaked
  key forces starting from a fresh project.

---

## Two behaviours to know about

**It stands down in silence when it has nothing to do.** Tool dropped in but not
configured, or unknown project: `?action=list` answers **200** with
`{"ok":false,"active":false}` and not 404. An HTTP error code is logged by the
browser ITSELF, in the console of every page, and no code can prevent it.
Measured: 3 console messages with the 404, 2 without — that is exactly those of
the bare page. The other actions, which a human calls by hand, keep their
explained 404.

**But once in place, it no longer keeps quiet.** Every failure is displayed, with
the message the server wrote. The sharing headers are set on error responses
**as well**, so that a 503 crosses the origin boundary and reaches the reviewer's
screen: an error the browser hides is a silent failure, and a remark one believes
saved and which is not is worse than no tool at all.

---

## What is in the directory

```
INSTALL.md                    this file — never published
annotepage-install.php        THE ROUTE IN: one file, dropped on a host and
                              opened in a browser. It downloads webroot/ from
                              the published release, verifies every file
                              against MANIFEST's SHA-256 before writing it, and
                              then runs the installation. It carries no list of
                              files and no version number — both come from the
                              manifest it just downloaded. NOT part of webroot/
webroot/                      THE ONLY part served by the web server
  MANIFEST                    SHA-256 of every shipped file. The integrity check
                              of an update, and `sha256sum -c MANIFEST` verifies
                              an installation with nothing of ours involved
  VERSION                     version of the TOOL (SemVer), independent of the
                              version of the site hosting it. It is INSIDE the
                              served part, and not at the root of the directory,
                              so that the diagnostic can read it online: a second
                              file at the root would end up diverging from it
  api.php                     single HTTP entry point
  install.php                 the FALLBACK route in, for a host with no way
                              out to HTTPS: the directory is already here, open
                              this page. Twenty lines onto install-flow.php.
                              NOT in the manifest, deliberately: a listed file
                              is a file the updater restores, and an installer
                              that comes back after being deleted is the
                              opposite of what it asks you to do
  index.php                   what a bare visit to the directory gets — a 404,
                              or `forward_root_to` when the operator set one.
                              Without it the answer would be a directory listing
  internal/config.php         defaults + merge of the local file
  internal/install-flow.php   THE INSTALLATION ITSELF: the report, the one form,
                              the proof over HTTP, the configuration written,
                              the offer to delete the installer. Both routes in
                              are a short entry point onto this file, so there
                              is one installation and not two that drift. It IS
                              in the manifest, and may be: under internal/ it
                              answers 404 and refuses to run without the
                              constant its caller sets, so restoring it puts
                              back inert code, not an open door
  internal/origins.php        declared projects, domain lock, sharing
  internal/input.php          bounds and cleanup of everything from the web
  internal/rate-limit.php     rate limiting and size caps
  internal/store-sqlite.php   THE DEFAULT STORE: one file, no database server
  internal/store.php          the MySQL store. Same contract, method for method
  internal/text-export.php    the format of reading from a distance
  internal/errors.php         a blank screen is never an answer
  internal/update.php         fetching a newer version and putting it in place;
                              off unless `auto_update` is set, and runnable on
                              its own from a shell or from cron. It is also what
                              annotepage-install.php requires and calls to
                              install from nothing: a fresh install is an update
                              from nothing, so there is one downloader
```

Exactly ONE store is loaded per request, chosen by `storage`. Both declare the
same class, so nothing downstream — the entry point, the export, the diagnostic
— knows which is answering. `storage` names a FILE, not an engine: a store of
your own dropped over `internal/store.php` is selected by `'storage' =>
'mysql'` and one dropped over `internal/store-sqlite.php` by `'sqlite'`,
whatever it actually talks to. That is the property that made a second store
possible at all, and it is why the header of `internal/store.php` states the
contract as a contract.

Everything under `internal/` refuses to run without a constant set only by
`api.php`, and answers 404 if called directly. The `.htaccess` in there only
doubles it: whether its directives are taken into account depends on the server's
`AllowOverride`, which is not always known, and a protection is never made to rest
on that file alone.
