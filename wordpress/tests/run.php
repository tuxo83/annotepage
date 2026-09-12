<?php
/**
 * THE PLUGIN, RUN.
 *
 * A WordPress plugin is the one thing in this repository that cannot be tested
 * by talking to it over HTTP: there is no WordPress here, and installing one to
 * run twenty assertions would make the suite depend on a database, a download
 * and a release cycle that belong to somebody else.
 *
 * So WordPress is stubbed -- only the two dozen functions this plugin actually
 * calls -- and the plugin is LOADED and RUN against those stubs. What is proved
 * here is the plugin's own reasoning: who the tag is written for, what
 * activation does and does not overwrite, which credential can reach the page,
 * and which posted values are refused.
 *
 * WHAT THIS CANNOT PROVE, said plainly so nobody reads more into a green line:
 * that the real WordPress calls these hooks when we think it does. The hook
 * names are checked against the real ones by eye and by the plugin directory's
 * own review. Everything downstream of them is here.
 *
 * Run by tools/check-wordpress.mjs, which also compares the key this file's
 * PHP derives against the MCP's implementation.
 */

/* -------------------------------------------------------------------------
 * The stubs. Nothing clever: each one is the smallest honest version of the
 * WordPress function, and where WordPress would ESCAPE, these escape too --
 * an assertion about escaped output is worthless against a stub that returns
 * its argument.
 * ---------------------------------------------------------------------- */

define( 'ABSPATH', __DIR__ . '/' );
define( 'MINUTE_IN_SECONDS', 60 );

$GLOBALS['ap_options']    = array();
$GLOBALS['ap_transients'] = array();
$GLOBALS['ap_meta']       = array();
$GLOBALS['ap_actions']    = array();
$GLOBALS['ap_users']      = array();
$GLOBALS['ap_current']    = 0;
$GLOBALS['ap_screen']     = null;

class WP_User {
	public $ID = 0;
	public $roles = array();
	public $user_login = '';
	public $user_email = '';
	public function __construct( $id = 0, $login = '', $roles = array() ) {
		$this->ID         = (int) $id;
		$this->user_login = $login;
		$this->user_email = $login . '@example.com';
		$this->roles      = $roles;
	}
	public function exists() {
		return $this->ID > 0;
	}
}

/* Thrown where WordPress would have ended the request. A redirect that is
   swallowed silently would let a test carry on through code the real plugin
   never reaches. */
class Ap_Redirect extends Exception {}
class Ap_Died extends Exception {}

function add_action( $hook, $fn, $priority = 10, $args = 1 ) {
	$GLOBALS['ap_actions'][ $hook ][] = $fn;
}
function add_filter( $hook, $fn, $priority = 10, $args = 1 ) {
	$GLOBALS['ap_actions'][ $hook ][] = $fn;
}
function register_activation_hook( $file, $fn ) {
	$GLOBALS['ap_actions']['activate'][] = $fn;
}

function get_option( $name, $default = false ) {
	return array_key_exists( $name, $GLOBALS['ap_options'] ) ? $GLOBALS['ap_options'][ $name ] : $default;
}
function update_option( $name, $value, $autoload = null ) {
	$GLOBALS['ap_options'][ $name ] = $value;
	return true;
}
function delete_option( $name ) {
	unset( $GLOBALS['ap_options'][ $name ] );
	return true;
}
function get_transient( $name ) {
	return isset( $GLOBALS['ap_transients'][ $name ] ) ? $GLOBALS['ap_transients'][ $name ] : false;
}
function set_transient( $name, $value, $ttl = 0 ) {
	$GLOBALS['ap_transients'][ $name ] = $value;
	return true;
}
function delete_transient( $name ) {
	unset( $GLOBALS['ap_transients'][ $name ] );
	return true;
}

