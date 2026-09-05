=== annotepage ===
Contributors: tuxo83
Tags: annotation, feedback, review, staging, encryption
Requires at least: 5.2
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Writes the annotepage tag at the foot of your pages. One screen, four answers,
and the key drawn in your own browser.

== Description ==

annotepage is an annotation layer for a site under review: a reviewer clicks an
element of a page, leaves a remark on it, and the remark is encrypted in the
browser before it goes anywhere. It is a single script tag, so it already works
on every platform that lets you paste one.

This plugin exists for the case where pasting is the hard part: a theme whose
footer you would rather not open, or a site where you are not the one with FTP.
It does one thing.

**It writes the tag. That is the whole plugin.**

There is no dashboard of notes here, no new user role, no widget, no shortcode,
no block. The notes live in the annotation panel on the site itself, where the
element being discussed is, which is the only place they mean anything.

= It ships no copy of the tool =

The tag it writes points at the CDN, on a floating major version. The tool
updates itself; this plugin does not have to publish a release every time it
does, and you do not have to press Update to get a fix. What that gives up is
the `integrity` attribute, deliberately: a pinned digest is a fix that reaches
nobody.

= The key is drawn in your browser =

The settings screen generates it with WebCrypto, on your machine, by the same
computation the tool itself runs. Nothing is sent anywhere to obtain it, and
there is no account to create. In secure mode it is never sent to WordPress at
all: you copy it once, and each reviewer pastes it once in their own browser.

= What you should know before choosing the mode =

The mode is settled by the tag and by nothing else, and it cannot be changed
afterwards. Changing it means a new key, therefore a new project, and the notes
already written stay behind.

* **Public** &mdash; the key is in the page. Nobody is asked for anything, and
  whoever can open the page can read the notes *and write them*. There is no
  reader-only role. Sound behind a login, a VPN or an IP allowlist; not sound
  on a public page.
* **Secure** &mdash; only the project id is in the page. Each reviewer pastes
  the key once per browser. Lose that key and the notes are gone: no recovery,
  no rotation.

= Where the notes go =

To an `api.php` you name in the settings: the shared relay, or a copy you host
yourself (one PHP file, PHP 7.4 and `pdo_sqlite`). In both cases the notes are
end-to-end encrypted and the server cannot read one. It sees counts, times,
sizes, IP addresses and your domain &mdash; never your paths and never your
text.

== Installation ==

1. Install and activate the plugin.
2. Go to **Settings &rarr; annotepage**.
3. Paste the address of your `api.php`, choose the mode, press **Draw a key**,
   and save.

The tag appears at the end of `<body>` on every page from that moment. To check
it landed, open the console on your site and ask for
`document.querySelector('script[data-key]')` &mdash; or `[data-project]` in
secure mode.

== Frequently Asked Questions ==

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
The only address it ever writes is the one you typed and the CDN address for
the tool itself.

= Where are my notes? =

On the site, in the annotation panel, next to the element they are about. This
plugin does not copy them into WordPress and does not read them: it cannot,
they are encrypted with a key the server never receives.

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

1. The settings screen: the server address, the mode with what it costs said
   before the choice, and the button that draws a key.
2. The tag as it is written, shown on the same screen.

== Changelog ==

= 1.0.0 =
* First release. Writes the tag, generates the key in the browser, and nothing
  else.
