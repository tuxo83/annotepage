# annotepage for WordPress

Writes the annotepage tag at the foot of your pages. One settings screen, the
key drawn in your browser, nothing else.

annotepage is a script tag, so it already works anywhere you can paste one.
This plugin is for sites where pasting into the template is the awkward part.
It does not add a capability; it removes a chore.

## What it is not

No dashboard of notes, no role, no widget, no shortcode, no block. The notes
live in the panel on the site, beside the element they are about. Read them
there, or through the MCP, from your assistant.

## Why it ships no client code

The tag points at the CDN on a **floating major range**, `@2`. The client
releases; the sites get it; this plugin does not move. Bundling `annotepage.js`
would make this a release train for a file it did not write, and would put
every fix behind somebody remembering to press Update.

The cost is stated rather than hidden: no `integrity` digest. A pinned digest
is a fix that reaches nobody.

## Why `wp_footer` and not `wp_enqueue_script`

The client reads `document.currentScript` for its own attributes. A script
queue may load a script however it likes -- concatenated, inlined, deferred as
a module -- and every one of those leaves `currentScript` null. The client's
rule is then silence: no annotation layer, **no error**. So the tag is written
as text, late in `wp_footer`, where the queue has no invitation. `defer` stays
on it; `type="module"` is what would break it.

## The four answers

| Field | Why it exists |
|---|---|
| Server address | The CDN-served client cannot deduce where `api.php` is, and neither can WordPress |
| Mode | Public or secure. It **is** the choice between `data-key` and `data-project`, and it cannot be undone |
| Key | Drawn in the browser, by the same computation the tool and the install page run |
| Version | Optional. It is what lets a resolved note say "fixed and online" rather than "fixed, not deployed yet" |

The six attributes that get no field -- `data-setup`, `data-mode`, `data-path`,
`data-domains`, `data-labels`, `data-environment` -- are argued one by one in
`annotepage.php`, above the settings screen. A setting nobody will touch is a
setting too many.

## The key never transits

It is generated with WebCrypto, on the administrator's machine. In public mode
it is stored, because it is written into the page and is public by definition.
In secure mode it is shown once and **not sent to WordPress at all**: the input
is disabled before submit, and the save handler does not read it either.

`tools/check-landing-derivation.mjs` extracts the derivation block from
`admin.js` and runs it against the MCP's implementation. A drift there would
hand out a project id the client never computes, and nothing anywhere would
raise an error.

## Requirements

PHP 7.4, WordPress 5.2, no dependency, and an `api.php` to point at -- the
shared relay or your own. Installing the server is one PHP file:
<https://annotepage.com/how-to-install-it.html>

MIT, like the rest of annotepage.
