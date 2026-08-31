# annotepage-client

The annotepage annotation layer, browser side.

You open a page, you click what you see -- a heading, an image, a button --
and you write a remark. It is **encrypted in the browser** before it goes out,
pinned to that element, and everybody sees everybody's notes. A fixer -- human
or AI -- replies to it, marks it resolved while saying which version the fix
ships in, and the remark moves into the history without ever being deleted.

This package is **one single file**, with no dependency, loaded by a `<script>`
tag under an SRI digest. It talks about no site in particular and knows none.

The exchange format, the security model and what they do not promise are
described in `FORMAT.md`, at the root of the repository. When this file and
`FORMAT.md` contradict each other, `FORMAT.md` is right.

## What it requires

- a recent browser, in a **secure context**: `https`, or `localhost`. Without
  one, the browser does not provide WebCrypto, and the tool can neither
  encrypt nor even compute the page index -- it says so on screen rather than
  pretending;
- a reachable **annotepage server**: the site itself (self-hosted), or a third
  party machine (relay). One single PHP codebase, deployed at either end;
- nothing else. No framework, no bundler, no stylesheet to load separately.

## Putting the tool on a site

### 1. Generate the salt, and put it away

Load the client once, on a page of the site, with `data-setup` and **without**
`data-project`:

```html
<script src="https://<your-cdn>/annotepage-client@2.0.0/dist/annotepage.js"
        integrity="sha384-A5Wrzv2mtFVnn8Mt0xC7BglTbxbb75unG3CNt5YHUNQ6X5QcwfFPI0OWtANjN2V/"
        crossorigin="anonymous"
        data-server="https://<your-server>/annotepage/api.php"
        data-setup
        defer></script>
```

The setup screen generates a **256-bit salt** and gives you four things to
copy: the salt, the project id, the final tag, and the three lines to declare
on the server. No network request is made at that point.

> **SALT LOST = NOTES LOST.** The salt is the only secret of the project. It
> never leaves the browser, the server receives it in no form whatsoever, and
> nobody can give it back to you. There is no recovery, no security question,
> no escrow third party. Put it where your team keeps its passwords **before**
> continuing.

### 2. Paste the final tag, at the end of `<body>`

```html
<script src="https://<your-cdn>/annotepage-client@2.0.0/dist/annotepage.js"
        integrity="sha384-A5Wrzv2mtFVnn8Mt0xC7BglTbxbb75unG3CNt5YHUNQ6X5QcwfFPI0OWtANjN2V/"
        crossorigin="anonymous"
        data-server="https://<your-server>/annotepage/api.php"
        data-project="7Qb1kZ3xNvA9dLpEqKf2Zt"
        data-version="1.4.12"
        data-environment="staging"
        defer></script>
```

**`integrity` is not decorative.** As soon as the client goes to a CDN, the
real risk of this architecture is the supply chain: a file swapped at the CDN's
host runs in your page, with access to `localStorage` -- hence to the salt. The
SRI digest is what makes that swap useless. `crossorigin="anonymous"` goes with
it: without it the browser does not check the digest of a cross-origin
resource.

The digest **of the version you serve** is in `dist/HASHES.txt` in the package,
and the build prints it. The one above is 2.0.0's. Never copy a digest from a
documentation page for another version: the browser will refuse the file, and
that is exactly its job.

**Do not add `type="module"`.** A module script has no
`document.currentScript`: the client could no longer read its own attributes
and would stand down in silence.

### 3. Declare the project on the server, and give the salt to the team

The server receives the project id (public) and the list of allowed origins.
The salt travels **out of band** -- the tool provides no channel for it. Each
reviewer pastes it once: the tool shows them the pasting screen, checks that
the salt really derives the id declared by the page, and remembers it in their
browser.

## The tag attributes

| Attribute | What it declares |
|---|---|
| `data-server` | the address of `api.php`. Required as soon as the client comes from a CDN. Without it, and only if the client is served by the site, the tool deduces `../api.php` from its own address -- as in version 1.2.0 |
| `data-project` | the project id, 22 characters. Without it the tool does **nothing** (except with `data-setup`) |
| `data-setup` | opens the setup screen. To be removed once the project is created |
| `data-mode` | `encrypted` (default) or `plain`. See below |
| `data-path` | path prefix: the pages of the project. `/fr/` does not annotate `/en/` |
| `data-domains` | origins of the project, separated by commas |
| `data-version` | the version REALLY being served, as the site names it |
| `data-environment` | the name of the environment, written into the note as it stands |
| `data-labels` | a label file belonging to the site, resolved against the document |

