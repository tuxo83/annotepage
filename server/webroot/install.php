<?php
/**
 * install.php -- THE FALLBACK ROUTE: the directory is already here, open this
 * page.
 *
 * THE ROUTE IS annotepage-install.php: one file, dropped anywhere on the host
 * and opened in a browser, which downloads the rest and verifies every file
 * against the published MANIFEST before writing it. This file is what installs
 * a server on a host that cannot make an outbound HTTPS request at all -- no
 * curl, no allow_url_fopen -- which is common on cheap hosting and is why the
 * copy-the-directory route stays supported instead of being replaced. See
 * INSTALL.md.
 *
 * IT IS TWENTY LINES. The installation itself -- the environment report, the
 * one form, the data file placed and PROVEN unreachable over HTTP, the
 * configuration written, the offer to delete this file -- is
 * internal/install-flow.php, and the bootstrap calls exactly the same code.
 * There is one installation, and two doors into it; the day they were two
 * copies of the same page is the day one of them started being wrong.
 *
 * IT IS NOT IN THE MANIFEST, deliberately: see tools/build-server-manifest.mjs.
 * A file listed there is a file the updater restores, and an installer that
 * comes back after being deleted is the opposite of what its last screen asks
 * you to do. internal/install-flow.php IS listed, and may be: under internal/
 * it answers 404 to anybody who calls it and refuses to run at all without the
 * constant this file sets, so restoring it puts back inert code and not an open
 * door.
 */

// --- 1. PHP version -------------------------------------------------------
// First executable statement, PHP 5.4 syntax only, exactly as in api.php: the
// version test below would never be reached if this file did not compile, and
// the version on the command line is not necessarily the one served.

if (!defined('PHP_VERSION_ID') || PHP_VERSION_ID < 70400) {
    header('Content-Type: text/plain; charset=utf-8');
    if (function_exists('http_response_code')) {
        http_response_code(500);
    }
    echo "annotepage requires PHP 7.4 or newer.\n";
    echo 'Version served by this web server: '
        . (defined('PHP_VERSION') ? PHP_VERSION : 'unknown') . "\n";
    echo "Ask the host to raise it; there is nothing to install until then.\n";
    exit;
}

define('AP_INTERNAL', 1);

// --- 2. The control endpoint ----------------------------------------------
//
// The installer fetches this file over HTTP before it fetches anything else,
// to establish that it can reach its own web server and that the URL it
// computed maps to this directory. Both are measured, neither is assumed.
//
// It is answered before ANYTHING else happens -- no file required, no
// configuration read, no side effect of any kind -- and the token is reduced
// to letters and digits before being echoed, so this cannot be turned into a
// reflector for someone else's content.
//
// It is written out here, and not called from install-flow.php, for that one
// reason: requiring a file to answer it would be a side effect. The bootstrap
// carries the same eleven lines, and for the same reason -- when it answers
// this, the release is not on disk yet.

if (isset($_GET['probe'])) {
    $token = preg_replace('/[^A-Za-z0-9]/', '', (string) $_GET['probe']);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    echo 'annotepage-install-probe ' . substr($token, 0, 64) . "\n";
    exit;
}

// --- 3. The installation --------------------------------------------------

require __DIR__ . '/internal/install-flow.php';

ap_i_run(array(
    'here' => __DIR__,
    'self' => __FILE__,
));
