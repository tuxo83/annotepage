# The annotepage.com site — direction

Decided by the client; it overrides any other instruction concerning the site.

## Absolute priority: USE

The visitor must understand **how to use it** before anything else. Not the
architecture, not the philosophy, not the security model: the use.

Imposed order of the page:

1. **What it does**, in one sentence and one image or one short animation.
2. **How you install it** — the snippet to paste, visible without scrolling
   far. One single tag, copyable in one click.
3. **How you annotate** — three gestures, shown, not described.
4. **How an AI uses it** — that is the project's differentiator. One command
   that can be copied, and what it returns.
5. The rest afterwards: where the data lives, encryption, licence, limits.

## Tone and form

- **Modern and simple.** Restrained, airy, no showing off. No superlatives, no
  fake testimonials, no invented screenshots.
- **Show rather than tell.** A block of code you can copy is worth three
  paragraphs.
- Hand-written HTML and CSS, no dependency, no remote font, no third-party
  script. The site must load instantly.
- Light and dark theme, and it must pass the contrast requirements it preaches
  itself — measured, not assumed.
- Really responsive, not merely "it does not overflow".

## What has to be said plainly

No authentication, no moderation, no deletion at all, no notification. These
are choices. Stating them inspires more confidence than hiding them, and it
avoids nasty surprises.

## Free, open source, and not a product

The priority is a COMMUNITY. Everything is free, everything is MIT, and there
will be one shared server anyone can use at no cost. It may become a product one
day; it is not one now, and the site must not read as if it were.

**Nothing may read as something being sold.** No price, no plan, no tier, no
trial, no "get started free" implying a paid tier waiting behind it. No
comparison table against paid tools. No call to action written like a sales page.

**This reaches the EXAMPLES, and that is where it went wrong once.** A demo note
about "Team, $9 per user per month, Save 20%" was meant as a generic third-party
site under review. On the landing page of a free MIT project it read as our own
price list, immediately. A sample that CAN be misread WILL be misread: choose
review remarks carrying no money and no commerce at all -- a heading that wraps,
an empty alt text, a link that 404s.

Say the words. "Free" and "open source" belong in the opening, in few words, not
left to a licence badge to imply.

## The replay: slow enough to read, simple enough to trust

Two decisions by the owner, both against the instinct of whoever builds it.

**GIVE IT TIME.** The end of a cycle currently passes so fast that nobody
realises it is restarting, and there is no time to read the right-hand picture
at all. Hold the finished state for SEVERAL SECONDS before the reset -- long
enough to read the resolved thread on the right, which is the payoff of the
whole figure and is currently wasted. Then reset visibly, hold that too, and
only then start again. A figure that has to be watched twice to be understood
has failed once already.

**SIMPLIFY, EVEN PAST REALISM.** Cut content, or lighten it considerably, even
if the result is a little caricatural next to what an assistant really prints.
The goal is not a faithful recording; it is that a stranger understands in
fifteen seconds that this is simple. Density that impresses a developer costs
more than it buys.

**But lightening is CHOOSING, never REWRITING.** The rule that every line is
verbatim from a capture does not bend -- it has caught three fabrications
already. Lighten by showing fewer lines, by collapsing output the way the real
interface collapses it, and by preferring the shortest real line over the
longest. Never by editing what a line said. If no captured line is short enough,
capture a session where the assistant was asked to be brief; do not trim one
into shape.

The distinction matters because it is the whole credibility of the page: the
figure may show LESS than happened, never OTHER than what happened.

**ONE LINE HAS BEEN REPLACED, AND HERE IS WHICH.** The capture ended its
deployment beat with `gh api .../actions/jobs/.../logs` returning `Reported
success!`. It proved the fix had shipped, and it proved it in one company's
command line -- on a page that refuses to name one assistant under a figure for
exactly that reason. Reviewed on the live site, the remark was: is there
something more universal? There is no neutral capture of that beat to reach
for, so the owner authorised rewriting it, once, in so many words.

It now reads `curl -s staging.example.com/guide | grep -o 'data-version="…"'`
returning `data-version="1.4.13"`. Two commands that run everywhere, and what
they read back is the attribute the last part of the page turns on: the old
line proved a job had gone green somewhere, this one proves the page the
reviewer is about to open says 1.4.13.

**The exception is written down so that it stays an exception.** A rule that
absorbs its own breaches in silence has stopped being a rule; the next line
that somebody wants to improve has to come back through here and be named the
same way, or the figure is no longer a capture.

## Naming another tool, and the line not to cross

The replay shows an assistant working. It is NOT captioned with the name of the
tool it was captured from, and that was decided after the caption had shipped.

**Why the name came off.** Two reasons, and the second is the one that decided
it. The terminal on that page is drawn in our own HTML -- it is not a screenshot
of anybody's interface, so nothing is being reproduced that needs attributing.
And this tool talks to an assistant over MCP: naming ONE of them under the
figure tells a reader that this is what it works with, which is narrower than
the truth and costs us the readers who use another. The caption informed nobody
and it fenced the product in.

The lines from that session stay verbatim, as the rule above requires. Where the
name is owed is in prose, as a fact -- this works with such-and-such -- not as a
label under a picture.