`data-version` serves one single purpose, but it counts: when a note is marked
resolved, the tool compares the version of the fix with this one to tell
"resolved and online" -- which folds into the history -- from "resolved, not
deployed yet" -- which stays in front of the reviewer, because the defect
itself is still on screen. Missing or unreadable version: the fix is taken as
NOT deployed, the note stays visible.

A standalone tool does not guess how a site names its version: without these
attributes the fields stay empty, and that is intended.

## Encrypted, or plain

Encryption is **on by default**. In encrypted mode, everything typed or
observed goes out in an AES-256-GCM envelope the server cannot open: the text,
but also the page, the selector, the excerpt, the reviewer's name, the version,
the environment. Encrypting the text alone would hand over the site's tree, its
wording and the list of its reviewers -- and a staging site is precisely what
is not published yet.

`data-mode="plain"` is only acceptable **when self-hosted**, where encryption
protects nothing: the notes are in the same database, on the same machine,
behind the same access restriction as the site under review. **A relay refuses
it**, with a 400, and shows its message.

The mode is written into each note. An installation that ran plain for two
weeks before turning encryption on stays entirely readable: every row says what
it is.

## What the server never sees, and what it sees anyway

It receives neither the salt, nor the key, nor the path of your pages: it
groups by **blind index**, an HMAC of the path that it cannot invert. It does
see the number of projects and notes, the number of distinct pages, the time of
every write, the shape of the threads, the approximate length of each remark,
the IP address of each reviewer -- and, on a relay, **the domain of the site
under review**, through the `Origin` header that the domain lock requires it to
read. The promise is not "the relay does not know which site you are
reviewing"; it is "the relay cannot read your paths, your names or your
remarks".

The server's domain lock is an **anti-abuse** measure: it stops another site
from consuming a project id found in the source of a page. **It is not a
protection against XSS**: an XSS runs INSIDE the target page, so with the
legitimate origin, and it has access to `localStorage`, hence to the salt.

The path prefix (`data-path`) is checked **by the client** -- the server does
not see paths. It is **tidiness**, not a security boundary.

## Content Security Policy (CSP)

If the site serves one, three directives concern it:

- `script-src`: the CDN's origin, without which the client does not load;
- `connect-src`: the annotepage server's origin, without which `fetch` fails
  and the tool stands down in silence, as if nothing were configured;
- `style-src`: nothing to do in most cases. The stylesheet is put in as a
  **constructed sheet**, which is not an inline sheet in the policy's sense. On
  a browser that cannot construct one, the tool falls back on a `<style>`,
  which `style-src` without `'unsafe-inline'` will block -- the tool will work,
  but unstyled.

## Two silences and a shout

**It stands down in silence when it has nothing to do.** If the API does not
answer, does not answer JSON, says it is not configured, or if the page is out
of the project's scope, the client adds nothing to the DOM and writes nothing
to the console. So the tag can be left in a template shared by the whole site.

**But once in place, it no longer keeps quiet.** Every failure is shown, with
the message the server wrote, and **the text typed stays in the form**. A
remark believed saved and not saved is worse than no tool at all.

**A refusal is named.** Defect seen in production: a hosting firewall answers
403 with an HTML page, and the user read "the server answered something
unexpected". That was true and useless. The tool now names the refusal, gives
its code, and suggests the one move that often gets around it: rephrase the
remark, with no tags and no fragments of code. The text itself is kept -- that
has not changed.

A refusal on the very first call is shown too, unlike 1.2.0: a firewall
blocking everything made the tool entirely invisible, and one looked for the
failure in the wrong file.

## What it does not touch

The client adds **one single element** to the site, at the end of `<body>`, and
works inside a `shadow root`: it puts no class, no attribute and no style on an
element of the page, and the pointing highlight is a rectangle drawn on its own
side, never an outline placed on the element aimed at. Its styles are prefixed
`ap-` and live inside the shadow root: they cannot reach the site, and the site
cannot reach them.

