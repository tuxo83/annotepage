<?php
/**
 * install.php -- UPLOAD THE DIRECTORY, OPEN THIS URL, DONE.
 *
 * ONE PAGE. ONE FORM. ONE BUTTON. Not a wizard, no step counter, no screen
 * that hides the next one. Everything is visible at once, every field carries
 * a default that already works, and somebody who reads nothing and clicks the
 * button gets a correct installation.
 *
 * WHAT IT ASKS: the storage (SQLite, selected; MySQL behind a closed
 * <details>) and automatic updates (a checkbox, off, with what turning it on
 * costs written beside it). Nothing else. Retention, rate limits, origins and
 * the courtesy redirect have defaults that work and belong in the
 * configuration file, where a comment can explain them -- not in front of
 * somebody installing.
 *
 * NO JAVASCRIPT. The MySQL fields are revealed by a <details> element, which
 * the browser opens on its own. A form that needs script to be fillable is a
 * form that does not work on the machine of the one person who has to use it.
 *
 * WHAT IT PROVES RATHER THAN ASSUMES
 *
 * A SQLite file inside the web root can be FETCHED OVER HTTP. An .htaccess
 * denying it does nothing under nginx, and plenty of cheap hosting is nginx.
 * The notes are encrypted, so the damage is bounded -- but page indexes,
 * timestamps and volumes leak, and in plain mode everything leaks.
 *
 * So this file does not reason about it. It creates the database, then asks
 * the web server for that file's own URL over HTTP and reads the status code.
 * Anything other than a refusal and it deletes what it created and writes no
 * configuration at all. Before that it runs a CONTROL request against itself,
 * because a probe that cannot reach the server proves nothing and must not be
 * mistaken for a clean result.
 *
 * WHAT IT REFUSES TO DO
 *
 *   - overwrite an existing internal/config-local.php. Ever. If one is there,
 *     the form is not even shown: that file holds somebody's projects and
 *     their storage, and a second run must not be able to cost them either;
 *   - finish an installation whose data file it could not prove unreachable;
 *   - stay behind quietly. It offers to delete itself and reports honestly
 *     whether it managed. An installer that stays reachable AND writable on a
 *     live server is a liability, and this one writes a configuration file.
 *
 * IT IS NOT IN THE MANIFEST, deliberately: see tools/build-server-manifest.mjs.
 * A file listed there is a file the updater restores, and an installer that
 * comes back after being deleted is the opposite of what this comment is for.
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
define('AP_FORMAT', 2);

$AP_HERE        = __DIR__;
$AP_CONFIG_PATH = $AP_HERE . '/internal/config-local.php';

// --- 2. The control endpoint ----------------------------------------------
//
// The installer fetches this file over HTTP before it fetches anything else,
// to establish that it can reach its own web server and that the URL it
// computed maps to this directory. Both are measured, neither is assumed.
//
// It is answered before ANYTHING else happens -- no configuration read, no
// file written, no side effect of any kind -- and the token is reduced to
// letters and digits before being echoed, so this cannot be turned into a
// reflector for someone else's content.

if (isset($_GET['probe'])) {
    $token = preg_replace('/[^A-Za-z0-9]/', '', (string) $_GET['probe']);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    echo 'annotepage-install-probe ' . substr($token, 0, 64) . "\n";
    exit;
}

require __DIR__ . '/internal/errors.php';
require __DIR__ . '/internal/config.php';

// --- 3. Small helpers ------------------------------------------------------

/** Everything that reaches the page goes through this. No exception. */
function ap_i_h($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function ap_i_version()
{
    $path = __DIR__ . '/VERSION';
    $read = is_readable($path) ? trim((string) file_get_contents($path)) : '';
    return preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $read) ? $read : 'unknown';
}

/**
 * The URL of the directory this file sits in, with a trailing slash.
 *
 * Built from what the request itself carries. HTTP_HOST is written by the
 * client and could be a lie -- which is exactly why nothing here trusts the
 * result: it is used to make a request, and it is the ANSWER to that request
 * that decides. A wrong host makes the control probe fail, and a failed
 * control probe stops the installation instead of blessing it.
 */
function ap_i_base_url()
{
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443)
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO'])
            && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $host = isset($_SERVER['HTTP_HOST']) && $_SERVER['HTTP_HOST'] !== ''
        ? (string) $_SERVER['HTTP_HOST']
        : (isset($_SERVER['SERVER_NAME']) ? (string) $_SERVER['SERVER_NAME'] : 'localhost');
    $host = preg_replace('/[^A-Za-z0-9\.\-\:\[\]]/', '', $host);
    $dir = str_replace('\\', '/', dirname(
        isset($_SERVER['SCRIPT_NAME']) ? (string) $_SERVER['SCRIPT_NAME'] : '/install.php'));
    if ($dir === '.' || $dir === '/') {
        $dir = '';
    }
    return ($https ? 'https://' : 'http://') . $host . $dir . '/';
}

/**
 * The document root MEASURED, not read from DOCUMENT_ROOT.
 *
 * This file's URL path and this file's filesystem path share a suffix. What is
 * left when the suffix is removed is the directory the web server maps '/' to,
 * whatever DOCUMENT_ROOT happens to say -- and DOCUMENT_ROOT is empty, wrong
 * or a symlink often enough that the whole "outside the document root" claim
 * cannot be allowed to rest on it.
 *
 * Returns null when the two cannot be matched, and null is then treated as
 * "assume the worst", which puts the data file in a guarded directory inside
 * and probes it like any other.
 */
function ap_i_measured_document_root()
{
    $here = str_replace('\\', '/', realpath(__DIR__));
    $urlDir = str_replace('\\', '/', dirname(
        isset($_SERVER['SCRIPT_NAME']) ? (string) $_SERVER['SCRIPT_NAME'] : '/install.php'));
    $urlDir = rtrim($urlDir, '/');
    if ($here === '' || $here === false) {
        return null;
    }
    if ($urlDir === '' || $urlDir === '.') {
        return $here;
    }
    if (substr($here, -strlen($urlDir)) !== $urlDir) {
        return null;
    }
    $root = substr($here, 0, strlen($here) - strlen($urlDir));
    return $root === '' ? '/' : rtrim($root, '/');
}

