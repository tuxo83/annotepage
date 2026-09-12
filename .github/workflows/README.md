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

## What has to be done once on wordpress.org

The plugin publishes on the same rule as the packages — push to `main`, and a
version the directory does not already serve goes out — but it cannot bootstrap
itself either, and for a harder reason: **there is no repository to write to
until a human at wordpress.org has approved the plugin.**

Three things, in this order. Until all three exist the job publishes nothing and
comes out green, saying which one is missing.

1. **An account on wordpress.org.** It owns the plugin and it is what SVN
   authenticates.
2. **The plugin submitted once, by hand**, at
   `wordpress.org/plugins/developers/add/` — a zip of `wordpress/` without
   `tests/` and without `README.md`. It is read by a person, which takes days
   or weeks, and the answer creates the SVN repository at
   `plugins.svn.wordpress.org/annotepage/`. Nothing can be automated before
   that, by anybody.
3. **Two repository secrets**, `WPORG_USERNAME` and `WPORG_PASSWORD`.

**That password is the account's own, and it is the weakest link in this
file.** npm gave us trusted publishing, so the npm packages go out with no
stored secret at all; wordpress.org has no equivalent — SVN takes the account
password, and that account owns every plugin it publishes. Two-factor
authentication on the website does not apply to SVN, so the secret is a standing
credential with no expiry. It is stated here rather than discovered later.

**The version in `wordpress/annotepage.php` is what decides**, and
`readme.txt`'s `Stable tag` must be the same string — the directory installs the
readme's number, so a disagreement ships code nobody chose. That is checked by
`npm run check` and again in the job, before anything is committed.

`wordpress/assets/` is the icon, the banner and the screenshots. It goes to
SVN's `assets/` directory and never into the zip, and `readme.txt` must not
announce a screenshot that is not there — an announced one that is missing is a
blank frame on the plugin's page.

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
