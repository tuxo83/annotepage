<?php
/**
 * Plugin Name:       annotepage
 * Plugin URI:        https://annotepage.com/how-to-install-it.html
 * Description:       Annotate this site. It works the moment you activate it, for administrators only, until you say otherwise.
 * Version:           1.0.0
 * Requires at least: 5.2
 * Requires PHP:      7.4
 * Author:            tuxo83
 * Author URI:        https://github.com/tuxo83
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       annotepage
 * Domain Path:       /languages
 *
 * ---------------------------------------------------------------------------
 * IT WORKS ON ACTIVATION, WITH NOTHING TYPED. That is the first decision and
 * every other one below serves it.
 *
 * Activation draws a key, points at the shared relay and shows the tool TO
 * ADMINISTRATORS ONLY. An administrator installs, activates, reloads the site
 * and annotates it. Nobody is asked a question they have no way to answer --
 * "what is your api.php address" is not a question a first-time user can
 * answer, and a plugin that does nothing until it is answered is a plugin that
 * does nothing.
 *
 * The settings screen is then for the second day: who else sees it, where the
 * notes go, which key.
 *
 * WHY ADMINISTRATORS AND NOT EVERYONE, on a plugin whose whole point is that it
 * works straight away. In public mode the key is in the page, and whoever can
 * read the page can read the notes AND write them. Defaulting to everyone would
 * put that key on a live site in one click, for a visitor who never asked. The
 * audience is a stored setting, it is on the first screen, and widening it is
 * one radio button -- with the consequence written beside it.
 *
 * THIS PLUGIN SHIPS NO CLIENT CODE, AND THAT IS THE DECISION THAT KEEPS IT
 * ALIVE.
 *
 * The obvious plugin bundles dist/annotepage.js and enqueues it. It is also
 * the plugin that has to be released every time the client is released --
 * forever, for a file it did not write, on a review queue it does not control.
 * A tool that fixes an anchoring bug on Tuesday would reach WordPress sites in
 * a fortnight, and only the ones that pressed Update.
 *
 * So the src below is the CDN address with a FLOATING MAJOR RANGE, @2, the
 * one jsDelivr re-resolves on its own. The client ships, the sites get it, and
 * this plugin does not move. What it writes is a tag; the day the tag stops
 * changing shape -- which is the whole point of a tag -- this file stops
 * needing releases. It is not a distribution channel for the client. It is a
 * text field for people whose theme has no footer.php they dare open.
 *
 * What that gives up is stated rather than hidden: no `integrity` digest, for
 * the reason written beside the tag on how-to-install-it.html#locked. A pinned
 * digest is a fix that reaches nobody.
 *
 * WHY wp_footer AND NOT wp_enqueue_script. This is deliberate and it is not
 * negotiable.
 *
 * The client reads `document.currentScript` to find its own attributes -- the
 * server address, the key, the version. That is how a CDN-served file learns
 * anything at all about the site under review. `wp_enqueue_script` hands the
 * tag to a queue, and a queue is entitled to decide HOW to load it: a
 * concatenation plugin merges it, an optimiser defers it as a module, a
 * "combine JS" switch inlines it. Every one of those leaves currentScript null
 * or the dataset empty, and the client's rule of silence then does exactly what
 * it promises: nothing happens, and NO ERROR IS RAISED. The site owner sees a
 * page with no annotation layer and no reason why.
 *
 * how-to-install-it.html says it in five words: "A module leaves it silent."
 *
 * A hand-written tag in wp_footer cannot be re-typed by a queue. Optimisers can
 * still touch it -- they parse HTML too -- but they no longer have an
 * invitation. `defer` stays on it: defer is a classic-script attribute and
 * leaves currentScript intact; `type="module"` is what does not.
 *
 * AND NOT wp_print_script_tag() EITHER -- MEASURED, NOT ASSUMED. That function
 * exists precisely to print a script tag with arbitrary attributes without the
 * queue, and it is the obvious answer to the plugin directory's scanner, which
 * flags the literal `<script` written below. It was built, run against
 * WordPress 7.1, and refused. The scanner's line does fall; three things found
 * by running it cost more than that line is worth:
 *
 *   - IT DOES NOT WRITE THIS TAG. wp_get_script_tag() now drives a
 *     WP_HTML_Tag_Processor, which emits a single line and returns the
 *     attributes in its own order -- `src` last rather than first, and no
 *     eight-space indentation. The tag on the page would stop being the tag
 *     how-to-install-it.html hands out, and annotepage_tag_markup() has two
 *     consumers: the footer prints it and the settings screen shows the same
 *     string back, escaped. They would still agree with each other and both
 *     disagree with the documentation.
 *   - IT REOPENS THE DOOR THIS SECTION EXISTS TO SHUT. It applies
 *     `wp_script_attributes`, so every other plugin on the site is invited to
 *     rewrite these attributes. One `type="module"` added there empties
 *     document.currentScript and the tool goes silent with no error -- the
 *     exact failure the paragraphs above refuse.
 *   - IT NEEDS WORDPRESS 5.7, where this plugin asks for 5.2. Until that floor
 *     is raised the scanner simply reports the incompatibility instead: the
 *     same two errors, one of them renamed. Raising a plugin's floor to quiet
 *     a scanner is paid for by the installs it drops.
 *
 * NOTHING HERE TALKS TO THE NETWORK. No wp_remote_get, no cURL, no update
 * check, no telemetry, no phone home. Grep the file: there is no HTTP call in
 * it. The key is drawn by this server at activation, or in the browser by
 * admin.js -- and in secure mode it never reaches PHP at all.
 *
 * THE STRINGS ARE WRAPPED, AND A FRENCH SET SHIPS IN languages/.
 *
 * CONVENTIONS.md section 1 puts everything this project publishes in English
 * and makes the strings somebody READS the one exception it permits. wp-admin
 * is exactly that: an administrator who runs WordPress in French reads this
 * screen in French, or reads half of it in English.
 *
 * TWO THINGS WERE MEASURED HERE rather than assumed, against WordPress 7.1 on
 * PHP 8.3, because both are commonly stated the wrong way round:
 *
 *   - WHAT ACTUALLY LOADS A .mo THAT SHIPS INSIDE THE PLUGIN, which is not the
 *     automatic loading everybody remembers. WordPress 4.6's is for the files
 *     translate.wordpress.org installs under wp-content/languages/, and it
 *     never looks in here. What looks in here is load_plugin_textdomain() --
 *     and on WordPress 7.1 core calls it FOR us, out of the Domain Path header,
 *     in _get_plugin_data_markup_translate(). Measured three ways, with the
 *     site in French: header and no call, the screen is French; call and no
 *     header, French; NEITHER, and it is English on the front end and in
 *     wp-admin both -- the path then falls back to the plugin's root, where no
 *     .mo is. So both stay. The header is what works on 7.1; the call is what
 *     does not depend on one version's admin helper having been loaded, and
 *     this plugin still declares `Requires at least: 5.2`, where that was not
 *     measured.
 *   - CALLING __() BEFORE `init` IS A NOTICE since WordPress 6.7 -- one that
 *     names this plugin in the site's debug log. Every string here is produced
 *     by a function hooked to wp_footer, admin_notices, admin_bar_menu,
 *     admin_menu or admin_post_*, all of which run after init, and the load
 *     below is on init itself. Measured with WP_DEBUG on -- front end, the
 *     plugins screen, the settings screen, the dashboard -- the log stayed
 *     empty, and the backtrace shows the translation being loaded just in time
 *     from inside admin_bar_menu, which is exactly where it should be.
 *
 * What a VISITOR reads is still not here. Those strings belong to the client
 * and translate through `data-labels`, a file belonging to the site.
 * ---------------------------------------------------------------------------
 */

/* Called directly rather than through WordPress: nothing below is meant to run
   that way, and a plugin file that answers an HTTP request on its own is the
   shape a decade of WordPress vulnerabilities had. */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * THE ADDRESS OF THE CLIENT. A floating major range, on purpose -- see the
 * header.
 *
 * It is a constant and not a setting. A field for it would be a field whose
 * only correct answer is this string, offered to somebody who cannot check
 * their own answer, and its wrong values fail silently: a 404 on a script tag
 * raises nothing a site owner ever sees. Whoever genuinely serves their own
 * copy of the client is editing files already.
 */