/** Is $path under $root? Both are compared as real paths. */
function ap_i_under($path, $root)
{
    if ($root === null || $root === '') {
        return null;
    }
    $real = realpath(is_file($path) ? $path : (is_dir($path) ? $path : dirname($path)));
    if ($real === false) {
        return null;
    }
    $root = rtrim(str_replace('\\', '/', $root), '/') . '/';
    return strpos(str_replace('\\', '/', $real) . '/', $root) === 0;
}

/**
 * One HTTP request, status code and first bytes of the body.
 *
 * CERTIFICATE VERIFICATION IS OFF ON THIS REQUEST, and it is the only place in
 * this project where that is true, so it is written down: we are not fetching
 * a secret and we are not trusting the content. We are asking one question --
 * "does this URL hand out our database file?" -- of a server on the other end
 * of a loopback, which on a staging box very often carries a self-signed
 * certificate. Refusing that certificate would turn "I could not check" into
 * "it looked fine", which is the failure mode this whole file exists to avoid.
 * The updater, which DOES trust what it downloads, verifies; see update.php.
 *
 * @return array status (int|null), body (string), error (string|null),
 *               transport (string)
 */
function ap_i_fetch($url, $timeout = 6)
{
    $out = array('status' => null, 'body' => '', 'error' => null, 'transport' => 'none');

    if (function_exists('curl_init')) {
        $out['transport'] = 'curl';
        $handle = curl_init($url);
        curl_setopt_array($handle, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_USERAGENT      => 'annotepage-install',
            // 64 KiB is far more than any refusal page and enough to recognise
            // a database file: its first sixteen bytes are the giveaway.
            CURLOPT_RANGE          => '0-65535',
        ));
        $body = curl_exec($handle);
        if ($body === false) {
            $out['error'] = curl_error($handle);
        } else {
            $out['body'] = (string) $body;
            $out['status'] = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        }
        curl_close($handle);
        return $out;
    }

    if (ini_get('allow_url_fopen')) {
        $out['transport'] = 'allow_url_fopen';
        $context = stream_context_create(array(
            'http' => array(
                'timeout'         => $timeout,
                'ignore_errors'   => true,
                'follow_location' => 0,
                'user_agent'      => 'annotepage-install',
            ),
            'ssl' => array('verify_peer' => false, 'verify_peer_name' => false),
        ));
        $body = @file_get_contents($url, false, $context, 0, 65536);
        if (isset($http_response_header) && is_array($http_response_header)) {
            foreach ($http_response_header as $line) {
                if (preg_match('#^HTTP/[0-9.]+\s+([0-9]{3})#', $line, $m)) {
                    $out['status'] = (int) $m[1];
                }
            }
        }
        if ($body === false && $out['status'] === null) {
            $out['error'] = 'the request could not be made';
        } else {
            $out['body'] = (string) $body;
        }
        return $out;
    }

    $out['error'] = 'this PHP has neither curl nor allow_url_fopen, '
        . 'so nothing can be checked over HTTP';
    return $out;
}

/**
 * Is this answer acceptable?
 *
 * TWO CRITERIA, and the difference between them is not a softening.
 *
 * For the EXACT URL of the file -- the one we measured really maps to it -- the
 * answer has to be a refusal: 401, 403, 404 or 410. A 200 does not pass
 * whatever the body, because something is serving that path and the next
 * configuration change decides what comes out of it.
 *
 * For a GUESSED URL -- the address a crawler would try, which on this
 * installation maps to nothing -- the criterion is only that the file itself
 * must not come back. Sites answer 200 to unknown paths all the time; a
 * catch-all page is a routing decision, not a leak, and refusing to install
 * over one would be an installer that cries wolf.
 *
 * The first sixteen bytes of every SQLite file are "SQLite format 3\0". If they
 * come back, it is a leak whatever status dressed it up, on any URL.
 */
function ap_i_answer_is_safe(array $answer, $exact)
{
    if (strpos($answer['body'], 'SQLite format 3') !== false) {
        return false;
    }
    if (!$exact) {
        return true;
    }
    return in_array($answer['status'], array(401, 403, 404, 410), true);
}

// --- 4. The environment report ---------------------------------------------
//
// Each line says what it MEANS. A tick that the reader has to interpret is a
// tick that tells them nothing, and the person opening this page is usually
// the person who cannot ask anybody.

