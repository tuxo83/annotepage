# What continuous integration does, and what it requires

Two files, not three. Each has a reason to exist.

## `workflows/check.yml` — on every push

For each package present: install, build, test, then `npm pack --dry-run`,
which answers the only question the registry will ask (which files go out, does
the manifest hold up). A missing package warns without failing: `client/` and
`mcp/` do not arrive on the same day.

A second job runs the end-to-end test if it finds one. It looks for it in this
order: `tools/end-to-end.mjs`, `tests/end-to-end.mjs`, then the same name under
`mcp/tools/`, `client/tools/`, `server/tools/`. Failing that, a root script
`npm run end-to-end`. None of this existed when the file was written: the first
of those paths to be created will be run without changing anything here.

## `workflows/publish.yml` — on a push to main

There is no tag and no release command. Push, and the packages catch up.

    node tools/release.mjs client 2.0.1
    npm run check
    git commit -am "Release client 2.0.1" && git push

On every push to main, each package is looked at in turn: the workflow reads the
version its `package.json` declares and asks the registry whether that version
is online. Already there -- which is the case on almost every push -- and it
publishes nothing and comes out green. Not there, and it builds, tests, and
publishes that one.

`package.json` is therefore the single source of truth for the version. There is
no tag to keep in step with it, so there is nothing for the two to disagree
about.

Trusted publishing through OIDC: **no token is stored**, neither in the
repository secrets nor anywhere else. The job exchanges an OIDC token good for a
few minutes against a right to publish.

### Why not tags

Two packages live here. A bare `v2.0.1` tag would not say which one moves, and a
convention of two prefixes is one more thing to remember correctly at the moment
one is least careful. The safety is not the tag anyway -- it is the question put
to the registry before anything goes out.

### What had to be done once

1. **The very first publication of each name was done by hand.** A package that
   has never been published has no settings page on which to declare a trusted
   publisher, so the automation cannot bootstrap itself. Done on 1 September
   2026 for both, at 2.0.0.
2. **On npmjs.com, for each package**: Settings > Trusted publishing > GitHub
   Actions, organisation `tuxo83`, repository `annotepage`, workflow filename
   `publish.yml` -- the exact name, extension included. Renaming that file
   breaks publication, and the refusal reads "unable to authenticate", which
   does not name the cause.
3. **In each `package.json`**: the UNSCOPED name and a `repository` field naming
   this repository. npm refuses a trusted publication without them. The job
   checks both before attempting anything, so the refusal is readable.

Provenance is not asked for with a flag: for a public repository published
through OIDC, npm generates it on its own. `--provenance` would only repeat it.

## No `pages.yml`

The site is HTML and CSS written by hand, with no dependency and no build step.
GitHub Pages serves `docs/` from the default branch directly, with no
continuous integration: a site-publishing job would have nothing to do but copy
files that are already ready. One piece less to break.

That assumes the final site is **in `docs/`**. Were it to stay under `site/`,
it would have to be either moved, or given the job we are avoiding here — Pages
can only serve the root or `docs/`.