function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}
function esc_html( $t ) {
	return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' );
}
function esc_attr( $t ) {
	return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' );
}
function esc_textarea( $t ) {
	return htmlspecialchars( (string) $t, ENT_QUOTES, 'UTF-8' );
}
/* WordPress drops a URL whose scheme is not allowed, and returns ''. The whole
   point of the plugin's `typed` versus `server` distinction depends on that
   behaviour, so the stub has it. */
function esc_url_raw( $url, $protocols = null ) {
	$url     = trim( (string) $url );
	$allowed = is_array( $protocols ) ? $protocols : array( 'http', 'https', 'mailto' );
	$scheme  = strtolower( (string) parse_url( $url, PHP_URL_SCHEME ) );
	if ( '' === $scheme || ! in_array( $scheme, $allowed, true ) ) {
		return '';
	}
	return $url;
}
function esc_url( $url ) {
	return esc_html( esc_url_raw( $url, array( 'http', 'https' ) ) );
}
function wp_unslash( $v ) {
	return is_array( $v ) ? array_map( 'stripslashes', $v ) : stripslashes( (string) $v );
}
function sanitize_text_field( $t ) {
	return trim( preg_replace( '/[\r\n\t]+/', ' ', strip_tags( (string) $t ) ) );
}
function sanitize_textarea_field( $t ) {
	return trim( strip_tags( (string) $t ) );
}
function sanitize_key( $t ) {
	return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $t ) );
}

class Ap_Roles {
	public function get_names() {
		return array(
			'administrator' => 'Administrator',
			'editor'        => 'Editor',
			'author'        => 'Author',
			'subscriber'    => 'Subscriber',
		);
	}
}
function wp_roles() {
	return new Ap_Roles();
}

function ap_add_user( $id, $login, $roles ) {
	$GLOBALS['ap_users'][ $id ] = new WP_User( $id, $login, $roles );
	return $GLOBALS['ap_users'][ $id ];
}
function get_user_by( $field, $value ) {
	foreach ( $GLOBALS['ap_users'] as $user ) {
		if ( 'id' === $field && (int) $user->ID === (int) $value ) {
			return $user;
		}
		if ( 'login' === $field && $user->user_login === $value ) {
			return $user;
		}
		if ( 'slug' === $field && $user->user_login === $value ) {
			return $user;
		}
		if ( 'email' === $field && $user->user_email === $value ) {
			return $user;
		}
	}
	return false;
}
/* One capability is all this plugin asks about. */
function user_can( $user, $cap ) {
	if ( ! ( $user instanceof WP_User ) || ! $user->exists() ) {
		return false;
	}
	return 'manage_options' === $cap && in_array( 'administrator', $user->roles, true );
}
function wp_get_current_user() {
	$id = $GLOBALS['ap_current'];
	return isset( $GLOBALS['ap_users'][ $id ] ) ? $GLOBALS['ap_users'][ $id ] : new WP_User( 0 );
}
function get_current_user_id() {
	return (int) $GLOBALS['ap_current'];
}
function current_user_can( $cap ) {
	return user_can( wp_get_current_user(), $cap );
}
function is_user_logged_in() {
	return wp_get_current_user()->exists();
}

function get_user_meta( $id, $key, $single = false ) {
	return isset( $GLOBALS['ap_meta'][ $id ][ $key ] ) ? $GLOBALS['ap_meta'][ $id ][ $key ] : '';
}
function update_user_meta( $id, $key, $value ) {
	$GLOBALS['ap_meta'][ $id ][ $key ] = $value;
	return true;
}
function delete_user_meta( $id, $key ) {
	unset( $GLOBALS['ap_meta'][ $id ][ $key ] );
	return true;
}

function admin_url( $path = '' ) {
	return 'https://example.com/wp-admin/' . ltrim( (string) $path, '/' );
}
function home_url( $path = '' ) {
	return 'https://example.com' . ( '' === $path ? '' : '/' . ltrim( (string) $path, '/' ) );
}
function plugins_url( $file, $plugin = '' ) {
	return 'https://example.com/wp-content/plugins/annotepage/' . $file;
}
function plugin_basename( $file ) {
	return 'annotepage/' . basename( $file );
}
/* BOTH SIGNATURES, because WordPress has both: add_query_arg( array, url ) and
   add_query_arg( key, value, url ). A stub with only the first turns the second
   into a query string with a numeric key, and the test then fails on a call
   that is perfectly correct -- which is how a stub sends somebody hunting for a
   bug in the code under test. */