function ap_i_environment($here)
{
    $lines = array();

    $lines[] = array('PHP version', PHP_VERSION,
        PHP_VERSION_ID >= 70400,
        'The version the WEB SERVER runs, which is not always the one on the '
        . 'command line. 7.4 or newer is required.');

    $lines[] = array('PHP interface', PHP_SAPI, true,
        'How PHP is plugged into the web server. It decides nothing here; it is '
        . 'the first thing a host asks you.');

    $lines[] = array('pdo_sqlite', extension_loaded('pdo_sqlite') ? 'present' : 'MISSING',
        extension_loaded('pdo_sqlite'),
        'The default storage: one file, no database to create. Compiled into PHP '
        . 'on nearly every host. Without it, choose MySQL below.');

    $lines[] = array('pdo_mysql', extension_loaded('pdo_mysql') ? 'present' : 'absent',
        true,
        'Needed ONLY if you choose MySQL. Its absence is not a problem otherwise.');

    $lines[] = array('mbstring', extension_loaded('mbstring') ? 'present' : 'MISSING',
        extension_loaded('mbstring'),
        'Counts characters rather than bytes when the server applies its length '
        . 'bounds. Without it an accented remark is measured wrong.');

    $lines[] = array('json', extension_loaded('json') ? 'present' : 'MISSING',
        extension_loaded('json'),
        'The client speaks JSON. Without it nothing answers at all.');

    $writable = is_writable($here);
    $lines[] = array('This directory', $writable ? 'writable' : 'read-only',
        true,
        $writable
            ? 'The installer can write internal/config-local.php here, and a data '
              . 'file if it has nowhere better. Read-only is SAFER once installed.'
            : 'The installer cannot write the configuration file here. Grant write '
              . 'permission to the user PHP runs as, install, then take it away again.');

    // OUTBOUND HTTPS. One real request, short timeout, and it costs nothing to
    // anybody who never turns automatic updates on -- it only decides whether
    // that checkbox can work at all.
    $reach = ap_i_fetch('https://raw.githubusercontent.com/', 4);
    $ok = $reach['status'] !== null;
    $lines[] = array('Outbound HTTPS',
        $ok ? 'works (' . $reach['transport'] . ')' : 'no way out',
        true,
        $ok
            ? 'This server can fetch over HTTPS. That is what automatic updates need; '
              . 'nothing else here uses it.'
            : 'This server cannot reach the outside. Everything works; only automatic '
              . 'updates are impossible, and this page will not pretend otherwise.');

    return array($lines, $ok);
}

// --- 5. Where the data file goes -------------------------------------------

/**
 * Picks a location, in the order of preference the threat dictates.
 *
 *   1. OUTSIDE the document root, when a writable directory can be found
 *      there. No URL maps to it, so there is nothing to defeat;
 *   2. otherwise INSIDE, in a directory with a name nobody can guess, holding
 *      its own .htaccess and an index.php that exits. Second best, and it is
 *      second best because both of those can be ignored by the server.
 *
 * Whichever it picks, the caller probes the result over HTTP. This function
 * chooses; it does not conclude.
 */
function ap_i_pick_location($here, $docRoot)
{
    if ($docRoot !== null && ap_i_under($here, $docRoot) === true) {
        $parent = dirname($docRoot);
        // A document root at '/' has no usable parent, and writing into '/' is
        // not a plan. Fall through to the guarded directory inside.
        if ($parent !== '' && $parent !== '/' && $parent !== $docRoot && is_dir($parent)) {
            $candidate = $parent . '/annotepage-data';
            $usable = (is_dir($candidate) && is_writable($candidate))
                || (!is_dir($candidate) && is_writable($parent));
            if ($usable && ap_i_under($candidate, $docRoot) !== true) {
                return array(
                    'directory' => $candidate,
                    'file'      => $candidate . '/notes.sqlite',
                    'placement' => 'outside',
                    'why'       => 'one level above the document root, where no URL '
                                   . 'reaches it',
                );
            }
        }
    }

    // random_bytes, not mt_rand: this name is the only thing standing between
    // the file and a crawler that guesses directory names, on the installations
    // that had nowhere else to go.
    $directory = $here . '/ap-data-' . bin2hex(random_bytes(8));
    return array(
        'directory' => $directory,
        'file'      => $directory . '/notes.sqlite',
        'placement' => 'inside',
        'why'       => 'inside the served directory -- no writable directory was '
                       . 'found above the document root -- under an unguessable name, '
                       . 'with its own .htaccess and index.php',
    );
}

/**
 * Every URL under which the data file might conceivably be served, each marked
 * `exact` or not -- see ap_i_answer_is_safe() for what the mark decides.
 *
 * EXACT means we measured that this URL maps to that file. It is the address
 * the browser of anyone who knows where to look would use. GUESSED means the
 * address somebody probing the site would try, which on this installation maps
 * to nothing: it costs one request and removes one assumption.
 */
function ap_i_probe_urls($file, $here, $docRoot, $baseUrl)
{
    $urls = array();
    $file = str_replace('\\', '/', $file);
    $directory = dirname($file);

    $siteRootUrl = $docRoot === null ? null : ap_i_site_root_url($here, $docRoot, $baseUrl);
    if ($siteRootUrl !== null) {
        $root = rtrim(str_replace('\\', '/', $docRoot), '/') . '/';
        if (strpos($file, $root) === 0) {
            $urls[$siteRootUrl . substr($file, strlen($root))] = true;
        }
        $guess = $siteRootUrl . basename($directory) . '/' . basename($file);
        if (!isset($urls[$guess])) {
            $urls[$guess] = false;
        }
    }

    $hereSlashed = rtrim(str_replace('\\', '/', $here), '/') . '/';
    if (strpos($file, $hereSlashed) === 0) {
        // The file is inside the served directory, so both of these are exact:
        // the file's own URL, and the directory's -- a listing there would name
        // the file to anybody who asked.
        $urls[$baseUrl . substr($file, strlen($hereSlashed))] = true;
        $urls[$baseUrl . basename($directory) . '/'] = true;
    }

    $out = array();
    foreach ($urls as $url => $exact) {
        $out[] = array('url' => $url, 'exact' => $exact);
    }
    return $out;
}

/** The URL of the site's root, derived from the measured mapping, or null. */
function ap_i_site_root_url($here, $docRoot, $baseUrl)
{
    $here = rtrim(str_replace('\\', '/', realpath($here)), '/');
    $root = rtrim(str_replace('\\', '/', $docRoot), '/');
    if ($root === '' || strpos($here . '/', $root . '/') !== 0) {
        return null;
    }
    $suffix = substr($here, strlen($root));       // '' or '/notes'
    $base = rtrim($baseUrl, '/');                  // 'https://host/notes'
    if ($suffix === '') {
        return $base . '/';
    }
    if (substr($base, -strlen($suffix)) !== $suffix) {
        return null;
    }
    return substr($base, 0, strlen($base) - strlen($suffix)) . '/';
}

// --- 6. Writing the configuration ------------------------------------------

