=== annotepage ===
Contributors: tuxo83
Tags: annotation, feedback, review, staging, encryption
Requires at least: 5.2
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Annotate this site. It works the moment you activate it, for administrators only, until you say otherwise.

== Description ==

annotepage is an annotation layer for a site under review: a reviewer clicks an
element of a page, leaves a remark on it, and the remark is encrypted in the
browser before it goes anywhere.

**Activate it and it works.** There is nothing to fill in first: activation
draws a key, points at the shared relay, and shows the tool to administrators
and nobody else. Open any page of your site and the button is at the bottom
right. The settings screen is for the second day &mdash; who else sees it, where
the notes go, which key.

There is no dashboard of notes here, no new user role, no widget, no shortcode,
no block. The notes live in the annotation panel on the site itself, where the
element being discussed is, which is the only place they mean anything.

= Who sees it =

A fresh install shows it to administrators. One radio button widens that to
everybody signed in, to chosen roles and named people, or to everyone including
visitors &mdash; and the screen says what each one costs before you choose it.

Everybody it is shown to also gets an item in the toolbar, with a switch that
turns it off **for them alone**. Nobody else's view changes, and it is not a way
into the tool for somebody the audience leaves out.

= The key is the project =

The same key on two sites is one set of notes. Paste the key of your staging
site into your development site and the two share every remark, because a page
is found by its path and not by its domain &mdash; which is how dev, staging and
production end up reviewing the same list.

Draw a new key and you have a new project: the notes written under the old one
stay exactly where they are, nothing is deleted, and this site stops showing
them. That is said on the screen, twice, before it happens.

= Two modes =

* **The key is in the page.** Nobody is asked for anything. Whoever is shown the
  tool can read the notes *and write them*; there is no reader-only role. Sound
  behind a login, a VPN, an IP allowlist, or with the audience left where it
  starts.
* **Only the project id is in the page.** Each reviewer pastes the key once, in
  their own browser. WordPress does not store it and the server never receives
  it. Lose that key and the notes are gone: no recovery, no rotation.

= It ships no copy of the tool =

The tag it writes points at the CDN, on a floating major version. The tool
updates itself; this plugin does not have to publish a release every time it
does, and you do not have to press Update to get a fix. What that gives up is
the `integrity` attribute, deliberately: a pinned digest is a fix that reaches
nobody.

= Where the notes go =

To an `api.php`: the shared relay, filled in at activation, or a copy you host
yourself (one PHP file, PHP 7.4 and `pdo_sqlite`). In both cases the notes are
end-to-end encrypted and the server cannot read one. It sees counts, times,
sizes, IP addresses and your domain &mdash; never your paths and never your
text.

== External services ==

This plugin relies on two external services. Its own PHP contacts neither of
them: both are reached by the reader's browser, only on pages where the tag is
written, and only for the people the audience includes.

**cdn.jsdelivr.net**, which serves the annotation tool itself. The tag this
plugin writes loads
`https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js`, so on
every page load that carries the tag, the browser sends jsDelivr what any
request for a file carries: the reader's IP address, their user agent, and the
address of the file asked for. No note, no page path and no key is sent there.
Terms of use: https://www.jsdelivr.com/terms
Privacy policy: https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net

**The notes server** &mdash; `https://api.annotepage.com/api.php`, the shared
relay filled in at activation, or whichever address you set on the settings
screen. It receives every note a reviewer writes and every request that reads
notes back, at the moment they are written and read. The notes are encrypted in
the browser before they leave it, so the server sees counts, times, sizes, IP
addresses and your domain &mdash; never your paths and never your text. Setting
the address to a copy of `api.php` you host yourself replaces this service with
your own server.
What the shared relay sees: https://annotepage.com/questions.html#data

== Installation ==

1. Install and activate the plugin. That is the whole of it: the tag is on your
   pages from that moment, for administrators.
2. Open any page of your site. The button is at the bottom right.
3. **Settings &rarr; annotepage** when you want to widen the audience, point at
   your own server, or share a key with another environment.

To check the tag landed, open the console on your site and ask for
`document.querySelector('script[data-key]')` &mdash; or `[data-project]` in
secure mode.

== Frequently Asked Questions ==

= It activated itself and drew a key. Is that safe? =

The key it drew is written into your pages, so it is only ever shown to people
the audience includes &mdash; administrators, until you change it. Nothing was
sent anywhere to obtain it: it is 32 random bytes from your own server. The
notice on the plugins screen says all of this, with the way to change it.

= Why is the tag not enqueued like every other script? =

Because the tool reads `document.currentScript` to find its own settings, and a
script queue is entitled to load a script however it likes. A concatenation
plugin, a "combine JS" switch or an optimiser that defers it as a module all
leave `currentScript` empty &mdash; and the tool's answer to not knowing where
it is, is to do nothing at all, silently. You would get a page with no
annotation layer and no error to explain it. So the tag is written as text, on
`wp_footer`, where a queue cannot rewrite it.

= Does anything phone home? =

No. There is no HTTP call in this plugin's PHP, and none in its admin script.
The only address it ever writes is the one in the settings and the CDN address
for the tool itself.

= Can I use one set of notes across dev, staging and production? =

Yes, and it is the reason the key can be pasted: give the three sites the same
key and they share the notes of the same path. Give them different keys and they
share nothing.

= Where are my notes? =

On the site, in the annotation panel, next to the element they are about. This
plugin does not copy them into WordPress and does not read them: it cannot, they
are encrypted with a key the server never receives.

= Can I set the path prefix, the domain list, or plain mode? =

Not from here, and each omission is argued in the source. In short: the domain
lock that matters is the server's, the path prefix is tidiness on a site that
has one prefix, and plain mode turns off encryption and is refused by the
shared relay anyway.

= What happens if I delete the plugin? =

The tag stops being written, and the settings row stays in the database on
purpose. It holds your key, and a key has no recovery: deleting it on uninstall
would turn every note ever written into ciphertext nobody can open, from a
screen that only said "delete". Reinstalling picks up where you left off.

= Can I translate the panel? =

The interface strings belong to the tool and are overridable through a label
file belonging to your site. That is a file you upload, not a setting here.

== Screenshots ==

1. The settings screen: who sees it, where the notes go, and the key &mdash; with the tag this site now writes shown at the foot of it.
2. The plugins screen straight after activation: it drew a key, pointed at the shared relay, and says so.

== Changelog ==

= 1.0.0 =
* First release. Works on activation for administrators, with an audience
  setting, a per-person switch in the toolbar, and a key that can be drawn,
  pasted or dropped.
