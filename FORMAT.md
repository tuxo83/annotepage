# annotepage — exchange format and security model

Format version: **2**

This document is the reference. The client, the PHP server and the MCP package
implement what is written here, and nothing else. When a sentence of this
document and a line of code contradict each other, the code is wrong.

Format 1 is the format of the original tool ("in-context notes", 1.2.0): no
project, no salt, no encryption, the page in the clear. It is not abandoned —
it is the "plain mode" special case described below, and a database written by
format 1 is read as it stands (§2.2).

---

## 1. The salt, and everything derived from it

### 1.1 The salt

A **256-bit salt** is generated at install time, by `crypto.getRandomValues()`
over 32 bytes. There is no other acceptable source: not a timestamp, not a
project name, not a password chosen by a human. A guessable salt makes
everything else decorative.

It never leaves the browser. The server does not receive it at any point, in
any form, in any mode.

**Lost salt = lost notes.** There is no recovery, no security question, no
escrow third party: it is the only secret, and nobody else holds it. The
install screen must spell this out, in full, before offering to continue, and
not in a footnote.

Representation meant for a human who copies it by hand:
**base64url without padding of the 32 bytes**, that is exactly 43 characters
taken from `A-Z a-z 0-9 - _`. No spaces, no grouping, no decorative dashes:
everything that "helps reading" ends up copied wrong.

The salt is kept in the browser's `localStorage`, under the key
`annotepage/salt/<project_id>`. Naming it by project id is not cosmetic: two
projects reviewed from the same browser must not overwrite each other.

An unpleasant consequence, to be stated: `localStorage` is **per origin**. The
day staging becomes production, every reviewer has to paste the salt once more
on the new domain. The notes themselves do not move — and that is precisely
what rule 1.3 buys.

### 1.2 Checking a salt that was typed in

When a reviewer pastes a salt, the client derives the project id from it
(§1.3) and compares it with the one declared by the page. Equal: the salt is
the right one. Different: the message is "this salt is not the salt of this
project", shown **before** any network request and before any decryption.

So there is no checksum and no verification code to carry alongside the salt:
the project id plays that part, it is already public, and one mechanism less
is one mechanism less to implement wrong.

### 1.3 The three derivations

One single function, **HKDF-SHA-256** (RFC 5869), applied three times to the
same salt. That is what holds the promise "one single secret to manage".

```
IKM        = the 32 bytes of the salt            (the secret)
HKDF salt  = "annotepage/1"       in UTF-8       (fixed, public)
info       = "id" | "encrypted" | "index"  in UTF-8
L          = 32 bytes for each output
```

Implementation trap, named here because it costs dearly: HKDF's `salt`
parameter **is not our salt**. Our salt is the input keying material (IKM).
HKDF's `salt` is the fixed, public string `annotepage/1`, which separates this
tool from any other software one might one day trust with the same secret.
Swapping them produces a system that works, that encrypts, and whose notes
become unreadable on the first reimplementation.

In WebCrypto:

```js
// The master key is the salt itself, imported as HKDF key material.
const master = await crypto.subtle.importKey(
    'raw', saltBytes, 'HKDF', false, ['deriveBits', 'deriveKey']);

const params = (label) => ({
    name: 'HKDF', hash: 'SHA-256',
    salt: utf8('annotepage/1'),   // NOT the salt: see above
    info: utf8(label),
});

const idBytes    = await crypto.subtle.deriveBits(params('id'), master, 256);
const indexBytes = await crypto.subtle.deriveBits(params('index'), master, 256);
const cryptoKey  = await crypto.subtle.deriveKey(
    params('encrypted'), master,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
```

`cryptoKey` is generated **non-extractable**. That is hygiene, not a barrier:
the salt sleeps in `localStorage` right next to it, and whoever reads one
rebuilds the other in three lines. It is written here so that nobody takes the
`false` for a protection it is not.

**project_id** = base64url without padding of the **first 16 bytes** of
`idBytes`, that is 22 characters.

Why 16 and not 32: this value travels in a query string, in a tag attribute,
in a PHP configuration file and in an indexed column. 128 bits are unguessable
(it would take 2^64 projects to hope for a single collision) and 22 characters
can be copied by hand. 43 cannot.

**encryption_key** = `cryptoKey`, AES-256-GCM. Never leaves the browser, in
any form, derived forms included.

