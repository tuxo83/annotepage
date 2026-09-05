<?php
/**
 * Plugin Name:       annotepage
 * Plugin URI:        https://annotepage.com/how-to-install-it.html
 * Description:       Writes the annotepage tag in your footer. One settings screen, the key drawn in your browser, and nothing else.
 * Version:           1.0.0
 * Requires at least: 5.2
 * Requires PHP:      7.4
 * Author:            tuxo83
 * Author URI:        https://github.com/tuxo83
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 *
 * ---------------------------------------------------------------------------
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
 * NOTHING HERE TALKS TO THE NETWORK. No wp_remote_get, no cURL, no update
 * check, no telemetry, no phone home. Grep the file: there is no HTTP call in
 * it. The key is generated in the browser by admin.js and reaches PHP once, in
 * the form POST that stores it -- and in secure mode it does not reach PHP at
 * all.
 *
 * The strings are English, with no translation layer, because CONVENTIONS.md
 * section 1 makes that the law for everything this project ships. The strings
 * a visitor reads are the CLIENT's, and those translate through `data-labels`,
 * which is a file belonging to the site.
 * ---------------------------------------------------------------------------
 */

/* Called directly rather than through WordPress: nothing below is meant to run
   that way, and a plugin file that answers an HTTP request on its own is the
   shape a decade of WordPress vulnerabilities had. */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * THE ADDRESS. A floating major range, on purpose -- see the header.
 *
 * It is a constant and not a setting. A field for it would be a field whose
 * only correct answer is this string, offered to somebody who cannot check
 * their own answer, and its wrong values fail silently: a 404 on a script tag
 * raises nothing a site owner ever sees. Whoever genuinely serves their own
 * copy of the client is editing files already.
 */
define( 'ANNOTEPAGE_CLIENT_SRC', 'https://cdn.jsdelivr.net/npm/annotepage-client@2/dist/annotepage.js' );

/* One option, one array. Five keys, no autoloaded sprawl.
 *
 * AND NO uninstall.php, WHICH IS A DECISION AND NOT AN OMISSION. Tidy plugins
 * delete their option on uninstall. This option holds a KEY, and a key has no
 * recovery and no rotation: deleting it turns every note ever written into
 * ciphertext nobody can open, in one click, from a screen that says "delete".
 * A stale row in wp_options costs nothing. Losing a project costs everything
 * the reviewers wrote. Whoever really wants it gone deletes the option. */
define( 'ANNOTEPAGE_OPTION', 'annotepage_settings' );

define( 'ANNOTEPAGE_PAGE', 'annotepage' );

/**
 * The stored answers, with every key present and every value a string.
 *
 * @return array<string,string>
 */