function add_query_arg( $one, $two = '', $three = null ) {
	if ( is_array( $one ) ) {
		$args = $one;
		$url  = (string) $two;
	} else {
		$args = array( $one => $two );
		$url  = (string) $three;
	}
	$parts = array();
	foreach ( $args as $k => $v ) {
		$parts[] = rawurlencode( $k ) . '=' . rawurlencode( $v );
	}
	return $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . implode( '&', $parts );
}
function wp_nonce_url( $url, $action = -1 ) {
	return add_query_arg( array( '_wpnonce' => 'nonce' ), $url );
}
function wp_nonce_field( $action = -1 ) {
	echo '<input type="hidden" name="_wpnonce" value="nonce">';
}
function check_admin_referer( $action = -1 ) {
	return true;
}
function wp_safe_redirect( $url, $status = 302 ) {
	throw new Ap_Redirect( $url );
}
function wp_die( $message = '', $title = '', $args = array() ) {
	throw new Ap_Died( is_string( $message ) ? $message : 'died' );
}
function wp_enqueue_script() {}
function add_options_page() {}
function submit_button( $text = '', $type = '', $name = '', $wrap = true, $other = array() ) {
	echo '<button type="submit">' . esc_html( $text ) . '</button>';
}
function checked( $a, $b = true, $echo = true ) {
	$out = ( (string) $a === (string) $b ) ? ' checked' : '';
	if ( $echo ) {
		echo $out;
	}
	return $out;
}
function is_admin_bar_showing() {
	return true;
}
function get_current_screen() {
	return $GLOBALS['ap_screen'];
}

class Ap_Screen {
	public $id;
	public function __construct( $id ) {
		$this->id = $id;
	}
}

/* The admin bar, reduced to what it is here: a list of nodes. */
class Ap_Bar {
	public $nodes = array();
	public function add_node( $node ) {
		$this->nodes[ $node['id'] ] = $node;
	}
	public function has( $id ) {
		return isset( $this->nodes[ $id ] );
	}
	public function title( $id ) {
		return isset( $this->nodes[ $id ] ) ? $this->nodes[ $id ]['title'] : '';
	}
}

/* -------------------------------------------------------------------------
 * The plugin itself.
 * ---------------------------------------------------------------------- */

require_once dirname( __DIR__ ) . '/annotepage.php';

/* -------------------------------------------------------------------------
 * Assertions
 * ---------------------------------------------------------------------- */

$failures = array();
$count    = 0;

function ap_check( $what, $ok, $detail = '' ) {
	global $failures, $count;
	$count++;
	if ( ! $ok ) {
		$failures[] = $what . ( '' === $detail ? '' : "\n      " . $detail );
	}
}

function ap_reset( $options = array() ) {
	$GLOBALS['ap_options']    = $options;
	$GLOBALS['ap_transients'] = array();
	$GLOBALS['ap_meta']       = array();
	$GLOBALS['ap_users']      = array();
	$GLOBALS['ap_current']    = 0;
	ap_add_user( 1, 'boss', array( 'administrator' ) );
	ap_add_user( 2, 'ed', array( 'editor' ) );
	ap_add_user( 3, 'reader', array( 'subscriber' ) );
	ap_add_user( 4, 'boss2', array( 'administrator' ) );
}

function ap_as( $id ) {
	$GLOBALS['ap_current'] = $id;
}

/* The footer, run for real: what a visitor's page would carry. */
function ap_footer() {
	ob_start();
	annotepage_print_tag();
	return ob_get_clean();
}