**index_key** = the 32 bytes of `indexBytes`, imported as an HMAC-SHA-256 key.
The specification says `page_index = HMAC(salt, path)`; we do not use the salt
directly, we use a subkey that has no other use. Same decision, tightened: one
key, one use, always.

### 1.4 What does NOT go into the derivation

**The domain is not in the key.** Not the domain, not the path prefix, not the
environment, not the site version.

The reason is operational, not theoretical: the day staging becomes
production, the domain changes. If it were in the derivation, every note would
become unreadable that day — that is, exactly the day one rereads the list of
what is left to fix.

The domain and an optional path prefix define the **scope** of the project:
which pages belong to it, which origins are allowed to consume it. That is
configuration (§6.2), never cryptography.

---

## 2. The schema of a note

A note and a reply are **the same thing**: a reply is a note that carries a
`reply_to`. One table, one thread depth. That is format 1's legacy, and there
is no reason to change it.

### 2.1 The plain columns, and why each one

These fields are readable by the server operator, in both modes. Each one is
there because the server cannot do its job without it.

| Column | Type | Why it stays plain |
|---|---|---|
| `id` | INT UNSIGNED, auto | One has to be able to designate a note to reply to it or mark it resolved. |
| `project` | VARCHAR(22) | The server groups by project. Without it, a relay mixes everyone together. |
| `page_index` | VARCHAR(22) | The server groups by page without knowing which page. See §4. |
| `reply_to` | INT UNSIGNED NULL | The shape of the thread. The server nests replies without reading a word. |
| `format` | INT | The format number of THIS row. See §5. |
| `mode` | VARCHAR(16) | `plain` or `encrypted`. See §3.4. |
| `created_at` | DATETIME (UTC) | Written by the server. It knows the arrival time anyway. |
| `resolved_at` | DATETIME NULL | Written by the server. Allows sorting open/resolved without decrypting. |

`mode` is VARCHAR(**16**), not VARCHAR(8): `encrypted` is nine characters and a
narrower column truncates it silently. A truncated mode is an unknown mode,
and an unknown mode means every row is skipped (§3.4). Nine fits in sixteen
with room to spare; do not tighten it back.

`created_at` and `resolved_at` are written by PHP in UTC, never by the SQL
engine's `NOW()`: PHP's timezone and the database's are not aligned by
default, and a note dated three hours in the future would cast doubt on
everything else.

### 2.2 The payload columns

| Column | `plain` mode | `encrypted` mode |
|---|---|---|
| `page` | the real path, `/en/contact.html` | `''` |
| `selector` | the CSS path | `''` |
| `fingerprint` | tag, id, classes | `''` |
| `excerpt` | the visible text of the element | `''` |
| `author` | the name that was typed | `''` |
| `text` | the remark | `''` |
| `version` | the version declared by the site | `''` |
| `environment` | the declared environment | `''` |
| `viewport` | `1280x800` | `''` |
| `resolved_by` | the name of the fixer | `''` |
| `resolved_version` | the version of the fix | `''` |
| `payload` | `''` | the envelope of the note (§3) |
| `resolution_payload` | `''` | the envelope of the resolution (§3.5) |

Plain mode fills **exactly** the columns of format 1 — under their English
names, which is where the old promise has to be restated honestly.

A format-1 database differs from a format-2 database in plain mode in two
ways, and only two:

- twelve columns carry French names: `reponse_a`, `cree_le`, `resolue_le`,
  `selecteur`, `empreinte`, `extrait`, `auteur`, `texte`, `environnement`,
  `fenetre`, `resolue_par`, `resolue_version`;
- six columns are missing: `project`, `page_index`, `format`, `mode`,
  `payload`, `resolution_payload`.

The lazy column catch-up already present in `store.php` covers both on the
first call: it **adds** the six missing columns and **renames** the twelve
French ones. One `ALTER TABLE`, once, automatically. No export, no reimport,
no manual step. `id`, `page` and `version` are spelled the same in both
languages and are left alone.

What does break, and is accepted: a format-1 **text export** no longer parses.
Its keys are French, the closed list of §5.1 is English, and a reader will not
recognise a single structure line — it will not misread them, it will not
recognise them. Exports are regenerated on demand from the database and nobody
archives one; the database is what carries the history, and the database
migrates itself.

### 2.3 Why the page and the author are encrypted too

The question deserves to be asked seriously, and the easy answer is the wrong
one.

