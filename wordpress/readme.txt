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
browser before it goes anywhere. This plugin is the WordPress way in: it writes
the tag and gives you one settings screen.

**The documentation is [annotepage.com](https://annotepage.com)**
[How you use it](https://annotepage.com/how-to-use-it.html) &middot; [Every way to install it](https://annotepage.com/how-to-install-it.html) &middot; [Questions people ask](https://annotepage.com/questions.html)

**This page is the plugin's own: what it adds to WordPress, and the questions
that only come up here. What annotepage is, and every other way to install it,
are on the site and are not repeated.**

**Activate it and it works.** There is nothing to fill in first: activation
draws a key, points at the shared relay &mdash; or at
[a copy you host yourself](https://annotepage.com/how-to-install-it.html)
&mdash; and shows the tool to administrators and nobody else. Open any page of
your site and the button is at the bottom right. The settings screen is for the
second day.

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

= The key, and your other environments =

The same key on two sites is one set of notes: paste the key of your staging
site into your development site and the two share every remark, because a page
is found by its path and not by its domain. Drawing a new key starts a new
project instead &mdash; nothing is deleted, and the screen says so twice before
it happens.

Whether that key travels in the page, or is asked of each reviewer once and kept
out of it (**secure** mode), is set on the same screen and laid out on the
[install page](https://annotepage.com/how-to-install-it.html#modes). In secure
mode, losing that key loses the notes: there is
[no recovery](https://annotepage.com/questions.html#no-recovery).

= It ships no copy of the tool =

The tag points at the CDN on a floating major version, so the tool updates
itself: no release of this plugin every time it moves, and no Update to press to
get a fix. The cost is the `integrity` attribute, given up deliberately &mdash;
a pinned digest is a fix that reaches nobody.

== External services ==

This plugin relies on two external services, and its own PHP contacts neither
of them: there is no HTTP call anywhere in it. Both are reached by the reader's
browser, and only because of the one script tag this plugin writes at the foot
of a page.

**cdn.jsdelivr.net**, operated by jsDelivr, serves the annotation tool itself.
The tag loads
`https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js`, so on
every page load that carries the tag, the browser sends jsDelivr what any
request for a file carries: the reader's IP address, their user agent, the
address of the file asked for, and &mdash; as for any cross-origin script
&mdash; your site in the `Referer` header, which current browsers reduce to the
scheme and host and not the page path. Nothing else goes there: no note, no
page path and no key, and the request is the same one every visitor to every
site using that file makes.
Terms of use: https://www.jsdelivr.com/terms
Privacy policy: https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net

**The notes server**, `https://api.annotepage.com/api.php` by default &mdash;
the shared relay filled in at activation, or whichever address you set on the
settings screen. It receives the notes: at the moment a reviewer writes one,
and at the moment the tool reads back the notes belonging to a page. They are
encrypted in the browser before they leave it, so that server sees counts,
times, sizes, IP addresses and your domain, and never your page paths and never
the text of a note &mdash; it cannot read one. Setting the address to a copy of
`api.php` you host yourself replaces this service with your own server.
What the shared relay sees: https://annotepage.com/questions.html#data

**When nothing is sent at all.** A fresh install writes the tag for
administrators only, so until you widen the audience on the settings screen, no
visitor to your site contacts either service: a page that carries no tag makes
no request to jsDelivr and none to the notes server. A consent manager or a
developer can also withdraw the tag for a single request through the
`annotepage_should_print` filter, without deactivating the plugin.

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
