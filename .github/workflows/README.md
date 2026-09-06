# What had to be done once, outside this repository

> **Nothing here concerns using annotepage** — that is on
> [annotepage.com](https://annotepage.com). This file is what had to be done
> once on npmjs.com; the workflows carry their own reasoning in their headers.

What is here is the part that lives on npmjs.com, where no comment in this
repository can reach it.

1. **The first publication of each name was done by hand.** A package that has
   never been published has no settings page on which to declare a trusted
   publisher, so the automation cannot bootstrap itself.
2. **On npmjs.com, for each package**: Settings > Trusted publishing > GitHub
   Actions, organisation `tuxo83`, repository `annotepage`, workflow filename
   `publish.yml` — the exact name, extension included. Renaming that file
   breaks publication, and the refusal reads "unable to authenticate", which
   does not name the cause.
3. **In each `package.json`**: the UNSCOPED name, and a `repository` field
   naming this repository. npm refuses a trusted publication without them. The
   job checks both before attempting anything, so the refusal is readable.

No token is stored, here or anywhere else. Provenance is not asked for with a
flag: for a public repository published through OIDC, npm generates it on its
own.

## Why this file is not in `.github/`

It was, and it was the repository's front page. GitHub picks the README it
shows in the order `.github/README.md`, then the root, then `docs/` — so a CI
note took the place of the README, and everybody arriving from the site read
about workflow files. Measured on the API rather than guessed: it answered
`.github/README.md`. One directory deeper, it is out of that order and back to
being what it is.

## No `pages.yml`

The site is HTML and CSS written by hand, in `docs/`, with no dependency and no
build step. GitHub Pages serves it from the default branch directly: a
site-publishing job would have nothing to do but copy files that are already
ready. One piece less to break.