define( 'ANNOTEPAGE_CLIENT_SRC', 'https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js' );

/**
 * THE ADDRESS THE NOTES GO TO, when nobody has said otherwise.
 *
 * This one IS a setting, because the answer differs per site -- but it has a
 * default, and the default is the shared relay, because "it works on
 * activation" is impossible without one. A field whose correct value cannot be
 * guessed by the person filling it in must arrive already filled in.
 */
define( 'ANNOTEPAGE_DEFAULT_SERVER', 'https://api.annotepage.com/api.php' );

/* One option, one array.
 *
 * AND NO uninstall.php, WHICH IS A DECISION AND NOT AN OMISSION. Tidy plugins
 * delete their option on uninstall. This option holds a KEY, and a key has no
 * recovery and no rotation: deleting it turns every note ever written into
 * ciphertext nobody can open, in one click, from a screen that says "delete".
 * A stale row in wp_options costs nothing. Losing a project costs everything
 * the reviewers wrote. Whoever really wants it gone deletes the option. */
define( 'ANNOTEPAGE_OPTION', 'annotepage_settings' );

/* Set at activation, removed when the notice is dismissed. Its presence is the
   whole state of that notice. */
define( 'ANNOTEPAGE_GREETING', 'annotepage_greeting' );

define( 'ANNOTEPAGE_PAGE', 'annotepage' );

/* Also the cache-buster on admin.js: one string to move, not two. */
define( 'ANNOTEPAGE_VERSION', '1.0.0' );

/* The per-person off switch, in user meta. Absent means on. */
define( 'ANNOTEPAGE_USER_OFF', 'annotepage_off' );

/**
 * THE TRANSLATIONS. Measured, and argued in the header: without this call a
 * .mo sitting in this plugin's own languages/ directory is never found, on any
 * WordPress -- the automatic loading everybody remembers is for the files
 * translate.wordpress.org installs somewhere else entirely.
 *
 * ON `init`, AND THE DOMAIN IS A LITERAL. Later than plugins_loaded on purpose:
 * WordPress 6.7 turns a translation loaded before init into a notice in the
 * site's log, and nothing here produces a string earlier. The literal is for
 * the tooling -- wordpress.org's scanner and tools/check-wordpress.mjs both
 * read this file as text, and a constant would hide the domain from both.
 */
function annotepage_load_translations() {
	load_plugin_textdomain( 'annotepage', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
}
add_action( 'init', 'annotepage_load_translations' );

/**
 * The stored answers, with every key present and every value of its own type.
 *
 * @return array<string,mixed>
 */
function annotepage_settings() {
	$stored = get_option( ANNOTEPAGE_OPTION, array() );
	if ( ! is_array( $stored ) ) {
		$stored = array();
	}

	$out = array(
		'server'   => '',
		'mode'     => 'open',
		'key'      => '',
		'project'  => '',
		'version'  => '',
		'audience' => 'admins',
		'roles'    => array(),
		'people'   => array(),
	);
	foreach ( array( 'server', 'mode', 'key', 'project', 'version', 'audience' ) as $name ) {
		if ( isset( $stored[ $name ] ) && is_string( $stored[ $name ] ) ) {
			$out[ $name ] = $stored[ $name ];
		}
	}
	if ( isset( $stored['roles'] ) && is_array( $stored['roles'] ) ) {
		$out['roles'] = array_values( array_filter( array_map( 'strval', $stored['roles'] ) ) );
	}
	if ( isset( $stored['people'] ) && is_array( $stored['people'] ) ) {
		$out['people'] = array_values( array_filter( array_map( 'intval', $stored['people'] ) ) );
	}

	/* Read back through the same judges that let it in. An option row can be
	   written by something other than this form -- WP-CLI, a migration, a
	   restored database -- and the tag is what the whole site serves. */
	if ( 'secure' !== $out['mode'] ) {
		$out['mode'] = 'open';
	}
	if ( ! annotepage_is_audience( $out['audience'] ) ) {
		$out['audience'] = 'admins';
	}
	if ( ! annotepage_is_key( $out['key'] ) ) {
		$out['key'] = '';
	}
	if ( ! annotepage_is_project( $out['project'] ) ) {
		$out['project'] = '';
	}
	if ( ! annotepage_is_server( $out['server'] ) ) {
		$out['server'] = '';
	}

	return $out;
}

/* 43 base64url characters, and the client refuses anything else out loud.
   The shape is checked here so a truncated paste is refused where somebody is
   looking at a screen, not on a visitor's page where nobody is. */
function annotepage_is_key( $value ) {
	return is_string( $value ) && 1 === preg_match( '/^[A-Za-z0-9_-]{43}$/', $value );
}

/* 22 base64url characters -- the length 00-preamble.js tests for. */
function annotepage_is_project( $value ) {
	return is_string( $value ) && 1 === preg_match( '/^[A-Za-z0-9_-]{22}$/', $value );
}

function annotepage_is_audience( $value ) {
	return in_array( $value, array( 'admins', 'signed-in', 'chosen', 'everyone' ), true );
}

/* http/https only, and the address has to survive a round trip.
 *
 * Not tidiness: this string is written into an attribute the browser resolves,
 * so a `javascript:` in it would be a script the site runs on every page.
 * esc_url() would already drop it; refusing it at the door means the stored
 * value is never the dangerous one in the first place.
 *
 * AND A SCHEME PLUS A HOST IS NOT ENOUGH. parse_url() answers about any string
 * it can make some sense of. Given
 * `https://api.annotephttps://api.annotepage.com/api.php` -- a paste that
 * landed inside the address already in the field, which is one mis-aimed click
 * away -- it reports the host `api.annotephttps` and the path
 * `//api.annotepage.com/api.php`, and a check that stops at "is there a host"
 * says yes to it. The site then writes that address into every page it serves
 * and the notes go nowhere, with nothing said, which is this plugin's worst
 * failure shape.
 *
 * So the parts are put back together and compared with what arrived. Where
 * parse_url() had to guess, the two differ: the guess above cannot place the
 * second colon and drops it. Where the address is a real one they are
 * identical, character for character.
 *
 * THE HALF THAT MATTERS IS THE ACCEPTING HALF. A stricter rule -- a dot in the
 * host, a known suffix, a regexp somebody thought looked reasonable -- would
 * refuse real self-hosted installs on somebody's intranet, silently, and that
 * is far worse than the typo it would catch. `http://localhost`, an internal
 * host with no dot, a port, an IPv6 literal in brackets, credentials and a
 * percent-encoded path all round-trip exactly, and run.php names every one of
 * them so that the next hand here cannot narrow this by accident. */
function annotepage_is_server( $value ) {
	if ( ! is_string( $value ) || '' === $value ) {
		return false;
	}
	$parts = wp_parse_url( $value );
	if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
		return false;
	}
	$scheme = strtolower( (string) $parts['scheme'] );
	if ( 'http' !== $scheme && 'https' !== $scheme ) {
		return false;
	}

	$rebuilt = $parts['scheme'] . '://';
	if ( isset( $parts['user'] ) && '' !== $parts['user'] ) {
		$rebuilt .= $parts['user'];
		if ( isset( $parts['pass'] ) && '' !== $parts['pass'] ) {
			$rebuilt .= ':' . $parts['pass'];
		}
		$rebuilt .= '@';
	}
	$rebuilt .= $parts['host'];
	if ( isset( $parts['port'] ) ) {
		$rebuilt .= ':' . $parts['port'];
	}
	$rebuilt .= isset( $parts['path'] ) ? $parts['path'] : '';
	if ( isset( $parts['query'] ) ) {
		$rebuilt .= '?' . $parts['query'];
	}
	if ( isset( $parts['fragment'] ) ) {
		$rebuilt .= '#' . $parts['fragment'];
	}

	return $rebuilt === $value;
}

/* base64url with no padding, which is the alphabet every other component of
   annotepage reads and writes. */