/**
 * Builds internal/config-local.php.
 *
 * It says it was generated, when, and by what. That matters more than it
 * looks: the next person to open this file has to know whether they are
 * reading somebody's decisions or a machine's defaults, and whether editing it
 * is safe. It is -- nothing rewrites it, the updater cannot even name it.
 *
 * `projects` is left EMPTY on purpose and the block to paste is right there in
 * a comment. The project id does not exist yet: it is derived from a salt the
 * browser generates, and the client's setup screen hands it over the first time
 * somebody opens an annotated page. Inventing one here would produce an
 * installation that answers about notes nobody can decrypt.
 */
function ap_i_config_text(array $values)
{
    $q = function ($s) {
        return "'" . str_replace(array('\\', "'"), array('\\\\', "\\'"), (string) $s) . "'";
    };

    $storage = $values['storage'];
    $text  = "<?php\n";
    $text .= "/**\n";
    $text .= " * config-local.php -- GENERATED FILE.\n";
    $text .= " *\n";
    $text .= " * Written by annotepage install.php " . $values['version'] . "\n";
    $text .= " * on " . gmdate('Y-m-d\TH:i:sP') . " (UTC).\n";
    $text .= " *\n";
    $text .= " * EDIT IT FREELY. Nothing rewrites it: the updater cannot even name it,\n";
    $text .= " * and install.php refuses to run while it exists. Every key that is not\n";
    $text .= " * here keeps the default from internal/config.php, which is where each\n";
    $text .= " * one is documented.\n";
    $text .= " *\n";
    $text .= " * THE SALT IS NOT HERE AND NEVER WILL BE. It is generated in the browser,\n";
    $text .= " * over 256 bits, and the server never receives it in any form. What goes\n";
    $text .= " * below is the PROJECT ID, which descends from it and does not lead back.\n";
    $text .= " */\n\n";
    $text .= "if (!defined('AP_INTERNAL')) {\n    http_response_code(404);\n    exit;\n}\n\n";
    $text .= "return array(\n\n";
    $text .= "    // Nothing answers until this is true.\n";
    $text .= "    'active' => true,\n\n";
    $text .= "    // This server sits on the site under review, behind the same access\n";
    $text .= "    // restriction as it. Change to 'relay' only on a machine serving\n";
    $text .= "    // several sites -- see internal/config.php for what that changes.\n";
    $text .= "    'deployment' => 'self-hosted',\n\n";

    if ($storage === 'sqlite') {
        $text .= "    // ONE FILE, no database server. The path was chosen by the\n";
        $text .= "    // installer, which then requested it over HTTP and confirmed the\n";
        $text .= "    // web server refuses to serve it.\n";
        $text .= "    'storage'  => 'sqlite',\n";
        $text .= "    'database' => array(\n";
        $text .= "        'file' => " . $q($values['file']) . ",\n";
        $text .= "    ),\n\n";
    } else {
        $text .= "    // MySQL. Each value may also be written as\n";
        $text .= "    // array('file' => '/absolute/path'), which READS the secret from a\n";
        $text .= "    // file dropped outside the web root instead of holding it here.\n";
        $text .= "    'storage'  => 'mysql',\n";
        $text .= "    'database' => array(\n";
        $text .= "        'host'     => " . $q($values['host']) . ",\n";
        $text .= "        'port'     => " . (int) $values['port'] . ",\n";
        $text .= "        'name'     => " . $q($values['name']) . ",\n";
        $text .= "        'user'     => " . $q($values['user']) . ",\n";
        $text .= "        'password' => " . $q($values['password']) . ",\n";
        $text .= "    ),\n\n";
    }

    $text .= "    // THE PROJECTS. Empty until you have one, and you will have one the\n";
    $text .= "    // first time somebody opens an annotated page: the client generates\n";
    $text .= "    // the salt in the browser and shows you the id and the block to paste\n";
    $text .= "    // here. The server does not compute that id, it recognises it.\n";
    $text .= "    //\n";
    $text .= "    // 'projects' => array(\n";
    $text .= "    //     '<the 22 characters the setup screen shows>' => array(\n";
    $text .= "    //         'origins' => array('https://www.example.com'),\n";
    $text .= "    //         'mode'    => 'encrypted',\n";
    $text .= "    //     ),\n";
    $text .= "    // ),\n";
    $text .= "    'projects' => array(),\n\n";

    if ($values['auto_update']) {
        $text .= "    // AUTOMATIC UPDATES, turned on at install time. The code directory\n";
        $text .= "    // must be writable by the user PHP runs as, and from that moment\n";
        $text .= "    // any file-writing bug anywhere on this account becomes permanent\n";
        $text .= "    // code execution. Setting this back to false does NOT undo it: the\n";
        $text .= "    // permission stays until somebody takes it away.\n";
        $text .= "    'auto_update' => true,\n\n";
    } else {
        $text .= "    // Automatic updates are OFF, which is the safe state: this server\n";
        $text .= "    // never rewrites its own code from a web request. `php\n";
        $text .= "    // internal/update.php` does the same thing from a shell or cron,\n";
        $text .= "    // with the directory writable by YOU and not by the web server.\n";
        $text .= "    'auto_update' => false,\n\n";
    }

    $text .= "    // WHERE A BARE VISIT GOES. Empty: a visit to this directory with no\n";
    $text .= "    // path gets a 404 and api.php is unaffected either way. Put an\n";
    $text .= "    // absolute http(s) URL here and such a visit is sent there with a 302\n";
    $text .= "    // -- what a public relay wants, so somebody landing on the bare host\n";
    $text .= "    // reaches a page explaining what the thing is instead of nothing.\n";
    $text .= "    'forward_root_to' => '',\n";
    $text .= ");\n";

    return $text;
}

// --- 7. The page shell -----------------------------------------------------