If only `text` were encrypted, the server operator — that is, in relay mode,
somebody other than the client — would read:

- **the complete tree of the site under review**, page by page, through the
  `page` column;
- **who is working on it**, through the `author` column, with their names as
  they write them;
- **the visible text of every annotated element**, through `excerpt`: button
  labels, headings, form labels. That is to say a good part of the content of
  the page;
- **the technical stack and the schedule**, through `version` and
  `environment`.

A staging site is exactly what a company has not published yet. The list of
its URLs, of its labels and of its reviewers is a leak, even without a single
remark.

**Settled: in encrypted mode, everything that is typed or observed goes into
the envelope.** The server keeps in the clear only what it needs in order to
group, nest and date. The list in §2.1 is closed: adding a plain column is a
format change (§5), not a convenience.

### 2.4 What the server learns anyway

Encrypting the fields is not invisibility. An honest relay operator must be
able to read the following without feeling betrayed, and a client must know it
before choosing the relay:

- the **number of projects**, and for each one the number of notes;
- the **number of distinct pages** annotated in a project, through the number
  of distinct `page_index` values, and the number of notes per page. A page
  that collects forty remarks is visible;
- the **time of every write**, hence the rhythm of the review, the days worked,
  the date of the last note;
- the **shape of the threads**: how many replies, how fast;
- the **fix rate and fix delay**, through `resolved_at`;
- the **approximate length of every remark**, through the size of the
  envelope. It is not masked (see §7);
- the **IP address and user agent** of every reviewer, like any HTTP server;
- **in relay mode, the domain of the site under review**, through the `Origin`
  header — which the domain lock has to read precisely (§6.2). Let us write it
  plainly: the promise is not "the relay does not know which site you are
  reviewing". It is "the relay can read neither your paths, nor your names,
  nor your remarks".
- `id` is a counter that is **global to the server**. Between two notes of the
  same project, the gap in ids tells how many notes all the other projects
  have written. A thin leak, a real one, kept because fixing it would require
  per-project numbering and its share of races (§8).

---

## 3. The encryption envelope

### 3.1 Algorithm

**AES-256-GCM**, through WebCrypto, without exception and without fallback. No
algorithm choice, no negotiation, no "suite": a format that negotiates is a
format you can push down to its weakest option.

- key: `encryption_key` (§1.3), 256 bits;
- **nonce: 12 bytes, drawn by `crypto.getRandomValues()` at every
  encryption.** Never a counter, never derived from the content, never reused.
  A repeated nonce with the same key in GCM does not leak a note: it leaks the
  authentication key. Random drawing over 96 bits holds up to about 2^32
  encryptions per project — that is a few billion notes, which will not happen;
- **authentication tag: 128 bits**, WebCrypto's default value, which it
  already appends to the ciphertext. We do not separate it.

### 3.2 Additional authenticated data (AAD)

The AAD binds the envelope to its place. Without it, a malicious server can
move a note from one page to another, or from one project to another: the
decryption would succeed and the remark would appear under an element it never
aimed at.

```
AAD = UTF-8( format + "\n" + project + "\n" + page_index + "\n" + role )
```

`format` is the decimal number (`2`), `role` is `note` or `resolution`. The
four values are in base64url or in digits: none of them can contain a line
break, so the separation is unambiguous.

### 3.3 Serialised form

An ASCII string, in three fields separated by dots:

```
ap<format>.<base64url nonce>.<base64url ciphertext+tag>
```

That is, for format 2:

```
ap2.7Qb1kZ3xNvA9dLpE.qKf2...Zt8
```

- `ap2`: the prefix **is** the format number. There is no second counter for
  the envelope: two version numbers end up diverging, and one of the two
  becomes a lie;
- base64url **without padding**, so it can travel through a query string, an
  `application/x-www-form-urlencoded` body and a SQL column without escaping;
- the nonce is always 16 characters (12 bytes). A reader that counts anything
  else refuses the row instead of guessing.

The encrypted content is a **compact JSON object, in UTF-8**, with the field
names of §2.2:

```json
{"page":"/en/contact.html","selector":"main:nth-of-type(1) > h2:nth-of-type(3)",
 "fingerprint":"h2.section-title","excerpt":"Contact us","author":"Camille",
 "text":"The link still points at the old form.",
 "version":"1.4.12","environment":"staging","viewport":"1280x800"}
```

