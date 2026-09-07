# Standing up the free public relay

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is how the free public relay is stood up — one machine, one operator, once. Installing an ordinary server is on the site.**

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

It stores sealed envelopes it cannot read. A note is a few hundred bytes, and
with 90 days of retention a thousand active projects is on the order of tens
of megabytes.

**The ceiling that actually bounds the bill is `max_note_age_days`, not
`max_notes_per_project`.** This file used to say the opposite, and it was
measured wrong: a cap per project bounds nothing against somebody who does not
care which project they fill, because a project id costs them nothing to
invent -- six unknown ids, six writes, six acceptances. What bounds one
address is `rate_writes_per_ip`, which sets the SLOPE; what makes the total
converge instead of growing for ever is retention, which is the only key here
that ever takes anything back.

`max_notes_per_project` still earns its place, for a different job than the
one it was given: it is what stops ONE project from becoming an export nobody
can serve. Past it a write is refused and nothing is erased -- which also
means the team whose id leaked cannot write either, until you raise it.

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
