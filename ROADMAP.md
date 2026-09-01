# What is left to do, and what we decided not to do yet

One entry = one subject, the reason it exists, and the traps already spotted.
Anything not yet settled is marked as such: this file does not decide in the
maintainer's place.

---

## Screenshots attached to notes

**Why.** The competing tools (BugHerd, Marker.io, Usersnap) attach a
screenshot to every remark. Today an annotepage note carries the page, the
selector, an excerpt of text, the version, the environment and the viewport
size — that is already a lot, but it does not show what the person SAW. And
the experience of this project is clear: several times, the description alone
sent the fix in the wrong direction, and it was a screenshot that settled it.

**TO LOOK AT, not decided yet.** Four real difficulties, to weigh before
starting:

1. **Weight.** A note weighs a few hundred bytes; a screenshot, hundreds of
   kilobytes — a thousand times more. That changes the sizing of the storage,
   and the economics of a shared public relay.
2. **Encryption.** If encryption is on, the screenshot has to be encrypted too,
   browser side. The relay then becomes unable to build a thumbnail of it: the
   display has to decrypt everything in order to show anything.
3. **Privacy, and this is the most serious point.** A screenshot taken on a
   staging site can contain real data displayed on screen — a name, an address,
   a customer record. The remark itself almost never does. Attaching an image
   changes the nature of what we store.
4. **Fidelity.** A rasterised screenshot ages badly and cannot be searched. A
   capture of the element's DOM (its HTML and its computed styles) weighs a
   thousand times less, can be reread, can be compared — and may well be enough
   for the real use.

**Leads, by increasing cost:** capture only the box of the targeted element
rather than the whole page; or capture the DOM rather than an image; or the
whole page, as an option, off by default.

---

## Product positioning — to be reflected in the site and the README

Observed while examining neighbouring projects: cusdis, remark42, giscus,
utterances, umami are COMMENT SYSTEMS — readers commenting on a published
article. Same technical shape as annotepage (a widget, a self-hostable server,
a hosted option), different business.

**The real competitors are BugHerd, Marker.io and Usersnap**: paid SaaS, no
self-hosting, no AI loop.

What does NOT differentiate, and must therefore not be put forward:
- the public server by default + self-hosting: it is the standard of the
  family, everybody does it;
- "dead simple": everybody claims it.

What does differentiate, and must be shown: **the closed loop**. The reviewer
annotates, the AI reads, fixes, REPLIES IN THE THREAD saying what it measured,
then ARCHIVES the note stamping it with the version the fix ships in. No tool
in this family goes beyond "export to Jira".

**And above all the COMBINATION**: open source + self-hostable + end-to-end
encrypted. An MCP can be copied in a weekend; a SaaS cannot follow on blind
encryption without contradicting its own model.

---

## Other open subjects

- **Notifications.** Today nobody is told that a note has arrived. On the
  original project, a periodic task collected them. An email on every new note
  would close the loop.
- **Overview.** No screen lists the open notes across all pages. You have to
  open each page, or read the raw export.
- **Badly explained server refusals.** Seen for real: when a host's firewall
  answers 403 with HTML, the reviewer reads "The server answered something
  unexpected". The typed text is kept, but the message should name the refusal
  and suggest rewording.
- **Deletion.** Original choice: no note is ever erased, you do not erase
  somebody else's remark. To be kept — but an operator who leaves a message by
  mistake has no recourse. Observed, with no solution adopted.

---

## Settled while converting to English, recorded so they are decisions

**The published client tarball no longer ships `src/` and `tools/`** -- only
`dist/`, `labels/` and the readme, five files. The sources are on GitHub and
the build is reproducible from there; shipping them again tripled the tarball
for nothing. Blessed deliberately: the conversion changed it without being
asked to, and the smaller list is the right one.

**Two end-to-end harnesses exist.** `mcp/tools/check-end-to-end.mjs` is the one
CI runs -- 15 checks. `test-end-to-end/` holds a second, richer one
(`client-bridge.mjs` + `file-store.php`) that nothing imports; it was written
by a workstream that stopped before wiring it, and it works -- the browser
verification of 1 September used its file store. Either wire it or delete it;
leaving an unrun test in a repository teaches people to distrust the tests
that do run.

**`?action=backfill` has no caller.** It fills `page_index` for rows written
before the blind index existed, and INSTALL.md gives a curl recipe. That is
enough for a one-off, but it means the code path is only ever exercised by
hand.

