# Language and naming conventions

This file is **law**. Where any other file disagrees with it, this file wins.
Read it before writing a single line.

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

## 2. The glossary — one word, one translation

These are the terms this project actually uses. Translate them **only** this
way. A synonym that reads better in one file breaks the match in another.

### Domain

| French | English | Note |
|---|---|---|
| note | note | |
| reponse | reply | a reply IS a note carrying `reply_to` |
| projet | project | |
| sel | key | |
| enveloppe | envelope | the sealed encrypted unit |
| chiffre / clair | encrypted / plain | the two modes, and their literal values |
| index aveugle | blind index | |
| derivation | derivation | |
| verrou de domaine | domain lock | an anti-abuse measure, NOT an XSS defence |
| prefixe de chemin | path prefix | |
| relais | relay | the shared public server |
| auto-heberge | self-hosted | |
| repere / ancre | anchor | how a note finds its element again |
| empreinte (element) | fingerprint | tag, id, classes |
| empreinte (SRI) | digest | never "fingerprint" — two different things |
| extrait | excerpt | the visible text of the annotated element |
| libelles | labels | the interface strings |
| charge | payload | |
| etat | status | |
| corrigee / resolue | resolved | |

### Database columns and text-export keys

Both are contracts. Change one, and every reader breaks.

| French | English |
|---|---|
| `projet` | `project` |
| `index_page` | `page_index` |
| `reponse_a` | `reply_to` |
| `cree_le` | `created_at` |
| `resolue_le` | `resolved_at` |
| `resolue_par` | `resolved_by` |
| `resolue_version` | `resolved_version` |
| `selecteur` | `selector` |
| `empreinte` | `fingerprint` |
| `extrait` | `excerpt` |
| `auteur` | `author` |
| `texte` | `text` |
| `environnement` | `environment` |
| `fenetre` | `viewport` |
| `charge` | `payload` |
| `charge_resolution` | `resolution_payload` |

Export keys, in the closed list the longest-prefix rule reads from:
`note`, `page`, `page-index`, `element`, `excerpt`, `mode`, `reply`,
`to note`, `author`, `date`, `version`, `environment`, `viewport`, `status`,
`resolved`, `text`.

Header keys: `tool`, `format`, `version`, `project`, `encryption`, `retention`,
`export`, `notes`. Values: `encryption yes | no | mixed`, `mode encrypted`,
`status open | resolved`.

Check `to note` against the longest-prefix rule before shipping: `note` is not
a prefix of `to note`, so both resolve. That property is why the rule exists.

### Names the first pass had to invent

These were missing from the glossary while the conversion ran. All three
components already agree on every one of them -- what was incomplete was this
file, not the code. Recorded here so the next change has one place to look.

| French | English |
|---|---|
| actions `liste` `ajout` `resoudre` `texte` `diagnostic` `reprise` | `list` `add` `resolve` `text` `diagnostic` `backfill` |
| HTTP parameters `par` `resolue` | `by` `resolved` |
| export keys `charge` `charge_resolution` `saute` `saute_raison` | `payload` `resolution-payload` `skipped` `skipped-reason` |
| MCP config `sel` `identifiant` `lecture_seule` `projet_par_defaut` | `key` `id` `read_only` `default_project` |
| `marqueur` | `marker` -- distinct from `repere`/`ancre`, which is `anchor` |
| `annotepage/sel/<id>` `annotepage/auteur` | `annotepage/key/<project_id>` `annotepage/author` |
| `preprod` (example values) | `staging` |

One term splits, deliberately: `etat` is `status` on the wire, where it means
open or resolved, and `state` in `ApStore::state()`, which is the diagnostic.
Two different things that shared a French word.

The four export keys above are emitted by both producers and accepted by the
reader, but were absent from the closed list in section 2. They are part of
it.

### Files and directories

| French | English |
|---|---|
| `source/` | `src/` |
| `outils/` | `tools/` |
| `racine-web/` | `webroot/` |
| `interne/` | `internal/` |
| `LISEZMOI.md` | `README.md` |
| `INSTALLER.md` | `INSTALL.md` |
| `construire.mjs` | `build.mjs` |
| `verifier.mjs` | `check.mjs` |
| `EMPREINTES.txt` | `HASHES.txt` |
| `00-preambule.js` | `00-preamble.js` |
| `10-outils.js` | `10-utils.js` |
| `15-libelles.js` | `15-labels.js` |
| `20-chiffrement.js` | `20-crypto.js` |
| `30-etat.js` | `30-state.js` |
| `50-reperes.js` | `50-anchors.js` |
| `60-interface.js` | `60-ui.js` |
| `70-installation.js` | `70-setup.js` |
| `90-demarrage.js` | `90-boot.js` |
| `depot.php` | `store.php` |
| `entrees.php` | `input.php` |
| `origines.php` | `origins.php` |
| `debit.php` | `rate-limit.php` |
| `erreurs.php` | `errors.php` |
| `sortie-texte.php` | `text-export.php` |
| `configuration.php` | `config.php` |
| `test-bout-en-bout/` | `test-end-to-end/` |

## 3. The one consequence, stated plainly

FORMAT.md claimed a property: a database written by the original in-context
tool ("format 1") is already a valid format-2 database in plain mode, so there
is **nothing to migrate**. English column names contradict that claim. Both
cannot be true.

The resolution: `store.php` already adds missing columns lazily, on first
call. It now also **renames** the format-1 French columns when it finds them.
One `ALTER TABLE`, once, automatically. No export, no reimport, no manual
step — the promise survives, and the product stays in one language.

Format-1 *exports* are a different matter: their French keys will no longer
parse. That is accepted. Exports are regenerated on demand and nobody archives
them.

## 4. Writing English here

Short sentences. Say why, not what. No marketing register, no superlatives, no
"simply" or "just" — if it were simple the comment would not be needed. Where
the French said something sharp, keep the sharpness; do not smooth it into
corporate English. A comment that explains a trap is worth ten that restate
the code.

## 5. Nothing that identifies anyone

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
be published.