function ap_i_head($title)
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    // No script anywhere on this page, and the header says so: an installer is
    // the last place that should be able to run somebody else's code.
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; "
        . "form-action 'self'; base-uri 'none'");
    echo "<!doctype html>\n<html lang=\"en\">\n<head>\n";
    echo "<meta charset=\"utf-8\">\n";
    echo "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n";
    echo "<meta name=\"robots\" content=\"noindex, nofollow\">\n";
    echo '<title>' . ap_i_h($title) . "</title>\n";
    echo "<style>\n"
        . "  :root { color-scheme: light dark; }\n"
        . "  body { margin: 0 auto; padding: 2rem 1.25rem 6rem; max-width: 46rem;\n"
        . "         font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }\n"
        . "  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }\n"
        . "  h2 { font-size: 1.05rem; margin: 2.25rem 0 .5rem; }\n"
        . "  p.lede { margin: 0 0 2rem; opacity: .8; }\n"
        . "  table { border-collapse: collapse; width: 100%; }\n"
        . "  td { padding: .45rem .5rem .45rem 0; vertical-align: top;\n"
        . "       border-bottom: 1px solid rgba(128,128,128,.25); }\n"
        . "  td.k { white-space: nowrap; font-weight: 600; width: 11rem; }\n"
        . "  td.v { white-space: nowrap; width: 9rem; font-variant-numeric: tabular-nums; }\n"
        . "  td.m { opacity: .75; font-size: .9rem; }\n"
        . "  .bad { color: #b00020; font-weight: 700; }\n"
        . "  fieldset { border: 1px solid rgba(128,128,128,.4); border-radius: 6px;\n"
        . "             margin: 0 0 1.25rem; padding: .9rem 1rem 1rem; }\n"
        . "  legend { font-weight: 700; padding: 0 .35rem; }\n"
        . "  label.choice { display: block; margin: .35rem 0; }\n"
        . "  .note { opacity: .75; font-size: .9rem; margin: .35rem 0 0 1.6rem; }\n"
        . "  details { margin: .75rem 0 0 1.6rem; }\n"
        . "  details p { margin: .5rem 0; }\n"
        . "  input[type=text], input[type=password], input[type=number] {\n"
        . "      font: inherit; padding: .3rem .4rem; width: 22rem; max-width: 100%; }\n"
        . "  button { font: inherit; font-weight: 700; padding: .6rem 1.4rem;\n"
        . "           border-radius: 6px; cursor: pointer; }\n"
        . "  pre { background: rgba(128,128,128,.14); padding: .8rem; border-radius: 6px;\n"
        . "        overflow-x: auto; font-size: .9rem; }\n"
        . "  code { background: rgba(128,128,128,.14); padding: .1rem .3rem;\n"
        . "         border-radius: 3px; }\n"
        . "</style>\n</head>\n<body>\n";
    echo '<h1>annotepage</h1>' . "\n";
}

function ap_i_foot()
{
    echo "</body>\n</html>\n";
}

// --- 8. Self-deletion ------------------------------------------------------
//
// An installer that stays reachable AND writable on a live server is a
// liability: it writes a configuration file, and the only reason it is safe
// once installed is that it refuses to act. That refusal is one bug away.

function ap_i_delete_self()
{
    $path = __FILE__;
    // clearstatcache first: a stale stat cache would let us report "deleted"
    // about a file that is still there.
    $gone = @unlink($path);
    clearstatcache(true, $path);
    if ($gone && !file_exists($path)) {
        return array(true, 'install.php is deleted. Nothing of the installer is left '
            . 'on this server.');
    }
    return array(false, 'install.php COULD NOT delete itself: the directory is not '
        . 'writable by the user PHP runs as, which is the normal state of a '
        . 'well-set-up server. Delete the file yourself, over FTP or from the '
        . 'file manager. Path: ' . $path);
}

// --- 9. Dispatch -----------------------------------------------------------

$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
$configured = is_file($AP_CONFIG_PATH);

// The delete button, wherever it was pressed from. It is handled before
// everything else because it is the one action that stays useful after the
// installation is over.
if ($method === 'POST' && isset($_POST['delete_self'])) {
    list($deleted, $message) = ap_i_delete_self();
    ap_i_head('annotepage -- installer');
    echo '<p class="lede">' . ($deleted ? 'Done.' : 'Not done.') . "</p>\n";
    echo '<p' . ($deleted ? '' : ' class="bad"') . '>' . ap_i_h($message) . "</p>\n";
    echo '<p>The server itself is unaffected either way: '
        . '<code>api.php?action=diagnostic</code> is what reports its state.</p>' . "\n";
    ap_i_foot();
    exit;
}