**The `id` column is a server-global counter.** Between two notes of one
project, the gap says how much every other project wrote. Thin, real, kept:
fixing it needs per-project numbering. Documented in FORMAT.md 2.4.

---

## The priority: a community, and everything free

Stated by the owner on 1 September. Everything is free and MIT; there will be
ONE shared server anyone can use at no cost. That server must be extremely
light, because nobody is paying for it and nobody is going to administer it.

This is not a business decision deferred, it is the shape of the project today,
and it constrains what goes on the site: see the section added to site/BRIEF.md.
A product may come later; nothing should be built now that assumes it.

The retention ceiling and open registration, both added today, exist for exactly
this server: it stores what it cannot read, for people it will never meet, and
without a bound it only grows.

## The public endpoint, and what it does not solve

A dedicated subdomain will host a public relay, so that putting the tool on a
site needs no server at all: paste one tag, done.

**Measured on the site of 1 September, before that endpoint exists:** a reader
must make or obtain **seventeen** things before a single note can be written.
The public endpoint removes nine of them -- the hosting, the codebase, the
database, the API URL, the deployment choice, the mode, the origins, the local
config file, and the decision of where the server goes.

**Eight remain, and all eight are the salt ceremony or optional attributes.**
So the endpoint alone does not deliver "paste one tag and you are done". The
shortest path still opens with: generate a 256-bit secret, store it where you
keep passwords, there is no recovery.

**Settled: the ceremony stays.** The salt remains an explicit prerequisite,
generated and safeguarded before anything is written. Silent generation was
considered and refused: it trades a risk nobody sees -- a reviewer clearing
their browser having never saved the key -- against a shorter first minute,
and losing every note of a review is not a risk worth trading for. Plain mode
on the public relay was refused on sight: a relay reading everyone's staging
paths, names and remarks is exactly what FORMAT.md 2.3 says must not happen.

**So the site must never promise "one tag".** It would be false. What it can
do, and does not do today, is make the shape visible before the reader starts:

- say the count up front -- three steps, and roughly how long, so the reader
  knows what they are entering rather than discovering it at 2.9 screens;
- make step one feel like the thirty seconds it is. The setup screen already
  generates the salt and hands over the four things to copy. The page spends
  62 words describing what that screen will tell the reader anyway;
- keep the lost-salt warning at full strength, but out from BETWEEN the two
  script tags. It belongs with the salt step or at the head of the section on
  where the notes live -- never standing between the reader and the tag that
  runs the tool;
- once the public endpoint exists, present it as what removes nine of the
  seventeen, not as a different product.

## Plugins for off-the-shelf platforms

Wanted, WordPress first. What the neighbours do, checked rather than
remembered:

- **cusdis** shows a grid of framework logos (Vue, React, Svelte, Hexo,
  Docsify) between the features and the pricing. It is a trust signal; it
  carries no instructions and shortens nothing.
- **giscus** puts a configurator on the page that generates the snippet -- but
  the snippet stays empty until the form is filled, so the first copyable thing
  is not copyable.
- **marker.io** separates "CMS Plugins" (WordPress -- what you install ON your
  site) from "Issue Trackers" (what you connect the tool TO). That distinction
  maps exactly onto this project's two audiences, and is worth borrowing.

**What we are not:** annotepage is a script tag, so it already works on every
platform that lets you add one. A plugin does not add capability; it removes
the awkwardness of pasting into `<body>` on platforms that hide the template --
WordPress, Shopify, Webflow, Ghost. Say the generic path works everywhere,
and offer shortcuts where pasting is genuinely painful. A grid of logos would
imply the list is the limit, which would be a weaker claim than the truth.

Never publish a platform with a "coming soon" label: it turns a strength into
a visible gap.

---

## A browser extension, instead of a tag

Considered, and worth doing -- but it is a second product, not a shortcut.

**What it would buy.** The reviewer annotates a site WITHOUT anything being
installed on it. No tag to paste, no access to the template, no deployment.
That is the case the tag cannot serve at all: reviewing a site you do not
control -- a supplier's, a client's, a competitor's. It is also how the paid
tools in this space work, which says the demand is real.

**What it changes, and it is not small.**

- The tag makes annotation a property OF THE SITE: it is there for whoever
  visits, the owner decided it, and the project is the site's. An extension
  makes it a property of the READER: the notes follow the person, and the site
  owner never knows. Those are two different products with one protocol.
