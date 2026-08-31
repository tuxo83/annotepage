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

## `workflows/publish.yml` — on a tag

The convention, and it is the only trigger:

    client-v<version>   ->  annotepage-client   (directory client/)
    mcp-v<version>      ->  annotepage-mcp      (directory mcp/)

    git tag client-v2.0.0 && git push origin client-v2.0.0

Trusted publishing through OIDC: **no token is stored**, neither in the
repository secrets nor anywhere else. The job exchanges an OIDC token good for
a few minutes against a right to publish.

If the version in the tag is already online, the job says so and comes out
green without publishing anything: republishing would fail, and a routine
failure ends up unread.

### What has to be done before the first tag

1. **On npmjs.com, for each of the two packages**: Settings > Trusted
   Publisher > GitHub Actions, organisation `tuxo83`, repository `annotepage`,
   workflow file `publish.yml` — the exact name, extension included. Renaming
   that file breaks publication; the refusal reads "unable to authenticate" and
   does not name the cause.
2. **In each `package.json`**: the UNSCOPED name (`annotepage-client`,
   `annotepage-mcp`) and a `repository` field naming this repository — npm
   refuses a trusted publication if either is missing. The job checks both
   before attempting anything, so that the refusal is readable.
3. **A package never published** has no settings page on which to declare its
   trusted publisher: the very first release of each name is done by hand, the
   automation takes over afterwards. To be confirmed when the time comes.

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
