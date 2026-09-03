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

## Two choices at generation time: public notes, or notes with a key

Proposed by the owner on 2026-09-02. The friction he is aiming at is real:
today every reviewer has to be handed a 43-character key and paste it once per
browser and per domain, and that is the single hardest step in the whole tool.
His shape: at generation, two options -- no key, everybody sees everything; or
a key, and only the people holding it see anything.

Half of it exists: `data-mode="plain"`. **A relay refuses it**, with a 400, and
FORMAT.md 3.4 demands that refusal. So the choice cannot be offered on the
shared server as things stand.

There are two ways to build it, and they are not variants of each other.

### (a) Allow plain mode on the public relay -- NOT recommended

Cheapest to build, and it changes what the relay is. It would hold readable
third-party content: the text of reviews, the paths of pages, the selectors,
the reviewers' names, from strangers' staging sites. The operator can read it,
a backup carries it, a breach publishes it, and someone will eventually ask
for it.

Worse, and this is the part that decides: **the project id is a bearer token
sitting in the page source.** In plain mode, whoever reads the HTML once can
read every note of that project, from any machine, for as long as the project
exists. That is not "everyone on the site sees everything" -- it is "the notes
are public on the internet", including the ones about a site that is not
published yet. It also breaks, in one word, the promise the site makes about
the shared server.

### (b) Put the key IN the tag -- DECIDED, 2026-09-02

The owner's original intention, and his call after reading (a): "l'option b dans
la configuration actuelle est tres acceptable, c'est vraiment celle que j'avais
en tete a l'origine". (a) is recorded above so nobody rediscovers it as an
obvious shortcut and takes it.

`data-key` beside `data-project`. The client reads it there instead of asking
for it, and stores nothing.

- Zero friction, which is the whole point: a visitor arrives, the key is
  already there, no screen, no pasting, everyone annotates and everyone reads.
- **The relay still cannot read anything.** The envelope is unchanged,
  AES-256-GCM, and the blind index still hides the paths. Backups, the
  database, the hosting company: all still opaque.
- The sentence to put on the page is exact and short: *the key is in your
  page, so anyone who can read the page can read the notes*. No claim to walk
  back.
- No format change and no server change. The client gains one attribute; the
  landing page gains a choice at generation.

**And it would let the assistant stop being configured at all.** Raised by the
owner in the same conversation: if the key is in the tag, `annotepage open`
could be given a URL, fetch the page, read `data-project` and `data-key` off
it, and work -- no configuration file holding the only secret in the system,
which today is the one file the MCP README puts in bold. For a public project
that is a genuine simplification and not a shortcut.

Three shapes for it, and the owner's is the cheapest AND the safest:

1. **The MCP fetches the URL itself.** The obvious one, and the worst: today
   it talks to ONE address, the one in its configuration. Fetching a URL the
   assistant chose is a new outbound surface -- private ranges, localhost,
   redirects -- and the page it fetches carries `data-server` too, so it also
   decides where the notes are read and written. Point it at a hostile page and
   it talks to a hostile server. Would need a refusal of private ranges and
   probably a human confirmation per project.

