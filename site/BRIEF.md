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

## Naming another tool, and the line not to cross

The replay shows an assistant working. It is captioned **"Example -- a Claude
Code session"**, and the name is written plainly, not hinted at. That framing is
deliberate and it is enough: it says what the picture is, exactly as a screen
recording would, and it claims nothing beyond that.

**Name the client. Do not be coy about it.** A vague "an assistant" would inform
the reader less while protecting nobody, and a figure whose subject is unnamed
invites the reader to guess. The honest version is the specific one.

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
- the figure carries a caption saying what it is -- an example session -- so a
  reader who lands on it mid-scroll cannot take it for something official.

None of that forbids showing the thing. A screen recording of a session would
raise the same questions and be published without hesitation; a replay built
from a session that really happened is the same object, more accurate and
lighter. What matters is the caption, not the restraint.

The same holds for any other tool named later: name it factually as something
this works with, and stop there. A free project with one maintainer has nothing
to gain from borrowing somebody's credibility, and everything to lose.

## What must not be done

No bullet-list "features" page. No comparison with the competitors. No
address-collecting form.


## Positioning — see ROADMAP.md

The site must show the CLOSED LOOP (the reviewer annotates, the AI fixes,
replies and archives), not the MCP on its own. And the COMBINATION open source
+ self-hostable + encrypted. Do NOT put forward "public server + self-hosting":
every neighbouring project already does it.