What is allowed, because it is simply true: saying the tool is an MCP server and
a command line, that it works with Claude Code, and showing a session that
really happened.

What is not:

- **no logo, no wordmark, no brand colour** belonging to anybody else. The
  terminal reproduces the STYLE of a terminal, which nobody owns;
- **nothing implying endorsement, partnership or affiliation.** Not in a
  sentence, not by placement, not by a badge that looks like a certification;
- **no suggestion that this is anybody else's product**, or that they have
  reviewed it, or that they know it exists;
- **no name, no logo under the figure.** A reader who lands on it mid-scroll
  sees a terminal, which is a shape nobody owns, and nothing claiming to be
  anybody's product.

None of that forbids showing the thing. A screen recording of a session would
raise the same questions and be published without hesitation; a replay built
from a session that really happened is the same object, more accurate and
lighter. What matters is that nothing in it claims more than it is.

The same holds for any other tool named later: name it factually as something
this works with, and stop there. A free project with one maintainer has nothing
to gain from borrowing somebody's credibility, and everything to lose.

## What the landing page taught, and the numbers to hold it to

Written on 2026-09-04, after a day of taking things off that page. Every rule
below is something that was WRONG there first and got fixed, so none of it is
taste. The figures are what the landing page measures today; a new page is
compared against them rather than against an opinion.

    titles          3 to 7 words
    sentences       36 to 99 characters, NOTHING over 110
    visible words   255 in the whole page
    left edges      TWO: the sentences at one, the blocks at the other

**A title says the gesture. The line under it says what the gesture buys.**
When a title starts listing what the next line says, it is not a title any
more -- one ran to twelve words doing that, and cutting it lost nothing.

**Two axes, and a third reads as an accident.** A chapter is sentences at the
wrap's left edge and blocks in the second column. Anything that starts
somewhere else -- a note crossing the gutter, a centred paragraph -- looks
placed by hand. The exit button is the one exception, and it is centred
deliberately, on the page's own axis, because it belongs to no column.

**Numbers are counted, never typed.** A step that can be hidden must renumber
the ones after it, or the page shows 01, 03.

**No option on a first screen.** A switch was built, worked, and came off: it
asked a reader to arbitrate between two things before they had seen a single
note. A switch is legitimate only where it shows the reader the case they are
ALREADY in -- which is why the usage page keeps two and the landing page has
none.

**Say the price where it costs.** What a choice gives up goes in the step that
makes it, not in a footnote. The open mode's line -- anyone who can open your
page can read these notes and add their own -- sits above the steps, where
somebody can still act on it.

**Consequence before mechanism.** "The key is in it" explains a mechanism to
somebody who does not yet know there is a key. What they need is what happens.

**Anything that repeats something else on the page goes.** The footer went
that way: eight links of which three were in the menu and five were one click
from GitHub. The rule found it, not an opinion -- count what each element says
that nothing else says, and delete what scores zero.

**A claim must stay true, and nothing checks that for you.** The footer said
the site made no outgoing request; it stopped being true the hour the real
tool went on the pages, and it took days to notice. When something on the page
becomes false, that is a defect of the same kind as a broken link.

**Lightening is CHOOSING, never REWRITING** -- the rule from the replay
section above applies to prose. A sentence of 145 characters carrying three
honest facts about a capture is SPLIT into three sentences, not summarised
into one that carries two.

### Applying it to a second page

The detailed usage page was measured against this the day it was written: 7
sentences over 110 characters against the landing page's 0, and 541 visible
words against 255. Six were shortened or split; the seventh is the assistant's
captured reply and stays as it is, because verbatim outranks the rule. Its
titles were already 4 to 5 words and its two axes were already clean.

Its word count stays higher, and should: it is the page somebody opens to see
the thing at length. The rule is not "be as short as the landing page", it is
"no sentence longer than the landing page allows".

**Then nothing was written under a figure at all**, and that is the rule now.
Three captions sat there. Each was read out loud against "what does this say
that nothing else says", and each answered nothing: one announced a continuity
the two pictures already show word for word, one disclosed what the replay cut
in five sentences where the reader needed one fact, one explained a version
number the picture carries on its own. A picture that needs a line under it to
be understood is the wrong picture; fix the picture.

What is allowed to remain under a figure is a CONTROL, not prose -- the button
that lets a reader who has asked for no motion play the thing once. It is
hidden for everyone else, and the strip carries no margin until it appears, so
an empty caption costs no space.

Measured after that pass, figures excluded, at 1440px: 232 words of prose on
the landing page, 208 on the usage page open / 235 secure, and not one sentence
over 110 characters in any of the four states of its two dials. The tooling is
`.outillage-test/ap4-prose.mjs` and `ap4-mesure.mjs`.

## The two detail pages, and the setup one in particular

**THE TWO DETAIL PAGES ARE NAMED AFTER THE CHAPTERS THEY UNFOLD**, word for
word: `how-you-use-it.html` and `how-you-install-it.html`. The landing page's
two chapters are called "How you use it" and "How you install it", and each of
these pages is the long form of one of them -- so the address says which,
without a word being invented for it. `example-session.html` and `install.html`
said neither that they were a pair nor whose long form they were.

