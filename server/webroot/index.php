<?php
/**
 * index.php -- WHAT A BARE VISIT TO THIS DIRECTORY GETS.
 *
 * Without this file the answer comes from the web server: a directory listing
 * naming every file of the tool, or a 403 whose wording belongs to somebody
 * else. Neither is an answer, and neither is ours to control.
 *
 * It does two things and nothing more:
 *
 *   - it applies `forward_root_to` WHEN THE OPERATOR SET ONE. That key is
 *     empty by default and ships empty; a relay operator who points it at the
 *     page explaining what the thing is turns a dead end into an answer. It is
 *     a 302, never a 301: a permanent redirect is cached by browsers and would
 *     outlive them changing their mind. See internal/config.php for the
 *     validation, which happens before the value reaches a Location header;
 *   - it redirects plain http to https, like every entry point, unless
 *     `allow_plain_http` says otherwise. That happens BEFORE the forward
 *     below, so a bare visit is never sent on over http;
 *   - otherwise it answers 404, in text, saying nothing about the
 *     installation. The one exception is the fresh-upload window -- install.php
 *     present and no configuration yet -- where it names install.php. That
 *     reveals nothing: whoever probes the directory finds install.php by
 *     asking for it, and the operator who just uploaded the files is the
 *     person actually standing here.
 *
 * IT NEVER TOUCHES api.php's BUSINESS. No action, no note, no diagnostic
 * passes through this file, and no redirect ever applies to them: a redirect
 * on an API endpoint breaks every caller, and a browser that follows it
 * silently turns that into an hour of confusion.
 */

if (!defined('PHP_VERSION_ID') || PHP_VERSION_ID < 70400) {
    // Same first statement as api.php, and for the same reason: the version on
    // the command line is not necessarily the one the web server serves.
    header('Content-Type: text/plain; charset=utf-8');
    echo "annotepage requires PHP 7.4 or newer.\n";
    exit;
}

define('AP_INTERNAL', 1);

require __DIR__ . '/internal/errors.php';
require __DIR__ . '/internal/config.php';

// https FIRST, before the courtesy redirect below and before anything is
// written: a bare visit is answered over http only where the operator asked
// for that. It is a 308 towards the same URL, it detects the scheme rather
// than trusting $_SERVER['HTTPS'] alone, and `allow_plain_http` turns it off
// -- all three in internal/config.php.
ap_require_https();

$forward = null;
try {
    // A configuration that will not load must not turn a courtesy page into a
    // 500. There is a place that reports that failure in full, and it is
    // api.php?action=diagnostic.
    $forward = ap_forward_root_to(ap_config());
} catch (Exception $e) {
    $forward = null;
} catch (Throwable $e) {
    $forward = null;
}

header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

if ($forward !== null) {
    http_response_code(302);
    header('Location: ' . $forward);
    header('Content-Type: text/plain; charset=utf-8');
    echo $forward . "\n";
    exit;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo "404\n";

if (is_file(__DIR__ . '/install.php') && !is_file(__DIR__ . '/internal/config-local.php')) {
    echo "\nannotepage is uploaded here but not configured yet. Open install.php "
        . "in this directory.\n";
}
