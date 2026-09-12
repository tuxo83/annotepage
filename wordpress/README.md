# annotepage for WordPress

> ### The documentation is [annotepage.com](https://annotepage.com)
> [How you use it](https://annotepage.com/how-to-use-it.html) &nbsp;·&nbsp; [Every way to install it](https://annotepage.com/how-to-install-it.html) &nbsp;·&nbsp; [Questions people ask](https://annotepage.com/questions.html)
>
> **This file is for whoever reads this plugin's code. Its own page is `readme.txt`; what annotepage is, and every other way to install it, is on the site.**

Writes the annotepage tag at the foot of your pages. One settings screen, the
key drawn in your browser, nothing else.

annotepage is a script tag, so it already works anywhere you can paste one.
This plugin is for sites where pasting into the template is the awkward part.
It does not add a capability; it removes a chore.

## Installing it

It is not in the WordPress plugin directory yet. Download this repository, zip
the `wordpress/` directory, and upload the zip under **Plugins > Add New >
Upload Plugin**. Activation is the last step: it draws a key, points at the
shared relay and writes the tag for administrators. **Settings > annotepage** is
for widening the audience, pointing elsewhere, or sharing a key with another
environment.

## It works on activation, and that decides the rest

An install that does nothing until somebody answers "what is your api.php
address" is an install that does nothing: that question has no answer a
first-time user can give. So activation answers it — the shared relay — draws a
key with `random_bytes`, and shows the tool to administrators only.

The narrow audience is what makes the rest safe. In public mode the key is in
the page and the key is write access, so the audience is the list of people who
may write notes. Widening it is one radio button, with the cost written beside
it.

The key may be **drawn, pasted or dropped**, because those are the same
decision: which project these notes belong to. Pasted into dev, staging and
production, one key gives the three sites one set of notes — the page index is
`HMAC(index key, path)` and carries no domain. Dropped, the page carries only
the project id and each reviewer is asked for the key once.

`readme.txt` is the plugin's own page -- what it does, the two modes, the
questions people ask. Read that one if you are installing it; this file is for
whoever is reading the code.

## What it is not

No dashboard of notes, no role, no widget, no shortcode, no block. The notes
live in the panel on the site, beside the element they are about. Read them
there, or through the MCP, from your assistant.

## The three decisions, and where they are argued

In the header of `annotepage.php`, beside the code that carries them, and in
`readme.txt`, which is the plugin's own page. Not a third time here:

- **it ships no client code** -- the tag points at the CDN on a floating major
  range, and the cost of that is stated rather than hidden: no `integrity`
  digest;
- **`wp_footer`, never `wp_enqueue_script`** -- the client reads
  `document.currentScript`, and a script queue is entitled to load a script in
  ways that leave it null;
- **no `uninstall.php`** -- the stored option holds a key, and a key has no
  recovery.

## The answers

| Field | Why it exists |
|---|---|
| Who sees it | Not an attribute: it decides whether the tag is written for this visitor at all. First on the screen because it is the only answer that can hurt |
| Server address | The CDN-served client cannot deduce where `api.php` is, and neither can WordPress. Filled in at activation |
| Mode | The key in the page, or only the project id. It **is** the choice between `data-key` and `data-project` |
| Key | Drawn here, pasted from another environment, or left empty. The same key is the same notes |
| Version | Optional. It is what lets a resolved note say "fixed and online" rather than "fixed, not deployed yet" |

## It is tested, against a stubbed WordPress

`wordpress/tests/run.php` loads the plugin over two dozen stubs and runs it:
who the tag is written for across every audience, that activation never draws a
second key over the first, that a key posted in secure mode is not stored, that
a subscriber with a valid nonce still cannot save. `tools/check-wordpress.mjs`
runs that, compares the id its PHP derives against the MCP's, and reads
`annotepage.php` and `readme.txt` as one document — a header saying 1.2.0 over a
`Stable tag: 1.1.0` is how a wordpress.org release ships the wrong code in
silence.

The six attributes that get no field -- `data-setup`, `data-mode`, `data-path`,
`data-domains`, `data-labels`, `data-environment` -- are argued one by one in
`annotepage.php`, above the settings screen. A setting nobody will touch is a
setting too many.

## The derivation is checked, not asserted

`tools/check-landing-derivation.mjs` extracts the derivation block from
`admin.js` and runs it against the MCP's implementation. Of the three
generators it guards, this is the one where a drift is hardest to see: there is
no tag on screen to compare by eye. A drift would hand out a project id the
client never computes, and nothing anywhere would raise an error.

## Requirements

PHP 7.4, WordPress 5.2, no dependency, and an `api.php` to point at -- the
shared relay or your own. Installing the server is one PHP file:
<https://annotepage.com/how-to-install-it.html>

MIT, like the rest of annotepage.
