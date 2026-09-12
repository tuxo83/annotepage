# What is coming, and what is ruled out

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is what is coming and what is ruled out. What the tool does TODAY is on the site.**

One line per subject. **What has shipped has left this file** — the site says
what the tool does today, and the code says how. A roadmap that also records
its own history stops being read.

Nothing here is a commitment, and nothing here decides in the maintainer's
place: the entries marked *undecided* are open questions with their objection
attached, which is the part worth keeping.

---

## Open

- **Screenshots on a note.** Undecided, and the objections are the point: a
  note weighs a few hundred bytes and a screenshot a thousand times more; it
  would have to be encrypted too, so no relay could ever build a thumbnail;
  and a capture of a staging page can hold real customer data where the remark
  almost never does. A capture of the element's DOM and computed styles weighs
  a thousandth as much, can be reread and compared, and may be enough.
- **Notifications.** Nobody is told a note has arrived. Closing that loop
  means an address, a sender, and a thing to unsubscribe from — none of which
  the tool has today.
- **An overview across pages.** The panel counts the whole site; nothing
  *lists* the open notes of every page in one screen.
- **Key rotation.** There is none. A leaked key means a fresh project and the
  notes already written abandoned. It is the sharpest edge in the tool, and no
  shape for it survives the fact that old notes are sealed under the old key.
- **A browser extension.** Worth doing and it is a second product, not a
  shortcut: it would annotate a site with nothing installed on it, and it
  would need its own store listing, its own permissions and its own update
  path.
- **The floating pill covers text.** At 390px the "Annotate this page" pill
  sits over whatever is at the bottom right of the viewport. On annotepage.com
  it landed on the last line of the lost-key warning, and the page reserves the
  corner for it — a patch on one page for a defect in the product, which should
  not cover text on anybody's site.
- **Plugins beyond WordPress.** WordPress ships. The others wait for somebody
  asking.
- **The server inside the WordPress plugin.** An avenue, not a plan, and low
  priority on purpose. Today the plugin writes a tag and the notes go to an
  `api.php` somewhere else; a plugin that carried the server too would be a
  one-click annotepage with nothing to install anywhere. What holds it back is
  not difficulty, it is that the plugin's whole value is working first time,
  simply, and being easy to hand to an assistant &mdash; and every structural
  question this opens is a question a site owner would have to answer. Where do
  the notes live: `wp_options`, a table of ours, a file? Whoever restores last
  week's database restores last week's notes, and the remarks written since are
  gone, silently, which is the one thing this tool promises never to do. The
  bounds the relay applies &mdash; rate limits, body caps, the domain lock
  &mdash; are a server's job, and inside WordPress they would be enforced after
  WordPress has already booted, on a surface with a decade of its own
  vulnerabilities. And a shared project across dev, staging and production stops
  working the moment the server is one of the three sites. None of that is
  fatal; all of it is a design, and the design is bigger than the plugin.
- **The installer in another language, French first.** The annotation layer is
  already translatable — every text is a label, English is the fallback, a
  partial translation is usable, and a complete French set of 150 labels ships
  in the package. The installer is not: it is English on both faces, and there
  is no way to ask it for anything else. Half the work is done without having
  been done for this: 79 of its texts are already DATA rather than prose in
  code — the label, the short line and the paragraph of each setting, the three
  questions and their answers, the sections, the MySQL fields — so translating
  those is a mapping and not a rewrite, and the same file would serve the form
  and `--help`. The other half is the prose of the screens themselves, about a
  hundred sentences that live in the code where they are printed. What it needs
  before it can start: where the choice comes from (`--lang=fr` on one face,
  `?lang=fr` on the other, and nothing guessed from a browser header, which
  would give somebody a language their colleague cannot read over their
  shoulder), and the same fallback rule as the client — a missing string is the
  English one, never an empty screen.

## Ruled out, with the reason

- **Wildcards in the origin list.** `origins` is a list and a project may
  declare as many as it likes; a pattern is refused because a pattern is read
  wrongly by whoever writes it, and the refusal is the only place it shows.
- **Accounts, logins, moderation.** None of the three, ever. A remark one can
  erase is a remark one can no longer contradict.
- **Deleting a note.** Resolved goes to the history and stays. Nobody can
  point at a remark and make it go. The one exception is age — every
  installation the installer creates keeps a thread ninety days after its last
  message — and a server where that is set says so in its diagnostic, in every
  export, and in the panel on the annotated pages, which also counts what has
  already gone that way.
- **Shipping `src/` in the client tarball.** Only `dist/`, `labels/` and the
  readme. The sources are on GitHub and the build is reproducible from there;
  shipping them tripled the tarball for nothing.

---

Free and MIT, with one shared relay anyone can use at no cost. That relay has
to stay extremely light: nobody is paying for it and nobody is going to
administer it.