An empty field is **absent** from the object, it is not written as `""`. A
reader treats absence as the empty string — the same rule as in the text
export, and for the same reason: do not write a key in order to say there is
nothing.

**The whole note fits in ONE envelope**, not one envelope per field. One
nonce, one tag, and the lengths of the individual fields cannot be read
separately. The usual price of that choice — changing one field forces
re-encrypting everything — is not paid here: the text of a note is never
modified. That is already a rule of format 1.

### 3.4 How a note carries its mode

The `mode` column of each row is `plain` or `encrypted`. It is written at
insert time and never recomputed.

This is not a theoretical precaution: an installation may have run in the
clear for two weeks before encryption was switched on, or may have migrated
from self-hosted to a relay. **A half-plain, half-encrypted database must stay
entirely readable**, and the only way is for each row to say what it is
itself. A global flag in the configuration would describe today's
installation, not yesterday's row.

Reading rules:

- `mode = plain`: the columns of §2.2 are read as they stand, `payload` is
  ignored;
- `mode = encrypted`: `payload` is decrypted, the columns of §2.2 are ignored
  (they are empty; if they are not, they are still not read);
- `mode` absent or empty: the row comes from format 1, it counts as `plain`;
- `mode` unknown: the row is **skipped**, with a count displayed. Neither
  guessed, nor silently rendered empty.

The mode is decided **at install time** and applies to the notes written
afterwards. Encryption is **on by default**. It can only be switched off when
self-hosted, where it protects nothing: the notes are in the same database, on
the same machine, behind the same access restriction as the site under review.
In relay mode, switching it off is **impossible** — the server refuses a
`mode=plain` write with a 400 and says so.

### 3.5 The resolution envelope

Marking a note resolved writes `resolved_by` and `resolved_version`, which are
payload data: so they are encrypted too, in a **second envelope**,
`resolution_payload`, with role `resolution`.

```json
{"by":"Dominique","version":"1.4.13"}
```

It has its own nonce. It is written by another person, at another moment,
often from another machine: folding it into the note's envelope would force
re-encrypting a remark that nobody is allowed to rewrite.

Reopening a note (`resolved=0`) sets `resolved_at` to NULL and
`resolution_payload` to the empty string. The reply thread is not touched.
That is format 1's behaviour, word for word.

### 3.6 Limits

In plain mode, format 1's per-field limits are kept:
text 4000, author 80, page 300, selector 500, fingerprint 255, excerpt 300,
version 60, environment 20, viewport 20 — in **characters**, not in bytes.

In encrypted mode, the server sees only a string. The only limit it can apply
is **the length of the envelope: 24000 characters** for `payload`, 2000 for
`resolution_payload`. Going over returns 400 naming the limit, never a silent
truncation.

A consequence to write down, because it is unpleasant: **in encrypted mode,
the per-field limits become a client-side convention.** A modified client can
put 3000 characters in the `author` field, and the server will accept it: it
does not see an `author` field. That is the price of end-to-end encryption,
and it is paid gladly — the tool addresses a review team, not a hostile
audience.

---

## 4. The blind index

```
page_index = base64url_without_padding(
                 first_16_bytes( HMAC-SHA-256(index_key, UTF-8(path)) ) )
```

`path` is **exactly** what `location.pathname` produces: an absolute path
beginning with a single slash, with no scheme, no host, no query string, no
fragment. Format 1's shape rules apply before the computation (a single
leading slash, no `..` segment).

Two points that make the difference between two implementations that talk to
each other and two that do not:

- **no normalisation other than that one.** No lowercasing, no stripping of a
  trailing slash, no decoding of `%xx` sequences. `/Contact` and `/contact`
  are two pages; `/a/` and `/a` are two pages. It is what the browser gives,
  it is what we index;
- **the computation is the same in both modes.** In plain mode the `page`
  column additionally carries the readable path, but the grouping is always
  done by `page_index`. One code path, one way to group. Two would have
  diverged by the second fix.

Corollary of plain mode: losing the salt does not lose the notes there — they
are readable in the database — but it loses the **grouping by page**, which
cannot be recomputed. One can then still read everything, and find nothing
back in context.

### What the server can do without decrypting

- return the notes of a page: `WHERE project = ? AND page_index = ?`;
- nest replies under their parent, through `reply_to`;
- order by `id`, date, count;
- mark resolved and reopen, by setting `resolved_at`;
- refuse a reply to a reply (a single depth), and make a reply inherit its
  parent's `page_index`;