function annotepage_b64url( $bytes ) {
	return rtrim( strtr( base64_encode( $bytes ), '+/', '-_' ), '=' );
}

/**
 * A KEY DRAWN BY THIS SERVER -- and only ever for public mode.
 *
 * admin.js draws it in the browser, and the reason that exists is secure mode:
 * there the key must never reach PHP, so PHP must not be the one who made it.
 * In PUBLIC mode that property does not exist to protect -- the key is written
 * into every page this site serves, which is what public mode IS. Drawing it
 * here is what lets activation produce a working install with nothing typed.
 *
 * random_bytes or nothing. There is no weaker fallback, because a key that
 * looks like a key and is guessable is worse than no key at all: it fails in
 * six months, silently, on somebody else's staging site.
 *
 * @return string 43 base64url characters, or '' when this PHP has no CSPRNG.
 */
function annotepage_draw_key() {
	try {
		return annotepage_b64url( random_bytes( 32 ) );
	} catch ( Exception $e ) {
		return '';
	} catch ( Error $e ) {
		return '';
	}
}

/**
 * The project id a key derives to. HKDF-SHA256, salt "annotepage/1", info
 * "id", first 16 bytes -- FORMAT.md, and the same computation admin.js and the
 * client run.
 *
 * PHP does not need this to write the tag in public mode. It needs it to SHOW
 * the id, so that the person sharing a key between dev, staging and production
 * can see that the three sites landed on the same project -- which is the only
 * visible sign that they did.
 *
 * @return string 22 base64url characters, or '' if the key is not one.
 */
function annotepage_project_from_key( $key ) {
	if ( ! annotepage_is_key( $key ) ) {
		return '';
	}
	$bytes = base64_decode( strtr( $key, '-_', '+/' ) . '=', true );
	if ( false === $bytes || 32 !== strlen( $bytes ) ) {
		return '';
	}
	if ( ! function_exists( 'hash_hkdf' ) ) {
		return '';
	}
	return annotepage_b64url( substr( hash_hkdf( 'sha256', $bytes, 32, 'id', 'annotepage/1' ), 0, 16 ) );
}

/**
 * The id in the tag, whichever mode wrote it.
 */
function annotepage_project_id( $settings = null ) {
	$s = ( null === $settings ) ? annotepage_settings() : $settings;
	if ( 'secure' === $s['mode'] ) {
		return $s['project'];
	}
	return annotepage_project_from_key( $s['key'] );
}

/* ---------------------------------------------------------------------------
 * ACTIVATION
 *
 * Fills in what is missing and touches nothing that is there. Re-activating
 * after an upgrade must not draw a second key over the first: a key is the
 * project, and a plugin that quietly replaced it would lose every note ever
 * written, on an operation nobody thinks of as destructive.
 * ------------------------------------------------------------------------- */

function annotepage_activate() {
	$stored = get_option( ANNOTEPAGE_OPTION, array() );
	if ( ! is_array( $stored ) ) {
		$stored = array();
	}

	$fresh = annotepage_settings();

	if ( '' === $fresh['server'] ) {
		$fresh['server'] = ANNOTEPAGE_DEFAULT_SERVER;
	}
	/* Only when there is NEITHER credential. A site coming back from secure
	   mode has a project and no key, and drawing one here would silently move
	   it to another project. */
	if ( '' === $fresh['key'] && '' === $fresh['project'] ) {
		$fresh['key']  = annotepage_draw_key();
		$fresh['mode'] = 'open';
	}

	/* AUTOLOADED, unlike the first version of this plugin. It is read on every
	   front-end page now -- the audience decides whether the tag goes out --
	   so not autoloading it buys one extra query per page view and saves a row
	   in a cache that already holds hundreds. */
	update_option( ANNOTEPAGE_OPTION, $fresh, true );

	/* The notice on the plugins screen lives until somebody dismisses it. An
	   option and not a transient: a message that expires on its own is a
	   message the person who was interrupted never sees. */
	update_option( ANNOTEPAGE_GREETING, '1', false );
}
register_activation_hook( __FILE__, 'annotepage_activate' );

/* ---------------------------------------------------------------------------
 * WHO SEES IT
 * ------------------------------------------------------------------------- */

/**
 * Does the configured audience include this person?
 *
 * Answers about a WP_User, never about "the current request", so that the
 * settings screen can ask the same question about somebody else and get the
 * same answer.
 *
 * @param WP_User|null $user
 * @return bool
 */