function ap_post( array $fields ) {
	$_POST = $fields;
	try {
		annotepage_save();
		return 'no redirect';
	} catch ( Ap_Redirect $e ) {
		return $e->getMessage();
	} finally {
		$_POST = array();
	}
}

function ap_notice_of( $redirect ) {
	$query = parse_url( $redirect, PHP_URL_QUERY );
	parse_str( (string) $query, $out );
	return isset( $out['ap_notice'] ) ? $out['ap_notice'] : '';
}

/* -- 1. Activation, on a site where nothing has ever been set ------------- */

ap_reset();
annotepage_activate();
$after = annotepage_settings();

ap_check( 'activation left the server address empty, so the plugin does nothing '
	. 'until somebody types an address they have no way of knowing',
	ANNOTEPAGE_DEFAULT_SERVER === $after['server'], $after['server'] );
ap_check( 'activation drew no key, so a fresh install writes no tag',
	annotepage_is_key( $after['key'] ), '"' . $after['key'] . '"' );
ap_check( 'activation did not start in public mode', 'open' === $after['mode'], $after['mode'] );
ap_check( 'a fresh install shows the tool to more than administrators',
	'admins' === $after['audience'], $after['audience'] );
ap_check( 'activation left no greeting for the plugins screen',
	'1' === get_option( ANNOTEPAGE_GREETING ) );

ap_as( 1 );
ap_check( 'an administrator does not get the tag on the very first page load '
	. 'after activation -- which is the whole promise of this plugin',
	false !== strpos( ap_footer(), 'data-key="' . $after['key'] . '"' ), ap_footer() );
ap_check( 'the tag does not point at the relay activation chose',
	false !== strpos( ap_footer(), 'data-server="' . ANNOTEPAGE_DEFAULT_SERVER . '"' ) );
ap_check( 'the tag carries a version nobody declared',
	false === strpos( ap_footer(), 'data-version' ) );
ap_check( 'the tag is a module or not deferred, either of which leaves '
	. 'document.currentScript empty and the tool silent',
	false !== strpos( ap_footer(), 'defer></script>' )
	&& false === strpos( ap_footer(), 'type="module"' ) );

/* Two credentials in one tag are refused whole by the client, and it does not
   pick a winner. */
ap_check( 'the tag carries both a key and a project id',
	! ( false !== strpos( ap_footer(), 'data-key' ) && false !== strpos( ap_footer(), 'data-project' ) ) );

$drawn = $after['key'];

/* -- 2. Re-activation must not lose a project ---------------------------- */

annotepage_activate();
ap_check( 'activating again drew a second key over the first, which loses every '
	. 'note ever written on an operation nobody thinks of as destructive',
	$drawn === annotepage_settings()['key'] );

ap_reset( array( ANNOTEPAGE_OPTION => array(
	'server' => 'https://api.example.com/api.php', 'mode' => 'secure',
	'key' => '', 'project' => 'AAAAAAAAAAAAAAAAAAAAAA', 'audience' => 'admins',
) ) );
annotepage_activate();
$secure_after = annotepage_settings();
ap_check( 'activating a site that is in secure mode drew a key for it, silently '
	. 'moving it to another project',
	'' === $secure_after['key'] && 'AAAAAAAAAAAAAAAAAAAAAA' === $secure_after['project'],
	$secure_after['key'] . ' / ' . $secure_after['project'] );
ap_check( 'activation overwrote a server address that was already set',
	'https://api.example.com/api.php' === $secure_after['server'] );

/* -- 3. Who sees it ------------------------------------------------------ */

ap_reset();
annotepage_activate();

ap_as( 3 );
ap_check( 'a subscriber is served the key on a fresh install', '' === ap_footer() );
ap_as( 0 );
ap_check( 'a logged-out visitor is served the key on a fresh install', '' === ap_footer() );

$base = annotepage_settings();