// A cross-site POST could otherwise install somebody else's MySQL credentials
// during the minutes between upload and installation. Browsers send Origin on
// a cross-site form submission; a mismatch is refused. Its ABSENCE is not: a
// missing Origin means a client that is not a browser, and this check is aimed
// at the browser somebody else's page is driving.
if ($method === 'POST' && isset($_SERVER['HTTP_ORIGIN'])) {
    $sent = parse_url((string) $_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
    $mine = parse_url(ap_i_base_url(), PHP_URL_HOST);
    if ($sent === null || strcasecmp((string) $sent, (string) $mine) !== 0) {
        http_response_code(403);
        ap_i_head('annotepage -- installer');
        echo '<p class="bad">This form was submitted from another site, so nothing '
            . 'was done. Open install.php directly and submit it from there.</p>' . "\n";
        ap_i_foot();
        exit;
    }
}

// ---------------------------------------------------------------------------
// ALREADY CONFIGURED. The form is not shown at all, and no value from the
// request is looked at. There is nothing here that a second run could improve
// and a great deal it could cost.
// ---------------------------------------------------------------------------

if ($configured) {
    // The operator's own redirect, if they set one, and only on a plain visit:
    // ?stay=1 (or any query) still shows this page, so the delete button below
    // stays reachable on a server that forwards.
    if ($method === 'GET' && empty($_SERVER['QUERY_STRING'])) {
        $forward = null;
        try {
            $forward = ap_forward_root_to(ap_config());
        } catch (Exception $e) {
            $forward = null;
        } catch (Throwable $e) {
            $forward = null;
        }
        if ($forward !== null) {
            http_response_code(302);
            header('Location: ' . $forward);
            header('Content-Type: text/plain; charset=utf-8');
            echo $forward . "\n";
            exit;
        }
    }

    ap_i_head('annotepage -- already installed');
    echo '<p class="lede">This server is already configured. The installer does '
        . 'nothing here.</p>' . "\n";
    echo '<p><code>internal/config-local.php</code> exists, and it holds this '
        . "installation's projects and storage. Overwriting it would cost somebody "
        . 'their notes, so the form is not shown and no value from this request was '
        . "read.</p>\n";
    echo '<h2>To change something</h2>' . "\n";
    echo '<p>Edit <code>internal/config-local.php</code>. Every key is documented in '
        . '<code>internal/config.php</code> next to it. To start over, delete the '
        . 'local file and reload this page &mdash; and know that the notes stay where '
        . 'they are, in the storage the old file named.</p>' . "\n";
    echo '<h2>To check the state of the server</h2>' . "\n";
    echo '<p><code>api.php?action=diagnostic</code> answers in plain text: the PHP '
        . 'really served, the storage, the declared projects and their origins, and '
        . "what is left to do. It is one request and it needs no shell.</p>\n";
    echo '<h2>Delete this file</h2>' . "\n";
    echo '<p>It is not needed any more. An installer that stays reachable and '
        . 'writable on a live server is a liability.</p>' . "\n";
    echo '<form method="post"><button type="submit" name="delete_self" value="1">'
        . "Delete install.php</button></form>\n";
    ap_i_foot();
    exit;
}

// ---------------------------------------------------------------------------
// THE INSTALLATION ITSELF.
// ---------------------------------------------------------------------------

$errors = array();
$report = array();          // what was measured, shown whatever the outcome
$installed = false;
$serverUrl = ap_i_base_url() . 'api.php';

if ($method === 'POST') {
    $storage = isset($_POST['storage']) && $_POST['storage'] === 'mysql' ? 'mysql' : 'sqlite';
    $autoUpdate = !empty($_POST['auto_update']);
    $values = array(
        'storage'     => $storage,
        'auto_update' => $autoUpdate,
        'version'     => ap_i_version(),
        'file'        => '',
        'host'        => '',
        'port'        => 3306,
        'name'        => '',
        'user'        => '',
        'password'    => '',
    );

    if ($storage === 'mysql') {

        // --- MySQL: the credentials have to WORK before they are written. A
        // configuration file naming a database nobody can reach is a file that
        // fails later, on somebody else's screen, with no clue where it came
        // from.
        $values['host'] = trim((string) (isset($_POST['host']) ? $_POST['host'] : ''));
        $values['port'] = (int) (isset($_POST['port']) ? $_POST['port'] : 3306);
        $values['name'] = trim((string) (isset($_POST['name']) ? $_POST['name'] : ''));
        $values['user'] = trim((string) (isset($_POST['user']) ? $_POST['user'] : ''));
        $values['password'] = (string) (isset($_POST['password']) ? $_POST['password'] : '');

        if ($values['host'] === '') { $values['host'] = '127.0.0.1'; }
        if ($values['port'] <= 0 || $values['port'] > 65535) { $values['port'] = 3306; }
        if ($values['name'] === '') { $errors[] = 'The database name is empty.'; }
        if ($values['user'] === '') { $errors[] = 'The database user is empty.'; }
        if ($values['password'] === '') {
            $errors[] = 'The database password is empty. The server refuses an empty '
                . 'credential rather than fail later with a driver message nobody can '
                . 'read; give the user a password.';
        }
        if (!extension_loaded('pdo_mysql')) {
            $errors[] = 'The PHP extension pdo_mysql is missing on this server, so '
                . 'MySQL cannot be used here. Choose SQLite, or ask the host to enable '
                . 'pdo_mysql.';
        }

        if (!$errors) {
            $config = array_merge(ap_config_defaults(), array(
                'storage'  => 'mysql',
                'database' => array(
                    'host' => $values['host'], 'port' => $values['port'],
                    'name' => $values['name'], 'user' => $values['user'],
                    'password' => $values['password'],
                ),
            ));
            try {
                ap_require_store($config);
                $store = new ApStore($config);
                // ensureSchema and not a bare connection: it also proves the
                // user may CREATE, which is the right that is missing half the
                // time and the one whose absence surfaces at the first note.
                $store->ensureSchema();
                $report[] = array('MySQL connection', 'succeeded',
                    'Connected to ' . $values['name'] . ' on ' . $values['host']
                    . ':' . $values['port'] . ', and the tables are in place.');
            } catch (Exception $e) {
                // The password is stripped from the driver message before it is
                // shown. The rest -- host, database, user -- was typed on this
                // very screen by the person reading it.
                $detail = str_replace($values['password'], '********', $e->getMessage());
                $errors[] = 'MySQL refused: ' . substr($detail, 0, 400);
            }
        }

    } else {

        // --- SQLite: pick, create, and then PROVE.
        if (!extension_loaded('pdo_sqlite')) {
            $errors[] = 'The PHP extension pdo_sqlite is missing on this server. Ask '
                . 'the host to enable it, or choose MySQL above.';
        }

        $docRoot = ap_i_measured_document_root();
        $baseUrl = ap_i_base_url();
        $report[] = array('Document root', $docRoot === null ? 'not measurable' : $docRoot,
            $docRoot === null
                ? 'This file\'s URL and its path on disk could not be matched, so the '
                  . '"outside the document root" claim cannot be made. The data file '
                  . 'goes in a guarded directory inside, and is probed like any other.'
                : 'Measured by matching this file\'s URL against its path on disk, not '
                  . 'read from DOCUMENT_ROOT, which is empty or wrong often enough that '
                  . 'nothing here may depend on it.');

        $created = array();
        $location = null;

        if (!$errors) {
            $location = ap_i_pick_location($AP_HERE, $docRoot);
            $values['file'] = $location['file'];
            $dirExisted = is_dir($location['directory']);

            $config = array_merge(ap_config_defaults(), array(
                'storage'  => 'sqlite',
                'database' => array('file' => $location['file']),
            ));
            try {
                ap_require_store($config);
                $store = new ApStore($config);
                $store->ensureSchema();
                // A real read on the real file: if the schema were not there,
                // this is where it would say so, not at the first note.
                $store->count('0000000000000000000000');
                $created = array($location['file'],
                                 $location['file'] . '-wal', $location['file'] . '-shm');
                if (!$dirExisted) {
                    $created[] = $location['directory'] . '/.htaccess';
                    $created[] = $location['directory'] . '/index.php';
                }
                $report[] = array('Data file', $location['file'],
                    'Created, with its schema. Placed ' . $location['why'] . '.');
            } catch (Exception $e) {
                $errors[] = 'The data file could not be created: ' . $e->getMessage();
            }
        }

        // --- THE PROOF. Nothing below reasons about protection; it requests
        // and reads the status. The control request comes first: a probe that
        // cannot reach the server proves nothing, and a "no answer" that got
        // taken for a refusal is the exact failure this is here to prevent.
        if (!$errors) {
            $token = bin2hex(random_bytes(8));
            $control = ap_i_fetch($baseUrl . 'install.php?probe=' . $token, 6);
            $controlOk = $control['status'] === 200
                && strpos($control['body'], 'annotepage-install-probe ' . $token) !== false;
            $report[] = array('Control request',
                $controlOk ? 'answered 200' : 'FAILED',
                $controlOk
                    ? 'This server can request its own URLs (' . $control['transport']
                      . '), and ' . $baseUrl . ' really maps to this directory. Without '
                      . 'that, nothing below would mean anything.'
                    : 'Asked for ' . $baseUrl . 'install.php and did not get our own '
                      . 'answer back'
                      . ($control['error'] !== null ? ' (' . $control['error'] . ')' : '')
                      . '. A single-worker development server deadlocks here; a real '
                      . 'host does not.');
            if (!$controlOk) {
                $errors[] = 'This installation cannot check itself over HTTP, so it '
                    . 'cannot prove the data file is unreachable, so it will not '
                    . 'finish. Nothing was configured. Use MySQL instead, or fix '
                    . 'whatever blocks this server from requesting its own address.';
            }

            if ($controlOk) {
                $urls = ap_i_probe_urls($location['file'], $AP_HERE, $docRoot, $baseUrl);
                if (!$urls) {
                    $report[] = array('Data file over HTTP', 'no URL maps to it',
                        'The file is outside everything this web server serves, so there '
                        . 'is no address to request. That is the case we wanted.');
                }
                foreach ($urls as $probe) {
                    $answer = ap_i_fetch($probe['url'], 6);
                    $safe = ap_i_answer_is_safe($answer, $probe['exact']);
                    $first = preg_replace('/[^\x20-\x7E]/', '.',
                        substr($answer['body'], 0, 60));
                    $report[] = array('Data file over HTTP',
                        ($answer['status'] === null ? 'no answer' : $answer['status'])
                        . ($safe ? ' -- refused' : ' -- REACHABLE'),
                        'Asked for ' . $probe['url']
                        . ($probe['exact']
                            ? ' (this URL maps to it)'
                            : ' (the address a crawler would try; it maps to nothing here)')
                        . ($answer['body'] !== ''
                            ? '. First bytes: "' . $first . '"'
                            : '. Empty body.')
                        . ($answer['error'] !== null ? ' (' . $answer['error'] . ')' : ''));
                    if (!$safe) {
                        $errors[] = 'The web server does not refuse ' . $probe['url']
                            . '. The database would be downloadable, so nothing was '
                            . 'configured and the file just created has been removed.';
                    }
                }
            }
        }

        // Failed proof: undo. Leaving a database behind that we have just shown
        // to be reachable would be worse than never having written it.
        if ($errors && $created) {
            foreach ($created as $path) {
                if (is_file($path)) { @unlink($path); }
            }
            if ($location !== null && is_dir($location['directory'])) {
                @rmdir($location['directory']);
            }
        }
    }

    // --- Writing the configuration. NEVER over an existing one: checked again
    // here, and not only at the top of the request, because the whole point is
    // that this file must not be able to destroy a configuration -- including
    // one that landed while this request was running.
    if (!$errors) {
        if (is_file($AP_CONFIG_PATH)) {
            $errors[] = 'internal/config-local.php appeared while this page was '
                . 'working. Nothing was written.';
        } else {
            $text = ap_i_config_text($values);
            $written = @file_put_contents($AP_CONFIG_PATH, $text, LOCK_EX);
            if ($written === false) {
                $errors[] = 'internal/config-local.php could not be written. Grant the '
                    . 'user PHP runs as write permission on the internal/ directory, '
                    . 'then reload this page. Path: ' . $AP_CONFIG_PATH;
            } else {
                // It holds credentials on the MySQL route. 0600 rather than
                // whatever umask the host happens to have.
                @chmod($AP_CONFIG_PATH, 0600);
                $installed = true;
            }
        }
    }
}

// --- 10. The page ----------------------------------------------------------

ap_i_head($installed ? 'annotepage -- installed' : 'annotepage -- install');

if ($installed) {
    echo '<p class="lede">Installed. One line left to paste.</p>' . "\n";

    echo '<h2>The line</h2>' . "\n";
    echo '<p>The tag on the pages you want to annotate carries this address:</p>' . "\n";
    echo '<pre>data-server="' . ap_i_h($serverUrl) . '"</pre>' . "\n";
    echo '<p>The rest of the tag &mdash; the script source and the project id &mdash; '
        . 'comes from the client. Add the tag to a page, open it, and the setup screen '
        . 'generates the salt in your browser and hands you the block to paste into '
        . '<code>internal/config-local.php</code> under <code>projects</code>. The '
        . 'salt never reaches this server, in any form: that is what makes the notes '
        . "unreadable to it.</p>\n";

    echo '<h2>What was measured</h2>' . "\n";
    echo "<table>\n";
    foreach ($report as $line) {
        echo '<tr><td class="k">' . ap_i_h($line[0]) . '</td><td class="v">'
            . ap_i_h($line[1]) . '</td><td class="m">' . ap_i_h($line[2]) . "</td></tr>\n";
    }
    echo "</table>\n";

    echo '<h2>Check it, in one request</h2>' . "\n";
    echo '<pre>' . ap_i_h($serverUrl) . '?action=diagnostic</pre>' . "\n";
    echo '<p>Plain text: the PHP really served, the storage and its state, the '
        . 'declared projects with their origins. No credential value ever appears '
        . "there.</p>\n";

    echo '<h2>Now delete this file</h2>' . "\n";
    echo '<p>It has done its job. It refuses to act while the configuration exists, '
        . 'but an installer that stays reachable and writable on a live server is a '
        . 'liability all the same.</p>' . "\n";
    echo '<form method="post"><button type="submit" name="delete_self" value="1">'
        . "Delete install.php</button></form>\n";
    ap_i_foot();
    exit;
}

// --- The form, and the report above it.

echo '<p class="lede">Upload the directory, open this page, press the button. '
    . "Two questions, and both have a default that works.</p>\n";

if ($errors) {
    echo '<h2>Nothing was installed</h2>' . "\n";
    foreach ($errors as $line) {
        echo '<p class="bad">' . ap_i_h($line) . "</p>\n";
    }
}

if ($report) {
    echo '<h2>What was measured</h2>' . "\n";
    echo "<table>\n";
    foreach ($report as $line) {
        echo '<tr><td class="k">' . ap_i_h($line[0]) . '</td><td class="v">'
            . ap_i_h($line[1]) . '</td><td class="m">' . ap_i_h($line[2]) . "</td></tr>\n";
    }
    echo "</table>\n";
}

echo '<h2>What this server offers</h2>' . "\n";
list($environment, $outbound) = ap_i_environment($AP_HERE);
echo "<table>\n";
foreach ($environment as $line) {
    echo '<tr><td class="k">' . ap_i_h($line[0]) . '</td>'
        . '<td class="v' . ($line[2] ? '' : ' bad') . '">' . ap_i_h($line[1]) . '</td>'
        . '<td class="m">' . ap_i_h($line[3]) . "</td></tr>\n";
}
echo "</table>\n";

$postedMysql = ($method === 'POST' && isset($_POST['storage']) && $_POST['storage'] === 'mysql');
$field = function ($name, $fallback = '') {
    return isset($_POST[$name]) ? (string) $_POST[$name] : $fallback;
};

echo '<h2>Install</h2>' . "\n";
echo '<form method="post" action="install.php">' . "\n";

echo "<fieldset>\n<legend>Storage</legend>\n";
echo '<label class="choice"><input type="radio" name="storage" value="sqlite"'
    . ($postedMysql ? '' : ' checked') . '> <strong>SQLite</strong> '
    . "&mdash; a file, nothing to create</label>\n";
echo '<p class="note">The installer picks a location the web server does not serve, '
    . 'creates the file, and then requests that file\'s own URL to confirm it comes '
    . 'back refused. If it does not, nothing is installed.</p>' . "\n";
echo '<label class="choice"><input type="radio" name="storage" value="mysql"'
    . ($postedMysql ? ' checked' : '') . '> <strong>MySQL</strong> '
    . "&mdash; I already have a database</label>\n";
echo "<details" . ($postedMysql ? ' open' : '') . ">\n";
echo "<summary>MySQL connection details</summary>\n";
echo '<p>Only if you chose MySQL above. The installer connects and creates the tables '
    . 'before writing anything.</p>' . "\n";
echo '<p><label>Host<br><input type="text" name="host" value="'
    . ap_i_h($field('host', '127.0.0.1')) . "\"></label></p>\n";
echo '<p><label>Port<br><input type="number" name="port" value="'
    . ap_i_h($field('port', '3306')) . "\"></label></p>\n";
echo '<p><label>Database name<br><input type="text" name="name" value="'
    . ap_i_h($field('name')) . "\"></label></p>\n";
echo '<p><label>User<br><input type="text" name="user" value="'
    . ap_i_h($field('user')) . "\"></label></p>\n";
echo '<p><label>Password<br><input type="password" name="password"></label></p>' . "\n";
echo "</details>\n</fieldset>\n";

echo "<fieldset>\n<legend>Automatic updates</legend>\n";
echo '<label class="choice"><input type="checkbox" name="auto_update" value="1"'
    . (!empty($_POST['auto_update']) ? ' checked' : '')
    . "> Let this server fetch and install its own updates</label>\n";
echo '<p class="note">Leave it off. Turning it on means the code directory must be '
    . 'writable by the user PHP runs as, and from that moment any bug anywhere on this '
    . 'account that can write a file &mdash; in this code, in a neighbouring '
    . 'application, in a plugin nobody remembers installing &mdash; stops being a '
    . 'defacement and becomes permanent code execution. Turning the key back off does '
    . 'not undo it: the permission stays until somebody takes it away. '
    . '<code>php internal/update.php</code> does the same job from a shell or from '
    . 'cron, with the directory writable by you and not by the web server.</p>' . "\n";
if (!$outbound) {
    echo '<p class="note bad">This server has no way out to HTTPS, so this option '
        . "cannot work here even if you tick it.</p>\n";
}
echo "</fieldset>\n";

echo '<button type="submit">Install</button>' . "\n";
echo "</form>\n";

ap_i_foot();