- Every reviewer then needs the extension AND the salt, where the tag needed
  neither. The shortest path gets longer for a team, and shorter for a loner.
- Page identity stops being obvious. The tag knows the site because it is in
  it; an extension has to decide what counts as "the same page" across
  environments -- staging and production, `localhost:3000` and `localhost:5173`.
  That is the same question the localhost work raises, and it should be
  answered once, for both.
- Store review, on two stores, forever. For a personal project that is the real
  recurring cost -- more than the code.

**Where it does NOT change anything:** the server, the format, the encryption,
and the MCP. The assistant reads the same notes from the same relay. That is
the sign the protocol was cut in the right place.

**If it is built**, build it second and say plainly on the site which of the
two a reader wants: "you control the site" -> the tag; "you do not" -> the
extension. Offering both with equal weight on the first screen would put a
choice in front of someone who has not yet understood what the tool does.

---

## Languages

The tool ships in English and the interface strings are overridable: a French
set is in `client/labels/fr.json`, loaded through `data-labels`. That covers the
reviewer's screen, which is the part a non-English-speaking team actually reads.

What is NOT covered, and should be, in this order:

1. **More label sets, contributed.** The mechanism exists and costs nothing per
   language: a JSON file of 101 keys. What is missing is a place to put them and
   a line on the site saying they are welcome. Cheapest win here by a distance.
2. **The setup screen and the error messages.** Some of what the client says in
   a bad situation -- no secure context, refused origin, unreadable note -- comes
   from the server, in English, and no label file can reach it. A reviewer who
   hits one of those meets English at the worst moment.
3. **The site itself.** English only, deliberately: it addresses developers
   choosing a tool, and that audience reads English. Translating it would double
   the maintenance of the one artefact that changes most. Revisit only if usage
   shows otherwise.
4. **The assistant's replies.** The MCP writes in whatever language the
   assistant answers in, which is right and needs nothing -- except that a note
   written in French and answered in English reads badly in the thread. Worth a
   sentence in the MCP readme telling the assistant to answer in the language of
   the note it is answering.

**What must never be translated:** the protocol. Column names, export keys,
action names and configuration keys stay English, whatever the interface shows.
That is the whole point of CONVENTIONS.md, and a localised wire format would
make two installations unable to read each other.

---

## Updating the PHP server without going and doing it by hand

**Decided by the owner: opt-in, and the update pulls its script from GitHub.**
The reasoning holds where it matters. Fetching over HTTPS moves the trust anchor
to GitHub and the certificate authorities: an attacker who hijacks the server's
DNS still cannot present a valid certificate for github.com, so a DNS
compromise alone does not reach the update. What is left is a GitHub account
compromise, which two-factor authentication already answers.

**The refinement, because the channel is not the only danger.** For a server to
rewrite itself FROM AN HTTP REQUEST, its own code directory must be writable by
the web server's user. From that moment any file-writing bug anywhere else --
in this code or in anything sharing the account -- becomes permanent code
execution. That was WordPress's largest attack surface for a decade and it has
nothing to do with where the update came from.

So: **opt-in, from GitHub, but run from the COMMAND LINE, not from a web
request.**

    php tools/update.php          # by hand, or from cron

The web-facing code never needs write permission on itself, which is the
property worth keeping. It stays automatic -- a cron line is set once -- and the
opt-in is real: a server that has not been given that line does nothing, ever.

**What it must do, in this order:**

1. read the running version and the latest published one, and stop if they
   match. Most runs must do nothing and say so;
2. fetch the release over HTTPS with certificate verification ON. Explicitly:
   any attempt to disable peer verification is the bug, not the workaround;
3. **verify a checksum published separately from the archive.** Cheap, and it
   catches a truncated download as well as a swapped one;
4. never touch `internal/config-local.php`, which holds the declared projects,
   the origins and the paths to the credentials. Nor the store, if it was
   replaced;
5. keep the previous version next to the new one, so a failed upgrade is undone
   by renaming a directory rather than by re-uploading everything from a hotel
   wifi.

**Practical constraint to check before writing any of it:** shared PHP hosting
often disables `allow_url_fopen` and does not ship curl. The script must detect
that and say so plainly rather than fail with a blank page -- and the diagnostic
should report whether outbound HTTPS works at all, since without it this whole
feature is unavailable on that host.

**Level 1 first, whatever happens.** The diagnostic reporting the running
version against the latest published one costs an hour, writes nothing, and
fixes the real problem: not that updating is hard, but that nobody knows they
should.