$audiences = array(
	/* audience,     roles,             people, who sees it: 1 admin, 2 editor, 3 subscriber, 0 anonymous */
	array( 'admins',    array(),            array(),    array( 1 ) ),
	array( 'signed-in', array(),            array(),    array( 1, 2, 3 ) ),
	array( 'chosen',    array( 'editor' ),  array(),    array( 2 ) ),
	array( 'chosen',    array(),            array( 3 ), array( 3 ) ),
	array( 'chosen',    array( 'editor' ),  array( 3 ), array( 2, 3 ) ),
	array( 'everyone',  array(),            array(),    array( 0, 1, 2, 3 ) ),
);
foreach ( $audiences as $row ) {
	list( $audience, $roles, $people, $allowed ) = $row;
	update_option( ANNOTEPAGE_OPTION, array_merge( $base, array(
		'audience' => $audience, 'roles' => $roles, 'people' => $people,
	) ), true );
	foreach ( array( 0, 1, 2, 3 ) as $who ) {
		ap_as( $who );
		$got     = ( '' !== ap_footer() );
		$expects = in_array( $who, $allowed, true );
		ap_check( sprintf( 'audience "%s" (%d role(s), %d named) %s user %d',
			$audience, count( $roles ), count( $people ),
			$expects ? 'does not show the tag to' : 'shows the tag to', $who ),
			$got === $expects );
	}
}

/* -- 4. The switch each person has, for themselves ----------------------- */

update_option( ANNOTEPAGE_OPTION, array_merge( $base, array( 'audience' => 'admins' ) ), true );
ap_as( 1 );
update_user_meta( 1, ANNOTEPAGE_USER_OFF, '1' );
ap_check( 'switching it off for myself left it on my own pages', '' === ap_footer() );
ap_as( 4 );
ap_check( 'one administrator switching it off took it away from the other one',
	'' !== ap_footer() );
ap_as( 1 );
delete_user_meta( 1, ANNOTEPAGE_USER_OFF );
ap_check( 'switching it back on did not bring it back', '' !== ap_footer() );

/* -- 5. The admin bar ---------------------------------------------------- */

ap_as( 1 );
$bar = new Ap_Bar();
annotepage_admin_bar( $bar );
ap_check( 'the admin bar carries no annotepage item', $bar->has( 'annotepage' ) );
ap_check( 'the admin bar item has no switch', $bar->has( 'annotepage-switch' ) );
ap_check( 'the admin bar item has no link to the settings', $bar->has( 'annotepage-settings' ) );
ap_check( 'the admin bar item does not say what is being written',
	false !== strpos( $bar->title( 'annotepage-state' ), 'Written on every page' ),
	$bar->title( 'annotepage-state' ) );
ap_check( 'the admin bar says it is off while it is on',
	false === strpos( $bar->title( 'annotepage' ), 'off' ), $bar->title( 'annotepage' ) );

update_user_meta( 1, ANNOTEPAGE_USER_OFF, '1' );
$bar = new Ap_Bar();
annotepage_admin_bar( $bar );
ap_check( 'the admin bar does not say it is off for me when it is',
	false !== strpos( $bar->title( 'annotepage' ), 'off' ), $bar->title( 'annotepage' ) );
ap_check( 'the switch does not offer to turn it back on',
	false !== strpos( $bar->title( 'annotepage-switch' ), 'back on' ),
	$bar->title( 'annotepage-switch' ) );
delete_user_meta( 1, ANNOTEPAGE_USER_OFF );

ap_as( 3 );
$bar = new Ap_Bar();
annotepage_admin_bar( $bar );
ap_check( 'a subscriber the audience leaves out is shown an admin bar item for a '
	. 'tool they cannot see', ! $bar->has( 'annotepage' ) );

/* A subscriber the audience DOES include gets the item, and no link into
   wp-admin they are not allowed to open. */
update_option( ANNOTEPAGE_OPTION, array_merge( $base, array( 'audience' => 'signed-in' ) ), true );
$bar = new Ap_Bar();
annotepage_admin_bar( $bar );
ap_check( 'an included subscriber gets no admin bar item', $bar->has( 'annotepage' ) );
ap_check( 'a subscriber is offered a settings screen they cannot open',
	! $bar->has( 'annotepage-settings' ) );
