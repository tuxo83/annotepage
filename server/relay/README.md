# Standing up the free public relay

Everything needed to put `api.annotepage.com` online. It is one PHP directory
and one database; there is no build step and nothing to compile.

## What goes where

    webroot/                  ->  the document root
    relay/config-local.php    ->  webroot/internal/config-local.php
    secrets/                  ->  OUTSIDE the document root

`secrets/` holds three one-line files -- `database-name`, `database-user`,
`database-password` -- so the configuration you upload carries no password and
can be read by anyone without harm.

**COUNT THE LEVELS AGAINST YOUR OWN LAYOUT, and do not copy the number.** The
paths are absolute, anchored on `__DIR__`, and `__DIR__` is
`webroot/internal/`. The file shipped here climbs three -- `/../../../secrets/`
-- which is right when the document root is itself one directory below the
account's home, and wrong by one everywhere else; `internal/config.php`'s own
example climbs two. Both are examples, neither is the answer for your host.

A path that is not absolute after resolution is refused outright, naming the
path it got. One `..` too many is worse, because it arrives as a 503 saying the
file is missing and to check the number of levels climbed -- which is exactly
the mistake, said in a sentence somebody has to read carefully.

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

```
GET <base>/api.php?action=diagnostic
```

**It answers four lines and no more** -- the tool, its version, the format and
the verdict -- unless the configuration says `'diagnostic' => 'full'`. The
short report is the default on purpose: that address has no authentication, so
what it publishes it publishes to everybody.

With `full`, the three lines worth reading on a relay are

    config.deployment          relay
    config.open_registration   yes -- any project id is served, no origin lock
    config.max_note_age_days   90 -- threads older than this are removed

and `full` is set while you check, then set back. This section used to name
those three lines without saying that the default hides them: the reader ran
the command, saw four lines, and had nothing to conclude from.
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