function annotepage_audience_allows( $user, $settings = null ) {
	$s = ( null === $settings ) ? annotepage_settings() : $settings;

	if ( 'everyone' === $s['audience'] ) {
		return true;
	}

	$exists = ( $user instanceof WP_User ) && $user->exists();
	if ( ! $exists ) {
		return false;
	}

	if ( 'signed-in' === $s['audience'] ) {
		return true;
	}
	if ( 'admins' === $s['audience'] ) {
		return user_can( $user, 'manage_options' );
	}

	/* chosen: these roles, plus these people. The two are added together and
	   not nested -- "the editors, and also Sam from marketing" is the sentence
	   this setting exists to write. */
	if ( in_array( (int) $user->ID, $s['people'], true ) ) {
		return true;
	}
	foreach ( $s['roles'] as $role ) {
		if ( in_array( $role, (array) $user->roles, true ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Has this person switched it off for themselves?
 *
 * Per person, in their own user meta, and it changes nothing for anybody else.
 * A logged-out visitor cannot have switched anything off: there is nowhere to
 * remember it.
 */
function annotepage_switched_off( $user ) {
	if ( ! ( $user instanceof WP_User ) || ! $user->exists() ) {
		return false;
	}
	return '1' === (string) get_user_meta( $user->ID, ANNOTEPAGE_USER_OFF, true );
}

/**
 * The whole front-end decision, in one place.
 */
function annotepage_should_print() {
	$user = wp_get_current_user();

	if ( '' === annotepage_tag_markup() ) {
		$decision = false;
	} elseif ( annotepage_switched_off( $user ) ) {
		$decision = false;
	} else {
		$decision = annotepage_audience_allows( $user );
	}

	/**
	 * THE ONE HOOK, AND IT EXISTS FOR CONSENT.
	 *
	 * The tag loads a third-party script, and in public mode it writes the key
	 * into the page. A site running a consent manager has to be able to
	 * withdraw it for a visitor who has not agreed -- for THIS request, before
	 * anything is written, without deactivating the plugin and without an
	 * administrator changing a setting that would change it for everybody.
	 * Nothing on the settings screen can express "only when this reader has
	 * agreed", because that answer is not a stored value: it is computed per
	 * request by code that is not ours.
	 *
	 * It is applied to the FINAL decision, never to an input of it, so that
	 * turning it off always works -- whatever the audience, the mode and the
	 * per-person switch have just concluded, this has the last word.
	 *
	 * It can also turn it ON for somebody the audience leaves out. That is
	 * deliberate and it is not a hole: a filter is the site's own PHP, written
	 * by whoever runs the site, and code that says so has taken that on
	 * explicitly. It is not reachable from a screen, a URL or a form, so it
	 * hands nothing to a visitor who merely asks.
	 *
	 * @param bool    $decision Whether the tag is about to be written.
	 * @param WP_User $user     Who it would be written for.
	 */
	return (bool) apply_filters( 'annotepage_should_print', $decision, $user );
}

/* ---------------------------------------------------------------------------
 * THE TAG
 * ------------------------------------------------------------------------- */

/**
 * One producer, two consumers: the footer echoes it, the settings screen shows
 * it escaped.
 *
 * It is written to be byte-identical to the block
 * docs/how-to-install-it.html hands out for the same answers -- same order,
 * same eight-space continuation indent, same `defer`. Two places that write
 * the same tag must write the SAME tag: a reader who pastes one and installs
 * the other must not be able to tell.
 *
 * @return string The markup, or '' when the answers are not complete.
 */
function annotepage_tag_markup() {
	$s = annotepage_settings();

	if ( '' === $s['server'] ) {
		return '';
	}

	/* NEVER BOTH. A tag carrying a key and an id is refused whole by the
	   client when they disagree, and it does not pick a winner -- so this
	   function must not be able to write two. The mode chooses one attribute;
	   there is no branch here that can emit the other as well. */
	if ( 'secure' === $s['mode'] ) {
		$attribute  = 'data-project';
		$credential = $s['project'];
	} else {
		$attribute  = 'data-key';
		$credential = $s['key'];
	}
	if ( '' === $credential ) {
		return '';
	}

	$lines   = array();
	$lines[] = '<script src="' . esc_url( ANNOTEPAGE_CLIENT_SRC ) . '"';
	$lines[] = '        data-server="' . esc_url( $s['server'] ) . '"';
	$lines[] = '        ' . $attribute . '="' . esc_attr( $credential ) . '"';

	/* Absent when empty, and that is the whole handling of it. An empty
	   data-version would declare "this site has no version", which is not the
	   same statement as not declaring one, and the client's own comment says
	   an invented version sends somebody hunting for a defect in a build that
	   never existed. */
	if ( '' !== $s['version'] ) {
		$lines[] = '        data-version="' . esc_attr( $s['version'] ) . '"';
	}

	/* defer, and nothing that would make it a module. See the file header. */
	$lines[] = '        defer></script>';

	return implode( "\n", $lines ) . "\n";
}

/**
 * The one thing this plugin does on the front end.
 *
 * Priority 100: late in wp_footer, so the tag sits near the end of <body> like
 * the documented one, and after whatever a theme prints at the default 10.
 *
 * PAGE CACHES. The tag now depends on who is looking, so a full-page cache that
 * serves one logged-out copy to everybody will serve the copy without it --
 * which is the harmless direction: no key goes out to somebody the audience
 * excluded. The other direction, audience "everyone", writes the same tag for
 * everybody and caches correctly.
 */
function annotepage_print_tag() {
	if ( ! annotepage_should_print() ) {
		return;
	}
	/* Every value inside was escaped by annotepage_tag_markup() and the frame
	   around them is a literal. There is nothing left to escape here, and
	   escaping the assembled markup would escape the tag itself. */
	echo annotepage_tag_markup(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}
add_action( 'wp_footer', 'annotepage_print_tag', 100 );

/* ---------------------------------------------------------------------------
 * WHAT IS TRUE RIGHT NOW, IN ONE SENTENCE
 *
 * Written once and read by the admin bar, the greeting and the settings
 * screen. Three screens that describe the same state in three wordings are
 * three chances to describe it wrongly.
 * ------------------------------------------------------------------------- */

function annotepage_audience_words( $settings = null ) {
	$s = ( null === $settings ) ? annotepage_settings() : $settings;
	switch ( $s['audience'] ) {
		case 'everyone':
			return __( 'everyone, visitors included', 'annotepage' );
		case 'signed-in':
			return __( 'everybody signed in to this site', 'annotepage' );
		case 'chosen':
			$bits = array();
			if ( ! empty( $s['roles'] ) ) {
				/* translators: %d is how many WordPress roles are chosen. */
				$bits[] = sprintf( _n( '%d role', '%d roles', count( $s['roles'] ), 'annotepage' ), count( $s['roles'] ) );
			}
			if ( ! empty( $s['people'] ) ) {
				/* translators: %d is how many people are named one by one. */
				$bits[] = sprintf( _n( '%d named person', '%d named people', count( $s['people'] ), 'annotepage' ), count( $s['people'] ) );
			}
			if ( empty( $bits ) ) {
				return __( 'nobody yet -- no role and no person chosen', 'annotepage' );
			}
			if ( 2 === count( $bits ) ) {
				/* translators: 1: a count of roles, 2: a count of named people. Joins them into one phrase. */
				return sprintf( __( '%1$s and %2$s', 'annotepage' ), $bits[0], $bits[1] );
			}
			return $bits[0];
	}
	return __( 'administrators', 'annotepage' );
}

function annotepage_state_line( $settings = null ) {
	$s = ( null === $settings ) ? annotepage_settings() : $settings;
	if ( '' === annotepage_tag_markup() ) {
		if ( '' === $s['server'] ) {
			return __( 'Nothing is written: there is no server address.', 'annotepage' );
		}
		return __( 'Nothing is written: this mode has no credential to put in the page.', 'annotepage' );
	}
	/* translators: %s is who the tag is written for, e.g. "administrators". */
	return sprintf( __( 'Written on every page, for %s.', 'annotepage' ), annotepage_audience_words( $s ) );
}

/* ---------------------------------------------------------------------------
 * THE ADMIN BAR
 *
 * The black bar is where somebody who has just activated the plugin looks, and
 * it is the only place the per-person switch can live: the switch is about the
 * page being looked at, so it belongs on that page and not two clicks into
 * wp-admin.
 *
 * SWITCHING OFF IS PERSONAL AND SWITCHING ON IS NOT A BACK DOOR. The item
 * appears for whoever the audience already includes; it cannot hand the tool
 * to somebody the configuration leaves out. An administrator who wants that
 * changes the audience, on a screen that says what it costs.
 * ------------------------------------------------------------------------- */

function annotepage_admin_bar( $bar ) {
	if ( ! is_admin_bar_showing() ) {
		return;
	}
	$user  = wp_get_current_user();
	$admin = current_user_can( 'manage_options' );
	$s     = annotepage_settings();

	/* An administrator always sees the item, even when the audience leaves
	   them out: they are the person who has to notice that it does. */
	if ( ! $admin && ! annotepage_audience_allows( $user, $s ) ) {
		return;
	}

	$off     = annotepage_switched_off( $user );
	$written = ( '' !== annotepage_tag_markup() );
	$here    = $written && ! $off && annotepage_audience_allows( $user, $s );

	$bar->add_node( array(
		'id'    => 'annotepage',
		/* translators: %s is the plugin's own name, which is a name and is not translated. */
		'title' => $here ? 'annotepage' : sprintf( __( '%s (off)', 'annotepage' ), 'annotepage' ),
		'href'  => $admin ? admin_url( 'options-general.php?page=' . ANNOTEPAGE_PAGE ) : false,
		'meta'  => array( 'title' => annotepage_state_line( $s ) ),
	) );

	$bar->add_node( array(
		'id'     => 'annotepage-state',
		'parent' => 'annotepage',
		'title'  => annotepage_state_line( $s ),
		'meta'   => array( 'class' => 'annotepage-state' ),
	) );

	if ( $user->exists() ) {
		$bar->add_node( array(
			'id'     => 'annotepage-switch',
			'parent' => 'annotepage',
			'title'  => $off ? __( 'Turn it back on for me', 'annotepage' ) : __( 'Turn it off for me', 'annotepage' ),
			'href'   => wp_nonce_url(
				add_query_arg(
					array(
						'action' => 'annotepage_switch',
						'back'   => rawurlencode( annotepage_current_url() ),
					),
					admin_url( 'admin-post.php' )
				),
				'annotepage_switch'
			),
		) );
	}

	if ( $admin ) {
		$bar->add_node( array(
			'id'     => 'annotepage-settings',
			'parent' => 'annotepage',
			'title'  => __( 'Settings', 'annotepage' ),
			'href'   => admin_url( 'options-general.php?page=' . ANNOTEPAGE_PAGE ),
		) );
	}
}
add_action( 'admin_bar_menu', 'annotepage_admin_bar', 100 );

/**
 * Where the person is standing, so the switch can put them back there.
 *
 * Rebuilt rather than taken from a header: it is handed back to
 * wp_safe_redirect(), which refuses any host but this one -- so the worst a
 * forged REQUEST_URI can do is send somebody to a wrong path on their own site.
 */
function annotepage_current_url() {
	$path = isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/';
	return home_url( $path );
}

function annotepage_switch() {
	$user = wp_get_current_user();
	if ( ! $user->exists() ) {
		wp_die( esc_html__( 'This switch is remembered per person, so it needs an account.', 'annotepage' ), '', array( 'response' => 403 ) );
	}
	check_admin_referer( 'annotepage_switch' );

	if ( annotepage_switched_off( $user ) ) {
		delete_user_meta( $user->ID, ANNOTEPAGE_USER_OFF );
	} else {
		update_user_meta( $user->ID, ANNOTEPAGE_USER_OFF, '1' );
	}

	$back = isset( $_GET['back'] ) ? esc_url_raw( wp_unslash( $_GET['back'] ) ) : '';
	wp_safe_redirect( '' !== $back ? $back : home_url( '/' ) );
	exit;
}
add_action( 'admin_post_annotepage_switch', 'annotepage_switch' );

/* ---------------------------------------------------------------------------
 * THE GREETING, ON THE PLUGINS SCREEN
 *
 * Activation did something without asking -- it drew a key and pointed at a
 * server -- and the one honest way to do that is to say so, on the screen the
 * person is already looking at, with the way to change it and the way to make
 * the message go.
 * ------------------------------------------------------------------------- */

function annotepage_greeting() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( '1' !== (string) get_option( ANNOTEPAGE_GREETING, '' ) ) {
		return;
	}
	$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
	if ( ! $screen || 'plugins' !== $screen->id ) {
		return;
	}

	$s        = annotepage_settings();
	$settings = admin_url( 'options-general.php?page=' . ANNOTEPAGE_PAGE );
	$dismiss  = wp_nonce_url(
		add_query_arg( 'annotepage_dismiss', '1', admin_url( 'plugins.php' ) ),
		'annotepage_dismiss'
	);
	$loud = ( 'everyone' === $s['audience'] && 'secure' !== $s['mode'] );
	?>
	<div class="notice notice-<?php echo $loud ? 'warning' : 'success'; ?>">
		<p>
			<strong><?php esc_html_e( 'annotepage is on.', 'annotepage' ); ?></strong>
			<?php echo esc_html( annotepage_state_line( $s ) ); ?>
			<?php esc_html_e( 'Open any page of the site and the button is at the bottom right.', 'annotepage' ); ?>
		</p>
		<p>
			<?php
			printf(
				/* translators: %s is the address of the notes server, shown inside a code element. */
				esc_html__( 'It drew a key and pointed at %s so that there was nothing to fill in first. The notes are encrypted in the browser before they leave it, and that server cannot read one.', 'annotepage' ),
				'<code>' . esc_html( $s['server'] ) . '</code>'
			);
			?>
			<?php if ( $loud ) : ?>
				<?php
				printf(
					/* translators: 1: an opening strong tag, 2: the closing one. */
					esc_html__( '%1$sThe key is in the page and the page is public:%2$s anybody who opens it can read these notes and write them.', 'annotepage' ),
					'<strong>',
					'</strong>'
				);
				?>
			<?php else : ?>
				<?php
				printf(
					/* translators: 1: an opening em tag, 2: the closing one, 3: who the tool is shown to, e.g. "administrators". */
					esc_html__( 'The key is in the page, so whoever is shown the tool can read the notes %1$sand write them%2$s &mdash; which is why it starts with %3$s.', 'annotepage' ),
					'<em>',
					'</em>',
					esc_html( annotepage_audience_words( $s ) )
				);
				?>
			<?php endif; ?>
		</p>
		<p>
			<a href="<?php echo esc_url( $settings ); ?>" class="button button-primary"><?php esc_html_e( 'Settings', 'annotepage' ); ?></a>
			<a href="<?php echo esc_url( $dismiss ); ?>" class="button"><?php esc_html_e( 'Dismiss', 'annotepage' ); ?></a>
		</p>
	</div>
	<?php
}
add_action( 'admin_notices', 'annotepage_greeting' );

function annotepage_dismiss() {
	if ( ! isset( $_GET['annotepage_dismiss'] ) ) {
		return;
	}
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	check_admin_referer( 'annotepage_dismiss' );
	delete_option( ANNOTEPAGE_GREETING );
	wp_safe_redirect( admin_url( 'plugins.php' ) );
	exit;
}
add_action( 'admin_init', 'annotepage_dismiss' );

/* The two links on the plugins list row, where WordPress users look for a
   settings screen before they look in a menu. */
function annotepage_row_links( $links ) {
	array_unshift(
		$links,
		'<a href="' . esc_url( admin_url( 'options-general.php?page=' . ANNOTEPAGE_PAGE ) ) . '">'
			. esc_html__( 'Settings', 'annotepage' ) . '</a>'
	);
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'annotepage_row_links' );

/* ---------------------------------------------------------------------------
 * THE SETTINGS SCREEN
 *
 * WHICH FIELDS EXIST, AND WHY THE OTHERS DO NOT.
 *
 * 00-preamble.js reads ten attributes. This screen offers four answers, plus
 * the one question that is not an attribute at all: who sees it. Each omission
 * is a decision, and a setting nobody will ever touch is a setting that costs
 * a reader a question and gives back nothing.
 *
 * KEPT
 *
 *   Who sees it  Not an attribute -- it decides whether the tag is written for
 *                this visitor at all. It is first on the screen because it is
 *                the only answer that can hurt: in public mode the tag carries
 *                the key, so the audience is the list of people who may write
 *                notes. Everything else is plumbing.
 *
 *   data-server   Required, and underivable. The client served from a CDN can
 *                 no longer deduce the API address from its own -- that address
 *                 says nothing about this site. Nothing in WordPress knows it
 *                 either. It arrives filled in with the shared relay, because
 *                 an empty required field is an install that does nothing.
 *
 *   data-key / data-project
 *                 One of the two, never both, and WHICH ONE IS THE MODE. The
 *                 key can be drawn here, pasted from another site, or dropped
 *                 entirely -- and the three are the same field, because they
 *                 are the same decision: WHICH PROJECT THESE NOTES BELONG TO.
 *                 Pasting the same key into dev, staging and production is how
 *                 one set of notes is shared by three environments; the page
 *                 index is HMAC(index key, path) and carries no domain, so the
 *                 same path on the three sites is the same page.
 *
 *   data-version  The only attribute that changes what the tool DOES rather
 *                 than where it points: a note marked resolved compares the
 *                 version of the fix against this one, to tell "resolved and
 *                 online" from "resolved, not deployed yet" -- and the second
 *                 stays on the reviewer's screen, because the defect is still
 *                 visible. Left empty it is not written at all.
 *                 It is NOT auto-filled from the theme's version. The theme's
 *                 version is not the version of what is being served, and a
 *                 wrong one here does not fail, it lies quietly.
 *
 * DISCARDED
 *
 *   data-setup    Opens the client's own setup screen, and its documented life
 *                 is "to be removed once the project is created". This screen
 *                 IS that setup, done once and stored. A field for it would be
 *                 a second way to do the same thing plus a switch somebody
 *                 forgets to turn back off, on every page of a live site.
 *
 *   data-mode     `plain` is only defensible self-hosted, and a relay answers
 *                 it with a 400. Offering a WordPress administrator a checkbox
 *                 that turns off end-to-end encryption -- and that the shared
 *                 server refuses anyway -- is offering a foot-gun with a
 *                 stuck trigger. Encrypted is the default because it is the
 *                 only default that does not require understanding the threat
 *                 model first. Whoever self-hosts AND wants plain is editing
 *                 PHP already.
 *
 *   data-path     Tidiness, not a boundary: it keeps the docs from collecting
 *                 the staging notes, and it protects nothing -- whoever has the
 *                 id and the key writes wherever they like. One WordPress
 *                 install is one site under one prefix. The person who needs
 *                 /fr/ separated from /en/ is running multisite or a
 *                 multilingual stack and is past this screen.
 *
 *   data-domains  The REAL lock is the server's, configured on the server, in
 *                 the file the install script writes. This attribute only
 *                 avoids talking to a server that is going to say no. Putting
 *                 it in wp-admin would put the anti-abuse setting in the one
 *                 place that cannot enforce it, and teach its owner that it
 *                 protects something. It does not.
 *
 *   data-labels   A URL to a label file belonging to the site. Tempting for a
 *                 non-English WordPress -- and still wrong here: the file has
 *                 to be authored and uploaded first, and whoever can do that
 *                 can add three lines to a theme. A field whose prerequisite is
 *                 harder than the field.
 *
 *   data-environment
 *                 The tempting one, because WordPress has
 *                 wp_get_environment_type(). It returns 'production' when
 *                 nobody has declared anything, so the auto-filled value is
 *                 indistinguishable from the unset one, and every note on every
 *                 site would carry a word its owner never chose. The client is
 *                 explicit that this context is DECLARED by the host site and
 *                 never guessed. So: not guessed, and not asked either -- on a
 *                 site with one environment it labels nothing.
 *
 *   A site-wide on/off switch
 *                 Deactivating the plugin is that switch, and it is the one
 *                 every WordPress user already knows how to find. The switch in
 *                 the admin bar is a different thing: it is per person, it
 *                 changes nothing for anybody else, and it exists because
 *                 somebody presenting their screen wants the pill gone for ten
 *                 minutes without touching what the team sees.
 * ------------------------------------------------------------------------- */

function annotepage_menu() {
	add_options_page(
		'annotepage',
		'annotepage',
		'manage_options',
		ANNOTEPAGE_PAGE,
		'annotepage_render'
	);
}
add_action( 'admin_menu', 'annotepage_menu' );

/**
 * admin.js, and ONLY on this screen.
 *
 * Enqueued through the queue -- which the front-end tag deliberately is not --
 * because this script has no such constraint: it never reads
 * document.currentScript, it reads the form. The rule in the header is about
 * the client, not about every script this plugin owns.
 */
function annotepage_admin_assets( $hook ) {
	if ( 'settings_page_' . ANNOTEPAGE_PAGE !== $hook ) {
		return;
	}
	wp_enqueue_script(
		'annotepage-admin',
		plugins_url( 'admin.js', __FILE__ ),
		array(),
		ANNOTEPAGE_VERSION,
		true
	);
}
add_action( 'admin_enqueue_scripts', 'annotepage_admin_assets' );

/**
 * The people named in the "chosen" list, as logins, for the form to show back.
 */
function annotepage_people_logins( array $ids ) {
	$names = array();
	foreach ( $ids as $id ) {
		$user = get_user_by( 'id', (int) $id );
		if ( $user ) {
			$names[] = $user->user_login;
		}
	}
	return $names;
}

/**
 * Logins, emails or display names typed into a box, turned into user ids.
 *
 * A text box and not a multi-select: a select listing every account is a
 * select that times out on a site with ten thousand of them, and the people
 * being named here are three colleagues whose usernames are known.
 *
 * @param string   $typed
 * @param string[] $unknown Out: what matched nothing, so the screen can say so.
 * @return int[]
 */
function annotepage_people_from_text( $typed, &$unknown ) {
	$unknown = array();
	$ids     = array();
	$parts   = preg_split( '/[,\r\n]+/', (string) $typed );
	foreach ( (array) $parts as $part ) {
		$name = trim( $part );
		if ( '' === $name ) {
			continue;
		}
		$user = get_user_by( 'login', $name );
		if ( ! $user ) {
			$user = get_user_by( 'email', $name );
		}
		if ( ! $user ) {
			$user = get_user_by( 'slug', $name );
		}
		if ( $user ) {
			$ids[] = (int) $user->ID;
		} else {
			$unknown[] = $name;
		}
	}
	return array_values( array_unique( $ids ) );
}

/**
 * Save. POST -> validate -> redirect, so a reload does not resubmit.
 *
 * The capability and the nonce are BOTH checked, and neither stands in for the
 * other: the nonce says this request came from our form, the capability says
 * this person is allowed to change what the whole site serves. A subscriber
 * with a valid nonce is still a subscriber.
 */
function annotepage_save() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You are not allowed to change these settings.', 'annotepage' ), '', array( 'response' => 403 ) );
	}
	check_admin_referer( 'annotepage_save' );

	$old = annotepage_settings();
	$new = $old;

	$mode        = isset( $_POST['ap_mode'] ) ? sanitize_text_field( wp_unslash( $_POST['ap_mode'] ) ) : '';
	$new['mode'] = ( 'secure' === $mode ) ? 'secure' : 'open';

	$audience = isset( $_POST['ap_audience'] ) ? sanitize_text_field( wp_unslash( $_POST['ap_audience'] ) ) : '';
	if ( annotepage_is_audience( $audience ) ) {
		$new['audience'] = $audience;
	}

	/* Against the roles this site actually has, not against a list written
	   here: a role added by another plugin is a real role, and a role removed
	   since must not stay in our option pointing at nothing. */
	$known = array_keys( wp_roles()->get_names() );

	/* Sanitized where the superglobal is read, and not a line later on the way
	   into array_intersect(): the values and their order are the same either
	   way, but the guarantee is only legible -- to a reader, and to the
	   directory's scanner -- at the point the request is touched. */
	$roles = isset( $_POST['ap_roles'] )
		? array_map( 'sanitize_key', (array) wp_unslash( $_POST['ap_roles'] ) )
		: array();
	$new['roles'] = array_values( array_intersect( $known, $roles ) );

	$unknown        = array();
	$typed_people   = isset( $_POST['ap_people'] ) ? sanitize_textarea_field( wp_unslash( $_POST['ap_people'] ) ) : '';
	$new['people']  = annotepage_people_from_text( $typed_people, $unknown );

	/* `typed` is kept apart from `server` on purpose. esc_url_raw() answers a
	   `javascript:` with an EMPTY STRING, which is indistinguishable from a
	   field somebody left blank -- and the two deserve opposite messages. One
	   says "fill this in", the other says "that is not an address". */
	$typed  = isset( $_POST['ap_server'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['ap_server'] ) ) ) : '';
	$server = ( '' === $typed ) ? '' : esc_url_raw( $typed, array( 'http', 'https' ) );

	/* The version is written into notes as it stands; the site names it, we do
	   not interpret it. Capped so a paste accident cannot become an attribute
	   the length of a page. */
	$version = isset( $_POST['ap_version'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['ap_version'] ) ) ) : '';
	if ( strlen( $version ) > 64 ) {
		$version = substr( $version, 0, 64 );
	}

	/* THE KEY ARRIVES ONLY IN PUBLIC MODE. In secure mode admin.js disables
	   that input, so the browser never sends it -- but a form is not a promise,
	   so the mode decides here too and the other field is not even read. This
	   is the difference between "the key does not transit" and "we did not look
	   at it".

	   AND AN EMPTY KEY FIELD MEANS EMPTY. It used to mean "keep the old one",
	   which made the field unable to express "no key here" -- and dropping the
	   key is now something somebody may genuinely want, on a site that should
	   ask each reviewer for it. */
	$key     = '';
	$project = '';
	if ( 'secure' === $new['mode'] ) {
		$project = isset( $_POST['ap_project'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['ap_project'] ) ) ) : '';
	} else {
		$key = isset( $_POST['ap_key'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['ap_key'] ) ) ) : '';
	}

	$notice = 'saved';

	if ( '' !== $typed && ! annotepage_is_server( $server ) ) {
		$notice = 'bad-server';
	} elseif ( 'secure' === $new['mode'] && '' !== $project && ! annotepage_is_project( $project ) ) {
		$notice = 'bad-project';
	} elseif ( 'secure' !== $new['mode'] && '' !== $key && ! annotepage_is_key( $key ) ) {
		$notice = 'bad-key';
	}

	if ( 'saved' === $notice ) {
		$new['server']  = $server;
		$new['version'] = $version;
		$new['key']     = $key;
		$new['project'] = $project;
		update_option( ANNOTEPAGE_OPTION, $new, true );

		/* Named rather than counted, and kept out of the redirect: what is
		   printed back comes from our own row, escaped, never from the URL the
		   browser was sent to. It is its own line on the screen, so it does not
		   compete for the headline -- see below. */
		if ( ! empty( $unknown ) ) {
			set_transient( 'annotepage_unknown_' . get_current_user_id(), $unknown, 120 );
		}

		/* THE HEADLINE IS THE MOST EXPENSIVE THING THAT JUST HAPPENED.
		   One slot means a ranking, and the first ranking here was the order
		   the branches happened to be written in: a misspelt username hid "the
		   key is now in a page every visitor can open". Ranked by consequence
		   now, and nothing is lost by it -- the misspelt name is printed under
		   the headline either way. */
		if ( '' === $new['server'] || ( '' === $new['key'] && '' === $new['project'] ) ) {
			$notice = 'incomplete';
		} elseif ( 'everyone' === $new['audience'] && 'secure' !== $new['mode'] ) {
			$notice = 'wide-open';
		}
	}

	wp_safe_redirect(
		add_query_arg(
			array(
				'page'      => ANNOTEPAGE_PAGE,
				'ap_notice' => $notice,
			),
			admin_url( 'options-general.php' )
		)
	);
	exit;
}
add_action( 'admin_post_annotepage_save', 'annotepage_save' );