ap_check( 'a subscriber cannot switch it off for themselves', $bar->has( 'annotepage-switch' ) );

/* -- 6. Saving ----------------------------------------------------------- */

ap_reset();
annotepage_activate();
ap_as( 1 );

$good = str_repeat( 'a', 43 );
$form = array(
	'ap_mode'     => 'open',
	'ap_audience' => 'signed-in',
	'ap_server'   => 'https://api.example.com/api.php',
	'ap_key'      => $good,
	'ap_version'  => '2026.9.12',
	'ap_people'   => 'ed, nobody-here',
	'ap_roles'    => array( 'editor', 'not-a-role' ),
);
$notice = ap_notice_of( ap_post( $form ) );
$saved  = annotepage_settings();
ap_check( 'a pasted key was not stored', $good === $saved['key'], $saved['key'] );
ap_check( 'the audience was not saved', 'signed-in' === $saved['audience'] );
ap_check( 'a role this site does not have was stored',
	array( 'editor' ) === $saved['roles'], implode( ',', $saved['roles'] ) );
ap_check( 'a named person was not resolved to their account',
	array( 2 ) === $saved['people'], implode( ',', $saved['people'] ) );
ap_check( 'the names that matched nothing were not kept for the screen to show',
	array( 'nobody-here' ) === get_transient( 'annotepage_unknown_1' ) );
ap_check( 'a misspelt username became the headline, where it can hide something '
	. 'that matters more', 'saved' === $notice, $notice );

/* AND IT IS STILL SAID. The headline is ranked by consequence; the name that
   matched nothing is printed beside whichever headline won. */
$_GET = array( 'ap_notice' => 'saved' );
ob_start();
annotepage_render();
$shown = ob_get_clean();
$_GET  = array();
ap_check( 'the name that matched no account was never shown to anybody',
	false !== strpos( $shown, 'nobody-here' ) );

/* The key field means what it says: empty means empty. It used to mean "keep
   the old one", which made the field unable to express "ask each reviewer". */
$notice = ap_notice_of( ap_post( array_merge( $form, array( 'ap_key' => '' ) ) ) );
ap_check( 'clearing the key field kept the old key, so the field cannot say '
	. '"no key here"', '' === annotepage_settings()['key'] );
ap_check( 'a site with no credential does not say the tag has stopped',
	'incomplete' === $notice, $notice );
ap_check( 'a site with no credential still writes a tag', '' === ap_footer() );

/* A key of the wrong length changes nothing at all. */
ap_post( array_merge( $form, array( 'ap_key' => $good ) ) );
$notice = ap_notice_of( ap_post( array_merge( $form, array( 'ap_key' => str_repeat( 'b', 42 ) ) ) ) );
ap_check( 'a 42-character key was accepted', $good === annotepage_settings()['key'] );
ap_check( 'a short key was not named as the problem', 'bad-key' === $notice, $notice );

/* An address that is not one is refused, and nothing else on the form is
   saved either -- a half-saved form is worse than a refused one. */
$notice = ap_notice_of( ap_post( array_merge( $form, array(
	'ap_server' => 'javascript:alert(1)', 'ap_version' => 'changed',
) ) ) );
ap_check( 'a javascript: address was not refused', 'bad-server' === $notice, $notice );
ap_check( 'a refused form saved the rest of its fields anyway',
	'2026.9.12' === annotepage_settings()['version'] );

/* Secure mode: the key does not transit, and it is not merely ignored -- it
   is not read, and what is stored is the id alone. */
$notice = ap_notice_of( ap_post( array(
	'ap_mode' => 'secure', 'ap_audience' => 'admins',
	'ap_server' => 'https://api.example.com/api.php',
	'ap_key' => $good, 'ap_project' => str_repeat( 'c', 22 ),
) ) );
$saved = annotepage_settings();
ap_check( 'a key posted in secure mode was stored', '' === $saved['key'], $saved['key'] );
ap_check( 'the project id posted in secure mode was not stored',
	str_repeat( 'c', 22 ) === $saved['project'] );