- serve the structural text export (§5.3).

### What it cannot do

- say which pages exist, or enumerate them other than by their indexes;
- search the text, sort by author, count one person's notes;
- apply a **path prefix**: it does not see the paths. Prefix scope is
  therefore checked **by the client**, before sending. It is a tidiness
  convenience, **not a security boundary** — whoever has the project id and
  the salt writes where they like.

---

## 5. The text export

### 5.1 The contract, unchanged

Format 1's grammar is a contract, it is taken over identically.

```
0 spaces   structure line of a note      note 4 / page / element / excerpt
2 spaces   structure line of a reply     reply 7 / to note 4
4 spaces   text of a note
6 spaces   text of a reply
```

One piece of information per line, in the form "key value". A missing line
means an empty value. An empty line separates two notes. Dates are ISO 8601
with an explicit offset. No decorative punctuation.

The gap of **four** spaces between structure and text stays deliberate: at
two, a remark beginning with the word "reply" would be indistinguishable from
the start of a reply.

The reading rule is stated here, because format 1 left it implicit and a key
such as `to note` contradicted it: **the key is not the first word, it is the
longest prefix of the line that appears in the closed list of keys**, and the
value is the rest. The list is read from the longest to the shortest.

Keys emitted: `note`, `page`, `page-index`, `element`, `excerpt`, `mode`,
`reply`, `to note`, `author`, `date`, `version`, `environment`, `viewport`,
`status`, `resolved`, `text`.

Two properties of that list, both of which the rule depends on, and both of
which have to be rechecked before adding a key:

- `note` is not a prefix of `to note`, so both resolve. That property is why
  the rule exists at all;
- `page` **is** a prefix of `page-index`. That is the one place where the list
  is not prefix-free. It resolves correctly, and only because the rule reads
  from the longest: `page-index 9dL...` matches `page-index`, never `page`
  with the value `-index 9dL...`. The reverse cannot happen, because the
  separator after a key is a space and `page-index` requires a `-` in that
  position. A reader that scans the list in declaration order and takes the
  first match reads `page-index` lines as `page` lines and silently loses the
  index. Longest first, or nothing.

The format defends itself, in both directions: everything a reader counts as
an end of line — `\r\n`, `\r`, U+0085, U+2028, U+2029 — is reduced to a plain
line feed, on writing **and** on reading back, and control characters other
than `\n` and `\t` are removed. Without that, one note manufactures, INSIDE
the export, a whole note that was never written. In encrypted mode this
cleanup happens **after** decryption, at the producer of the export: that is
the only place where the text exists.

### 5.2 The header

Format 1 wrote four lines. We add to them, we never change them:

```
tool annotepage
format 2
version 2.0.0
project 7Qb1kZ3xNvA9dLpEqKf2Zt
encryption yes
export 2026-08-31T09:14:22+00:00
notes 128
```

`encryption` is `yes`, `no` or `mixed`. `mixed` is the normal case of an
installation that changed its mind: it is said, it is not hidden.

### 5.3 Two producers, one grammar

This is the point of this chapter.

**In plain mode, the server produces the export**, as it does today, byte for
byte like format 1 (apart from the header lines).

**In encrypted mode, the server cannot**: it has neither the paths, nor the
names, nor the texts. It then produces a **structural export** — the same
grammar, with the only lines it knows:

```
note 4
page-index 9dLpEqKf2Zt8ArC1vX
mode encrypted
date 2026-08-30T14:02:11+00:00
status open
```

The keys it cannot fill are **absent**, which, by the contract, means exactly
"empty value". No `text` line is emitted: a `text` line followed by nothing
would announce an empty remark, which would be false. A reader that receives
this export therefore knows, unambiguously and with no special-case code, that
it is missing the salt.

**The complete export in encrypted mode is produced by `annotepage-mcp`**,
which has the salt: it reads `?action=text`, decrypts each envelope and emits
the grammar above, **filled in**, with the same indents and the same keys. A
tool that reads the export does not know — and does not have to know — which
of the two producers wrote it.

`mode encrypted` is emitted only for an encrypted note. A plain note has no
`mode` line, and neither does a format-1 note: the same absence, the same
meaning. Format-1 exports are therefore still valid as they stand, as a
*grammar* — their French keys are another matter, and §2.2 settles it.

### 5.4 What the export exposes