function annotepage_settings() {
	$stored = get_option( ANNOTEPAGE_OPTION, array() );
	if ( ! is_array( $stored ) ) {
		$stored = array();
	}

	$out = array(
		'server'  => '',
		'mode'    => 'open',
		'key'     => '',
		'project' => '',
		'version' => '',
	);
	foreach ( $out as $name => $default ) {
		if ( isset( $stored[ $name ] ) && is_string( $stored[ $name ] ) ) {
			$out[ $name ] = $stored[ $name ];
		}
	}

	/* Read back through the same judges that let it in. An option row can be
	   written by something other than this form -- WP-CLI, a migration, a
	   restored database -- and the tag is what the whole site serves. */
	if ( 'secure' !== $out['mode'] ) {
		$out['mode'] = 'open';
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

/* http/https only. Not tidiness: this string is written into an attribute the
   browser resolves, so a `javascript:` in it would be a script the site runs on
   every page. esc_url() would already drop it; refusing it at the door means
   the stored value is never the dangerous one in the first place. */
function annotepage_is_server( $value ) {
	if ( ! is_string( $value ) || '' === $value ) {
		return false;
	}
	$scheme = strtolower( (string) wp_parse_url( $value, PHP_URL_SCHEME ) );
	if ( 'http' !== $scheme && 'https' !== $scheme ) {
		return false;
	}
	return '' !== (string) wp_parse_url( $value, PHP_URL_HOST );
}

/**
 * THE TAG. One producer, two consumers: the footer echoes it, the settings
 * screen shows it escaped.
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
 */
function annotepage_print_tag() {
	$markup = annotepage_tag_markup();
	if ( '' === $markup ) {
		return;
	}
	/* Every value inside was escaped by annotepage_tag_markup() and the frame
	   around them is a literal. There is nothing left to escape here, and
	   escaping the assembled markup would escape the tag itself. */
	echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
}
add_action( 'wp_footer', 'annotepage_print_tag', 100 );

/* ---------------------------------------------------------------------------
 * THE SETTINGS SCREEN
 *
 * WHICH FIELDS EXIST, AND WHY THE OTHERS DO NOT.
 *
 * 00-preamble.js reads ten attributes. This screen offers four answers. Each
 * omission is a decision, and a setting nobody will ever touch is a setting
 * that costs a reader a question and gives back nothing.
 *
 * KEPT
 *
 *   data-server   Required, and underivable. The client served from a CDN can
 *                 no longer deduce the API address from its own -- that address
 *                 says nothing about this site. Nothing in WordPress knows it
 *                 either. Without this field the plugin cannot work at all.
 *
 *   data-key / data-project
 *                 One of the two, never both, and WHICH ONE IS THE MODE. This
 *                 is not a field so much as the product: it is the value a
 *                 neophyte would otherwise have to go and fetch from another
 *                 page. It is generated here, in the browser (admin.js).
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
 *   An on/off switch
 *                 Deactivating the plugin is the switch, and it is the one
 *                 every WordPress user already knows how to find. An
 *                 incomplete configuration writes nothing on its own.
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
		'1.0.0',
		true
	);
}
add_action( 'admin_enqueue_scripts', 'annotepage_admin_assets' );

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
		wp_die( 'You are not allowed to change these settings.', '', array( 'response' => 403 ) );
	}
	check_admin_referer( 'annotepage_save' );

	$old = annotepage_settings();
	$new = $old;

	$mode = isset( $_POST['ap_mode'] ) ? sanitize_text_field( wp_unslash( $_POST['ap_mode'] ) ) : '';
	$new['mode'] = ( 'secure' === $mode ) ? 'secure' : 'open';

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

	/* THE KEY ARRIVES ONLY IN OPEN MODE. In secure mode admin.js disables that
	   input, so the browser never sends it -- but a form is not a promise, so
	   the mode decides here too and the other field is not even read. This is
	   the difference between "the key does not transit" and "we did not look at
	   it". */
	$key     = $old['key'];
	$project = $old['project'];
	if ( 'secure' === $new['mode'] ) {
		$key       = '';
		$posted_id = isset( $_POST['ap_project'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['ap_project'] ) ) ) : '';
		if ( '' !== $posted_id ) {
			$project = $posted_id;
		}
	} else {
		$project    = '';
		$posted_key = isset( $_POST['ap_key'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['ap_key'] ) ) ) : '';
		if ( '' !== $posted_key ) {
			$key = $posted_key;
		}
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
		update_option( ANNOTEPAGE_OPTION, $new, false );

		if ( '' === $new['server'] || ( '' === $new['key'] && '' === $new['project'] ) ) {
			$notice = 'incomplete';
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
		'saved'       => 'Saved. The tag below is what every page of this site now carries.',
		'incomplete'  => 'Saved, and the tag is NOT being written: it needs a server address and a key.',
		'bad-server'  => 'Nothing was saved: the server address must be a full http:// or https:// URL.',
		'bad-key'     => 'Nothing was saved: a key is 43 characters. Use the button to draw one.',
		'bad-project' => 'Nothing was saved: a project id is 22 characters. Use the button to draw one.',
	);
	return isset( $all[ $key ] ) ? $all[ $key ] : '';
}