ap_check( 'the tag in secure mode carries a key',
	false === strpos( ap_footer(), 'data-key' ), ap_footer() );
ap_check( 'the tag in secure mode carries no project id',
	false !== strpos( ap_footer(), 'data-project="' . str_repeat( 'c', 22 ) . '"' ) );

/* The combination the site owner is allowed to choose, and must be told about. */
$notice = ap_notice_of( ap_post( array_merge( $form, array( 'ap_audience' => 'everyone' ) ) ) );
ap_check( 'putting the key on a page every visitor can open said nothing',
	'wide-open' === $notice, $notice );
$notice = ap_notice_of( ap_post( array(
	'ap_mode' => 'secure', 'ap_audience' => 'everyone',
	'ap_server' => 'https://api.example.com/api.php',
	'ap_project' => str_repeat( 'c', 22 ),
) ) );
ap_check( 'secure mode for everyone was warned about as if the key were exposed',
	'saved' === $notice, $notice );

/* Nobody without the capability writes what the whole site serves. */
ap_as( 3 );
$denied = false;
try {
	ap_post( $form );
} catch ( Ap_Died $e ) {
	$denied = true;
}
ap_check( 'a subscriber with a valid nonce changed the site-wide settings', $denied );
ap_as( 1 );

/* -- 7. The greeting on the plugins screen ------------------------------- */

ap_reset();
annotepage_activate();
ap_as( 1 );

function ap_greeting() {
	ob_start();
	annotepage_greeting();
	return ob_get_clean();
}

$GLOBALS['ap_screen'] = new Ap_Screen( 'dashboard' );
ap_check( 'the greeting turns up on screens it was not meant for', '' === ap_greeting() );

$GLOBALS['ap_screen'] = new Ap_Screen( 'plugins' );
$greeting             = ap_greeting();
ap_check( 'the plugins screen carries no greeting after activation', '' !== $greeting );
ap_check( 'the greeting does not link to the settings',
	false !== strpos( $greeting, 'options-general.php?page=annotepage' ) );
ap_check( 'the greeting cannot be dismissed',
	false !== strpos( $greeting, 'annotepage_dismiss' ) );
ap_check( 'the greeting does not say where the notes go',
	false !== strpos( $greeting, ANNOTEPAGE_DEFAULT_SERVER ) );
ap_check( 'the greeting does not say who can see it',
	false !== strpos( $greeting, 'administrators' ), $greeting );

ap_as( 3 );
ap_check( 'a subscriber is shown the greeting', '' === ap_greeting() );
ap_as( 1 );

$_GET = array( 'annotepage_dismiss' => '1' );
try {
	annotepage_dismiss();
} catch ( Ap_Redirect $e ) {
	/* where it sends them back to is not the point */
}
$_GET = array();
ap_check( 'dismissing the greeting did not remove it',
	false === get_option( ANNOTEPAGE_GREETING ) );
ap_check( 'the greeting came back after being dismissed', '' === ap_greeting() );

/* -- 8. The settings screen renders, and escapes ------------------------- */

ap_reset();
annotepage_activate();
ap_as( 1 );
update_option( ANNOTEPAGE_OPTION, array_merge( annotepage_settings(), array(
	'version' => '<script>alert(1)</script>',
) ), true );

ob_start();
annotepage_render();
$screen = ob_get_clean();

ap_check( 'the settings screen has no audience control', false !== strpos( $screen, 'name="ap_audience"' ) );
ap_check( 'the settings screen offers no key field', false !== strpos( $screen, 'name="ap_key"' ) );
ap_check( 'the settings screen offers no project id field', false !== strpos( $screen, 'name="ap_project"' ) );
ap_check( 'the settings screen lists no roles', false !== strpos( $screen, 'name="ap_roles[]"' ) );
ap_check( 'a stored value is printed into the page unescaped, which is a script '
	. 'this site runs in its own admin', false === strpos( $screen, '<script>alert(1)</script>' ) );