Its palette is its own and follows `prefers-color-scheme`: it reads neither the
variables nor the theme of the host site.

`textContent` everywhere, `innerHTML` nowhere: the text of a note is typed by a
human and is never interpreted as markup.

## Translating, or changing a word

Every text shown is in `src/15-labels.js`, in a flat object, in English. Two
ways to replace them without touching the code, by priority:

```html
<!-- 1. an object, defined BEFORE the client -->
<script>window.Annotepage = { labels: { 'button.open': 'Annoter la page' } };</script>
<script src="https://.../annotepage.js" ... defer></script>

<!-- 2. a neighbouring file, DECLARED on the tag -->
<script src="https://.../annotepage.js" data-labels="/local-labels.js" ... defer></script>
```

A missing label falls back on English: a partial translation stays usable.

The complete French set ships in the package, in `labels/fr.json`. It is data,
not a script, so it cannot be given to `data-labels` as it stands -- that
attribute loads a **script**. Either paste the object into the page:

```html
<script>window.Annotepage = { labels: /* the contents of labels/fr.json */ };</script>
```

or wrap it once, in a file of your own served by your site:

```js
// local-labels.js
window.Annotepage = window.Annotepage || {};
window.Annotepage.labels = { /* the contents of labels/fr.json */ };
```

The keys are the same in both files; only the values change. This tool does not
force English onto the reviewers of a French site.

## Building, checking, publishing

```
npm run build     assembles dist/annotepage.js and prints its sha384 digest
npm test          checks the derivations, the blind index and the envelope
npm publish
```

The build has **no dependency**: no bundler, no minifier. That is deliberate --
the file goes into somebody else's page, and the supply chain is the main risk
of this architecture. The file stays readable, and a digest is checked against
something one can read.

`npm test` cross-checks the format vectors against a second implementation of
HKDF-SHA-256 written by hand from RFC 5869. That is what guarantees that the
salt is the input keying material and `annotepage/1` the HKDF salt, and not the
other way round: both "work", only one is the format. The PHP server and the
MCP package can copy these vectors to check that they speak the same format.

## What is in the package

```
dist/annotepage.js    THE served file. Generated: do not edit it by hand
dist/HASHES.txt       one sha384 digest per published version
labels/fr.json        the complete French label set, as an example
```

The sources and the build tools are **not published**: what a page loads is the
one file above, and its digest is checked against it. They are in the
repository:

```
src/00-preamble.js   reading the tag: server, project, scope, limits
src/10-utils.js      labels, base64url, dates, versions
src/15-labels.js     EVERY text shown, English by default
src/20-crypto.js     salt, HKDF, blind index, AES-256-GCM envelope
src/30-state.js      state, browser memory, scope
src/40-api.js        the calls, the refusals, what goes out encrypted or plain
src/50-anchors.js    finding the element of a note, or calling it orphaned
src/60-ui.js         all the DOM, inside the shadow root
src/70-setup.js      the two screens that show or ask for the salt
src/90-boot.js       the order of ignition, and the silences
src/styles.css       confined styles, inlined by the build
tools/build.mjs      the assembly, and the SRI digest
tools/check.mjs      the format vectors
```

The sources are not modules: they are the **sections** of one single file, put
end to end by the build inside one single scope. That is what makes it possible
to port the client from 1.2.0 without rewriting it.

## What it does not do

This is a choice, not an oversight:

- **no authentication.** The name typed in is a convenience, not an identity.
  The project id is a bearer token: whoever has it can read and write. In
  encrypted mode, what they read is useless without the salt;
- **no moderation, and no deletion.** A note that is posted stays. The only
  state it can change is "resolved", and that state can be taken back;
- **no salt rotation.** There is no mechanism: a leaked salt means starting
  from a fresh project, abandoning the notes;
- **no channel for handing the salt** to the second reviewer;
- **no masking of the length** of the remarks: the size of the envelope gives
  it away to within a few bytes.

The salt is remembered **per browser and per origin**. The day staging becomes
production, every reviewer pastes it once more on the new domain -- the notes
themselves do not move. That is exactly what the rule "the domain is not in the
key" buys.

## Licence

MIT.