function annotepage_render() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$s      = annotepage_settings();
	$markup = annotepage_tag_markup();
	$has    = ( '' !== $s['key'] || '' !== $s['project'] );

	$notice = '';
	if ( isset( $_GET['ap_notice'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$notice = annotepage_notice_text( sanitize_key( wp_unslash( $_GET['ap_notice'] ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	}
	?>
	<div class="wrap">
		<h1>annotepage</h1>

		<?php if ( '' !== $notice ) : ?>
			<div class="notice notice-info"><p><?php echo esc_html( $notice ); ?></p></div>
		<?php endif; ?>

		<p>
			This screen writes one script tag at the foot of every page. It
			installs nothing else: the tool itself is served from a CDN and
			updates on its own.
		</p>

		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="ap-form">
			<input type="hidden" name="action" value="annotepage_save">
			<?php wp_nonce_field( 'annotepage_save' ); ?>

			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ap-server">Server address</label></th>
					<td>
						<input name="ap_server" id="ap-server" type="url" class="regular-text code"
							value="<?php echo esc_attr( $s['server'] ); ?>"
							placeholder="https://api.annotepage.com/api.php">
						<p class="description">
							The address of <code>api.php</code> &mdash; the shared
							relay, or your own install. The client is served from a
							CDN and cannot guess it.
						</p>
					</td>
				</tr>

				<tr>
					<th scope="row">Mode</th>
					<td>
						<!-- THE WARNING COMES BEFORE THE CHOICE, not after it.
						     A screen that explains what cannot be undone under
						     the radio somebody has already clicked has
						     explained nothing. -->
						<div class="notice notice-warning inline" style="margin:0 0 12px;padding:8px 12px;">
							<p style="margin:0.4em 0;">
								<strong>This choice cannot be taken back.</strong>
								The mode is settled by the tag and by nothing else.
								Changing it later means a new key, so a new project,
								and <strong>the notes already written stay behind</strong>
								&mdash; they are not moved and not deleted, this site
								simply stops showing them.
							</p>
						</div>

						<fieldset>
							<label style="display:block;margin-bottom:8px;">
								<input type="radio" name="ap_mode" value="open" id="ap-mode-open"
									<?php checked( 'open', $s['mode'] ); ?>>
								<strong>Public</strong> &mdash; the key is in the page.
								Nobody is asked for anything.
								<span class="description" style="display:block;margin-left:24px;">
									Whoever can open the page can read these notes
									<strong>and write them</strong>; there is no
									reader-only role. Someone who copies the tag out
									of your page source writes into your notes from
									their own site. Fine behind a login, a VPN or an
									IP allowlist. Not fine on a public page.
								</span>
							</label>
							<label style="display:block;">
								<input type="radio" name="ap_mode" value="secure" id="ap-mode-secure"
									<?php checked( 'secure', $s['mode'] ); ?>>
								<strong>Secure</strong> &mdash; only the project id is
								in the page.
								<span class="description" style="display:block;margin-left:24px;">
									Each reviewer pastes the key once, in their own
									browser. WordPress never stores it, and the server
									never receives it. <strong>Lose it and the notes
									are gone</strong>: there is no recovery and no
									rotation.
								</span>
							</label>
						</fieldset>
					</td>
				</tr>

				<tr>
					<th scope="row">Key</th>
					<td>
						<!-- The two values the browser produces. One of them is
						     submitted; admin.js disables the other, and
						     annotepage_save() does not read it either. -->
						<input type="hidden" name="ap_key" id="ap-key" value="<?php echo esc_attr( $s['key'] ); ?>">
						<input type="hidden" name="ap_project" id="ap-project" value="<?php echo esc_attr( $s['project'] ); ?>">

						<p>
							<button type="button" class="button" id="ap-generate">
								<?php echo $has ? 'Draw a new key' : 'Draw a key'; ?>
							</button>
							<span id="ap-state" class="description" style="margin-left:8px;">
								<?php
								if ( 'secure' === $s['mode'] && '' !== $s['project'] ) {
									echo 'Project <code>' . esc_html( $s['project'] ) . '</code>. The key is not stored here.';
								} elseif ( '' !== $s['key'] ) {
									echo 'A key is stored and written into the page.';
								} else {
									echo 'None yet.';
								}
								?>
							</span>
						</p>

						<p class="description">
							It is drawn in <em>this</em> browser, by the same
							computation the install page and the tool itself run.
							Nothing is sent anywhere to obtain it.
						</p>

						<!-- Filled by admin.js in secure mode, and only there:
						     it is the one moment the key exists anywhere this
						     administrator can read it. -->
						<div id="ap-once" style="display:none;">
							<div class="notice notice-warning inline" style="margin:12px 0 0;padding:8px 12px;">
								<p style="margin:0.4em 0;">
									<strong>Copy this now.</strong> In secure mode it is
									not sent to WordPress and not stored anywhere. This
									is the only time it will be shown.
								</p>
								<p style="margin:0.4em 0;">
									<code id="ap-once-key" style="user-select:all;"></code>
								</p>
							</div>
						</div>

						<div id="ap-mismatch" style="display:none;">
							<div class="notice notice-error inline" style="margin:12px 0 0;padding:8px 12px;">
								<p style="margin:0.4em 0;">
									This mode needs its own key. Draw one before
									saving &mdash; and the notes written under the
									current one stay behind.
								</p>
							</div>
						</div>
					</td>
				</tr>

				<tr>
					<th scope="row"><label for="ap-version">Version</label></th>
					<td>
						<input name="ap_version" id="ap-version" type="text" class="regular-text code"
							value="<?php echo esc_attr( $s['version'] ); ?>"
							placeholder="2026.9.5">
						<p class="description">
							Optional, and left empty it is not written at all. It
							is what lets a resolved note say &ldquo;fixed and
							online&rdquo; rather than &ldquo;fixed, not deployed
							yet&rdquo; &mdash; the second stays on the
							reviewer&rsquo;s screen, because the defect still is.
							Whatever your site calls its version; nothing here
							invents one.
						</p>
					</td>
				</tr>
			</table>

			<?php submit_button( 'Save', 'primary', 'submit', true, array( 'id' => 'ap-save' ) ); ?>
		</form>

		<h2>The tag on your pages</h2>
		<?php if ( '' !== $markup ) : ?>
			<p class="description">
				Written by this plugin at the end of <code>&lt;body&gt;</code>.
				There is nothing to paste.
			</p>
			<pre class="code" style="overflow:auto;padding:12px;background:#f6f7f7;border:1px solid #dcdcde;"><code><?php echo esc_html( $markup ); ?></code></pre>
		<?php else : ?>
			<p>
				Nothing is written yet. The tag needs a server address and a key.
			</p>
		<?php endif; ?>
	</div>
	<?php
}
