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
