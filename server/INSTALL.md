# annotepage — the server

annotepage's PHP server. It saves the notes, groups them by project and by page,
and returns them — in JSON to the client, in plain text to an assistant.

**One code, two places to drop it.** That is the point to understand before
anything else:

| | self-hosted | relay |
|---|---|---|
| where | on the site under review itself | on a third-party machine |
| projects | one only | as many as you like |
| encryption | on by default, can be switched off | on, **cannot be switched off** |
| `Origin` header | optional | required on writes |
| backfill of a 1.2.0 database | available | refused |

There are not two implementations: it is the same table, the same query, the
same file. The configuration declares `deployment`, and that value changes only
the three lines of the table above.

The server is **not** an npm package. It gets copied.

---

## What it requires, and nothing more

- Apache (or any server that runs PHP);
- **PHP 7.4 or newer**, with `pdo_mysql` and `json`;
- **a MySQL database** and a user that can write to it.

No dependency to install, no build step, no package, nothing to compile. Copy a
directory, drop in a file, add a tag.

---

## What the server does not know, and never will

**The salt.** It is generated at setup, in the browser, over 256 bits. It does
not leave the browser: the server does not receive it at any point, in any form,
in any mode. Nothing written in this document asks you to put it there.

**Salt lost = notes lost.** There is no recovery, no security question, no escrow
third party. The server can do nothing about it, and that is the price of what
it buys: a relay operator cannot read the notes it hosts.

What the server does know is the **project id**: 22 characters, derived from the
salt by HKDF, with no way back. It is public — it appears in the tag of every
annotated page — and it is what you write into the configuration.

---

## Dropping it onto a site, in three moves

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

Three things to write in it, and only one is new compared with the original
tool:

```php
'deployment' => 'self-hosted',      // or 'relay'

'projects' => array(
    '7Qb1kZ3xNvA9dLpEqKf2Zt' => array(
        'origins' => array('https://staging.example.com',
                           'https://www.example.com'),
        'mode'    => 'encrypted',
    ),
),

'database' => array( /* host, port, name, user, password */ ),
```

The **project id** (`7Qb1kZ...`) is the one the client's setup screen shows after
generating the salt. Copy it: the server does not compute it, it recognises it.
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

Returns, in plain text: the PHP version REALLY served, the extensions present,
the deployment mode, the declared projects with their origins, whether the
credential files are readable, the state of the storage — table present, missing
columns, missing indexes, number of notes — and what is left to backfill from a
1.2.0 database.

Three rules are kept there without exception:

- no database credential **value** ever appears, not even its length: we say
  where it comes from and whether it is readable;
- a **project** id appears only through its first six characters. Six are enough
  to confirm you are looking at the right one, and the whole id is what gives
  access to the rows;
- **no effect**. The diagnostic does not create the table it comes looking for,
  does not complete a schema, does not attach any row.

It answers EVEN when the local configuration is unreadable, malformed, or
declares an invalid project: it then names the file and the cause. That is
precisely the moment when it is all you have.

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
to run once, and `?action=diagnostic` lists what is missing.

An index that cannot be created interrupts nothing: it makes the queries slow,
not wrong, and refusing to serve the notes for that would be a manufactured
outage. The diagnostic does say so.

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
  `HMAC(index_key, path)`, and the key descends from the salt, which never leaves
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

The client computes the index of each path — it has the salt — and sends it back,
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
`localStorage` anyway, hence to the salt. An XSS on an annotated page compromises
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
  unusable without the salt. In plain mode they are readable — and that is
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
- **no salt rotation.** There is no mechanism, here or anywhere else. A leaked
  salt forces starting from a fresh project.

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
webroot/                      THE ONLY part served by the web server
  VERSION                     version of the TOOL (SemVer), independent of the
                              version of the site hosting it. It is INSIDE the
                              served part, and not at the root of the directory,
                              so that the diagnostic can read it online: a second
                              file at the root would end up diverging from it
  api.php                     single HTTP entry point
  internal/config.php         defaults + merge of the local file
  internal/origins.php        declared projects, domain lock, sharing
  internal/input.php          bounds and cleanup of everything from the web
  internal/rate-limit.php     rate limiting and size caps
  internal/store.php          THE ONLY place that talks to the database
  internal/text-export.php    the format of reading from a distance
  internal/errors.php         a blank screen is never an answer
```

Everything under `internal/` refuses to run without a constant set only by
`api.php`, and answers 404 if called directly. The `.htaccess` in there only
doubles it: whether its directives are taken into account depends on the server's
`AllowOverride`, which is not always known, and a protection is never made to rest
on that file alone.
