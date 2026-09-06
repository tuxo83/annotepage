# Language and naming conventions

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is for whoever writes code in this repository. Nothing here is needed in order to use annotepage.**

How this repository is written. FORMAT.md is the reference for what goes on the
wire; this file is the reference for the language it is written in. Where the
two touch — a column name, an export key — FORMAT.md is right, because whoever
reads the format has no reason to open this one. Both files claimed to win over
the other for a while, on the same ground.

## 1. Everything shipped is in English

annotepage is a public, open-source tool published on npm and on a public
domain. It is read by developers who do not share a language, and by AI
assistants whose whole job here is to read its output. Anything else is a
barrier.

In English, with no exception:

- source code: identifiers, function names, constants, file and directory
  names;
- comments — plain ASCII, no accented characters, explaining WHY and not WHAT;
- every document in the repository, the website, and both npm READMEs;
- commit messages;
- the wire protocol: database columns, HTTP parameters, text-export keys;
- the widget's default interface strings.

The widget's strings are overridable, so a French site can stay French without
patching the code. A French label file ships as an example, in `client/labels/`.

This was written down as broken, and it was: `hooks/` had a French file name
and refused in French. A rule the repository breaks in the very files that
enforce it is not a rule. Translated and renamed -- English messages
throughout, `annotepage.guard` for the config key, and the old key still read
so a clone configured before the rename does not start refusing every commit.

The one French file left is `client/labels/fr.json`, which IS the translation.
It is the exception this section exists to permit.

## 2. The words that are not interchangeable

Not a glossary — the code is the glossary, and the French-to-English tables
that stood here served a conversion that finished. What is left is the pairs
that have already been confused, where the confusion is silent:

- **fingerprint** is an element's tag, id and classes. **digest** is the SRI
  hash. Never "fingerprint" for the second: two different things.
- **status** is on the wire and means open or resolved. **state** is the
  store's own, which is what the diagnostic reports.
- **anchor** is how a note finds its element again. **marker** is the badge the
  reader clicks. Not the same object.
- **key** is the secret, everywhere. Not "salt", not "secret", not "password".
  That word was changed once already, across every component at once.
- **domain lock** is an anti-abuse measure, NOT an XSS defence. Saying it the
  other way promises something the tool does not do.
- **relay** is the shared public server, **self-hosted** is the other one.
  Almost every configuration key means something different between the two.

**The closed lists are not repeated here.** Database columns, HTTP parameters,
export keys and API actions live in FORMAT.md and in the code that reads them.
Copied into this file they went stale twice over: it still listed six actions
when the server answered eight, and an export key list without `title`,
`title-payload`, `skipped` or `skipped-reason` — all four shipped in both
producers and in the reader. A closed list has exactly one home.

## 3. Writing English here

Short sentences. Say why, not what. No marketing register, no superlatives, no
"simply" or "just" — if it were simple the comment would not be needed. Where
the French said something sharp, keep the sharpness; do not smooth it into
corporate English. A comment that explains a trap is worth ten that restate
the code.

## 4. Nothing that identifies anyone

This repository is generic. It names no client, no company, no employer, no
supplier, no production site, and no person's real name — not in the code, the
comments, the examples, the fixtures, the documentation, the website, the
published READMEs, the `.gitignore`, the git hooks, the commit messages, the
branch names, or the git author field.

Nor anything that identifies without naming: an absolute path from someone's
machine, a real email address, a fixed IP address, the URL of a staging site.

Use `example.com`, `/path/to/site`, `you@example.com`. The only real name
anywhere is the project's own: `annotepage`.

This is not tidiness. Once pushed, it is public forever — a later commit that
removes the word does not erase it, because the earlier commit still holds it
and the mirrors already have a copy. The only cheap moment to get this right
is before the first push.

A guard enforces it on every commit and every push. It lives outside the
repository, because a list of words that must not be published cannot itself
be published. `hooks/guard.sh` says where to declare
it.