Not `use.html` / `install.html`: the menu already reads `Use . Install` and
points at the landing page's anchors, so those two names are taken by something
else.

Both old addresses stay as redirects. What follows a rename: the internal links
in the three pages, `docs/sitemap.xml`, `tools/check-shell.mjs`, the anchors,
and the READMEs that point at the old ones.

**THE ORDER IS SERVER, PAGE, ASSISTANT, and the reason is blocking.** A
developer's own order is page first -- paste the tag, watch a note leave, plug
the assistant in -- and it was argued for. It loses to this: somebody who has
to stand up a server cannot do anything else until it is up. So the chapter
that may block comes first, and the dial is what makes it cost one line for
everybody else.

**TWO DIALS, AT THE TOP, AND THEY REMOVE ROUTES.**

    Your project        Open / Secure       the same words the usage page uses
    The notes server    Shared / Your own   not "public", which is taken

Choosing Shared collapses the whole server chapter to a sentence. That is the
dial earning its place: it takes a variant away, it never adds one.

**AND A FIELD BESIDE THEM: "Your site".** Not a dial -- it hides no route --
but the one answer that turns examples into the reader's own values: the
`data-server` when they host it themselves, the `origins` of the relay, the
`origin` of the assistant's configuration file, and the line they will type to
the assistant. Asked once, reused in all three chapters. Left empty, everything
falls back to `staging.example.com`, so the page reads exactly as it does now.

Two conditions, both checkable. The page SENDS NOTHING -- the landing page's
key generator is already local, and this must stay measurable the same way. And
the fallback is never a blank: a reader who types nothing must still see a
complete, copyable block.

**THE FRAMEWORK QUESTION IS NOT ONE OF THEM.** It only changes one block, in
one chapter, so it lives there -- tabs beside the tag, not a third dial at the
top of the page.

**WHAT MUST GO**, measured: 3060 words of prose against the landing page's 232,
45 sentences over 110 characters, 10 left edges against 2. The table of
contents (ten links -- the rule that killed the footer), the eyebrow, the "One
rule" chapter, the 226 words arguing for the short tag, the three cryptography
columns, and everything paraphrasing INSTALL.md or the client README.

Target: 250 to 400 visible words IN A GIVEN STATE. The dials do that work, not
the writing.

**WHAT CANNOT GO.** Key lost = notes lost, no recovery and no rotation. The key
gives reading AND writing. The mode cannot be changed afterwards. The classic
script tag rule and the one-line check -- the only thing on the page a reader
can measure. What the server still sees. No account, no moderation, no
deletion, no notification. A secure context is required. A declared
`localhost:3000` accepts writes from every machine on earth. A wrong digest
fails silently. A key given in a conversation has crossed a provider's logs.

**AND THE TAG HAS TO BE COPYABLE.** The current one reads
`data-project="<yours, from the landing page>"`: the one block on the page
whose whole job is to be copied cannot be, and it sends the reader back to
another page for a generator.

## The install page, when we get to it

**THE LOOP DIAGRAM OPENS IT.** It was built on the usage page and it works
there, but its real audience is not the reader discovering the tool -- it is
the one asking "does the assistant see my site?", and that question is asked
at the moment of installing, not at the moment of understanding. Four boxes,
four arrows, and neither diagonal carrying anything: the absence of an arrow
between the assistant and the page is what answers, without a sentence.

**AND NO SECOND BUTTON ON THE LANDING PAGE.** The question came up -- a
technical reader wants the flows, and "See every way to install it" does not
promise them. Two buttons side by side would break the rule that page was
validated under: one way out per chapter, no option on a first screen. If the
button does not promise enough, the LABEL changes; a word costs nothing, a
second control costs the discipline.



Not written yet, and deliberately: the landing page was validated first, then
the usage page, and this one comes after them. What follows is decided, not
open.

**THE FIRST QUESTION IS "DO YOU WANT AUTOMATIC UPDATES", AND THE TAG COMES
AFTER IT.** Today the page shows a tag and explains the locked variant beside
it. That is backwards. There are two tags because there are two answers to one
question nobody was asked:

- **yes** -- the tag carries no version and no digest. The client replaces
  itself when a newer one is announced, riding the `list` response it was
  making anyway. Nothing to come back and change, ever;
- **no** -- the tag pins a version and carries its `integrity` digest. A
  version range and a fixed digest cannot both hold, so this answer costs a
  visit on every upgrade, and the page says so where it costs.

Ask, then show ONE tag. Showing both, or showing the pinned one and explaining
the other underneath, makes an install look like a decision about
cryptography when it is a decision about who does the upgrading.

## What must not be done

No bullet-list "features" page. No comparison with the competitors. No
address-collecting form.


## Positioning — see ROADMAP.md

The site must show the CLOSED LOOP (the reviewer annotates, the AI fixes,
replies and archives), not the MCP on its own. And the COMBINATION open source
+ self-hostable + encrypted. Do NOT put forward "public server + self-hosting":
every neighbouring project already does it.