ap_check( 'the screen does not show the tag it writes',
	false !== strpos( $screen, 'cdn.jsdelivr.net/npm/annotepage-client@2' ) );

/* -- 9. What counts as a server address ---------------------------------
 *
 * BOTH DIRECTIONS, and the accepting one matters more. A validator that only
 * proves it refuses the malformed address can be tightened, on some later
 * pass, into one that refuses every self-hosted install as well -- and that
 * failure is silent, on an intranet, where nobody is watching a screen. So
 * each shape a real install legitimately uses is named here, one by one, and
 * narrowing the rule now has to break a test with the address written in it.
 * ---------------------------------------------------------------------- */

$legitimate = array(
	'https://api.annotepage.com/api.php',
	'http://localhost',
	'http://localhost/api.php',
	'https://127.0.0.1:8443/api.php',
	'https://intranet/api.php',                    /* an internal host, no dot */
	'https://[::1]:8443/api.php',                  /* IPv6, in brackets */
	'https://[2001:db8::1]/api.php',
	'http://intranet:8080/annotepage/api.php',      /* with a port, and nested */
	'https://example.com:8080/notes/api.php?v=2',
	'https://user:pass@example.com/api.php',
	'https://example.com',
	'https://example.com/',
	'https://example.com/a%20b/api.php',
);
foreach ( $legitimate as $address ) {
	ap_check( 'a legitimate server address is refused, which breaks a real '
		. 'self-hosted install and says nothing: ' . $address,
		annotepage_is_server( $address ) );
}

$malformed = array(
	/* THE ONE THIS SECTION EXISTS FOR. A paste that landed inside the address
	   already in the field: parse_url() finds a scheme and a host in it, and a
	   check that asks no more than that says yes. */
	'https://api.annotephttps://api.annotepage.com/api.php',
	'javascript:alert(1)',
	'ftp://example.com/api.php',
	'/api.php',
	'api.annotepage.com/api.php',
	'https://',
	'https:///api.php',
	'',
);
foreach ( $malformed as $address ) {
	ap_check( 'a malformed server address is accepted: '
		. ( '' === $address ? '(empty)' : $address ),
		! annotepage_is_server( $address ) );
}

/* And the whole way through, not merely the judge on its own: a tag is never
   written for an address the judge refuses. */
ap_reset();
annotepage_activate();
update_option( ANNOTEPAGE_OPTION, array_merge( annotepage_settings(), array(
	'server' => 'https://api.annotephttps://api.annotepage.com/api.php',
) ), true );
ap_as( 1 );
ap_check( 'a server address nobody could have meant still reaches the page',
	'' === ap_footer(), ap_footer() );

/* -- 10. The derivation PHP does, for the screen to show ----------------- */

$vector = 'UHoSPQTpSizB8GmgSaXlzoGHvxjA9_ZtgfXau7VHGts';
ap_check( 'the project id PHP derives is not 22 base64url characters',
	annotepage_is_project( annotepage_project_from_key( $vector ) ),
	annotepage_project_from_key( $vector ) );
ap_check( 'a key of the wrong shape derived something anyway',
	'' === annotepage_project_from_key( 'nope' ) );

/* Printed for tools/check-wordpress.mjs to compare against the MCP's own
   implementation: two implementations of one derivation, and the comparison is
   the only thing that keeps them equal. */
echo 'DERIVED ' . $vector . ' ' . annotepage_project_from_key( $vector ) . "\n";

/* -- Verdict ------------------------------------------------------------- */

if ( $failures ) {
	echo "wordpress harness:\n";
	foreach ( $failures as $f ) {
		echo '    ' . $f . "\n";
	}
	echo count( $failures ) . ' of ' . $count . " checks failed\n";
	exit( 1 );
}
echo 'wordpress harness: ' . $count . " checks, all passed\n";