Filled in, it contains names and internal remarks. It has no business on an
open site — that was true in format 1, it still is. What changes: in encrypted
mode, the address `?action=text` returns nothing but the structure, and the
genuinely readable document exists only on the machine that holds the salt.

---

## 6. The six addresses

Relative to the mount prefix. Format 1's five, with the project id added,
plus `backfill`.

```
GET  <base>/api.php?action=list&project=<id>&index=<page_index>
POST <base>/api.php?action=add
POST <base>/api.php?action=resolve
GET  <base>/api.php?action=text&project=<id>
GET  <base>/api.php?action=diagnostic
POST <base>/api.php?action=backfill
```

`backfill` is the one no client calls. It fills `page_index` for rows written
before the blind index existed, and it is meant to be run by hand, once, after
an upgrade -- see INSTALL.md. It is a POST for the same reason the other two
are: it writes.

The two writes stay POST, never GET: an action that changes state must not be
triggered by a link somebody follows or a crawler explores. An unknown action
returns 400 and the list above, never an empty body.

### 6.1 Fields

**`list`** — `project`, `index`. The real path is **never** sent, in any mode:
sending the path in plain mode and the index in encrypted mode would make two
code paths, and the second would be the less tested one.

Response: `{"ok":true,"tool":"annotepage","format":2,"version":"...",
"project":"...","index":"...","notes":[...]}`. Each note carries its plain
columns (§2.1), its payload columns (§2.2) and its nested replies.

**`add`** — `application/x-www-form-urlencoded`. We do not move to JSON: an
urlencoded body is a "simple request" in the CORS sense and does not trigger a
preflight, which spares the relay a whole `OPTIONS` machinery.

| Field | Always | Plain mode | Encrypted mode |
|---|---|---|---|
| `project` | yes | | |
| `index` | new note | | |
| `mode` | yes | `plain` | `encrypted` |
| `reply_to` | reply | | |
| `payload` | | — | the envelope |
| `author`, `text` | | required | — |
| `page`, `selector`, `fingerprint`, `excerpt` | | new note | — |
| `version`, `environment`, `viewport` | | optional | — |

A reply **inherits** `page_index` and, in plain mode, the page, the selector,
the fingerprint and the excerpt of its parent. Asking the client for them
again would open the door to a reply attached somewhere other than the note it
comments on. A reply to a reply is refused with a 400.

**`resolve`** — `project`, `id`, `resolved` (0 reopens, default 1), plus
`resolution_payload` in encrypted mode, or `by` and `version` in plain mode.
The name is only required in order to mark something fixed: it is what signs
it. To reopen, we do not ask for the fixer's name in order to cancel the fix.

**`text`** — `project`. Returns the complete export in plain mode, the
structural one in encrypted mode (§5.3).

**`diagnostic`** — no parameter, and above all no `project`. It returns the
state of the server, never notes. It **never** displays a project id in full:
six characters are enough to confirm one is looking at the right one, and the
id is what gives access to the rows.

### 6.2 The domain lock

Every project declares, in the server configuration, the list of origins
allowed to consume it:

```
project 7Qb1kZ3xNvA9dLpEqKf2Zt
  origins  https://staging.example.com, https://www.example.com
  mode     encrypted
```

A project may declare several, and that is intended: a staging site and the
production it becomes are the same project, with the same notes. It is the
operational counterpart of the rule "the domain is not in the key".

Rule applied:

- `Origin` header present and absent from the list: **403**, in `text/plain`;
- `Origin` present and recognised: the response carries
  `Access-Control-Allow-Origin: <the verified origin>`, never `*`;
- `Origin` absent: when self-hosted, allowed (a same-origin request does not
  send one). On a relay, **every write is refused** — a browser always sends
  `Origin` on a cross-origin request.

**What this lock is, and what it is not.** It is an **anti-abuse** measure: it
stops another site from consuming a project id found in the source of a page,
writing noise into it and burning the relay's quota.

**It is not a protection against XSS**, and it must never be presented as one.
An XSS runs **inside** the target page, so with the legitimate origin: it goes
through the lock without effort, and it has access to `localStorage` anyway,
hence to the salt. An XSS on an annotated page compromises the notes of the
project, full stop.

### 6.3 What the project id gives

The project id is a **bearer token**: whoever has it can read the rows of the
project and write to it. There is no authentication, and that is accepted — it
was already the case in format 1.

