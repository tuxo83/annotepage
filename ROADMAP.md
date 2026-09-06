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

- **The installer, self-contained, and the same options from a shell.**
  Required, whatever else the install review decides. `annotepage-install.php`
  runs today only in a browser: it reads `$_POST`, writes HTML, and asks three
  questions. It has to run from a command line too, with proper options and a
  `--help` that is readable on its own, and the two faces have to cover the
  SAME set of options -- neither able to configure something the other cannot.

  Measured before promising anything: `config.php` recognises **34 top-level
  keys**; the installer's form asks **nine fields** and writes **two keys**
  into the configuration, leaving everything else at its default. So parity is
  not "add a CLI beside the form": it is deciding what the installer is for.
  Every key is not a question -- eleven of the thirty-four are length caps
  nobody sets at install time -- and the design question the review has to
  settle is which keys are *questions*, which are *flags for whoever knows
  they want them*, and which are neither. Until that line is drawn, a CLI
  would be a second incomplete interface rather than one complete one.

  Also required, and cheaper: a CLI run must be non-interactive by
  construction (no prompt with a default nobody sees in a script), must say
  what it wrote and where, and must fail loudly on an unknown option rather
  than ignoring it.

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

## Ruled out, with the reason

- **Wildcards in the origin list.** `origins` is a list and a project may
  declare as many as it likes; a pattern is refused because a pattern is read
  wrongly by whoever writes it, and the refusal is the only place it shows.
- **Accounts, logins, moderation.** None of the three, ever. A remark one can
  erase is a remark one can no longer contradict.
- **Deleting a note.** Resolved goes to the history and stays. The one
  exception is age, on a relay configured for it, and such a server says so in
  its diagnostic and in every export.
- **Shipping `src/` in the client tarball.** Only `dist/`, `labels/` and the
  readme. The sources are on GitHub and the build is reproducible from there;
  shipping them tripled the tarball for nothing.

---

Free and MIT, with one shared relay anyone can use at no cost. That relay has
to stay extremely light: nobody is paying for it and nobody is going to
administer it.