/* A closed list. The message shown is chosen from here by a key that arrived in
   a URL, so nothing that arrived in a URL is ever printed. */
function annotepage_notice_text( $key ) {
	$all = array(
		'saved'       => __( 'Saved. The tag below is what this site now carries.', 'annotepage' ),
		'incomplete'  => __( 'Saved, and the tag is NOT being written: it needs a server address and a key.', 'annotepage' ),
		'wide-open'   => __( 'Saved. The key is now in a page every visitor can open, so every visitor can read these notes and write them.', 'annotepage' ),
		'bad-server'  => __( 'Nothing was saved: the server address must be a full http:// or https:// URL.', 'annotepage' ),
		'bad-key'     => __( 'Nothing was saved: a key is 43 characters. Paste one, or use the button to draw one.', 'annotepage' ),
		'bad-project' => __( 'Nothing was saved: a project id is 22 characters. Paste one, or draw a key and let it derive.', 'annotepage' ),
	);
	return isset( $all[ $key ] ) ? $all[ $key ] : '';
}

function annotepage_render() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$s       = annotepage_settings();
	$markup  = annotepage_tag_markup();
	$id      = annotepage_project_id( $s );
	$has     = ( '' !== $s['key'] || '' !== $s['project'] );
	$notice  = '';
	$unknown = array();

	if ( isset( $_GET['ap_notice'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$notice = annotepage_notice_text( sanitize_key( wp_unslash( $_GET['ap_notice'] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	}

	/* Read whatever the headline was: names that matched no account are shown
	   beside every outcome, never instead of one. Ours, escaped, and gone once
	   it has been read. */
	$stored = get_transient( 'annotepage_unknown_' . get_current_user_id() );
	if ( is_array( $stored ) ) {
		$unknown = $stored;
		delete_transient( 'annotepage_unknown_' . get_current_user_id() );
	}

	$loud = ( 'everyone' === $s['audience'] && 'secure' !== $s['mode'] );
	?>
	<div class="wrap">
		<h1>annotepage</h1>

		<?php if ( '' !== $notice || ! empty( $unknown ) ) : ?>
			<div class="notice notice-info">
				<?php if ( '' !== $notice ) : ?>
					<p><?php echo esc_html( $notice ); ?></p>
				<?php endif; ?>
				<?php if ( ! empty( $unknown ) ) : ?>
					<p>
						<?php
						printf(
							/* translators: %s is the list of names that matched no account, inside a code element. */
							esc_html__( 'This site has no account for %s, so nobody was added for that name.', 'annotepage' ),
							'<code>' . esc_html( implode( ', ', $unknown ) ) . '</code>'
						);
						?>
					</p>
				<?php endif; ?>
			</div>
		<?php endif; ?>

		<p>
			<strong><?php echo esc_html( annotepage_state_line( $s ) ); ?></strong>
			<?php esc_html_e( 'This screen writes one script tag at the foot of the page. It installs nothing else: the tool itself is served from a CDN and updates on its own.', 'annotepage' ); ?>
		</p>

		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="ap-form">
			<input type="hidden" name="action" value="annotepage_save">
			<?php wp_nonce_field( 'annotepage_save' ); ?>

			<h2><?php esc_html_e( 'Who sees it', 'annotepage' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Shown to', 'annotepage' ); ?></th>
					<td>
						<fieldset id="ap-audience">
							<label style="display:block;margin-bottom:6px;">
								<input type="radio" name="ap_audience" value="admins"
									<?php checked( 'admins', $s['audience'] ); ?>>
								<?php
								printf(
									/* translators: 1: an opening strong tag, 2: the closing one. */
									esc_html__( '%1$sAdministrators%2$s &mdash; where a fresh install starts.', 'annotepage' ),
									'<strong>',
									'</strong>'
								);
								?>
							</label>
							<label style="display:block;margin-bottom:6px;">
								<input type="radio" name="ap_audience" value="signed-in"
									<?php checked( 'signed-in', $s['audience'] ); ?>>
								<?php
								printf(
									/* translators: 1: an opening strong tag, 2: the closing one. */
									esc_html__( '%1$sEverybody signed in%2$s to this site.', 'annotepage' ),
									'<strong>',
									'</strong>'
								);
								?>
							</label>
							<label style="display:block;margin-bottom:6px;">
								<input type="radio" name="ap_audience" value="chosen" id="ap-audience-chosen"
									<?php checked( 'chosen', $s['audience'] ); ?>>
								<strong><?php esc_html_e( 'These roles, and these people.', 'annotepage' ); ?></strong>
							</label>

							<div id="ap-chosen" style="margin:0 0 10px 24px;">
								<p style="margin:4px 0;">
									<?php foreach ( wp_roles()->get_names() as $slug => $label ) : ?>
										<label style="display:inline-block;margin-right:14px;">
											<input type="checkbox" name="ap_roles[]"
												value="<?php echo esc_attr( $slug ); ?>"
												<?php checked( in_array( $slug, $s['roles'], true ) ); ?>>
											<?php echo esc_html( $label ); ?>
										</label>
									<?php endforeach; ?>
								</p>
								<p style="margin:4px 0;">
									<label for="ap-people"><?php esc_html_e( 'And these people, by username or email, one per line or separated by commas:', 'annotepage' ); ?></label><br>
									<textarea name="ap_people" id="ap-people" rows="2" class="large-text code"
										placeholder="<?php echo esc_attr__( 'jo, sam@example.com', 'annotepage' ); ?>"><?php echo esc_textarea( implode( ', ', annotepage_people_logins( $s['people'] ) ) ); ?></textarea>
								</p>
							</div>

							<label style="display:block;">
								<input type="radio" name="ap_audience" value="everyone" id="ap-audience-everyone"
									<?php checked( 'everyone', $s['audience'] ); ?>>
								<strong><?php esc_html_e( 'Everyone, visitors included.', 'annotepage' ); ?></strong>
								<span class="description" style="display:block;margin-left:24px;">
									<?php esc_html_e( 'On a public page in public mode this hands the key to anybody who opens it, and the key is write access: they can read every note and add their own. It is a real answer on a site behind a login, a VPN or an IP allowlist &mdash; and on a site that is genuinely open, secure mode below is the pairing that survives it.', 'annotepage' ); ?>
								</span>
							</label>
						</fieldset>

						<div id="ap-wide" class="notice notice-warning inline"
							style="margin:12px 0 0;padding:8px 12px;<?php echo $loud ? '' : 'display:none;'; ?>">
							<p style="margin:0.4em 0;">
								<?php
								printf(
									/* translators: 1: an opening strong tag, 2: the closing one. */
									esc_html__( '%1$sEveryone, with the key in the page.%2$s Every visitor to this site can read these notes and write them, and somebody who copies the tag out of your page source can write into them from anywhere. Sound behind a login or a VPN. Worth a second thought on a public site.', 'annotepage' ),
									'<strong>',
									'</strong>'
								);
								?>
							</p>
						</div>
					</td>
				</tr>
			</table>

			<h2><?php esc_html_e( 'Where the notes go', 'annotepage' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ap-server"><?php esc_html_e( 'Server address', 'annotepage' ); ?></label></th>
					<td>
						<input name="ap_server" id="ap-server" type="url" class="regular-text code"
							value="<?php echo esc_attr( $s['server'] ); ?>"
							placeholder="<?php echo esc_attr( ANNOTEPAGE_DEFAULT_SERVER ); ?>">
						<p class="description">
							<?php
							printf(
								/* translators: %s is the file name api.php, inside a code element. */
								esc_html__( 'The address of %s &mdash; the shared relay, filled in at activation, or your own install. The client is served from a CDN and cannot guess it.', 'annotepage' ),
								'<code>api.php</code>'
							);
							?>
						</p>
					</td>
				</tr>

				<tr>
					<th scope="row"><label for="ap-version"><?php esc_html_e( 'Version', 'annotepage' ); ?></label></th>
					<td>
						<input name="ap_version" id="ap-version" type="text" class="regular-text code"
							value="<?php echo esc_attr( $s['version'] ); ?>"
							placeholder="2026.9.5">
						<p class="description">
							<?php esc_html_e( 'Optional, and left empty it is not written at all. It is what lets a resolved note say &ldquo;fixed and online&rdquo; rather than &ldquo;fixed, not deployed yet&rdquo; &mdash; the second stays on the reviewer&rsquo;s screen, because the defect still is. Whatever your site calls its version; nothing here invents one.', 'annotepage' ); ?>
						</p>
					</td>
				</tr>
			</table>

			<h2><?php esc_html_e( 'The key', 'annotepage' ); ?></h2>
			<p class="description" style="max-width:46em;">
				<?php
				printf(
					/* translators: 1: an opening em tag, 2: the closing one. */
					esc_html__( 'The key %1$sis%2$s the project: the same key on two sites is one set of notes, and a different key is a different set. Draw one, or paste the one another environment already uses &mdash; dev, staging and production sharing a key share the notes of the same path, because a page is found by its path and not by its domain.', 'annotepage' ),
					'<em>',
					'</em>'
				);
				?>
			</p>

			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Mode', 'annotepage' ); ?></th>
					<td>
						<fieldset>
							<label style="display:block;margin-bottom:8px;">
								<input type="radio" name="ap_mode" value="open" id="ap-mode-open"
									<?php checked( 'open', $s['mode'] ); ?>>
								<?php
								printf(
									/* translators: 1: an opening strong tag, 2: the closing one. */
									esc_html__( '%1$sThe key is in the page.%2$s Nobody is asked for anything.', 'annotepage' ),
									'<strong>',
									'</strong>'
								);
								?>
								<span class="description" style="display:block;margin-left:24px;">
									<?php
									printf(
										/* translators: 1: an opening strong tag, 2: the closing one. */
										esc_html__( 'Whoever is shown the tool can read these notes %1$sand write them%2$s; there is no reader-only role.', 'annotepage' ),
										'<strong>',
										'</strong>'
									);
									?>
								</span>
							</label>
							<label style="display:block;">
								<input type="radio" name="ap_mode" value="secure" id="ap-mode-secure"
									<?php checked( 'secure', $s['mode'] ); ?>>
								<?php
								printf(
									/* translators: 1: an opening strong tag, 2: the closing one. */
									esc_html__( '%1$sOnly the project id is in the page.%2$s Each reviewer pastes the key once, in their own browser.', 'annotepage' ),
									'<strong>',
									'</strong>'
								);
								?>
								<span class="description" style="display:block;margin-left:24px;">
									<?php
									printf(
										/* translators: 1: an opening strong tag, 2: the closing one. */
										esc_html__( 'WordPress does not store it and the server never receives it. %1$sLose it and the notes are gone%2$s: there is no recovery and no rotation.', 'annotepage' ),
										'<strong>',
										'</strong>'
									);
									?>
								</span>
							</label>
						</fieldset>
					</td>
				</tr>

				<tr>
					<th scope="row"><label for="ap-key"><?php esc_html_e( 'Key', 'annotepage' ); ?></label></th>
					<td>
						<input name="ap_key" id="ap-key" type="text" class="large-text code"
							autocomplete="off" spellcheck="false"
							value="<?php echo esc_attr( $s['key'] ); ?>"
							placeholder="<?php echo esc_attr__( '43 characters, or empty', 'annotepage' ); ?>">
						<p>
							<button type="button" class="button" id="ap-generate">
								<?php echo esc_html( $has ? __( 'Draw a new key', 'annotepage' ) : __( 'Draw a key', 'annotepage' ) ); ?>
							</button>
							<span id="ap-state" class="description" style="margin-left:8px;">
								<?php
								if ( 'secure' === $s['mode'] && '' !== $s['project'] ) {
									printf(
										/* translators: %s is the project id, inside a code element. */
										esc_html__( 'Project %s. The key is not stored here.', 'annotepage' ),
										'<code>' . esc_html( $s['project'] ) . '</code>'
									);
								} elseif ( '' !== $id ) {
									printf(
										/* translators: %s is the project id, inside a code element. */
										esc_html__( 'Project %s.', 'annotepage' ),
										'<code>' . esc_html( $id ) . '</code>'
									);
								} else {
									esc_html_e( 'None yet.', 'annotepage' );
								}
								?>
							</span>
						</p>
						<p class="description">
							<?php
							printf(
								/* translators: 1: an opening em tag, 2: the closing one, 3: an opening strong tag, 4: the closing one. */
								esc_html__( 'Drawn in %1$sthis%2$s browser, by the same computation the install page and the tool itself run. Nothing is sent anywhere to obtain it. A new key is a new project: %3$sthe notes written under the old one stay where they are%4$s &mdash; nothing is deleted &mdash; and this site stops showing them.', 'annotepage' ),
								'<em>',
								'</em>',
								'<strong>',
								'</strong>'
							);
							?>
						</p>

						<div id="ap-once" style="display:none;">
							<div class="notice notice-warning inline" style="margin:12px 0 0;padding:8px 12px;">
								<p style="margin:0.4em 0;">
									<?php
									printf(
										/* translators: 1: an opening strong tag, 2: the closing one. */
										esc_html__( '%1$sCopy this now.%2$s In this mode it is not sent to WordPress and not stored anywhere. This is the only time it will be shown.', 'annotepage' ),
										'<strong>',
										'</strong>'
									);
									?>
								</p>
								<p style="margin:0.4em 0;">
									<code id="ap-once-key" style="user-select:all;"></code>
								</p>
								<p style="margin:0.4em 0;">
									<label>
										<input type="checkbox" id="ap-kept"> <?php esc_html_e( 'I have copied it', 'annotepage' ); ?>
									</label>
								</p>
							</div>
						</div>
					</td>
				</tr>

				<tr id="ap-project-row">
					<th scope="row"><label for="ap-project"><?php esc_html_e( 'Project id', 'annotepage' ); ?></label></th>
					<td>
						<input name="ap_project" id="ap-project" type="text" class="regular-text code"
							autocomplete="off" spellcheck="false"
							value="<?php echo esc_attr( $s['project'] ); ?>"
							placeholder="<?php echo esc_attr__( '22 characters', 'annotepage' ); ?>">
						<p class="description">
							<?php esc_html_e( 'What goes in the page when the key does not. It is derived from the key, so pasting a key above fills it in &mdash; and pasting an id here alone points this site at a project whose key its reviewers already hold.', 'annotepage' ); ?>
						</p>
					</td>
				</tr>
			</table>

			<?php submit_button( __( 'Save', 'annotepage' ), 'primary', 'submit', true, array( 'id' => 'ap-save' ) ); ?>
		</form>

		<h2><?php esc_html_e( 'The tag on your pages', 'annotepage' ); ?></h2>
		<?php if ( '' !== $markup ) : ?>
			<p class="description">
				<?php
				printf(
					/* translators: 1: the word body inside a code element, 2: who the tag is written for, e.g. "administrators". */
					esc_html__( 'Written by this plugin at the end of %1$s, for %2$s. There is nothing to paste.', 'annotepage' ),
					'<code>&lt;body&gt;</code>',
					esc_html( annotepage_audience_words( $s ) )
				);
				?>
			</p>
			<pre class="code" style="overflow:auto;padding:12px;background:#f6f7f7;border:1px solid #dcdcde;"><code><?php echo esc_html( $markup ); ?></code></pre>
		<?php else : ?>
			<p>
				<?php esc_html_e( 'Nothing is written yet. The tag needs a server address, and a key or a project id.', 'annotepage' ); ?>
			</p>
		<?php endif; ?>
	</div>
	<?php
}