- in **encrypted** mode, those rows are unusable without the salt. The token
  alone gives what §2.4 enumerates, nothing more;
- in **plain** mode, those rows are readable. That is exactly why plain mode
  is reserved for self-hosting, where the API sits behind the same access
  restriction as the site under review.

The two sentences above are the same argument, and it closes the loop: plain
mode is impossible on a relay because a relay has no access restriction to
offer.

### 6.4 Silence

Format 1's rule is kept word for word. `?action=list` on a tool that is
deployed but **not configured**, or on an unknown project, answers **200**
with `{"ok":false,"active":false}` and not 404: an HTTP error code is logged by
the browser itself, in the console of every page, and no code can prevent it.
The other actions, which a human calls by hand, keep their explained 404.

---

## 7. The format number and its rule of evolution

The format number is an **integer**, with no dot. It is **2**.

It appears in three places, and the three must agree: the `format` column of
every row, the `ap<n>` prefix of every envelope, the `format` line of the
export header.

It is **per row**, not per installation. A database may carry rows of format
1, 2 and 3: each is read according to its own. That is the same decision as
the per-note `mode`, for the same reason.

### What does NOT change the number

- adding a key to the text export;
- adding an optional field to the JSON object of the envelope;
- adding a plain column whose absence has no consequence;
- adding an action to the API, or an optional field to an action.

These changes are safe **because the reading rule is mandatory**: a reader
**silently ignores** any unknown export key, any unknown JSON field, any
unknown column. A reader that fails on what it does not know makes the first
addition impossible.

### What changes the number

- any change to the derivations: the algorithm, the lengths, the labels
  `id` / `encrypted` / `index`, the string `annotepage/1`;
- any change of algorithm or of envelope shape, the composition of the AAD
  included;
- any change to the construction of `page_index`;
- any change to the meaning of an existing export key, to the list of indents,
  or to the four-space rule;
- making a field required that was not.

### How a reader behaves in front of a format it does not know

Two behaviours, and the difference matters:

- **envelope with a higher number**: flat refusal. One does not guess at
  cryptography. The note is skipped and counted, the tool says "this note was
  written by a newer version of annotepage";
- **text export with a higher number**: read it anyway, ignoring unknown keys.
  The grammar of indents is stable by construction, and a half-read export is
  worth more than a refusal.

The derivation labels are **frozen** by the format number. Changing
`"encrypted"` to `"encryption"` makes every note already written unreadable.
If that ever had to happen, it would be format 3, with a reader for both.

---

## 8. What this specification does not settle

Nothing that follows prevents implementing format 2. These are open questions,
listed so that they do not close by accident.

1. **Padding the envelopes.** The length of the envelope gives the length of
   the remark, to within a few bytes. Padding to a multiple of 256 bytes would
   mask it, at the price of a length field in the clear and a cost in storage.
   Not specified: envelopes are not padded. If it is ever done, it is a JSON
   padding field, so no format number change.

2. **Salt rotation.** There is no mechanism. A leaked salt forces starting
   from a fresh project, abandoning the notes. Bulk re-encryption assumes
   somebody holds both the old and the new salt and rewrites every row — which
   contradicts the append-only model. To be settled before promising anything
   on this point.

3. **How the salt reaches the second reviewer.** Out of band, through a
   channel the tool does not provide. The URL fragment (`#salt=...`) is not
   sent to the server and would be convenient, but it lands in the browser
   history and in everything that logs URLs. Not settled.

4. **What an MCP server is allowed to do on its own.** It holds the salt, so
   everything. May it mark a note resolved without a human confirming? Write a
   note of its own accord? The format allows it; the policy is not written.

5. **Pagination of `?action=text`.** Format 1 returns everything, as a stream.
   A project with ten thousand notes returns a document nobody reads and no
   model swallows. No limits, no filter by status, no filter by date.

6. **Quota and retention in relay mode.** How many projects, how many notes
   per project, what becomes of a project untouched for a year. The domain
   lock limits abuse from another site, not from a hand-made client.

7. **Numbering the notes.** Global to the server today (§2.4). Per-project
   numbering would remove the leak and make the numbers more readable in the
   export, at the price of a counter to maintain without a race between two
   simultaneous writes.

8. **What happens when two projects declare the same origin.** Nothing forbids
   it, nothing describes it. A page carrying two tags, two ids and two salts
   is neither planned for nor refused.
