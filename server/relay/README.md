# Standing up the free public relay

Everything needed to put `www.api.annotepage.com` online. It is one PHP directory
and one database; there is no build step and nothing to compile.

## What goes where

    webroot/                  ->  the document root of www.api.annotepage.com
    relay/config-local.php    ->  webroot/internal/config-local.php
    secrets/                  ->  one level ABOVE the document root

`secrets/` holds three one-line files -- `database-name`, `database-user`,
`database-password` -- so the configuration you upload carries no password and
can be read by anyone without harm. Put them outside the document root; the
config refuses a path that is not absolute after resolution, and says which one
it got.

## The database

One MySQL database, one user with the usual rights. **No schema to create**: the
server builds its tables on the first call and adds anything missing on later
ones. Nothing to migrate, ever.

MySQL and not the SQLite default, and `config-local.php` says so with
`storage => 'mysql'`. SQLite locks the whole file for each write; a relay takes
concurrent writes from people who have never heard of each other. On a single
site under review the default is the right one and there is no database to
create at all.

## HTTPS is not optional

The client needs a secure context to reach WebCrypto, so it will not encrypt --
will not even compute a page index -- over plain `http`. A relay served without
HTTPS serves nobody. Any certificate does.

## Checking it, in one request

    curl 'https://www.api.annotepage.com/api.php?action=diagnostic'

Read three lines:

    config.deployment          relay
    config.open_registration   yes -- any project id is served, no origin lock
    config.max_note_age_days   90 -- threads older than this are removed

If `open_registration` says `no`, a copied tag will be refused with a 404 and
the person who copied it has no way to guess why.

## What it costs to run

It stores sealed envelopes it cannot read. A note is a few hundred bytes; the
ceiling that actually bounds the bill is `max_notes_per_project`, because
nothing distinguishes an abuser from a project. With 500 notes per project and
90 days of retention, a thousand active projects is on the order of tens of
megabytes.

There is no scheduled task: retention runs opportunistically, one write in
fifty, and the counters clean themselves the same way. Nothing to add to cron.

## What you are promising the people who use it

Say it where they can read it, because they cannot verify it:

- their notes are encrypted in their browser and this server cannot read a
  path, a name or a remark;
- it keeps threads for 90 days, then they go. Nobody chooses which;
- there is no origin lock on an undeclared project, so whoever reads the source
  of an annotated page finds the project id and could write into it. What they
  cannot do is write a note that decrypts, so it comes back as unreadable rows
  -- a nuisance, not a disclosure. A team that wants the lock declares its
  project or runs its own server;
- it is free, it is nobody's business, and it can stop.

That last line matters more than it looks. A free service with no stated
promise about its own future is one people build on and then resent.