2. **The ASSISTANT fetches it, and passes what it found to the MCP.** The owner's
   version. The assistant already reads web pages; it reads the tag, takes
   `data-project` and `data-key`, and calls the tool with them. The MCP gains
   NO new capability -- no outbound fetch, no URL parsing, no allowlist to
   maintain -- it only has to accept a project and a key per call instead of
   reading them from a file. And the URL came from the human, who is the one
   who knows which site is theirs. The trust boundary does not move.

   What it needs is small: tools that take `project` and `key` as arguments,
   and a tool description that tells the assistant where to find them ("the
   annotepage tag at the end of the page carries both"). That description is
   the actual feature; the code around it is an argument.

3. **Ask the human for the key.** The fallback for when there is no page to
   read, and what happens today, just spelled out in the moment rather than in
   a configuration file.

**THE LINE THAT MUST NOT BE CROSSED, and it decides where 2 applies.** In shape
2 the key travels through the assistant's context: a model provider's logs, a
transcript, a shared session. For a PUBLIC project that is exactly nothing --
the key is in the page, it is public by construction. For a private project it
is a leak of the only secret in the system, and an unrotatable one. So shape 2
is for public projects and must refuse to be used for anything else; a private
project keeps its configuration file, and should.

What (b) costs, and must be said where it is offered: the key is served to
whoever the page is served to -- search engines and archive sites included --
and there is no going back. A project made public cannot be made private
again, because the key is out; making it private means a new key, therefore a
new project, and the old notes stay behind. That is the same irreversibility
the key already has, pointed the other way.

### How it is offered, and one derivation that must never be built

The owner's framing, 2026-09-02, and it is the right one because it is what is
actually true: **either the notes are protected by a password, or they are
protected by the same thing that protects the site itself -- being able to
reach it.** Said in those words, at the moment of choosing, with nothing else
around it.

  Step 02, default:  no password. Whoever can open the page can read the notes.
  Step 02, optional: a password. Only the people you give it to can read them,
                     including people who can open the page.

Step 03 then keeps the shape it has, plus one sentence: **if a password was
set and the assistant does not have it, the MCP asks for it.** Nothing to
configure in advance for the default case.

**THE DERIVATION THAT LOOKS OBVIOUS AND MUST NOT BE BUILT: deriving the key
from the domain name.** It was proposed in the same breath and it is the one
version of this that gives everything away.

The client always talks to a DIFFERENT origin from the site under review --
`api.annotepage.com` against `example.com` -- so the browser writes an `Origin`
header on every request, and origins.php reads it: that is how the domain lock
works. A relay therefore knows the domain of every project writing to it. If
the key were a function of the domain, the relay could compute the key, and
with it the project id, and read everything it stores. It would not even need
the page.

That is option (a) with a coat of paint, and worse than (a): (a) is honestly
plain, this one would be sold as encrypted while the operator can read it.

The random key in the tag gives the owner exactly what he is asking for and
keeps the property (a) loses. Access to the notes = access to the page, because
the key is IN the page -- and the page is the one thing the server never sees.
The server keeps receiving an id and ciphertext, and keeps being unable to open
either.

### Saying it out loud: "encrypted, and the key is public"

The owner's refinement, and it settles the honesty question: keep everything
encrypted exactly as it is, and when the key was not chosen by a person, SAY
SO -- end-to-end encrypted, and the key is public. A small standing mention in
the tool, not a footnote on a website.

That is the right sentence and it should be built. It removes the objection
that a public-key project would be "sold as encrypted": nothing is sold, the
tool says what it has.

Three behaviours go with it, and the first two already exist:

- notes exist and the key in this browser derives a DIFFERENT project id: the
  client asks for the key. That is `start()` in 90-boot.js today;
- a key is pasted that does not derive the declared id: refused, with nothing
  sent and nothing decrypted. Today's `salt.wrong`;
- **new**: when the project is running on the public key, the tool says so
  where the notes are, every time, not once. "Encrypted, and the key of this
  project is public: anyone who can open this page can read these notes."

WHERE THE PUBLIC KEY COMES FROM IS STILL THE WHOLE QUESTION, and the answer is
the tag, not the domain -- on the owner's own criterion.

His goal, in his words, is that the notes be protected by "the same thing that
protects the site: being able to reach it". A key written into the tag does
exactly that: to read the notes you must be able to load the page, so a
staging site behind HTTP auth, a VPN or an IP allowlist protects its review
notes with the same lock that protects itself.

A key derived from the domain BREAKS that, and not marginally: the hostname of
a private staging site is not a secret -- it is in DNS, in certificate
transparency logs, in a link somebody pasted -- and anyone holding it could
read every note of that project without ever reaching the site. The relay
included, since the browser hands it the Origin on every request.

Same simplicity for the user either way: no password to invent, nothing to
paste. One of the two keeps the promise the sentence makes.

### The mode is not chosen at first use -- it is chosen when the tag is made

Proposed: on install, look for existing notes; if there are some, test the key
and ask for it if it is wrong; if there are none, show a screen asking the
operator to choose between a public key and a confidential one, and perhaps
write a seed note so the choice "occupies the ground".

The first half is what the client already does. The second half cannot work,
and the reason removes the need for it.

**The project id IS the key, hashed.** A tag exists only because a key was
generated first, and choosing the other mode means a different key, therefore
a different project id, therefore a different tag on every annotated page. So
there is no moment where a project exists, is empty, and is waiting to be told
what it is. The choice was made when the tag was made, and it is as
irreversible as the key -- which is exactly what the page must say at the
moment of choosing, and nowhere else.

Which also answers the seed note: there is nothing to hold. A seed note would
be a real row -- stored, counted against the project cap, present in every
export, and needing a new kind in the format so nobody mistakes it for a
remark -- to record something the tag already states. Not worth a format
concept.

**And the client does not need to look for existing notes to know the mode.**
It cannot, before it has the key: the page index is HMAC(index key, path), so
without the key there is no question to ask the server. It does not have to.
The tag carries `data-key` or it does not, and that is the mode.

### What a public key actually opens, and it is not mainly reading

Worth stating where the choice is offered, because the obvious half is the
less dangerous one. The key gives read AND write -- there is no reader role in
this format. So a public-key project is a page anybody who opens it can also
POST to.

On a staging site behind a login, that is a team. On a public production page,
it is the internet, and two things follow that a warning has to name:

- the project's note cap is the only thing between that and a full database,
  and the relay's rate limit is per IP, which is not an answer to more than one
  of them;
- **a copied tag writes into your project**. The domain lock is what stops
  that, and on a relay with `open_registration` a project has no declared
  origins to match, so it does not apply. Someone who lifts a public tag from
  your source writes into your notes from their own site.

Neither is a reason not to build the public mode. Both are reasons the
sentence next to the choice cannot only be about who can read.

### The tag carries the key, OR the id -- and that is the mode

The owner's unease, and it is the useful kind: "either you put the project id
in the tag or you don't, and if you do it asks for the key -- something bothers
me there." What bothers him is that the tag was being asked to carry an
identity somebody has to create elsewhere, by two paths that behave nothing
alike.

It resolves into one rule, and the rule IS the choice:

    data-key      the key itself. Public: whoever loads the page reads and
                  writes. Nothing is asked, nothing is stored, no first-run
                  screen.
    data-project  the id alone. Confidential: the key is asked for once per
                  browser, and until it is there the client fetches nothing
                  and decrypts nothing.
    data-setup    neither, temporarily: create the project on your own site,
                  then replace the tag with one of the two above.

**The id becomes redundant in the public form, and must be dropped from it.**
`derive()` already produces the id from the key -- HKDF label `id`, first 16
bytes -- so a client given `data-key` computes `data-project` itself, in the
line it already runs. Writing both would mean writing the same fact twice, in a
tag people copy by hand, where the two can disagree.

That is not hypothetical: keeping the printed id equal to the id inside the
generated tag is a thing the landing page has to check on every regeneration,
and it is the kind of pair that goes wrong silently -- a tag whose notes nobody
can read, with nothing to see. In the public form the class of bug disappears
rather than being guarded.

So the sentence next to the choice writes itself, and it is about the tag
rather than about a setting:

    the tag carries the key    -> anyone who can open the page
    the tag carries the id     -> only the people you hand the key to

### Nobody pastes twice: the key is generated before the tag exists

Objection, and it is right about the flow it describes: asking somebody to
paste a setup tag and then replace it IS complicated, and no default path
should do that.

No default path does. The landing page generates the key in the visitor's own
browser and hands over the finished tag, already carrying what it needs. One
paste. `data-setup` is the escape hatch for whoever will not let a page they
did not write generate their key -- a legitimate refusal, and not the road.

With `data-key`, that road becomes the shortest it can be:

    <script src="https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js"
            data-server="https://api.annotepage.com/api.php"
            data-key="..."
            defer></script>

One paste, nothing to save, nothing to configure, nobody to hand anything to.
The install chapter loses its middle step for the public mode: paste the tag,
plug in the assistant, done -- which is where the owner started.

The confidential mode costs exactly one thing more, and it should be priced in
those words rather than described: **every reviewer pastes the key once**. That
is the whole difference, and it buys the only thing it can buy -- that somebody
who can open the page still cannot read the notes.

### What is NOT settled

Whether the shared relay should carry public projects at all. (b) keeps the
notes unreadable to the operator, which removes the liability argument, but a
project anyone can write to is a project anyone can fill with noise, and the
per-project cap is the only thing between that and the relay's disk. The rate
limit is per IP and per project; neither is an answer to a public project
someone decides to flood.

## The stale copy can replace itself, and the tag cannot help

Asked on 2026-09-03: can the seven-day browser cache be changed from the tag,
or from the client's own code?

**From the tag, no.** No attribute of `<script>` touches cache lifetime --
integrity, crossorigin, defer, async, referrerpolicy, fetchpriority, none of
them. `Cache-Control` is a response header and the requester cannot overrule
it. jsDelivr's `max-age=604800` on a range URL is theirs to set, and `@2` is
already the shortest form they serve: a pinned `@2.1.0` is immutable there and
cached for a YEAR.

**From the code, yes, and the clean way avoids the cache entirely rather than
fighting it.** The trick is that the stale copy does not have to refresh its
own URL -- it can load a DIFFERENT one:

1. the client knows its own version, the build stamps it (`TOOL_VERSION`);
2. it learns the current one from somewhere with a short cache -- a small
   JSON on annotepage.com, which GitHub Pages serves with minutes of cache,
   not days. NOT from the CDN range, which is the very thing that is stale;
3. if it is behind, it injects a script tag pointing at the EXACT version --
   `annotepage-client@2.1.1/dist/annotepage.js` -- and that URL has never been
   fetched by this browser, so no cache stands in the way. It then withdraws
   and lets the fresh copy take over the page.

**THE CHECK GOES FIRST, BEFORE THE WORK -- owner's refinement, 2026-09-03,
and the boot path already has the seam for it.** 90-boot.js says it in its own
comment: "The order matters: we ask the API BEFORE touching the DOM. If it does
not answer what it should, the site never saw anything go by." A stale copy
that learns it is stale at that moment has drawn nothing, listened to nothing
and decrypted nothing: it withdraws instead of undoing.

Which forbids the obvious implementation. The check must not be a request the
boot WAITS on before starting -- that would make every page load, on every
site, pay for the rare case of being behind. Two shapes avoid it:

- **ride the answer the client already asks for.** The `list` call happens
  before the DOM is touched; the server can name the current client version in
  it, and there is no second request at all. The cost is a coupling: a
  self-hosted server would announce whatever it was installed with, so it must
  say nothing rather than guess, and "nothing" must mean "carry on";
- **or fetch the version file in parallel** with that call, never in front of
  it. One extra request, concurrent, so it adds no time to a page that is up
  to date -- which is every page, almost always.

What has to be got right, and none of it is hard: the old copy must remove its
host element and its listeners before the new one builds, or the page carries
two pills; the check must be cheap and must not run on every page view; and a
failure to reach the version file must be a silence, not a screen -- the tool
already works, it is merely old.

The variant that does NOT work as well: `fetch(url, {cache: 'reload'})` on the
range URL. It does refresh the HTTP cache, but a `<script src>` with no
crossorigin is a no-cors request and a default fetch is cors, so browsers may
key them separately and the next load can still read the stale entry. Loading
a version that was never cached has no such subtlety.

This also gives the owner-facing half for free: a client that knows it is
behind can say so, which is what an earlier entry asked for.

## Origin patterns, and why the refusal is weaker than it reads

Asked on 2026-09-02: several sites in one project, yes -- `origins` is a list
and a server may declare as many projects as it likes. Wildcards, no, and
origins.php says why where it compares:

    no prefix, no wildcard, no implicit subdomain. A wildcard on subdomains
    would look convenient and would open the project to the first page hosted
    on a subdomain one no longer controls.

That reason is sound and it is also weaker than it sounds, which is worth
writing down before somebody quotes it as settled. **The domain lock is
anti-abuse, not a security boundary** -- FORMAT.md says so in as many words.
What a wildcard would open is not reading: the notes stay unreadable without
the key. It is WRITING: somebody on a subdomain you stopped controlling could
fill the project with noise and burn its cap. Real, and bounded.

The case the refusal makes impractical is preview deployments --
`pr-412-app.vercel.app`, a new host per branch, impossible to list. Today the
answer there is to leave that project without declared origins, which on a
self-hosted server means it does not work at all.

The shape that looks defensible, and is NOT built: **one label, on a domain
entirely yours** -- `https://*.preview.example.com`, never `https://*.example.com`.
One level, so the wildcard cannot reach a sibling of the apex; and on a
subdomain whose whole subtree you own, so "a subdomain one no longer controls"
stops being the common case and becomes a deliberate act.

Whoever builds it: the pattern is matched AFTER canonicalisation, against the
same normalised origin the exact comparison uses, and a pattern with more than
one `*`, or a `*` anywhere but the leftmost label, is refused at configuration
load rather than at request time -- a lock nobody can read is a lock nobody
maintains.

## Rotating the key

Asked for by the owner on 2026-09-02, as the thing that would absorb part of
the risk the public option carries -- and part of the risk the key carries
anyway, since today it cannot be changed at all.

**Why there is no rotation today.** The key derives the project id. Change the
key and you change the id, which means you have a different project: a new
tag on every page, and every note left behind in the old one. That coupling is
what makes the id safe to publish -- it cannot be worked back to the key --
and it is also what makes rotation impossible. The two properties are the same
property.

**What a rotation would actually be: a re-encryption.** The CLI and the MCP
already hold the key, and they are the only place that could do it: read every
note with the old key, decrypt, re-encrypt with the new one, recompute every
blind index, write them under the new project, then delete the old rows. The
server never has to understand any of it -- it moves envelopes it cannot open,
which is what it already does.

What it costs, and none of it is hidden:

- **the tag changes on every annotated page**, because the project id changed.
  A rotation is therefore a coordinated deploy, not a button;
- **every reviewer pastes the new key once**, on every domain, exactly as they
  did the first time;
- **the old rows must be deleted**, or the old key still opens them where they
  sit.

**What rotation buys, stated exactly, because it is easy to oversell.** It does
not undo a leak: whoever holds the old key and kept a copy of the old rows
keeps them, forever. What it buys is that the leaked key stops working against
the live server, and that everything written after the rotation is out of its
reach. For the public option that is the whole point -- it is the only way a
project that was made public becomes private again for what comes next.

**The change that would make it cheap, and it is a format break.** If the
project id were random and carried in the tag rather than derived from the
key, the key could change without the id changing: no new tag, no coordinated
deploy, and the reviewers' re-paste becomes the only cost. Notes still need
re-encrypting. That is format 3 territory and should not be smuggled into a
point release; write it down here and decide it once, with FORMAT.md section 7
open.

Nothing is built. `annotepage rotate` does not exist and must not be half
implemented -- a rotation that stops in the middle leaves a project whose notes
are split across two keys, which is the one state the format's per-row mode
field was designed to survive but which nobody should have to read about in a
support message.

## A page of its own for the security rules

The landing page's step 03 says the one thing that cannot be undone -- the salt
is the key, nobody else has a copy, losing it loses the notes -- and then sends
the reader to two anchors on how-it-works.html. That is the right size for a
step in a three-step chapter and the wrong size for the subject.

What belongs on a page of its own, and is today scattered across FORMAT.md,
INSTALL.md and how-it-works.html: where the salt may and may not live, what a
shared relay learns anyway (the path of every annotated page, the sizes, the
times), what `data-mode="plain"` costs and when it is acceptable, what a
compromised CDN could do to a site carrying the short tag, and what changes
when the server is your own.

It also gives the tag's third line somewhere to point: the owner asked for the
warning to lead somewhere written for it, not for a paragraph borrowed from a
longer explanation.

Not started. how-it-works.html#no-recovery and #data hold the line until then,
and they are accurate -- they are just not a security page.

## The tag on the landing page floats, and gives up SRI to do it -- SETTLED

Decided on 2026-09-02, written down because it is a real trade and the reasons
have to survive whoever asks "why is there no integrity attribute?".

The tag the landing page hands out ends in `@2`, with no `integrity` and no
`crossorigin`. A version range and a fixed digest cannot both hold: pin the
bytes and the tag can never update, let it update and the digest is wrong the
day it does -- silently, the script simply never runs.

The floating tag was chosen because the realistic failure of the pinned one is
that it rots: a free tool with no update channel, pasted once into a layout
file, still serving a version nobody has looked at in two years while a fix
sits on npm. What it gives up is real and is written on install.html rather
than glossed over: a compromised npm account or CDN would run whatever it
served on every page carrying the tag, and this client reads the notes in the
clear in the browser.

The locked form is documented at install.html#locked with its digest, and the
READMEs still carry it. Both are supported; neither is hidden.

THE ARGUMENT THAT WAS MISSING WHEN THIS WAS DECIDED, raised by the owner the
same day and written here because it points the other way.

The salt does not only travel; it LIVES in the reviewer's browser, in the
localStorage of the annotated origin, for as long as the project exists. The
client is third-party JavaScript running on that origin. So a compromised
release does not read one note in flight -- it reads the salt, and with it
every note of that project, past and future, on every site carrying the tag.
FORMAT.md already says an XSS on an annotated page compromises the project
"full stop"; a compromised client IS that XSS, delivered by us.

That makes the integrity attribute the one control standing between the supply
chain and the only secret in the system, which is not the same thing as a
protection against a stale bundle. Weigh accordingly the next time this is
looked at.

What would make the trade cheaper, and is not built: the client noticing a
newer version exists and telling the site owner once, in the tool's own
surface, so a pinned tag can stay pinned without going stale unnoticed.

SETTLED 2026-09-03 by the owner, and the deciding argument is not the one
this entry was weighing. It is not about what the trade costs US: we ship the
releases, so a pinned tag would cost us one line per release. It is about
everyone who pasted the tag ONCE into a layout file and will never come back
to edit a digest and a version number. A pinned tag means a fix reaches
nobody, which is the failure that actually happens to a free tool.

So the floating tag stays, the absence of `integrity` is now written as a
decision beside the tag on the landing page and on install.html#locked, and
what it gives up is stated there rather than glossed over.

What would remove the trade entirely, and is the real answer: the browser
extension already described above. The salt would live in the extension rather
than in the page's localStorage, out of reach of anything running on the site
under review -- including an XSS, including a bad release of the client.

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

---

## The floating pill covers text, on every site

Found by three readers judging screenshots, unanimously, and it is a defect of
the PRODUCT and not of our page: at 390px the "Annotate this page" pill sits over
whatever is at the bottom right of the viewport. On annotepage.com it landed on
the last line of the lost-salt warning -- the one sentence in the whole page
about permanent, unrecoverable loss -- and on the primary button.

It does that on every site that installs the tool, and the site owner cannot see
it happening: the pill is in a shadow root, it is positioned against the
viewport, and nothing in the page's own CSS reaches it.

The page-side patch is reserved padding, which we added, and which every site
would have to discover and add for itself. That is not a fix, it is a workaround
we happen to know about.

Worth doing properly, cheapest first:

- **let it be moved.** A `data-corner` attribute -- bottom-right by default,
  bottom-left, top-right -- costs almost nothing and solves most cases;
- **let it be dismissed** for the session, and remember it. A reviewer who has
  finished reading should be able to put it away;
- **have it step aside.** Fade or shrink while the pointer is near it, so text
  underneath can be read without moving anything.

Until then, INSTALL.md should say the corner is occupied, so a site owner puts
nothing important there.
