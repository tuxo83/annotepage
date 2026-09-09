<?php
/**
 * install-flow.php -- THE INSTALLATION ITSELF: the report, the one form, the
 * proof, the configuration file, and the offer to delete the installer.
 *
 * WHY THIS IS A FILE OF ITS OWN, when it used to be the body of install.php.
 * There are two ways to install this server and there is exactly ONE
 * installation:
 *
 *   - annotepage-install.php, ONE FILE dropped on the host, which downloads
 *     the release from the published source and verifies every file against
 *     MANIFEST's SHA-256 before writing it. That is the route;
 *   - install.php, which comes with the directory when somebody copied
 *     webroot/ over FTP. That is the fallback, for a host with no way out to
 *     HTTPS.
 *
 * Both of them are a dozen lines: check the PHP version, answer the control
 * probe, require this file, call ap_i_run(). Everything below happens once, in
 * one place, and the two routes cannot drift apart -- which they would, and
 * the half that drifts is always the one nobody opens.
 *
 * The bootstrap could not simply download install.php, either: install.php is
 * deliberately NOT in the manifest (see tools/build-server-manifest.mjs), so
 * there is no published hash to check it against, and writing an unverified
 * file is the one thing the whole download path exists to avoid. THIS file is
 * in the manifest, like every other shipped file, and is verified like every
 * other one.
 *
 * IT LIVES UNDER internal/, and that is what makes it harmless for the updater
 * to maintain. What must never come back on a live server is a REACHABLE
 * installer; everything in internal/ answers 404 when called directly and
 * refuses to run without the constant its caller sets. A restored
 * install-flow.php is inert code, not an open door -- which is exactly why
 * install.php, the entry point, stays out of the manifest.
 *
 * WHAT IT ASKS: who the server is for (one site, selected; or anyone, which
 * writes a relay), the storage (SQLite, selected; MySQL behind a closed
 * <details>) and automatic updates (a checkbox, off, with what turning it on
 * costs written beside it). Nothing else. Retention, rate limits, origins and
 * the courtesy redirect have defaults that work and belong in the
 * configuration file, where a comment can explain them -- not in front of
 * somebody installing.
 *
 * WHO IT IS FOR IS ASKED BECAUSE THE ANSWER CANNOT BE GUESSED, and getting it
 * wrong is silent both ways. Without the question this file wrote
 * `self-hosted` unconditionally and never wrote `open_registration` at all, so
 * every server installed through the web refused every project until somebody
 * hand-edited config-local.php -- and there was no path through this page to a
 * relay at all. The answer only ever WIDENS what is written: the default is
 * the narrow one, and a value that is not the exact expected string falls back
 * to it, because a relay opened by a typo stores strangers' notes on somebody
 * who never asked for that.
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
 * configuration at all. Before that it runs a CONTROL request against the
 * entry point that called it, because a probe that cannot reach the server
 * proves nothing and must not be mistaken for a clean result.
 *
 * WHAT IT REFUSES TO DO
 *
 *   - overwrite an existing internal/config-local.php. Ever. If one is there,
 *     the form is not even shown: that file holds somebody's projects and
 *     their storage, and a second run must not be able to cost them either;
 *   - finish an installation whose data file it could not prove unreachable;
 *   - stay behind quietly. It offers to delete the ENTRY POINT that called it
 *     -- install.php, or the one-file bootstrap, whichever the person used --
 *     and reports honestly whether it managed.
 *
 * NOTHING HERE KNOWS WHERE IT IS. The directory to install into, the file to
 * delete, the method to act on and the rows measured before it was called all
 * arrive in ap_i_run()'s $options. That is what lets the same code answer for
 * a file sitting in the served directory and for one dropped beside it.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

// require_once, and not require: the entry point may already have loaded these
// -- annotepage-install.php loads errors.php the moment it has verified it, to
// have somewhere for a failure to go while it is still downloading.
require_once __DIR__ . '/errors.php';
require_once __DIR__ . '/config.php';

/**
 * The protocol number. The installation never writes a note, but it opens a
 * store, and a store is entitled to it.
 *
 * READ OUT OF api.php rather than written here. It has exactly one home --
 * that one line, which tools/check-versions.mjs reads with this very regular
 * expression to keep the client, the MCP and the server agreeing -- and a
 * second copy of a protocol number is precisely the drift that check exists to
 * prevent. Nor could an entry point carry it: annotepage-install.php is
 * forbidden to know anything about the release it installs, version numbers
 * included.
 */
if (!defined('AP_FORMAT')) {
    $apFormat = @file_get_contents(dirname(__DIR__) . '/api.php');
    if (preg_match("/define\('AP_FORMAT',\s*(\d+)\)/", (string) $apFormat, $apFormatMatch)) {
        define('AP_FORMAT', (int) $apFormatMatch[1]);
    }
    unset($apFormat, $apFormatMatch);
}

/**
 * The URL path of the entry point PHP is running, as the web server gave it.
 *
 * Written once because three things read it -- the base URL, the measured
 * document root and the control probe -- and they must read the SAME thing. Its
 * absence means no web server (a command line), where '/' gives every caller
 * the same answer as the file name would.
 */
function ap_i_script_name($force = null)
{
    /* FORCED, ON A COMMAND LINE, AND IT HAS TO BE. In CLI, PHP puts the path
       AS TYPED in SCRIPT_NAME -- so `php x.php`, `php notes/x.php` and
       `php /abs/notes/x.php` are three different answers to a question about
       URLs, and ap_i_measured_document_root() turns each into a different
       document root. Measured: one of them places the data file in a directory
       the web server serves, while the configuration written says the opposite
       was proven. The command line therefore gets its path from the address the
       operator gives, and from nowhere else. */
    static $forced = null;
    if ($force !== null) {
        $forced = (string) $force;
    }
    if ($forced !== null) {
        return $forced;
    }
    if (PHP_SAPI === 'cli') {
        /* Nothing has been forced and there is no request: refuse to invent
           one. Every caller treats '/' as "no directory", which is the only
           safe reading. */
        return '/';
    }
    return isset($_SERVER['SCRIPT_NAME']) && $_SERVER['SCRIPT_NAME'] !== ''
        ? (string) $_SERVER['SCRIPT_NAME']
        : '/';
}

// --- 1. Small helpers ------------------------------------------------------

/** Everything that reaches the page goes through this. No exception. */
function ap_i_h($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function ap_i_version($here)
{
    $path = $here . '/VERSION';
    $read = is_readable($path) ? trim((string) file_get_contents($path)) : '';
    return preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $read) ? $read : 'unknown';
}

/**
 * Can this PHP interface hand the response to the visitor and keep working?
 *
 * The same three cases as ap_update_release_visitor() in update.php, asked
 * WITHOUT doing it. Written once because two screens depend on the answer --
 * the form, which ticks the URL option for the operator when it is no, and the
 * last screen, which does not offer `auto_update` at all when it is no. A
 * third copy of this test is a third thing to forget the day the list grows.
 */
function ap_i_can_defer()
{
    return PHP_SAPI === 'cli'
        || function_exists('fastcgi_finish_request')
        || function_exists('litespeed_finish_request');
}

/** The absolute path of a script under internal/, for a cron line to paste. */
function ap_i_update_script($here, $script = 'update.php')
{
    $real = realpath($here);
    return ($real === false ? $here : str_replace('\\', '/', $real)) . '/internal/' . $script;
}

/**
 * A MINUTE AND AN HOUR DRAWN FOR THIS INSTALL, for a crontab line.
 *
 * The line used to read `17 4` for everybody, and everybody who pasted it
 * asked the same host for the same file at the same second. That is a spike
 * this project builds into somebody else's server -- and, for the sweep, a
 * pile of databases rewriting themselves at once on shared hosting.
 *
 * Drawn once per screen, so the two lines on it do not fire together either.
 * Nothing depends on the value: any minute of any hour does the same work.
 */
function ap_i_cron_time()
{
    return sprintf('%d %d * * *', random_int(0, 59), random_int(0, 23));
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
function ap_i_base_url($force = null)
{
    /* Forced from --api-address on a command line, for the same reason as
       ap_i_script_name(): the scheme, the host and the port are all read off a
       request, and there is no request. Every one of the five sources
       ap_request_scheme_detail() consults is absent in CLI, so it would answer
       "http" for a site that is https, and the host would be the literal
       `localhost` for everybody. */
    static $forced = null;
    if ($force !== null) {
        $forced = rtrim((string) $force, '/') . '/';
    }
    if ($forced !== null) {
        return $forced;
    }
    // The SAME detector the redirect uses -- ap_request_scheme_detail() in
    // config.php. Two copies of this test would drift, and the day they
    // disagree the installer probes a URL the server would have redirected.
    $https = ap_request_is_https();
    $host = isset($_SERVER['HTTP_HOST']) && $_SERVER['HTTP_HOST'] !== ''
        ? (string) $_SERVER['HTTP_HOST']
        : (isset($_SERVER['SERVER_NAME']) ? (string) $_SERVER['SERVER_NAME'] : 'localhost');
    $host = preg_replace('/[^A-Za-z0-9\.\-\:\[\]]/', '', $host);
    $dir = str_replace('\\', '/', dirname(ap_i_script_name()));
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
function ap_i_measured_document_root($here)
{
    $here = str_replace('\\', '/', realpath($here));
    $urlDir = str_replace('\\', '/', dirname(ap_i_script_name()));
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

// --- 2. The environment report ---------------------------------------------
//
// Each line says what it MEANS. A tick that the reader has to interpret is a
// tick that tells them nothing, and the person opening this page is usually
// the person who cannot ask anybody.

function ap_i_environment($here, $outboundUrl)
{
    $lines = array();

    /* THE TWO ROWS THAT DESCRIBE THE WRONG PHP WHEN NOBODY IS BROWSING. Run
       from a shell, this measures the command-line interpreter -- another
       version, another set of extensions, sometimes another user than the one
       the web server runs as, which is the ordinary case on shared hosting.
       The rows say which one they measured rather than claiming the other. */
    $cli = (PHP_SAPI === 'cli');

    $lines[] = array('PHP version', PHP_VERSION,
        PHP_VERSION_ID >= 70400,
        $cli
            ? 'The version on THIS command line. The web server may well run '
              . 'another one, and nothing here can see it. 7.4 or newer is required.'
            : 'The version the WEB SERVER runs, which is not always the one on the '
              . 'command line. 7.4 or newer is required.');

    $lines[] = array('PHP interface', PHP_SAPI, true,
        $cli
            ? 'How PHP is plugged in HERE, on this command line. How it is plugged '
              . 'into the web server is a different answer, and this run cannot '
              . 'measure it.'
            : 'How PHP is plugged into the web server. It decides nothing here; it is '
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
    $reach = ap_i_fetch($outboundUrl, 4);
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

// --- 3. Where the data file goes -------------------------------------------

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
            /* A SYMLINK IS NOT A DIRECTORY WE CHOSE. The name is fixed and
               guessable, so anybody who can write next to the document root
               can point it wherever they like -- measured: at /tmp, and at a
               served directory, where the database then answers 200 to a
               plain GET while this file's report says no URL reaches it. */
            $usable = !is_link($candidate)
                && ((is_dir($candidate) && is_writable($candidate))
                    || (!is_dir($candidate) && is_writable($parent)));
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

// --- 4. Writing the configuration ------------------------------------------

/**
 * THE INSTALLATION ITSELF, AND IT NO LONGER READS THE REQUEST.
 *
 * Everything this function does used to sit inside `if ($method === 'POST')`,
 * reading $_POST sixteen times. It contains NOT ONE `echo`: the decision and
 * the rendering were already separate in this file, and nobody had drawn the
 * line. Drawing it costs no rewritten output, and it is what lets a second
 * face -- a command line -- hand the same answers to the same code rather
 * than grow a second installer beside this one.
 *
 * WHAT IT IS HANDED is a plain array of answers, keyed exactly as the form
 * names its fields. The comparisons against exact strings inside are unchanged
 * to the character: `anyone`, `mysql`, `self`. They are what stops a relay
 * being opened by a mistyped value, and they must go on refusing whatever they
 * do not recognise, from whichever face it arrives.
 *
 * @param array $answers  the answers, keyed as the form names them
 * @param array $report   filled with the [key, value, meaning] rows measured
 * @param array $errors   filled with what went wrong; empty means installed
 * @return array installed, relay, token, auto, wants -- what the last screen
 *               needs and cannot recompute
 */
function ap_i_install(array $answers, $here, $configPath, $selfName,
                      array &$report, array &$errors)
{
    // Assigned only on success further down, and read at the end whatever
    // happens: two PHP warnings on every failed run, which worked only
    // because an undefined variable reads as false.
    $installed = false;
    $installedRelay = false;

    $storage = isset($answers['storage']) && $answers['storage'] === 'mysql' ? 'mysql' : 'sqlite';
    /* ONE CHOICE OF THREE, AND IT ARRIVES AS ONE FIELD. It was two
       independent checkboxes, which said "tick what you like" over a
       paragraph explaining that ticking the second when the first is open
       to you is a mistake. The site has drawn it as one choice of three
       since the install page was rebuilt; the installer said something
       else. Compared against exact strings, like the audience below and
       for the same reason: anything unrecognised lands on the safest
       answer, the cron that needs no permission granted to anybody. The
       two flags the rest of this file reads are unchanged. */
    $wants = isset($answers['updates']) ? (string) $answers['updates'] : 'cron';
    $wantsUrl = ($wants === 'url');
    $autoUpdate = ($wants === 'self');

    // WHO IT IS FOR. Compared against the one exact string the form sends,
    // never tested for truth: a missing field, a mangled one, a value from
    // an older form or a hand-made request all land on 'self-hosted'. The
    // wrong answer in this direction costs a manual edit; the wrong answer
    // in the other opens somebody's disk to strangers without them asking.
    $deployment = (isset($answers['audience']) && $answers['audience'] === 'anyone')
        ? 'relay' : 'self-hosted';

    /* 32 bytes, base64url, from the same source as everything else that
       must not be guessable. Generated HERE and shown once: the installer
       is the only screen that will ever have a reason to print it. */
    $updateToken = '';
    if ($wantsUrl) {
        $updateToken = rtrim(strtr(base64_encode(
            function_exists('random_bytes') ? random_bytes(32)
                : openssl_random_pseudo_bytes(32)), '+/', '-_'), '=');
    }

    /* THE SETTINGS, FROM WHICHEVER FACE. Keyed exactly as config.php keys
       them, so nothing is translated on the way in. Absent means absent: the
       generated file then says nothing about that key and config.php goes on
       deciding it, which is what an operator who did not touch it wants. */
    $settings = array();
    foreach (ap_i_settings() as $setting) {
        if (isset($answers[$setting['key']]) && $answers[$setting['key']] !== '') {
            $settings[$setting['key']] = (string) $answers[$setting['key']];
        }
    }

    $values = array(
        'settings'     => $settings,
        'storage'      => $storage,
        'deployment'   => $deployment,
        'auto_update'  => $autoUpdate,
        'update_token' => $updateToken,
        'version'     => ap_i_version($here),
        'installer'   => $selfName,
        'file'        => '',
        'host'        => '',
        'port'        => 3306,
        'name'        => '',
        'user'        => '',
        'password'    => '',
    );

    /* WHAT THIS RUN CREATED, and it is declared HERE rather than inside the
       SQLite branch: the undo below has to be reachable from after the
       configuration is written, and a variable scoped to one branch is not.
       On the MySQL route both stay empty and the undo does nothing. */
    $created = array();
    $location = null;

    if ($storage === 'mysql') {

        // --- MySQL: the credentials have to WORK before they are written. A
        // configuration file naming a database nobody can reach is a file that
        // fails later, on somebody else's screen, with no clue where it came
        // from.
        $values['host'] = trim((string) (isset($answers['host']) ? $answers['host'] : ''));
        $values['port'] = (int) (isset($answers['port']) ? $answers['port'] : 3306);
        $values['name'] = trim((string) (isset($answers['name']) ? $answers['name'] : ''));
        $values['user'] = trim((string) (isset($answers['user']) ? $answers['user'] : ''));
        $values['password'] = (string) (isset($answers['password']) ? $answers['password'] : '');

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
                /* THE STORE'S SENTENCE IS WRITTEN FOR A REVIEWER, NOT FOR AN
                   INSTALLATION. It says "your notes are NOT saved. The tool has
                   lost nothing of what was already saved" -- true and useful on
                   the path somebody is reading a page, and absurd here, where no
                   note exists yet and the person is holding the credentials that
                   were just refused. The database server's own words go to the
                   log, which is stderr on a command line: named, so the operator
                   knows to look up rather than at this line. */
                $detail = str_replace($values['password'], '********', $e->getMessage());
                $errors[] = 'MySQL refused the connection, so nothing was written. '
                    . 'The database server said why, in this host\'s PHP error log, on '
                    . 'the line beginning [annotepage] -- from a command line that is '
                    . 'the line printed just above. It is nearly always one of three: '
                    . 'the password, the database name, or a user without the right to '
                    . 'create tables. What this tool was told: '
                    . substr($detail, 0, 400);
            }
        }

    } else {

        // --- SQLite: pick, create, and then PROVE.
        if (!extension_loaded('pdo_sqlite')) {
            $errors[] = 'The PHP extension pdo_sqlite is missing on this server. Ask '
                . 'the host to enable it, or choose MySQL above.';
        }

        $docRoot = ap_i_measured_document_root($here);
        $baseUrl = ap_i_base_url();
        $report[] = array('Document root', $docRoot === null ? 'not measurable' : $docRoot,
            $docRoot === null
                ? 'This file\'s URL and its path on disk could not be matched, so the '
                  . '"outside the document root" claim cannot be made. The data file '
                  . 'goes in a guarded directory inside, and is probed like any other.'
                : 'Measured by matching this file\'s URL against its path on disk, not '
                  . 'read from DOCUMENT_ROOT, which is empty or wrong often enough that '
                  . 'nothing here may depend on it.');

        if (!$errors) {
            $location = ap_i_pick_location($here, $docRoot);
            $values['file'] = $location['file'];
            /* WHAT WAS ALREADY THERE IS NOT OURS TO UNDO. The path is fixed --
               <parent of the document root>/annotepage-data/notes.sqlite --
               so a second installation under the same parent lands on the
               first one's database. Listing that file as "created" made the
               undo below delete it: measured, a failed run from a second copy
               destroyed a live installation's notes, and the next request
               recreated an empty file with its schema, so nothing anywhere
               said a word. Two runs racing did the same to each other.

               So each of the three is judged on its own, before anything is
               written, and the undo can only take back what this run made. */
            $dirExisted  = is_dir($location['directory']);
            $fileExisted = is_file($location['file']);
            $walExisted  = is_file($location['file'] . '-wal');
            $shmExisted  = is_file($location['file'] . '-shm');

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
                $created = array();
                if (!$fileExisted) { $created[] = $location['file']; }
                if (!$walExisted)  { $created[] = $location['file'] . '-wal'; }
                if (!$shmExisted)  { $created[] = $location['file'] . '-shm'; }
                if (!$dirExisted) {
                    $created[] = $location['directory'] . '/.htaccess';
                    $created[] = $location['directory'] . '/index.php';
                }
                /* AND ADOPTION IS SAID OUT LOUD. A database that was already
                   there is kept, notes and all -- the store is multi-tenant, so
                   two installations CAN share one file -- but somebody who did
                   not mean to share has to be able to see it on this screen
                   rather than discover it later. */
                $report[] = array('Data file', $location['file'],
                    ($fileExisted
                        ? 'ALREADY THERE, and taken as it is: its notes are kept and '
                          . 'this installation will write into the same file. Nothing '
                          . 'of it will be removed, even if this run fails. '
                        : 'Created, with its schema. ')
                    . 'Placed ' . $location['why'] . '.');
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
            $control = ap_i_fetch($baseUrl . rawurlencode($selfName) . '?probe=' . $token, 6);
            $controlOk = $control['status'] === 200
                && strpos($control['body'], 'annotepage-install-probe ' . $token) !== false;
            $report[] = array('Control request',
                $controlOk ? 'answered 200' : 'FAILED',
                $controlOk
                    ? 'This server can request its own URLs (' . $control['transport']
                      . '), and ' . $baseUrl . ' really maps to this directory. Without '
                      . 'that, nothing below would mean anything.'
                    : 'Asked for ' . $baseUrl . $selfName . ' and did not get our own '
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
                $urls = ap_i_probe_urls($location['file'], $here, $docRoot, $baseUrl);
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

    }

    // --- Writing the configuration. NEVER over an existing one: checked again
    // here, and not only at the top of the request, because the whole point is
    // that this file must not be able to destroy a configuration -- including
    // one that landed while this request was running.
    if (!$errors) {
        /* CREATED EXCLUSIVELY, not tested and then written. `is_file()`
           followed by a write is two operations with a gap between them,
           and two runs that both pass the test both write -- the last one
           wins and BOTH announce success. `x` asks the kernel for the file
           only if it does not exist, which is one operation and cannot be
           raced. LOCK_EX was never the guard here: it serialises writers,
           it does not refuse the second one. */
        $handle = @fopen($configPath, 'x');
        if ($handle === false) {
            $errors[] = is_file($configPath)
                ? 'internal/config-local.php appeared while this page was '
                  . 'working. Nothing was written.'
                : 'internal/config-local.php could not be written. Grant the '
                  . 'user PHP runs as write permission on the internal/ directory, '
                  . 'then reload this page. Path: ' . $configPath;
        } else {
            $text = ap_i_config_text($values);
            $written = @fwrite($handle, $text);
            @fclose($handle);
            if ($written === false || $written < strlen($text)) {
                @unlink($configPath);
                $errors[] = 'internal/config-local.php could not be written in full, '
                    . 'so it was removed rather than left half-written. Check the '
                    . 'free space and the permissions on internal/. Path: ' . $configPath;
            } else {
                // It holds credentials on the MySQL route. 0600 rather than
                // whatever umask the host happens to have.
                @chmod($configPath, 0600);
                $installed = true;
                $installedRelay = ($deployment === 'relay');
            }
        }
    }

    /* AND IF ANYTHING FAILED, UNDO WHAT THIS RUN CREATED. It used to live
       inside the SQLite branch, so it ran for a failed proof and NOT for
       the two failures that come later -- a configuration that appeared
       while this one was working, and a configuration that could not be
       written. Both left a database and its guard files behind, in the web
       root on the "inside" placement, belonging to nobody and swept by
       nothing. */
    if ($errors && $created) {
        foreach ($created as $path) {
            if (is_file($path)) { @unlink($path); }
        }
        if ($location !== null && is_dir($location['directory'])) {
            @rmdir($location['directory']);
        }
        /* AND THE REPORT HAS TO SAY SO. It went on carrying "Data file --
           created, with its schema" over a run that had just deleted that file
           and its directory: the undo was right and the screen was a step
           behind it. A report describing a state that no longer exists is
           worse than a shorter one. */
        if ($location !== null) {
            $report[] = $fileExisted
                ? array('Data file', 'left exactly as it was',
                    'That file was already there when this run started, so it is not '
                    . 'this run\'s to take back: its notes are untouched. Only what '
                    . 'this run created has been removed.')
                : array('Data file', 'removed again',
                    'Nothing was installed, so what this run created was taken back: '
                    . 'the file, its journals, and the directory when this run made '
                    . 'it. The directory is as it was before.');
        }
    }

    return array(
        'installed' => $installed,
        'relay'     => $installedRelay,
        'token'     => $updateToken,
        'auto'      => $autoUpdate,
        'wants'     => $wants,
    );
}


/**
 * THE QUESTIONS, AS DATA. THREE OF THEM, AND THE PAGE PROMISES THREE.
 *
 * WHY THIS EXISTS RATHER THAN THREE BLOCKS OF `echo`. The same three questions
 * have to be asked twice: once as a form somebody clicks, once as options
 * somebody types, with an aide that names every one of them. Written twice,
 * they diverge at the first change -- which is not a fear, it is what already
 * happened between this file and the page that draws it, and what
 * tools/check-install-questions.mjs now watches.
 *
 * So the legend, the answers, the value each answer sends and the sentence
 * that follows it are declared HERE, once. The form renders them. The command
 * line will read them for `--help` and validate against the same `value`
 * strings -- the exact strings the installation already compares against, and
 * which are what stops a relay being opened by a typo.
 *
 * `say` and `note` carry markup, deliberately: they are written for a screen
 * and this file has always written them as they are. The command line will
 * have to strip the two tags they use, which is cheaper than keeping a second
 * wording in a second place.
 *
 * @return array one entry per question, in the order they are asked
 */
function ap_i_questions()
{
    return array(
        array(
            'key'    => 'audience',
            'legend' => 'Who this server is for',
            'answers' => array(
                array('value' => 'one-site', 'id' => 'a-one', 'class' => 'if-one',
                      'label' => 'One site, mine',
                      'say'   => 'You declare its project by hand, and nothing else '
                                 . 'can write here.'),
                array('value' => 'anyone', 'id' => 'a-anyone', 'class' => 'if-anyone',
                      'label' => 'Anyone',
                      /* THE NUMBER IS THE ONE THIS INSTALLATION WRITES, and it
                         has to be re-read every time that number moves. It said
                         500 for two releases after the cap became 2000 and then
                         6000 -- a screen promising a limit the file it writes
                         does not carry. Found by looking at the screen, which
                         is the only way this kind of drift is ever found. */
                      'say'   => 'A relay: projects nobody declared may write, bounded '
                                 . 'at 6000 rows each -- about 2000 remarks -- and 90 '
                                 . 'days.'),
            ),
        ),
        array(
            'key'    => 'storage',
            'legend' => 'Storage',
            'answers' => array(
                array('value' => 'sqlite', 'id' => 's-sqlite', 'class' => 'if-sqlite',
                      'label' => 'SQLite',
                      'say'   => 'One file. Nothing to create, and the installer proves '
                                 . 'the web server refuses it.'),
                array('value' => 'mysql', 'id' => 's-mysql', 'class' => 'if-mysql',
                      'label' => 'MySQL',
                      'say'   => 'A database you already have. The installer creates '
                                 . 'the tables.'),
            ),
        ),
        array(
            'key'    => 'updates',
            'legend' => 'Keeping this server up to date',
            'answers' => array(
                array('value' => 'cron', 'id' => 'u-cron', 'class' => 'if-cron',
                      'label' => 'A shell cron',
                      'say'   => 'Best, and nothing to grant: <code>php '
                                 . 'internal/update.php</code> once a day. The next '
                                 . 'screen gives you that line with the real path in it.'),
                array('value' => 'url', 'id' => 'u-url', 'class' => 'if-url',
                      'label' => 'An address to call',
                      'say'   => 'For a scheduler that can only fetch a URL. The address '
                                 . 'is shown once, on the next screen.'),
                array('value' => 'self', 'id' => 'u-self', 'class' => 'if-self',
                      'label' => 'It updates itself',
                      'say'   => 'Last resort. It costs a permission that outlives the '
                                 . 'choice &mdash; see below.'),
            ),
        ),
    );
}

/**
 * EVERYTHING ELSE, AND ALL OF IT SETTABLE FROM EITHER FACE.
 *
 * The installer asks three questions and that does not change: they are what
 * somebody must answer, and a fourth would be a fourth. But asking three is
 * not the same as deciding the other fourteen behind their back -- and it did
 * decide one of them, `max_notes_per_project`, which on a relay it wrote at
 * 500 without a word. That is the cap whose arrival makes a project MUTE: a
 * reply is a write like any other, so past it nobody can answer anybody, and
 * nothing releases it but the operator.
 *
 * So: three questions in front, and this table behind a fold. Same source for
 * both faces -- the form renders it, the command line derives one option per
 * entry from it, and what is written into the configuration comes from the
 * same place. A setting added here appears in all three without anybody
 * remembering to.
 *
 * EVERY KEY OF internal/config.php AN OPERATOR MAY SET IS IN THIS TABLE, and
 * a check refuses one that is not. What is not settable here is not settable
 * at install time at all, and --help says which two those are and why.
 *
 * THE THIRTEEN FIELD LENGTHS ARE NOT KEYS ANY MORE, so they are not here
 * either. They spent one release in this table, behind a fold, on the
 * principle that every setting must be visible -- and being visible is what
 * showed they were never settings: nine of them are written into the MySQL
 * table as VARCHAR(n) at CREATE, so raising one afterwards changes what the
 * server accepts and not what the column holds, and a plain-mode remark then
 * dies at the insert with a 500 and the reviewer's text gone. They are
 * constants at the bottom of internal/config.php now, with the measurement.
 * What is metered here is VOLUME -- how many notes, how many requests, how
 * big a request -- which is the operator's subject; the length of one field
 * is the format's.
 *
 * `kind` is what the value IS, so that each face can render and check it:
 * 'int', 'bool', 'text', 'choice'. `unit` is what the number counts, for the
 * sentence. `decided` is what THIS INSTALLATION writes when the field is left
 * empty, per audience, where that differs from config.php's default. No entry
 * carries a default -- ap_i_setting_default() reads the live one out of
 * config.php, so the number shown beside a field cannot drift from the number
 * in force, and an empty field still means "leave it deciding".
 */
function ap_i_settings()
{
    return array(
        array('key' => 'max_notes_per_project', 'hint' => 'Rows, replies included. 0 is no limit.', 'group' => 'keep', 'kind' => 'int', 'unit' => 'notes',
            'label' => 'Notes one project may hold',
            'decided' => array('one-site' => 'no limit', 'anyone' => '6000 rows, about '
                                                         . '2000 remarks'),
            'say'   => 'Counted in ROWS, not in remarks: a reply is a row of its own, '
                       . 'so a discussed thread costs two or three. Past it a write is '
                       . 'refused with a 403 and NOTHING is erased -- but a reply is a '
                       . 'write, so the project goes silent until somebody raises this. '
                       . '0 is no limit, which is what a server carrying one team\'s own '
                       . 'notes wants. A relay needs one: it stores for strangers. '
                       . 'Measured: six reviewers over three months write about 3600 '
                       . 'rows, and a relay is capped at 6000 unless you say otherwise.'),
        array('key' => 'max_note_age_days', 'hint' => 'From a thread&rsquo;s last message. 0 keeps everything.', 'group' => 'keep', 'kind' => 'int', 'unit' => 'days',
            'label' => 'How long a thread is kept',
            'decided' => array('one-site' => '90 days', 'anyone' => '90 days'),
            'say'   => 'Counted from its LAST message, so a live discussion is never '
                       . 'cut short, and the whole thread goes at once. 0 keeps '
                       . 'everything for ever, which is what config.php decides for a '
                       . 'server this file never installed.'),
        array('key' => 'rate_window_seconds', 'hint' => 'Fixed, not sliding.', 'group' => 'rate', 'kind' => 'int', 'unit' => 'seconds',
            'label' => 'The window the limits below are counted in',
            'say'   => 'Fixed, not sliding: hitting a limit early in a window costs the '
                       . 'rest of it. A long window makes a refusal last longer.'),
        array('key' => 'rate_writes_per_ip', 'hint' => '', 'group' => 'rate', 'kind' => 'int', 'unit' => 'writes',
            'label' => 'Writes per address, per window',
            'say'   => 'Everybody behind one office address counts as one machine, on '
                       . 'all of their projects together.'),
        array('key' => 'rate_writes_per_project', 'hint' => 'All of its writers together.', 'group' => 'rate', 'kind' => 'int', 'unit' => 'writes',
            'label' => 'Writes per project, per window',
            'decided' => array('one-site' => '0, which is off -- everybody who can '
                                             . 'write here is already behind your door',
                               'anyone'   => '300'),
            'say'   => 'All of that project\'s writers together. It is the anti-abuse '
                       . 'ceiling, not the working budget.'),
        array('key' => 'rate_exports_per_ip', 'hint' => 'An assistant spends about three per remark.', 'group' => 'rate', 'kind' => 'int', 'unit' => 'exports',
            'label' => 'Exports per address, per window',
            'decided' => array('one-site' => '0, which is off -- the only reader of an '
                                             . 'export here is your own assistant',
                               'anyone'   => '90'),
            'say'   => 'An export is how an assistant READS: its whole loop -- read, '
                       . 'reply, resolve -- costs about three per remark, so 90 per '
                       . 'window is thirty remarks. Measured: at 20 an assistant met '
                       . 'the refusal in the middle of its seventh remark, on day one.'),
        array('key' => 'rate_reads_per_ip', 'hint' => '0 costs nothing: the counter is never touched.', 'group' => 'rate', 'kind' => 'int', 'unit' => 'page loads',
            'label' => 'Page loads per address, per window',
            'say'   => 'OFF, and 0 means the counter is never touched: a page load then '
                       . 'costs no database write, which is why it is the default. It is '
                       . 'the only thing that bounds a loop of `list` -- 200 bytes asked, '
                       . 'several hundred kilobytes answered on a heavily annotated page '
                       . '-- so a server open to strangers with nothing in front of PHP '
                       . 'wants it. Set it far above a person: one page load is one call, '
                       . 'so 600 in five minutes is two a second and no reviewer will '
                       . 'ever meet it.'),
        array('key' => 'max_body_bytes', 'hint' => '', 'group' => 'rate', 'kind' => 'int', 'unit' => 'bytes',
            'label' => 'Largest request body',
            'say'   => 'Read before anything is parsed; over it, a 413. Sized by the '
                       . 'envelope bounds of the format, not by what people write: the '
                       . 'longest remark measured on a real project used 5% of it.'),
        array('key' => 'client_ip_header', 'hint' => 'Only behind a proxy you trust: a client can write it itself.', 'group' => 'server', 'kind' => 'text', 'unit' => '',
            'label' => 'Header carrying the real address, behind a proxy',
            'say'   => 'Empty unless a TRUSTED proxy rewrites it on every request: a '
                       . 'header the client can set itself makes every limit above '
                       . 'bypassable in one line. Without it, everyone behind that proxy '
                       . 'counts as one machine.'),
        array('key' => 'publish_server_totals', 'hint' => 'Three figures, to anybody who opens an annotated page.', 'group' => 'server', 'kind' => 'bool', 'unit' => '',
            'label' => 'Publish what the whole server holds',
            'say'   => 'Three integers -- projects, notes, pages -- answered to anybody '
                       . 'who can open one annotated page. Counted on every page load: '
                       . 'measured at 5.7 ms without it and 41.8 ms with it on 60,000 '
                       . 'notes.'),
        array('key' => 'forward_root_to', 'hint' => 'The directory only, never api.php.', 'group' => 'server', 'kind' => 'text', 'unit' => '',
            'label' => 'Where a bare visit to this directory goes',
            'say'   => 'Empty gives a 404. An absolute http(s) URL sends it there with a '
                       . '302 -- what a public relay wants, so that somebody landing on '
                       . 'the bare host reaches a page explaining what this is. It never '
                       . 'applies to api.php.'),
        array('key' => 'diagnostic', 'hint' => '<code>full</code> publishes the whole report to whoever asks.', 'group' => 'server', 'kind' => 'choice', 'unit' => '',
            'values' => array('minimal', 'full', 'off'),
            'label' => 'How much ?action=diagnostic tells',
            'say'   => 'That page has no authentication, so what it publishes it '
                       . 'publishes to everybody. `minimal` is four lines and answers '
                       . 'even when the configuration cannot be read, which is when it '
                       . 'is needed; `full` is the whole report, for the length of a '
                       . 'diagnosis; `off` makes the action not exist.'),
        array('key' => 'table_prefix', 'hint' => 'Only on a database shared with something else.', 'group' => 'server', 'kind' => 'text', 'unit' => '',
            'label' => 'Prefix of the table names',
            'say'   => 'The tables are <prefix>notes, <prefix>rate and <prefix>tally. '
                       . 'Only worth changing on a database shared with something else '
                       . 'that already owns those names.'),
        array('key' => 'update_source', 'hint' => 'Where this server fetches its own code.', 'group' => 'risky', 'kind' => 'text', 'unit' => '',
            'label' => 'Where updates are fetched from',
            'say'   => 'The release channel. `next` instead of `main` in that address '
                       . 'runs the candidate; a fork or a mirror inside a closed network '
                       . 'goes here too. HTTPS only, and no flag relaxes that.'),
        array('key' => 'allow_plain_http', 'hint' => 'Without https a browser cannot encrypt anything.', 'group' => 'risky', 'kind' => 'bool', 'unit' => '',
            'label' => 'Answer over plain http',
            'say'   => 'A way out, not a preference: without https there is no WebCrypto, '
                       . 'so nothing can be encrypted in a browser. Turn it on only for a '
                       . 'host that reports an https visitor as http and therefore '
                       . 'redirects in a loop.'),
    );
}

/**
 * The default really in force for a setting, as text, for showing beside its
 * field.
 *
 * READ OUT OF config.php AT THE MOMENT IT IS SHOWN, never copied into the
 * table above: a copy would go on saying 4000 the day config.php says 8000,
 * and a number shown beside an empty field is a promise about what happens if
 * the field stays empty. Booleans read `true`/`false` as they will be
 * written; a null reads as nothing, because that is what it is.
 */
function ap_i_setting_default($key)
{
    $defaults = ap_config_defaults();
    if (!array_key_exists($key, $defaults)) {
        return '';
    }
    $value = $defaults[$key];
    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }
    if ($value === null) {
        return '';
    }
    return (string) $value;
}

/**
 * The sections the settings are shown in, in order, on both faces.
 *
 * ONE PAGE, READ TOP TO BOTTOM, AND NOTHING HIDDEN THAT IS NOT NAMED. The
 * fifteen settings were behind a single fold called "change anything else",
 * which is honest and useless: it says a list exists without saying what is in
 * it, so the person who came to set a retention or a rate limit has to open it
 * and read fifteen fields to find two. Grouped, the fold's own title answers
 * "is what I came for in here?" before it is opened.
 *
 * `open` is what a section shows without being asked, and only the first is:
 * how long notes are kept is a promise this server makes on every annotated
 * page, and it was written as 90 days at the bottom of a fold nobody opened.
 * The others are shut, so the page is still the length it was.
 *
 * `warn` marks the section whose settings can undo what the tool is for. It is
 * not hidden -- hiding it is what makes somebody find it in a forum post
 * instead -- it is named, and it says what each one costs.
 */
function ap_i_setting_sections()
{
    return array(
        'keep' => array(
            'title' => 'What this server keeps, and for how long',
            'open'  => true,
            'hint'  => '',
            'say'   => 'The two numbers that decide whether a remark is still there '
                       . 'next month. Both are written into your configuration by this '
                       . 'installation, so they are here rather than in a fold.',
        ),
        'rate' => array(
            'title' => 'How fast anybody may write, read or export',
            'open'  => false,
            'hint'  => 'Per address and per project, in a fixed window. Over the limit '
                       . 'is a 429 saying when to come back; 0 switches one off.',
            'say'   => 'Counted per address and per project, in a fixed window. Past a '
                       . 'limit the answer is a 429 saying when to come back, and '
                       . 'nothing is lost. 0 switches a counter off entirely -- and off '
                       . 'means the counter is never touched, not touched and ignored.',
        ),
        'server' => array(
            'title' => 'What this server says about itself, and where it sits',
            'open'  => false,
            'hint'  => 'None of these changes what is stored.',
            'say'   => 'None of these changes what is stored. They decide what a '
                       . 'stranger can read from the outside, what this server believes '
                       . 'about the address a request came from, and which tables it '
                       . 'writes into.',
        ),
        'risky' => array(
            'title' => 'Two that can undo what this tool is for',
            'open'  => false,
            'warn'  => true,
            'hint'  => 'Both have a use, and both are the wrong answer nine times out '
                       . 'of ten.',
            'say'   => 'Both have a legitimate use and both are the wrong answer nine '
                       . 'times out of ten. They are named rather than hidden: a '
                       . 'setting somebody finds in a forum post is a setting they use '
                       . 'without the sentence that goes with it.',
        ),
    );
}

/** One setting by key, or null. */
function ap_i_setting($key)
{
    foreach (ap_i_settings() as $setting) {
        if ($setting['key'] === $key) { return $setting; }
    }
    return null;
}

/**
 * The one question that is not a choice: where the MySQL server is.
 *
 * Asked only by the answer above it, which is why it is not a fourth dial --
 * the page promises three questions and a person choosing SQLite is asked
 * nothing here. The command line reads this list too: every entry becomes
 * `--mysql-<key>`, and none of them becomes anything else.
 */
function ap_i_credential_fields()
{
    return array(
        array('name' => 'host', 'label' => 'Host', 'type' => 'text',
              'default' => '127.0.0.1'),
        array('name' => 'port', 'label' => 'Port', 'type' => 'number',
              'default' => '3306'),
        array('name' => 'name', 'label' => 'Database name', 'type' => 'text',
              'default' => ''),
        array('name' => 'user', 'label' => 'User', 'type' => 'text',
              'default' => ''),
        /* No value attribute, ever: a password sent back to the browser would
           sit in the page's source and in its cache. Retyping it is the price. */
        array('name' => 'password', 'label' => 'Password', 'type' => 'password',
              'default' => null),
    );
}

/**
 * One question, drawn. The form is the only caller today; the command line
 * renders the same model as text.
 */
function ap_i_render_dial(array $question, $chosen)
{
    echo '<fieldset class="dial"><legend>' . $question['legend'] . '</legend>' . "\n";
    echo '<div class="seg">' . "\n";
    foreach ($question['answers'] as $answer) {
        echo '<label><input type="radio" name="' . $question['key']
            . '" value="' . $answer['value'] . '" id="' . $answer['id'] . '"'
            . ($chosen === $answer['value'] ? ' checked' : '')
            . '><span>' . $answer['label'] . "</span></label>\n";
    }
    echo "</div>\n";
    echo '<p class="dial-say">';
    foreach ($question['answers'] as $answer) {
        echo '<span class="' . $answer['class'] . '">' . $answer['say'] . '</span>';
    }
    echo "</p>\n";
    echo "</fieldset>\n";
}

/** The question of the given key, or null. */
function ap_i_question($key)
{
    foreach (ap_i_questions() as $question) {
        if ($question['key'] === $key) { return $question; }
    }
    return null;
}

/**
 * A SCREEN, DRAWN. The blocks come in as a list of [type, ...] and go out as
 * the markup this file has always written -- byte for byte, which is how the
 * conversion was checked.
 *
 * Eight types cover the whole installer. That is not a design goal met by
 * luck: the screens were counted before this was written -- 21 paragraphs,
 * eight code blocks, six headings, four sub-headings, two warnings, one lede,
 * one table, one button -- and nothing else appeared.
 *
 * WHY A LIST RATHER THAN echo. The same screen has to be said twice: to a
 * browser, and to a shell that has no browser. Written twice it diverges, and
 * this file's own header says the day it was two copies of one page is the day
 * one of them started being wrong.
 */
function ap_i_render_html(array $screen)
{
    foreach ($screen as $block) {
        switch ($block[0]) {
            case 'lede':
                echo '<p class="lede">' . $block[1] . "</p>\n";
                break;
            case 'p':
                echo '<p>' . $block[1] . "</p>\n";
                break;
            case 'bad':
                echo '<p class="note bad">' . $block[1] . "</p>\n";
                break;
            case 'h2':
                echo '<h2>' . $block[1] . "</h2>\n";
                break;
            case 'h3':
                echo '<h3>' . $block[1] . "</h3>\n";
                break;
            case 'pre':
                echo '<pre>' . $block[1] . "</pre>\n";
                break;
            /* The three columns are escaped HERE and nowhere else: they are
               the only blocks whose content is measured rather than written,
               so they are the only ones that can carry a path somebody chose. */
            case 'table':
                echo "<table>\n";
                foreach ($block[1] as $line) {
                    echo '<tr><td class="k">' . ap_i_h($line[0]) . '</td><td class="v">'
                        . ap_i_h($line[1]) . '</td><td class="m">' . ap_i_h($line[2])
                        . "</td></tr>\n";
                }
                echo "</table>\n";
                break;
            /* The environment table is the other one: four columns rather than
               three, and the measured value carries a class when the answer is
               not the one wanted. */
            case 'table-env':
                echo "<table>\n";
                foreach ($block[1] as $line) {
                    echo '<tr><td class="k">' . ap_i_h($line[0]) . '</td>'
                        . '<td class="v' . ($line[2] ? '' : ' bad') . '">'
                        . ap_i_h($line[1]) . '</td>'
                        . '<td class="m">' . ap_i_h($line[3]) . "</td></tr>\n";
                }
                echo "</table>\n";
                break;
            case 'button':
                echo '<form method="post"><button type="submit" name="' . $block[1]
                    . '" value="1">' . $block[2] . "</button></form>\n";
                break;
        }
    }
}

/**
 * THE LAST SCREEN, BUILT AND NOT DRAWN.
 *
 * It returns the list of blocks; the caller decides whether they become a page
 * or lines on a terminal. That is the whole reason it is a function: this is
 * the one screen both faces have to show -- the address for the tag, the two
 * crontab lines with the real path in them, the update token that appears here
 * and nowhere else -- and a screen written twice is a screen that will
 * disagree with itself.
 */
function ap_i_screen_installed($installedRelay, $serverUrl, $here, $selfName,
                               array $report, $autoUpdate, $outboundUrl, $updateToken)
{
    /* THE SCREEN, BUILT BEFORE IT IS DRAWN. Every line below adds a block
       to this list; nothing writes to the page until the end. The list is
       what the command line will print as text -- the same screen, said
       twice, from one place. */
    $screen = array();
    $screen[] = array('lede', 'Installed. One line left to paste.');

    $screen[] = array('h2', 'The line');
    $screen[] = array('p',
        'The tag on the pages you want to annotate carries this address:');
    $screen[] = array('pre', 'data-server="' . ap_i_h($serverUrl) . '"');
    if ($installedRelay) {
        $screen[] = array('p', 'The rest of the tag &mdash; the script source and the project id '
            . '&mdash; comes from the client, and there is nothing to declare here: '
            . 'this server answers about any project id it is given. The key never '
            . 'reaches it, in any form: that is what makes the notes unreadable to '
            . "it, and to you.");
    } else {
        $screen[] = array('p', 'The rest of the tag &mdash; the script source and the project id '
            . '&mdash; comes from the client. Add the tag to a page, open it, and the '
            . 'setup screen generates the key in your browser and hands you the block '
            . 'to paste into <code>internal/config-local.php</code> under '
            . '<code>projects</code>. The key never reaches this server, in any form: '
            . "that is what makes the notes unreadable to it.");
    }

    /* THE ONE THING THIS INSTALLATION DOES THAT THE TOOL OTHERWISE PROMISES
       NOT TO. Everywhere else "nothing is ever deleted" holds; here a
       number was just written into the configuration, and the person who
       pressed the button is the person who has to know it. Said on the
       screen that reports what was done, not left to a comment inside a
       file and a line in a diagnostic nobody opens. */
    $screen[] = array('h2', 'How long a remark is kept');
    $screen[] = array('p', 'Ninety days after the last message of its thread &mdash; a review '
        . 'cycle with room to spare &mdash; and then the whole thread goes at '
        . 'once, so a reply is never cut off its remark. Nobody chooses which: '
        . 'there is no moderation here and no takedown, which is the point of '
        . "saying age and only age.");
    $screen[] = array('p', 'It is <code>\'max_note_age_days\' => 90</code> in the configuration '
        . 'just written. Set it to <code>0</code> to keep everything for ever. '
        . 'While it is set, the panel on your pages says so and every export '
        . "carries it in its header &mdash; nobody discovers it late.");

    /* WHAT ACTUALLY SWEEPS. Without this line the ceiling is kept by a die
       rolled on writes -- which is enough on a busy relay and is nothing at
       all on the case retention exists for: a project nobody has come back
       to. A promise measured in days needs a job measured in days. */
    $sweepScript = ap_i_update_script($here, 'maintenance.php');
    $screen[] = array('p', 'One line makes it happen on time. Without it the sweep is a die '
        . 'rolled on writes, which on a project nobody comes back to &mdash; the '
        . 'very case this exists for &mdash; is never rolled at all:');
    $screen[] = array('pre', ap_i_h(ap_i_cron_time()) . ' php ' . ap_i_h($sweepScript)
        . " &gt;/dev/null");
    $screen[] = array('p', 'Drawn for you, like the update line further down, so that a hundred '
        . 'installations do not rewrite their databases at the same second. It '
        . 'also brings the storage in line with the code after an update that '
        . 'changes what a column should be, on a table small enough to rebuild '
        . 'unasked -- above that it prints the SQL and leaves the moment to you. '
        . 'It prints what it swept and exits 0 when there was nothing to do. It is '
        . 'not reachable over the web, and there is no address for it: the only '
        . 'thing that could buy anybody is making somebody else\'s deletions '
        . "happen sooner.");
    $screen[] = array('h2', 'What was measured');
    $screen[] = array('table', $report);

    $screen[] = array('h2', 'Check it, in one request');
    $screen[] = array('pre', ap_i_h($serverUrl) . '?action=diagnostic');
    $screen[] = array('p', 'Plain text, and short by default: the tool, its version, the format '
        . 'and the verdict &mdash; running, or not, and what to do about it. That '
        . 'page has no authentication, so what it publishes it publishes to '
        . "everybody.");
    $screen[] = array('p', 'The configuration just written carries '
        . '<code>\'diagnostic\' => \'minimal\'</code>. Change it to '
        . '<code>\'full\'</code> for the whole report &mdash; the PHP really '
        . 'served, the storage and its state, the declared projects with their '
        . 'origins &mdash; and change it back when you are done. No credential '
        . "value ever appears there, under either value.");

    // --- KEEPING IT UP TO DATE. THREE WAYS, RANKED, WITH THE REAL PATH AND
    // THE REAL URL OF THIS INSTALLATION. An example is a thing to adapt, and
    // the adaptation is where it goes wrong -- on the machines this tool
    // targets, whose operator has a control panel and no shell, "replace
    // /path/to with your path" is where the update stops being set up at all.
    //
    // WHAT IS SHOWN IS CUT TO WHAT THIS HOST CAN DO. By now we know the PHP
    // interface, whether anything can get out to HTTPS, and whether a token
    // was written. Offering the third way on a `cgi-fcgi` host would be
    // offering a key that is read and declined on every write.
    //
    // THE TOKEN IS PRINTED HERE AND NOWHERE ELSE. Not in ?action=diagnostic,
    // which has no authentication and answers whoever asks; not in a log.
    // Whoever loses it writes a new one into config-local.php by hand.
    $updateToken = (string) $updateToken;
    $autoUpdateOn = (bool) $autoUpdate;
    $canDefer = ap_i_can_defer();
    $updateScript = ap_i_update_script($here);
    $cronWhen = ap_i_cron_time();
    $reach = ap_i_fetch($outboundUrl, 4);
    $canReach = $reach['status'] !== null;

    $screen[] = array('h2', 'Keeping it up to date');
    $screen[] = array('p', 'Once a day is enough. A release is not an emergency, and a run '
        . 'with nothing to fetch costs one version check and stops there. '
        . "Three ways, best first &mdash; you need one of them.");
    if (!$canReach) {
        $screen[] = array('bad', 'This server could not reach the outside over '
            . 'HTTPS just now, so nothing below can fetch anything until that is '
            . 'fixed. A shell with <code>curl</code> may still get out where PHP '
            . "cannot; the lines are here for when it does.");
    }

    $screen[] = array('h3', '1. Cron, from a shell &mdash; use this one');
    $screen[] = array('p', 'It is the best of the three for one reason: the code directory stays '
        . 'writable by <strong>you</strong> and never by the web server, so no '
        . 'request to this site can rewrite this code whatever goes wrong in it. '
        . 'Nothing to turn on and nothing to keep secret. Run it once by hand to '
        . "watch it work, then give cron this line:");
    $screen[] = array('pre', 'php ' . ap_i_h($updateScript) . "\n\n"
        . ap_i_h($cronWhen) . ' php ' . ap_i_h($updateScript) . " &gt;/dev/null");
    $screen[] = array('p', 'That minute and that hour were drawn for you, and any others do as '
        . 'well: what matters is that every installation does not ask the same host '
        . 'for the same file at the same second. It '
        . 'exits 0 when there was nothing to do &mdash; which is most nights &mdash; '
        . 'and 1 only when something really failed, so a scheduler that reports '
        . 'failures has something to report on. Drop the <code>&gt;/dev/null</code> '
        . "and it mails you the result of every run instead.");

    $screen[] = array('h3', '2. Cron that can only fetch a URL');
    if ($updateToken !== '') {
        $screen[] = array('p', 'Much shared hosting has a scheduler that takes an address and '
            . 'nothing else. This is the address, and <strong>this screen is the '
            . 'only place it will ever appear</strong> &mdash; it is not in '
            . '<code>?action=diagnostic</code> and not in any log. Copy it before '
            . "you leave this page.");
        $screen[] = array('pre',
            ap_i_h($serverUrl . '?action=update&token=' . $updateToken));
        $screen[] = array('p',
            'Paste that into the panel. From a crontab, the same thing:');
        $screen[] = array('pre', ap_i_h($cronWhen) . ' curl -fsS \''
            . ap_i_h($serverUrl . '?action=update&token=' . $updateToken)
            . "' &gt;/dev/null");
        $screen[] = array('p', 'Whoever calls it waits while the update runs and is answered with '
            . 'what it did &mdash; allowed at that address and nowhere else, because '
            . 'they came for it and no reader of a page is kept waiting. At most one '
            . 'real check a day however often it is called; add '
            . '<code>&amp;force=1</code> to check anyway. To retire the address, '
            . 'empty <code>update_token</code> in '
            . '<code>internal/config-local.php</code> and it stops existing &mdash; '
            . "unknown, not refused.");
    } else {
        $screen[] = array('p', 'Much shared hosting has a scheduler that takes an address and '
            . 'nothing else. You did not ask for one, so none was written. To have '
            . 'it, put a secret of 32 characters or more in '
            . "<code>internal/config-local.php</code>:");
        $screen[] = array('pre',
            '\'update_token\' => \'32 characters or more, of your own\',');
        $screen[] = array('p', 'and <code>' . ap_i_h($serverUrl)
            . '?action=update&amp;token=&lt;that secret&gt;</code> then runs the '
            . 'update during the request and answers with what it did. Until such a '
            . 'key exists the action does not exist either &mdash; unknown, not '
            . "refused.");
    }

    if (!$canDefer) {
        $screen[] = array('h3',
            '3. Letting the server update itself &mdash; impossible here');
        $screen[] = array('p', 'This PHP interface (<code>' . ap_i_h(PHP_SAPI) . '</code>) cannot '
            . 'hand the response to the visitor before doing more work, and somebody '
            . 'who came to read or write a note must never wait on a fetch to GitHub. '
            . 'So <code>auto_update</code> is read and declined here on every write, '
            . 'ticked or not. That is the ordinary case on shared hosting, and it is '
            . "why the address above exists.");
        if ($autoUpdateOn) {
            $screen[] = array('bad', 'It is on in the configuration just written, '
                . 'and it will do nothing but be declined. Set '
                . '<code>\'auto_update\' => false</code> in '
                . '<code>internal/config-local.php</code>, and do not give the web '
                . "server write access to this directory.");
        }
    } else {
        $screen[] = array('h3',
            '3. Letting the server update itself &mdash; last resort');
        $screen[] = array('p', 'Only if neither of the two above exists on this host. It costs '
            . 'something the others do not: the code directory has to be '
            . '<strong>writable by the user PHP runs as</strong>, and from that '
            . 'moment any bug anywhere on this account that can write a file &mdash; '
            . 'in this code, in a neighbouring application, in a plugin nobody '
            . 'remembers installing &mdash; stops being a defacement and becomes '
            . 'permanent code execution. Setting the key back to <code>false</code> '
            . 'does not undo it: the permission stays until somebody takes it '
            . "away.");
        $screen[] = array('pre', '\'auto_update\' => true,');
        $screen[] = array('p', 'in <code>internal/config-local.php</code>'
            . ($autoUpdateOn ? ' &mdash; already written there, because you asked for '
                . 'it on the form.' : ', where it is currently <code>false</code>.')
            . ' The check then happens on a write, at most once a day, never on a '
            . "read, and only after the reader already has their answer.");
    }

    $screen[] = array('h2', 'Now delete this file');
    $screen[] = array('p', 'It has done its job. It refuses to act while the configuration exists, '
        . 'but an installer that stays reachable and writable on a live server is a '
        . 'liability all the same.');
    $screen[] = array('button', 'delete_self', 'Delete ' . ap_i_h($selfName));


    return $screen;
}

/* ===========================================================================
   THE OTHER FACE. THE SAME INSTALLATION, TYPED RATHER THAN CLICKED.
   ===========================================================================

   It asks nothing. There is no prompt and no confirmation: a prompt with a
   default is a prompt nobody sees in a scheduled run, and typing the command
   is the consent -- the same sentence internal/update.php writes about its own
   command line.

   It shares everything that matters with the browser face: the questions come
   from ap_i_questions(), the installation is ap_i_install(), the screen is the
   same list of blocks. What differs is what a shell cannot know and a request
   carries for free -- the address this server answers at -- and one answer
   that cannot be measured from here, which is refused rather than guessed.
   =========================================================================== */

/**
 * The options, derived from the questions rather than listed beside them.
 *
 * A second list would drift from the first at the first change. Every option
 * below is either a question (its values ARE the question's values, the exact
 * strings the installation compares against) or one of the four things a shell
 * has to be told.
 */
function ap_i_cli_options()
{
    $options = array();

    $named = array('audience' => 'answers-for', 'storage' => 'storage',
                   'updates'  => 'updated-by');
    foreach (ap_i_questions() as $question) {
        $values = array();
        foreach ($question['answers'] as $answer) {
            $values[] = $answer['value'];
        }
        $options[$named[$question['key']]] = array(
            'kind'   => 'choice',
            'field'  => $question['key'],
            'values' => $values,
            'legend' => $question['legend'],
        );
    }

    foreach (ap_i_credential_fields() as $box) {
        $options['mysql-' . $box['name']] = array(
            'kind'  => 'value',
            'field' => $box['name'],
            'label' => $box['label'],
        );
    }

    /* THE PASSWORD, THE OTHER WAY. An argument is world-readable: /proc/<pid>/
       cmdline is mode 444 on the hosting this tool targets, so every other
       account on the machine can read it while the command runs, and the shell
       keeps it in its history afterwards. The file is read once, here, and
       what lands in the configuration is the value itself -- exactly what the
       browser form writes. */
    $options['mysql-password-file'] = array('kind' => 'value', 'field' => null,
        'label' => 'A file holding the password');

    /* ONE OPTION PER SETTING, and their names ARE their keys: somebody who has
       read the configuration file, or the FAQ, already knows what to type.
       Nothing is invented and nothing is renamed. */
    foreach (ap_i_settings() as $setting) {
        $options[str_replace('_', '-', $setting['key'])] = array(
            'kind'    => 'value',
            'field'   => null,
            'setting' => $setting['key'],
            'label'   => $setting['label'],
        );
    }

    $options['api-address'] = array('kind' => 'value', 'field' => null,
        'label' => 'The address api.php will answer at');
    $options['dir'] = array('kind' => 'value', 'field' => null,
        'label' => 'The directory to install into');
    $options['delete-installer'] = array('kind' => 'flag', 'field' => null,
        'label' => 'Delete this file once the configuration is written');
    $options['help'] = array('kind' => 'flag', 'field' => null, 'label' => 'This text');
    $options['verbose'] = array('kind' => 'flag', 'field' => null,
        'label' => 'With --help: the reasoning behind every option, not just the list');
    $options['version'] = array('kind' => 'flag', 'field' => null,
        'label' => 'The version of this file, and nothing else');

    return $options;
}

/**
 * Reads the command line. Refuses everything it does not recognise.
 *
 * A value that was ignored would install the default and read as a success --
 * which is what the browser form does deliberately, because a radio always
 * sends one of its own values and the narrow answer is the safe one. A shell
 * has no such guarantee, so here an unknown option, an unknown value or a
 * missing required one stops the run before anything is touched.
 *
 * @return array array('given' => …, 'errors' => …)
 */
function ap_i_parse_options(array $argv)
{
    $known  = ap_i_cli_options();
    $given  = array();
    $errors = array();

    foreach (array_slice($argv, 1) as $argument) {
        if ($argument === '--') {
            continue;
        }
        if (substr($argument, 0, 2) !== '--') {
            $errors[] = 'Not an option: ' . $argument
                . '. Everything this takes is written --name=value.';
            continue;
        }
        $body = substr($argument, 2);
        $eq   = strpos($body, '=');
        $name = $eq === false ? $body : substr($body, 0, $eq);
        $value = $eq === false ? true : substr($body, $eq + 1);

        if (!isset($known[$name])) {
            $errors[] = 'Unknown option: --' . $name
                . '. Run with --help for the ones there are.';
            continue;
        }
        $shape = $known[$name];
        if ($shape['kind'] === 'flag' && $value !== true) {
            $errors[] = '--' . $name . ' takes no value.';
            continue;
        }
        if ($shape['kind'] !== 'flag' && $value === true) {
            $errors[] = '--' . $name . ' needs a value: --' . $name . '=…';
            continue;
        }
        if ($shape['kind'] === 'choice' && !in_array($value, $shape['values'], true)) {
            $errors[] = '--' . $name . '=' . $value . ' is not one of: '
                . implode(', ', $shape['values']) . '.';
            continue;
        }
        /* A SETTING IS CHECKED AGAINST WHAT IT IS. A ceiling that arrived as
           `2 000` or `deux mille` and was read as 2 would be a limit nobody
           asked for, reached in an afternoon. */
        if (isset($shape['setting'])) {
            $setting = ap_i_setting($shape['setting']);
            if ($setting['kind'] === 'int' && !preg_match('/^\d+$/', (string) $value)) {
                $errors[] = '--' . $name . ' takes a whole number of '
                    . ($setting['unit'] !== '' ? $setting['unit'] : 'units')
                    . ', and 0 where that means no limit. Given: ' . $value;
                continue;
            }
            if ($setting['kind'] === 'bool'
                && !in_array($value, array('true', 'false'), true)) {
                $errors[] = '--' . $name . ' takes true or false. Given: ' . $value;
                continue;
            }
            if ($setting['kind'] === 'choice'
                && !in_array($value, $setting['values'], true)) {
                $errors[] = '--' . $name . ' is not one of: '
                    . implode(', ', $setting['values']) . '. Given: ' . $value;
                continue;
            }
        }
        /* SAID TWICE IS NOT SAID ONCE. `--answers-for=one-site
           --answers-for=anyone` took the last and opened a relay without a
           word -- which is the very outcome the exact-string comparisons in
           this file exist to prevent, reached by a generated command line that
           appends an override after a default. */
        if (isset($given[$name])) {
            $errors[] = '--' . $name . ' was given twice. Which one did you mean?';
            continue;
        }
        $given[$name] = $value;
    }

    return array('given' => $given, 'errors' => $errors);
}

/** Markup out of a sentence written for a screen. */
function ap_i_plain($text, $keepLines = false)
{
    /* STRIPPED FIRST, DECODED AFTER, AND THE ORDER IS THE WHOLE POINT.
       Decoding `&lt;that secret&gt;` into `<that secret>` and THEN stripping
       tags fed it to strip_tags as an element: the browser printed
       "token=<that secret> then runs", the terminal printed "token= then
       runs". The one placeholder somebody has to replace was the thing that
       disappeared. */
    $text = strip_tags((string) $text);
    /* THE CURLY ONES TOO. `&rsquo;` reached a terminal as five literal
       characters the day a hint used an apostrophe -- the list was written
       when nothing but `&mdash;` was in play, and a list of entities is a list
       that falls behind the text it serves. */
    $text = str_replace(
        array('&mdash;', '&ndash;', '&nbsp;', '&amp;', '&quot;', '&#039;', '&apos;',
              '&lsquo;', '&rsquo;', '&ldquo;', '&rdquo;', '&hellip;', '&lt;', '&gt;'),
        array('--', '-', ' ', '&', '"', "'", "'",
              "'", "'", '"', '"', '...', '<', '>'), $text);
    /* A `pre` block is the only place where a line break MEANS something: it
       separates the command you run by hand from the crontab line. Collapsing
       whitespace there glued the two into one line nobody could use. */
    if ($keepLines) {
        return trim($text, "\n");
    }
    return trim(preg_replace('/\s+/', ' ', $text));
}

/** A paragraph, folded at 78 columns, indented as asked. */
/** Entities decoded, tags left alone: for what a server answered. */
function ap_i_entities($text)
{
    return str_replace(
        array('&mdash;', '&nbsp;', '&amp;', '&quot;', '&#039;', '&lt;', '&gt;'),
        array('--', ' ', '&', '"', "'", '<', '>'), (string) $text);
}

function ap_i_wrap($text, $indent = '', $strip = true)
{
    /* The fold is 78 columns INCLUDING the indent: folding to 78 and then
       pushing the whole block six spaces right gives 84, which wraps again in
       an 80-column terminal, in the wrong place and twice. */
    $width = 78 - strlen($indent);
    if ($width < 24) { $width = 24; }
    $body = $strip ? ap_i_plain($text) : trim(preg_replace('/\s+/', ' ', (string) $text));
    return $indent . str_replace("\n", "\n" . $indent,
        wordwrap($body, $width, "\n", false));
}

/**
 * The same screen the browser is shown, in text.
 *
 * It reads the very list ap_i_render_html() reads. Two renderings of one
 * screen; no second wording anywhere.
 */
function ap_i_render_text(array $screen)
{
    $out = '';
    foreach ($screen as $block) {
        switch ($block[0]) {
            case 'lede':
                $out .= ($out === '' ? '' : "\n") . ap_i_wrap($block[1]) . "\n";
                break;
            case 'p':
                $out .= "\n" . ap_i_wrap($block[1]) . "\n";
                break;
            case 'bad':
                $out .= "\n" . ap_i_wrap($block[1], '!! ') . "\n";
                break;
            case 'h2':
                $out .= "\n" . strtoupper(ap_i_plain($block[1])) . "\n"
                    . str_repeat('=', strlen(ap_i_plain($block[1]))) . "\n";
                break;
            case 'h3':
                $out .= "\n" . ap_i_plain($block[1]) . "\n"
                    . str_repeat('-', strlen(ap_i_plain($block[1]))) . "\n";
                break;
            /* NOT WRAPPED, EVER. These are the lines somebody copies: a
               crontab line, an address, a key. A fold inserted in one of them
               would be copied with the fold. */
            case 'pre':
                $out .= "\n    "
                    . str_replace("\n", "\n    ", ap_i_plain($block[1], true)) . "\n";
                break;
            /* MEASURED VALUES, NOT PROSE. These cells hold what a server
               answered -- "First bytes: <!doctype html><html>..." is the
               evidence of a refusal, and running it through strip_tags ate it
               from the first `<` onwards, closing quote included. Entities are
               still decoded; tags are left exactly as they came back. */
            case 'table':
            case 'table-env':
                $out .= "\n";
                foreach ($block[1] as $line) {
                    $meaning = $block[0] === 'table-env' ? $line[3] : $line[2];
                    $out .= '  ' . $line[0] . ': ' . ap_i_entities($line[1]) . "\n"
                        . ap_i_wrap(ap_i_entities($meaning), '      ', false) . "\n";
                }
                break;
            /* A button is a button. What replaces it is the command that does
               the same thing, which the caller prints where it belongs. */
            case 'button':
                break;
        }
    }
    return $out;
}

/**
 * `--help`, built from the same model the form is built from.
 *
 * Exhaustive by construction: an answer added to a question appears here
 * without anybody remembering to write it down.
 */
function ap_i_render_help($selfName, $long = false)
{
    /* SHORT BY DEFAULT, AND THE SAME TEXTS EITHER WAY. This printed 288 lines
       and 2079 words for a list of 29 options, which is the same mistake the
       form had made: a paragraph per setting, so the list stops being a list.
       Both faces now carry BOTH registers of the same table -- the short line
       for somebody scanning, the paragraph for somebody deciding -- and each
       face lets you ask for the other: --verbose here, ?long=1 on the form.
       Nothing is written in two places: `hint` and `say` are two fields of one
       setting, and this function chooses between them. */
    $line = function ($setting) {
        /* What the label cannot say, plus what leaving it out gets you. The
           form prints exactly the same two things, in the same order. */
        $bits = array();
        if ($setting['hint'] !== '') {
            $bits[] = ap_i_plain($setting['hint']);
        }
        if (isset($setting['decided'])) {
            $one = ap_i_plain($setting['decided']['one-site']);
            $any = ap_i_plain($setting['decided']['anyone']);
            $bits[] = $one === $any
                ? 'Left out: ' . $one . '.'
                : 'Left out: ' . $one . ' (one-site), ' . $any . ' (anyone).';
        } else {
            $default = ap_i_setting_default($setting['key']);
            $bits[] = $default !== ''
                ? 'Default: ' . $default
                    . ($setting['unit'] !== '' ? ' ' . $setting['unit'] : '') . '.'
                : 'Unset unless you set it.';
        }
        return implode(' ', $bits);
    };

    $out = "annotepage -- install the notes server, from a shell.\n\n";
    if ($long) {
        $out .= ap_i_wrap('It does what the browser installer does, in the same order: '
                . 'it creates the storage, requests that storage\'s own URL over HTTP '
                . 'and refuses to finish unless the web server refuses it, then writes '
                . 'internal/config-local.php and prints what it wrote and where.') . "\n\n"
            . ap_i_wrap('It asks nothing. There is no prompt: typing the command is the '
                . 'consent. An option it does not know stops it, because an option that '
                . 'was ignored would install the default and read as a success. It never '
                . 'writes over an existing internal/config-local.php, and no option '
                . 'makes it.') . "\n\n";
    } else {
        $out .= ap_i_wrap('It asks nothing, it never writes over an existing '
            . 'internal/config-local.php, and an option it does not know stops it.')
            . "\n\n";
    }
    $out .= "  php " . $selfName . " --api-address=https://example.com/notes/api.php \\\n"
        . "      --answers-for=one-site --storage=sqlite\n";
    if (!$long) {
        $out .= "\n" . ap_i_wrap('Short list. `--help --verbose` says why each one is '
            . 'there and what it costs -- the same sentences the install page shows '
            . 'behind its own "explain" link.') . "\n";
    }

    $out .= "\nTHE ADDRESS, WHICH IS THE ONE THING A SHELL CANNOT KNOW\n"
        . str_repeat('=', 54) . "\n\n"
        . "  --api-address=<url>\n";
    $out .= !$long
        ? ap_i_wrap('REQUIRED. What the tag on your pages carries as data-server. '
            . 'Proven before anything is installed: a file is written here and asked '
            . 'for there.', '      ') . "\n\n"
        : ap_i_wrap('REQUIRED. The address api.php will answer at once this is '
            . 'installed -- what the tag on your pages carries as data-server. Opened '
            . 'in a browser this installer FILLS IT IN from the request that reached '
            . 'it and shows it in a field, so it can be corrected where the name PHP '
            . 'sees is not the name the site answers at: behind a proxy or a CDN, or '
            . 'through a temporary address used before the real domain points here. '
            . 'From a shell there is no request, and nothing may guess it. Four things '
            . 'rest on it: whether this server is reached over https, the control '
            . 'request that establishes that this directory really is served at that '
            . 'address, the request that proves the data file is not downloadable, and '
            . 'the line you paste into the tag. Typed rather than read off a request -- '
            . 'on either face -- it is proven before anything else happens: a file with '
            . 'a random name is written here and asked for there, and an address that '
            . 'answers something else installs nothing.', '      ') . "\n\n";
    $out .= "  --dir=<path>\n"
        . ap_i_wrap('The directory to install into. Default: the directory this file '
            . 'sits in, which is where a browser would have installed it.', '      ')
        . "\n";

    foreach (ap_i_cli_options() as $name => $shape) {
        if ($shape['kind'] !== 'choice') {
            continue;
        }
        $question = ap_i_question($shape['field']);
        $out .= "\n" . strtoupper($question['legend']) . "\n"
            . str_repeat('=', strlen($question['legend'])) . "\n";
        foreach ($question['answers'] as $answer) {
            $out .= "\n  --" . $name . '=' . $answer['value']
                . '   ' . ap_i_plain($answer['label']) . "\n";
            if ($long) {
                $out .= ap_i_wrap($answer['say'], '      ') . "\n";
            }
        }
    }

    $out .= !$long ? "\n" : "\n" . ap_i_wrap('There is no --updated-by=self, and the browser form offers '
        . 'one. It is the answer for a host with neither a shell nor a scheduler, '
        . 'which is not the host you are typing on -- and it cannot be checked from '
        . 'here: whether this server may hand the response to a visitor and keep '
        . 'working depends on the PHP interface the WEB SERVER runs, and from a '
        . 'command line the only interface in sight is this one. The check would '
        . 'always say yes, and be wrong on every host that runs cgi-fcgi. Write '
        . "'auto_update' => true in internal/config-local.php if you mean it, and "
        . 'read what it costs beside the key.') . "\n";

    $out .= "\nWHERE THE MySQL SERVER IS\n" . str_repeat('=', 24) . "\n\n"
        . ($long
            ? ap_i_wrap('Required with --storage=mysql, except the host and the port. '
                . 'The installer connects and creates the tables before it writes '
                . 'anything: a configuration naming a database nobody can reach is a '
                . 'file that fails later, on somebody else\'s screen.') . "\n\n"
            : ap_i_wrap('Required with --storage=mysql, except the host and the port.')
              . "\n\n");
    foreach (ap_i_credential_fields() as $box) {
        $out .= '  --mysql-' . $box['name']
            . ($box['default'] ? '   default ' . $box['default'] : '') . "\n";
    }
    $out .= "\n  --mysql-password-file=<path>\n"
        . ($long
            ? ap_i_wrap('Read the password out of this file, once, now. A password on a '
                . 'command line is visible in `ps` to every other account on the machine '
                . 'and stays in your shell history; this is the way that is not. What is '
                . 'written into the configuration is the value itself, exactly as the '
                . 'browser form writes it.', '      ') . "\n"
            : ap_i_wrap('Read the password out of this file rather than off a command '
                . 'line, where `ps` shows it.', '      ') . "\n");

    $out .= "\nEVERYTHING ELSE, AND IT IS ALL SETTABLE HERE\n"
        . str_repeat('=', 44) . "\n\n"
        . ($long
            ? ap_i_wrap('Three questions are what you must answer; these are what you '
                . 'may. Each one is a key of internal/config.php under its own name, so '
                . 'what you type here is what you would have edited there. Leave one out '
                . 'and the default stays in force -- and a later version may raise it '
                . 'for you, which a value written into your file would prevent.') . "\n\n"
              . ap_i_wrap('They come in the same four sections as the form, in the same '
                . 'order, for the same reason: a flat list of fifteen says a list exists '
                . 'without saying what is in it.') . "\n"
            : ap_i_wrap('Each one is a key of internal/config.php under its own name. '
                . 'Left out, the default stays in force.') . "\n");
    $section = null;
    $sections = ap_i_setting_sections();
    foreach (ap_i_settings() as $setting) {
        if ($setting['group'] !== $section) {
            $section = $setting['group'];
            $title = strtoupper($sections[$section]['title']);
            $out .= "\n" . $title . "\n" . str_repeat('-', strlen($title)) . "\n";
            $intro = ap_i_plain($long ? $sections[$section]['say']
                                      : $sections[$section]['hint']);
            if ($intro !== '') {
                $out .= "\n" . ap_i_wrap($intro) . "\n";
            }
        }
        $shape = $setting['kind'] === 'choice'
            ? implode('|', $setting['values'])
            : ($setting['kind'] === 'bool' ? 'true|false'
                : ($setting['kind'] === 'int' ? '<' . $setting['unit'] . '>' : '<text>'));
        /* The default beside the option, read live out of config.php. Without
           it the only way to learn what a limit is today is to read the source
           -- and knowing the number is most of deciding whether to change it. */
        if (!$long) {
            $out .= "\n  --" . str_replace('_', '-', $setting['key']) . '=' . $shape . "\n";
            $short = $line($setting);
            if ($short !== '') {
                $out .= ap_i_wrap($short, '      ') . "\n";
            }
            continue;
        }
        $default = ap_i_setting_default($setting['key']);
        if (isset($setting['decided'])) {
            /* Four of them this command decides from --answers-for, and saying
               "config.php's default" for those would name a number that will
               not be written. What a reader needs here is what LEAVING IT OUT
               gets them, which is not the same thing. */
            $one = ap_i_plain($setting['decided']['one-site']);
            $any = ap_i_plain($setting['decided']['anyone']);
            $says = $setting['label'] . '. '
                . ($one === $any
                    ? 'Left out, this install writes ' . $one . '. '
                    : 'Left out: ' . $one . ' with --answers-for=one-site, ' . $any
                      . ' with --answers-for=anyone. ')
                . $setting['say'];
        } else {
            $says = $setting['label'] . '. '
                . ($default !== ''
                    ? "config.php's default: " . $default
                        . ($setting['unit'] !== '' ? ' ' . $setting['unit'] : '') . '. '
                    : 'No default: unset unless you set it. ')
                . $setting['say'];
        }
        $out .= "\n  --" . str_replace('_', '-', $setting['key']) . '=' . $shape . "\n"
            . ap_i_wrap($says, '      ') . "\n";
    }

    $out .= "\nAFTERWARDS\n==========\n\n"
        . "  --delete-installer\n"
        . ($long
            ? ap_i_wrap('Delete this file once the configuration is written, the way '
                . 'the browser installer\'s last screen offers to. Off by default: from '
                . 'a shell the file is one `rm` away and its path is printed.', '      ')
              . "\n\n"
            : ap_i_wrap('Delete this file once the configuration is written. Off by '
                . 'default.', '      ') . "\n\n")
        . "  --help, --help --verbose, --version\n";

    $out .= "\nWHAT IT DOES NOT SET\n====================\n\n"
        . (!$long
            ? ap_i_wrap('Your project and the origins it answers to: they descend from '
                . 'a key your browser generates and this server never receives, so the '
                . 'install page hands you the block to paste into '
                . 'internal/config-local.php. And the length of each field, which is a '
                . 'constant rather than a key.') . "\n"
            : ap_i_wrap('Two things, and they are the same thing: your project and the '
            . 'origins it answers to. A project descends from a key YOUR BROWSER '
            . 'generates and this server never receives, so no shell can declare one '
            . 'here -- the install page hands you the block to paste into '
            . 'internal/config-local.php, where every key is commented next to itself '
            . 'and internal/config-local.example.php sits beside it with every key '
            . 'there is. Everything else this server reads is either answered by the '
            . 'three questions above or offered as an option above -- there is no key '
            . 'left that this command cannot set.') . "\n\n"
        . ap_i_wrap('The length of each field is not a key at all: a remark, a name, a '
            . 'selector, an envelope, and the ten others are constants at the bottom '
            . 'of internal/config.php. Nine of them are the width of a MySQL column '
            . 'the day the table is created, so a number changed afterwards would '
            . 'make this server accept a remark its own table cannot hold -- '
            . 'measured, in strict mode: a 500, and the text lost. What is metered '
            . 'here is volume; the shape of one note is FORMAT.md\'s.') . "\n");

    $out .= "\nEXIT CODES\n==========\n\n"
        . "  0   Installed -- or already configured, and nothing was done.\n"
        . "  1   It refused, or something failed. Nothing was configured, and\n"
        . "      anything it had created has been taken back.\n"
        . "  2   The command line itself: an unknown option, a missing required\n"
        . "      one, or a value it does not accept. Nothing was touched.\n";

    return $out;
}

/**
 * The command line, from end to end.
 *
 * Reached from ap_i_run() when PHP is running on a terminal, before anything
 * else happens. Everything it decides, it decides before touching the disk.
 */
/**
 * Does the address really lead to THIS directory?
 *
 * A file with a random name and a random token is written HERE and asked for
 * THERE, then removed either way. If what comes back is not the token, the
 * address serves somebody else's directory -- and every measurement that
 * follows would be about theirs, including the one that proves the database
 * cannot be downloaded.
 *
 * MEASURED, BEFORE THIS EXISTED: a release unpacked in /apps/notes/ and given
 * the site root as its address installed with exit 0, wrote "placed one level
 * above the document root, where no URL reaches it", and left the database
 * answering 200 to a plain GET. The control request alone cannot catch that --
 * install.php replies to ?probe= before requiring anything, so any copy at the
 * site root validates any directory.
 *
 * SHARED BY BOTH FACES since the form learned to show the address. Opened in a
 * browser the address is normally the request's own, and then the request IS
 * the proof; this runs when somebody has typed a different one, which is the
 * same situation as a command line and deserves the same refusal.
 *
 * @param string      $here    the directory this file sits in
 * @param string|null $why     filled in with the reason, on either failure
 * @param string|null $askedTo filled in with the URL that was requested
 * @return bool|null true when it leads here, false when it does not, null when
 *                   the check could not even be made
 */
function ap_i_address_leads_here($here, &$why = null, &$askedTo = null)
{
    $witness = 'ap-check-' . bin2hex(random_bytes(8)) . '.txt';
    $token   = bin2hex(random_bytes(16));
    $witnessPath = $here . '/' . $witness;
    $askedTo = ap_i_base_url() . $witness;

    if (@file_put_contents($witnessPath, $token) === false) {
        $why = 'Cannot write into ' . $here . ', so this run cannot even check that '
             . 'the address leads here. Grant write permission on that directory, '
             . 'install, and take it away again.';
        return null;
    }
    $answer = ap_i_fetch($askedTo, 8);
    @unlink($witnessPath);
    if ($answer['status'] === null || trim((string) $answer['body']) !== $token) {
        $why = 'A file was written here and asked for there, and what came back was '
             . ($answer['status'] === null
                 ? 'nothing at all (' . (string) $answer['error'] . ')'
                 : 'not it (HTTP ' . $answer['status'] . ')') . '.';
        return false;
    }
    return true;
}

function ap_i_cli(array $options)
{
    /* THE NETS, HERE AND NOT ON THE WEB PATH. Without them a defect in this
       code prints a stack trace on somebody's terminal -- which can carry
       fragments of a configuration -- and exits with whatever PHP chooses.
       With them it is one sentence on stderr and exit 1, which is what a
       provisioning run owes its caller. */
    if (function_exists('ap_install_handlers')) {
        ap_install_handlers();
    }

    $here     = isset($options['here']) ? $options['here'] : dirname(__DIR__);
    $selfName = basename(isset($options['self']) ? $options['self'] : 'install.php');
    $argv     = isset($options['argv']) ? $options['argv']
        : (isset($GLOBALS['argv']) ? $GLOBALS['argv'] : array());
    $outboundUrl = isset($options['outbound_url'])
        ? $options['outbound_url'] : 'https://raw.githubusercontent.com/';

    $read   = ap_i_parse_options($argv);
    $given  = $read['given'];
    $errors = $read['errors'];

    /* HELP FIRST, AND A BARE COMMAND IS NOT AN INSTALLATION. An installer run
       with no arguments is a script that forgot them: it prints what it takes
       and exits 2, so a broken pipeline stops instead of installing defaults. */
    if (isset($given['help']) || count($argv) <= 1) {
        /* ASKED FOR, IT IS AN ANSWER; PRINTED TO REFUSE, IT IS AN ERROR.
           `php install.php > install.log` on a bare command wrote five
           kilobytes of aide into the log and nothing on stderr, so a pipeline
           that watches stderr saw a silent success that had installed
           nothing. */
        if (isset($given['help'])) {
            echo ap_i_render_help($selfName, isset($given['verbose']));
            exit(0);
        }
        /* The SHORT one on a bare command: what somebody who forgot the
           arguments needs is the list, and 288 lines scrolled it off their
           terminal. */
        fwrite(STDERR, ap_i_render_help($selfName));
        exit(2);
    }
    /* AND --verbose ALONE IS NOT AN INSTALLATION FLAG. It says nothing about
       what to install, so accepting it silently would be the "an option that
       was ignored" this file refuses everywhere else. */
    if (isset($given['verbose'])) {
        fwrite(STDERR, "--verbose only means something with --help.\nNothing was "
            . "touched.\n");
        exit(2);
    }
    if (isset($given['version'])) {
        echo ap_i_version($here) . "\n";
        exit(0);
    }

    if (isset($given['dir'])) {
        $here = rtrim($given['dir'], '/');
        /* AN EMPTY --dir IS NOT THE ROOT, AND / IS NOT AN INSTALLATION.
           `--dir=/` trimmed to '', and realpath('') is the SHELL'S working
           directory: the measured document root became wherever the operator
           happened to stand. */
        if ($here === '') {
            $errors[] = '--dir needs a directory. `/` is not one to install into.';
        }
    }
    $configPath = $here . '/internal/config-local.php';

    /* AND IT HAS TO BE AN INSTALLATION. A mistyped --dir installed a
       configuration into an empty directory and called it success: no api.php
       next to it, no VERSION, nothing that would ever serve a note. The only
       exception is the file that downloads the release, which legitimately
       runs where nothing is yet. */
    if (isset($given['dir']) && $here !== ''
        && !is_file($here . '/api.php') && !is_file($here . '/MANIFEST')) {
        $errors[] = $here . ' does not hold a server: no api.php and no MANIFEST. '
            . 'Point --dir at the directory the release was unpacked into.';
    }

    if (!isset($given['api-address'])) {
        $errors[] = '--api-address is required. Opened in a browser this installer '
            . 'reads that address off the request that reached it; from a shell there '
            . 'is no request, and the proof that the data file is unreachable needs an '
            . 'address to ask for.';
    }
    if (!isset($given['answers-for'])) {
        $errors[] = '--answers-for is required, and has no default: the two answers are '
            . 'silent when wrong, in opposite directions.';
    }
    if (isset($given['updated-by']) && $given['updated-by'] === 'self') {
        $errors[] = '--updated-by=self is not offered here. Whether this server may hand '
            . 'the response to a visitor and keep working depends on the PHP interface '
            . 'the WEB SERVER runs, and from a command line the only interface in sight '
            . "is this one. Write 'auto_update' => true in internal/config-local.php if "
            . 'you mean it, and read what it costs beside the key.';
    }
    $storage = isset($given['storage']) ? $given['storage'] : 'sqlite';
    if ($storage === 'mysql') {
        foreach (array('mysql-name', 'mysql-user') as $needed) {
            if (!isset($given[$needed]) || $given[$needed] === '') {
                $errors[] = '--' . $needed . ' is required with --storage=mysql.';
            }
        }
        if (!isset($given['mysql-password']) && !isset($given['mysql-password-file'])) {
            $errors[] = 'A password is required with --storage=mysql: '
                . '--mysql-password-file=<path> reads it from a file, which is the way '
                . 'that does not put it in `ps` and in your shell history.';
        }
    }

    $password = isset($given['mysql-password']) ? $given['mysql-password'] : '';
    if (isset($given['mysql-password-file'])) {
        $read = @file_get_contents($given['mysql-password-file']);
        if ($read === false) {
            $errors[] = 'Could not read ' . $given['mysql-password-file'] . '.';
        } else {
            // The trailing newline an editor adds is not part of a password.
            $password = rtrim($read, "\r\n");
        }
    }

    if ($errors) {
        fwrite(STDERR, "Nothing was touched.\n\n");
        foreach ($errors as $line) {
            fwrite(STDERR, ap_i_wrap($line, '  ') . "\n\n");
        }
        fwrite(STDERR, 'Run  php ' . $selfName . " --help  for what this takes.\n");
        exit(2);
    }

    /* THE ADDRESS IS READ WITH THE REST OF THE COMMAND LINE, not after the
       disk has been consulted. Measured: `--api-address=notaurl` exited 2 on a
       fresh directory and 0 on an installed one, so the same wrong command was
       named in one place and swallowed in the other. */
    $parts = isset($given['api-address']) ? parse_url($given['api-address']) : null;
    if (isset($given['api-address'])
        && (!$parts || !isset($parts['scheme']) || !isset($parts['host'])
            || !in_array(strtolower($parts['scheme']), array('http', 'https'), true))) {
        $errors[] = '--api-address must be an absolute http:// or https:// URL, '
            . 'ending in the path api.php will answer at.';
    }

    if ($errors) {
        fwrite(STDERR, "Nothing was touched.\n\n");
        foreach ($errors as $line) {
            fwrite(STDERR, ap_i_wrap($line, '  ') . "\n\n");
        }
        fwrite(STDERR, 'Run  php ' . $selfName . " --help  for what this takes.\n");
        exit(2);
    }

    /* ALREADY CONFIGURED IS A RESULT, NOT A REDIRECT -- BUT IT COMES AFTER THE
       COMMAND LINE HAS BEEN READ. Measured: with this test first, a mistyped
       option on an installed directory printed "already configured" and exited
       0, and the typo was never named. A wrong command is wrong wherever it is
       run, and swallowing it is exactly what this face must not do.

       Zero, because re-running a provisioning step that had nothing to do is
       not a failure -- the same answer `php internal/update.php` gives when
       there is nothing to fetch. */
    if (is_file($configPath)) {
        echo 'Already configured: ' . $configPath . "\n"
            . "Nothing was done, and nothing was overwritten. Delete that file\n"
            . "yourself if you mean to install again -- it holds a project and a\n"
            . "storage somebody is using.\n";
        exit(0);
    }

    /* WHAT A REQUEST WOULD HAVE CARRIED, taken from the address instead. Both
       of these refuse to answer at all in CLI until they are given something,
       so nothing downstream can quietly fall back on a guess. */
    $urlDir = isset($parts['path']) ? rtrim(dirname($parts['path']), '/') : '';
    $host   = $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    ap_i_base_url($parts['scheme'] . '://' . $host . $urlDir);
    ap_i_script_name(($urlDir === '' ? '' : $urlDir) . '/' . $selfName);

    /* THE ADDRESS AND THE DIRECTORY, TIED TOGETHER, AND NOTHING ELSE CAN DO IT.
       Opened in a browser they are one thing: the request arrived at this
       file, so the directory it sits in IS the directory served at that
       address. On a command line they are two independent inputs that nobody
       had ever compared. The control request further down proves only that AN
       annotepage installer answers there -- install.php replies to ?probe=
       before requiring anything, so any copy at the site root validates any
       directory.

       Measured, before this existed: a release unpacked in /apps/notes/ and
       given the site root as its address installed with exit 0, wrote "placed
       one level above the document root, where no URL reaches it", and left
       the database answering 200 to a plain GET. The configuration it wrote
       said the installer had requested it over HTTP and confirmed the refusal.

       So: a file with a random name and a random token is written HERE, asked
       for THERE, and removed either way. If the answer is not the token, the
       address does not lead to this directory -- and every measurement that
       follows would be about somebody else's. Nothing is touched. */
    $why = null;
    $leads = ap_i_address_leads_here($here, $why, $failedTo);
    if ($leads === null) {
        fwrite(STDERR, ap_i_wrap($why) . "\n");
        exit(1);
    }
    if ($leads === false) {
        fwrite(STDERR, "Nothing was touched.\n\n"
            . ap_i_wrap('--api-address does not lead to this directory. ' . $why, '  ')
            . "\n\n"
            . ap_i_wrap('Asked for: ' . $failedTo, '  ') . "\n"
            . ap_i_wrap('Written in: ' . $here, '  ') . "\n\n"
            . ap_i_wrap('Give the address this directory really answers at, or point '
                . '--dir at the directory that address serves. Without that, every '
                . 'measurement below would be about somebody else\'s directory -- '
                . 'including the one that proves the database cannot be downloaded.',
                '  ') . "\n");
        exit(2);
    }

    /* WHAT WAS MEASURED, AND ON WHICH PHP. The environment rows describe the
       interpreter running this command, which on shared hosting is very often
       not the one the web server runs -- different version, different
       extensions, sometimes a different user. Said here rather than left to be
       discovered. */
    list($environment, $outbound) = ap_i_environment($here, $outboundUrl);
    echo ap_i_render_text(array(
        array('h2', 'What this command line offers'),
        array('p', 'Measured on the PHP running THIS command, which on shared hosting '
                   . 'is often not the one the web server runs. What was measured over '
                   . 'HTTP below was measured against the real one.'),
        array('table-env', $environment),
    ));

    $answers = array(
        'audience' => $given['answers-for'],
        'storage'  => $storage,
        'updates'  => isset($given['updated-by']) ? $given['updated-by'] : 'cron',
        'host'     => isset($given['mysql-host']) ? $given['mysql-host'] : '',
        'port'     => isset($given['mysql-port']) ? $given['mysql-port'] : '',
        'name'     => isset($given['mysql-name']) ? $given['mysql-name'] : '',
        'user'     => isset($given['mysql-user']) ? $given['mysql-user'] : '',
        'password' => $password,
    );
    foreach (ap_i_settings() as $setting) {
        $flag = str_replace('_', '-', $setting['key']);
        if (isset($given[$flag])) {
            $answers[$setting['key']] = $given[$flag];
        }
    }

    $report = array();
    $failed = array();
    $done   = ap_i_install($answers, $here, $configPath, $selfName, $report, $failed);

    if (!$done['installed']) {
        /* An empty table under a heading is furniture: the MySQL route measures
           nothing before it connects, so a failure there had a title and a
           blank space under it. */
        echo $report ? ap_i_render_text(array(
            array('h2', 'What was measured'),
            array('table', $report),
        )) : '';
        fwrite(STDERR, "\nNothing was installed.\n\n");
        foreach ($failed as $line) {
            fwrite(STDERR, ap_i_wrap($line, '  ') . "\n\n");
        }
        exit(1);
    }

    echo "\n";
    echo ap_i_render_text(ap_i_screen_installed($done['relay'], ap_i_base_url() . 'api.php',
        $here, $selfName, $report, $done['auto'], $outboundUrl, $done['token']));

    /* THE BUTTON HAS NO EQUIVALENT, SO THE COMMAND IS PRINTED INSTEAD. Never
       done on its own: a script that deletes its own file after a successful
       run cannot be re-run, and being re-runnable is what a provisioning tool
       is owed. */
    $self = isset($options['self']) ? $options['self'] : ($here . '/' . $selfName);
    if (isset($given['delete-installer'])) {
        list($gone, $said) = ap_i_delete_self($self);
        echo "\n" . ap_i_wrap($said) . "\n";
    } else {
        // The screen above has just said why. Here, only the command.
        echo "\n    rm " . $self . "\n";
    }
    exit(0);
}

/**
 * Builds internal/config-local.php.
 *
 * It says it was generated, when, and by what. That matters more than it
 * looks: the next person to open this file has to know whether they are
 * reading somebody's decisions or a machine's defaults, and whether editing it
 * is safe. It is -- nothing rewrites it, the updater cannot even name it.
 *
 * `projects` is left EMPTY on purpose and the block to paste is right there in
 * a comment. The project id does not exist yet: it is derived from a key the
 * browser generates, and the client's setup screen hands it over the first time
 * somebody opens an annotated page. Inventing one here would produce an
 * installation that answers about notes nobody can decrypt.
 *
 * TWO DEPLOYMENTS, ONE FILE. `$values['deployment']` decides between the
 * server that carries one site's notes and the relay that carries anybody's.
 * The relay branch writes the same keys, with the same reasons, as
 * server/relay/config-local.php in the repository -- that file is the
 * hand-written original and this is the machine writing it, so the two must
 * not say different things about the same key.
 */
function ap_i_config_text(array $values)
{
    $q = function ($s) {
        return "'" . str_replace(array('\\', "'"), array('\\\\', "\\'"), (string) $s) . "'";
    };

    $storage = $values['storage'];

    // Never a truthiness test on whatever arrived: only the one word this
    // installer writes counts as a relay, so a key that was mistyped, dropped
    // or copied from somewhere else produces the narrow deployment.
    $relay = (isset($values['deployment']) && $values['deployment'] === 'relay');

    $text  = "<?php\n";
    $text .= "/**\n";
    $text .= " * config-local.php -- GENERATED FILE.\n";
    $text .= " *\n";
    $text .= " * Written by annotepage " . $values['installer'] . ' '
        . $values['version'] . "\n";
    $text .= " * on " . gmdate('Y-m-d\TH:i:sP') . " (UTC).\n";
    $text .= " *\n";
    $text .= " * EDIT IT FREELY. Nothing rewrites it: the updater cannot even name it,\n";
    $text .= " * and the installer refuses to run while it exists. Every key that is not\n";
    $text .= " * here keeps the default from internal/config.php, which is where each\n";
    $text .= " * one is documented.\n";
    $text .= " *\n";
    $text .= " * THE KEY IS NOT HERE AND NEVER WILL BE. It is generated in the browser,\n";
    $text .= " * over 256 bits, and the server never receives it in any form. What goes\n";
    $text .= " * below is the PROJECT ID, which descends from it and does not lead back.\n";
    $text .= " */\n\n";
    $text .= "if (!defined('AP_INTERNAL')) {\n    http_response_code(404);\n    exit;\n}\n\n";
    $text .= "return array(\n\n";
    $text .= "    // Nothing answers until this is true.\n";
    $text .= "    'active' => true,\n\n";
    if ($relay) {
        $text .= "    // THIS SERVER HOLDS OTHER PEOPLE'S NOTES, which is what was asked\n";
        $text .= "    // for at install time. Two consequences, and they are written as\n";
        $text .= "    // what they are rather than hidden behind one word:\n";
        $text .= "    //\n";
        $text .= "    // No project here may keep its words readable. Plain mode is only\n";
        $text .= "    // ever acceptable where the notes sit behind the same door as the\n";
        $text .= "    // site they annotate; here it would hand this machine's operator\n";
        $text .= "    // every path, every label and every remark of every site using it.\n";
        $text .= "    'allow_plain_mode' => false,\n\n";
        $text .= "    // And a write must carry an Origin header. On this machine a write\n";
        $text .= "    // necessarily comes from another domain, and a browser always\n";
        $text .= "    // attaches that header -- so its absence means the caller is not a\n";
        $text .= "    // browser.\n";
        $text .= "    'require_origin_on_writes' => true,\n\n";

        $text .= "    // It serves projects nobody declared, which is what makes a tag\n";
        $text .= "    // copied from a web page work with nothing to ask and nobody to\n";
        $text .= "    // ask. The price is written down rather than discovered: any\n";
        $text .= "    // well-formed project id is served, such a project has NO origin\n";
        $text .= "    // lock -- nobody declared its origins and there is no way to learn\n";
        $text .= "    // them an abuser could not use too -- so a stranger who reads an id\n";
        $text .= "    // in the source of a page can write into it. They write bytes, not\n";
        $text .= "    // words: the key never reached this server, so what they insert\n";
        $text .= "    // comes back as unreadable rows. What it really costs is your\n";
        $text .= "    // disk, which is what the two caps below are for.\n";
        $text .= "    //\n";
        $text .= "    // Plain mode is refused here whatever a caller asks: a public relay\n";
        $text .= "    // storing plaintext would hand its operator every path, every label\n";
        $text .= "    // and every remark of every site using it. That refusal is in the\n";
        $text .= "    // code, not in this file.\n";
        $text .= "    'open_registration' => true,\n\n";
    } else {
        $text .= "    // THIS SERVER SITS ON THE SITE UNDER REVIEW, behind the same access\n";
        $text .= "    // restriction as it. Two consequences follow, and they are written\n";
        $text .= "    // as what they are rather than hidden behind one word:\n";
        $text .= "    //\n";
        $text .= "    // A project may declare mode `plain`, and this server then keeps\n";
        $text .= "    // the words as they were typed. That protects exactly as much as\n";
        $text .= "    // the site itself does, which is the whole argument -- and it is\n";
        $text .= "    // false the day these notes live anywhere else. Set it back to\n";
        $text .= "    // false and every project here is encrypted, whatever it declares.\n";
        $text .= "    'allow_plain_mode' => true,\n\n";
        $text .= "    // And a write need not carry an Origin header, because it may\n";
        $text .= "    // legitimately come from this same origin. On a machine holding\n";
        $text .= "    // somebody else's notes this is true instead.\n";
        $text .= "    'require_origin_on_writes' => false,\n\n";
    }

    if ($storage === 'sqlite') {
        $text .= "    // ONE FILE, no database server. The path was chosen by the\n";
        $text .= "    // installer, which then requested it over HTTP and confirmed the\n";
        $text .= "    // web server refuses to serve it.\n";
        if ($relay) {
            $text .= "    //\n";
            $text .= "    // ON A RELAY THIS IS THE PART THAT WILL GIVE FIRST. SQLite locks\n";
            $text .= "    // the whole file for each write, and a relay takes concurrent\n";
            $text .= "    // writes from people who have never heard of each other. Move to\n";
            $text .= "    // MySQL before that becomes the reason writes fail.\n";
        }
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

    if ($relay) {
        $text .= "    // THE PROJECTS. Empty, and it stays empty: declaring nothing is\n";
        $text .= "    // the point of the key above. Declare one only to give it back the\n";
        $text .= "    // origin lock -- declared projects keep it on a relay that is\n";
        $text .= "    // otherwise open, which is the answer for a team that wants it.\n";
    } else {
        $text .= "    // THE PROJECTS. Empty until you have one, and you will have one the\n";
        $text .= "    // first time somebody opens an annotated page: the client generates\n";
        $text .= "    // the key in the browser and shows you the id and the block to paste\n";
        $text .= "    // here. The server does not compute that id, it recognises it.\n";
    }
    $text .= "    //\n";
    $text .= "    // 'projects' => array(\n";
    $text .= "    //     '<the 22 characters the setup screen shows>' => array(\n";
    $text .= "    //         'origins' => array('https://www.example.com'),\n";
    $text .= "    //         'mode'    => 'encrypted',\n";
    $text .= "    //     ),\n";
    $text .= "    // ),\n";
    $text .= "    'projects' => array(),\n\n";

    /* HOW LONG A THREAD IS KEPT, AND WHY IT IS WRITTEN HERE RATHER THAN
       DEFAULTED IN config.php. Ninety days -- a review cycle with room to
       spare -- on every installation this file creates, relay or not: a review
       that nobody has come back to in three months is not a review any more,
       and a server that keeps everything for ever only grows.

       IT IS NOT THE DEFAULT OF THE KEY, AND THAT IS DELIBERATE. Changing
       `max_note_age_days` in config.php from 0 to 90 would make every server
       already in service start deleting threads at its next update, silently,
       on a decision nobody there took. A default that destroys data on
       somebody else's machine is not a default. So the number is written into
       the file this installer generates, where it belongs to THIS
       installation, is visible, and is one edit away from being changed or
       removed.

       The whole thread goes, dated by its last message, so a live discussion
       is never cut short and a reply is never orphaned from its remark. Nobody
       chooses which -- there is still no moderation and no takedown. The
       client says it in its panel and the export says it in its header,
       because "nothing is ever deleted" stops being true here. */
    $text .= "    // HOW LONG A THREAD IS KEPT, counted from its LAST message: a whole\n";
    $text .= "    // thread goes at once, so a reply is never cut off its remark. Ninety\n";
    $text .= "    // days is a review cycle with room to spare. Set it to 0 to keep\n";
    $text .= "    // everything for ever -- the client stops announcing an age, and this\n";
    $text .= "    // server stops removing anything.\n";
    if (!isset($chosen['max_note_age_days'])) {
        $text .= "    'max_note_age_days'     => 90,\n\n";
    }

    /* WHAT THE WHOLE SERVER HOLDS, AND WHY IT IS WRITTEN HERE TURNED OFF
       RATHER THAN LEFT OUT. It is a flag an operator wants to know exists --
       one running a relay for other people has no other way to see, from a
       page, what their own server is carrying. Written as `false` with the
       cost beside it, it is found by whoever opens this file; left out, it is
       found by whoever reads config.php, which is nobody. */
    /* THE LIMITS, WRITTEN INTO EVERY CONFIGURATION AS COMMENTS. They have
       always existed and have always been changeable -- and nobody knew,
       because the only place they were named is a template file next to this
       one that people open when they already suspect. The file an operator
       actually reads is the one this installer writes, so the numbers belong
       here, with what each one bounds.

       COMMENTED AND NOT ACTIVE, deliberately: a value copied into this file
       is a value frozen at install time, and these are the defaults of
       internal/config.php, which is where they should keep coming from. The
       line is there to be uncommented, with the number already in it. */
    /* WHAT THE OPERATOR SET, IN ACTIVE LINES, ABOVE THE COMMENTED DEFAULTS.
       Given on the form or on the command line, a value is a decision: it is
       written, with the sentence that goes with it, so that the next person to
       open this file reads a choice rather than a number. What was not given
       is not written at all -- config.php goes on deciding it, and a later
       version may raise it. */
    $chosen = isset($values['settings']) ? $values['settings'] : array();
    if ($chosen) {
        $text .= "    // WHAT YOU SET WHILE INSTALLING. Everything else keeps the default\n";
        $text .= "    // from internal/config.php, which is listed below in comments.\n";
        foreach (ap_i_settings() as $setting) {
            $key = $setting['key'];
            if (!isset($chosen[$key])) {
                continue;
            }
            $raw = $chosen[$key];
            if ($setting['kind'] === 'int') {
                $written = (string) (int) $raw;
            } elseif ($setting['kind'] === 'bool') {
                $written = ($raw === 'true' || $raw === '1') ? 'true' : 'false';
            } else {
                $written = $q($raw);
            }
            $text .= "    // " . wordwrap(ap_i_plain($setting['say']), 68,
                "\n    // ", false) . "\n";
            $text .= "    '" . $key . "' => " . $written . ",\n\n";
        }
    }

    $text .= "    // WHAT BOUNDS WHAT, AND ALL OF IT IS YOURS TO CHANGE. These are the\n";
    $text .= "    // defaults, shown so that you know they exist. Uncomment a line to\n";
    $text .= "    // change it; leave it and internal/config.php keeps deciding, which\n";
    $text .= "    // means a later version may raise it for you.\n";
    $text .= "    //\n";
    $text .= "    // Counted per IP address and per project, in a fixed window. What is\n";
    $text .= "    // counted is WRITES (a note, a reply, a resolution) and EXPORTS --\n";
    $text .= "    // never a page load, which would cost a database write to defend\n";
    $text .= "    // against a request that makes nothing grow. Over the limit is a 429\n";
    $text .= "    // with Retry-After; 0 on any of them switches that counter off.\n";
    /* A COMMENTED DEFAULT IS NOT WRITTEN BESIDE A LINE THAT SETS THE SAME KEY.
       It was, and it read as two answers to one question: the operator's 3600
       above, and `// 'rate_window_seconds' => 300` thirty lines below, with
       nothing saying which one the server obeys. Whoever set it knows what
       they set; the comment is for the keys nobody touched. */
    $unset = function ($key, $line) use ($chosen, &$text) {
        if (!isset($chosen[$key])) {
            $text .= $line;
        }
    };
    $unset('rate_window_seconds',
        "    // 'rate_window_seconds'     => 300,   // five minutes\n");
    $unset('rate_writes_per_ip',
        "    // 'rate_writes_per_ip'      => 120,   // per window\n");
    $unset('rate_writes_per_project',
        "    // 'rate_writes_per_project' => 300,   // per window, all writers together\n");
    $unset('rate_exports_per_ip',
        "    // 'rate_exports_per_ip'     => 90,    // per window; three per remark\n");
    if (!isset($chosen['rate_reads_per_ip'])) {
        $text .= "    //\n";
        $text .= "    // And `list`, the call every annotated page makes on load, counted\n";
        $text .= "    // only if you set this. 0 means the counter is never touched, so a\n";
        $text .= "    // page load costs no database write. Set it far above a person:\n";
        $text .= "    // 600 in five minutes is two a second.\n";
        $text .= "    // 'rate_reads_per_ip'       => 0,\n";
    }
    $text .= "    //\n";
    if (!$relay) {
        /* On a relay the real line is written further down, with its own
           reason; a commented duplicate above it would be two answers to one
           question. */
        $text .= "    // How many notes one project may hold, 0 being no limit -- which is\n";
        $text .= "    // what a server carrying one team's own notes wants. It refuses the\n";
        $text .= "    // write beyond, with a 403, and erases nothing.\n";
        $text .= "    // 'max_notes_per_project' => 5000,\n";
        $text .= "    //\n";
    }
    if (!isset($chosen['max_body_bytes'])) {
        $text .= "    // The size of one request body, beyond which the answer is 413. A note\n";
        $text .= "    // carrying an encrypted envelope fits with room to spare.\n";
        $text .= "    // 'max_body_bytes' => 65536,\n";
        $text .= "    //\n";
    }
    if (!isset($chosen['client_ip_header'])) {
        $text .= "    // Behind a proxy that rewrites it on every request, the header carrying\n";
        $text .= "    // the real client address -- without it every visitor counts as one.\n";
        $text .= "    // NULL by default, and that default is the point: a header a client can\n";
        $text .= "    // write itself makes all of the above bypassable in one line.\n";
        $text .= "    // 'client_ip_header' => 'HTTP_X_FORWARDED_FOR',\n";
    }
    $text .= "\n";

    $text .= "    // WHAT THIS WHOLE SERVER HOLDS -- how many projects, how many notes,\n";
    $text .= "    // how many pages -- answered on the call every annotated page already\n";
    $text .= "    // makes, beside that project's own figures. Off, and no client draws\n";
    $text .= "    // it.\n";
    $text .= "    //\n";
    $text .= "    // Turning it on publishes those three integers to anybody who can\n";
    $text .= "    // open one annotated page";
    $text .= $relay
        ? " -- on this server, that is every visitor of\n"
          . "    // every site using it, learning how many teams you carry.\n"
        : " -- here, that is a figure your own team\n"
          . "    // already knows.\n";
    $text .= "    // Never a project id, never a page, never a date.\n";
    /* Written unless it was answered on the way in: a value set while
       installing and then repeated as a default lower down would be silently
       overruled by the second one -- PHP keeps the last. Measured, on
       `diagnostic`, before these three guards existed. */
    if (!isset($chosen['publish_server_totals'])) {
        $text .= "    'publish_server_totals' => false,\n\n";
    } else {
        $text .= "    // Set while installing; the line is further up.\n\n";
    }

    if ($relay) {
        /* WHAT THIS CAP DOES AND WHAT IT DOES NOT. It was written here as
           "the only thing bounding what a single abuser costs, since an
           abuser cannot be told from a project", and that was measured wrong:
           a project id costs nothing to invent, so somebody who does not care
           which project they fill is not bounded by a per-project cap at all.
           Six unknown ids, six writes, six acceptances. */
        $text .= "    // WHAT THIS CAP IS FOR, AND WHAT IT IS NOT. It stops ONE project\n";
        $text .= "    // from growing into an export nobody can serve. It does NOT bound\n";
        $text .= "    // what an abuser costs you: a project id costs them nothing to\n";
        $text .= "    // invent, so they simply start another. Against that, what sets the\n";
        $text .= "    // slope is rate_writes_per_ip, and what makes the total converge\n";
        $text .= "    // rather than grow for ever is max_note_age_days above -- the only\n";
        $text .= "    // key here that ever takes anything back.\n";
        $text .= "    //\n";
        $text .= "    // And the other edge: past this cap a write is refused and nothing\n";
        $text .= "    // is erased, so a team whose id leaked cannot write either, until\n";
        $text .= "    // you raise it.\n";
        if (!isset($chosen['max_notes_per_project'])) {
            $text .= "    // 500, then 2000, and both were measured too low: the cap\n";
            $text .= "    // counts ROWS, and a discussed thread is three of them. A\n";
            $text .= "    // simulated team of six reviewers over three months writes\n";
            $text .= "    // 1200 remarks -- 3600 rows -- so 2000 stopped them at week\n";
            $text .= "    // two, and past the cap nobody can even reply. 6000 rows is\n";
            $text .= "    // about 2000 remarks: 6.5 MB of storage and a 4.7 MB export.\n";
            $text .= "    'max_notes_per_project' => 6000,\n\n";
        }
    } else {
        /* TWO OF THEM HAVE NO OBJECT HERE, SO THEY ARE TURNED OFF RATHER THAN
           LEFT TO BE MET. On a server carrying one site's own notes, everybody
           who can reach it is already behind the same door as the site under
           review: there is nobody to defend against, and a limit that only
           ever refuses honest work is friction with a security shape.

           What stays on is the per-address write count, which is not aimed at
           anybody -- it catches a client stuck in a loop, and it is the only
           one of the three that would. */
        if (!isset($chosen['rate_writes_per_project'])) {
            $text .= "    // OFF, and deliberately: this server carries one site's notes,\n";
            $text .= "    // and everybody who can write to it is already behind the same\n";
            $text .= "    // access restriction as the site itself. A ceiling on how fast\n";
            $text .= "    // a team may annotate their own site protects nobody from\n";
            $text .= "    // anything. On a relay it is the opposite: see server/relay/.\n";
            $text .= "    'rate_writes_per_project' => 0,\n\n";
        }
        if (!isset($chosen['rate_exports_per_ip'])) {
            $text .= "    // OFF too. An export is how an assistant READS: its loop --\n";
            $text .= "    // read, reply, resolve -- costs about three per remark, so this\n";
            $text .= "    // is the limit that would bite first, and it would bite the one\n";
            $text .= "    // consumer this tool has. It exists for a relay, where an\n";
            $text .= "    // export is bandwidth a stranger can ask for; here the notes\n";
            $text .= "    // are your own.\n";
            $text .= "    'rate_exports_per_ip' => 0,\n\n";
        }
    }

    if ($values['auto_update']) {
        $text .= "    // AUTOMATIC UPDATES, turned on at install time. The code directory\n";
        $text .= "    // must be writable by the user PHP runs as, and from that moment\n";
        $text .= "    // any file-writing bug anywhere on this account becomes permanent\n";
        $text .= "    // code execution. Setting this back to false does NOT undo it: the\n";
        $text .= "    // permission stays until somebody takes it away.\n";
        $text .= "    //\n";
        $text .= "    // It is the LAST of the three ways to keep this server current, and\n";
        $text .= "    // it is worth going back to one of the other two: `php\n";
        $text .= "    // internal/update.php` from cron, with the code directory writable\n";
        $text .= "    // by YOU, or the update address below for a cron that can only\n";
        $text .= "    // fetch a URL. Either of those leaves this key false.\n";
        $text .= "    'auto_update' => true,\n\n";
    } else {
        $text .= "    // Automatic updates are OFF, which is the safe state: this server\n";
        $text .= "    // never rewrites its own code from a web request. `php\n";
        $text .= "    // internal/update.php` does the same thing from a shell or cron,\n";
        $text .= "    // with the directory writable by YOU and not by the web server.\n";
        $text .= "    'auto_update' => false,\n\n";
    }

    if (!empty($values['update_token'])) {
        $text .= "    // THE UPDATE ADDRESS, for a host with neither cron nor shell -- or\n";
        $text .= "    // one whose cron can only fetch a URL. Calling\n";
        $text .= "    //     ?action=update&token=<the value below>\n";
        $text .= "    // fetches and installs the published version DURING that request\n";
        $text .= "    // and answers with what it did. Whoever calls it waits; nobody\n";
        $text .= "    // else is kept waiting, which is why it is allowed there and not\n";
        $text .= "    // on the path a reader takes. At most one real check a day,\n";
        $text .= "    // however often it is called; add &force=1 to check anyway.\n";
        $text .= "    //\n";
        $text .= "    // Empty this string and the action stops existing -- unknown, not\n";
        $text .= "    // refused. Change it and the old address stops working at once.\n";
        $text .= "    'update_token' => '" . $values['update_token'] . "',\n\n";
    }

    if ($relay) {
        $text .= "    // WHERE A BARE VISIT GOES. Somebody who reaches a relay with no\n";
        $text .= "    // path has usually just read a project id in the source of a page\n";
        $text .= "    // and wants to know what the thing is; a 404 answers nothing. Put\n";
        $text .= "    // the absolute http(s) URL of the page that explains it here and\n";
        $text .= "    // such a visit is sent there with a 302 -- the directory and\n";
        $text .= "    // install.php only, never api.php.\n";
        $text .= "    //\n";
        $text .= "    // Left empty because the installer does not know that page and a\n";
        $text .= "    // guessed redirect sends strangers somewhere you did not choose.\n";
        if (!isset($chosen['forward_root_to'])) {
            $text .= "    'forward_root_to' => '',\n\n";
        } else {
            $text .= "    // Set while installing; the line is further up.\n\n";
        }
    } else {
        $text .= "    // WHERE A BARE VISIT GOES. Empty: a visit to this directory with no\n";
        $text .= "    // path gets a 404 and api.php is unaffected either way. Put an\n";
        $text .= "    // absolute http(s) URL here and such a visit is sent there with a 302\n";
        $text .= "    // -- what a public relay wants, so somebody landing on the bare host\n";
        $text .= "    // reaches a page explaining what the thing is instead of nothing.\n";
        if (!isset($chosen['forward_root_to'])) {
            $text .= "    'forward_root_to' => '',\n\n";
        } else {
            $text .= "    // Set while installing; the line is further up.\n\n";
        }
    }

    // Written out although it is the default, like the two keys above it: the
    // installer's last screen sends the operator to ?action=diagnostic, and
    // this is where they will come looking for the reason it says four lines.
    $text .= "    // HOW MUCH ?action=diagnostic PUBLISHES. 'minimal' -- the tool, the\n";
    $text .= "    // version, the format and the verdict -- because that page has no\n";
    $text .= "    // authentication and answers whoever asks. 'full' adds the PHP really\n";
    $text .= "    // served, the storage and its engine, this file's path, the update\n";
    $text .= "    // source, the caps and the declared projects: set it while you\n";
    $text .= "    // diagnose, and set it back. 'off' refuses the action like one nobody\n";
    $text .= "    // ever heard of.\n";
    if (!isset($chosen['diagnostic'])) {
        $text .= "    'diagnostic' => 'minimal',\n";
    } else {
        $text .= "    // Set while installing; the line is further up.\n";
    }
    $text .= ");\n";

    return $text;
}

// --- 5. The page shell -----------------------------------------------------

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
        . "  h3 { font-size: .95rem; margin: 1.75rem 0 .4rem; }\n"
        . "  p.lede { margin: 0 0 2rem; opacity: .8; }\n"
        . "  table { border-collapse: collapse; width: 100%; }\n"
        . "  td { padding: .45rem .5rem .45rem 0; vertical-align: top;\n"
        . "       border-bottom: 1px solid rgba(128,128,128,.25); }\n"
        /* NO `nowrap` ON A CELL THAT HOLDS A PATH. It held one of 54 characters,
           which made a 9rem column 597px wide, pushed the third column off the
           page, and rendered the meaning -- the column carrying the whole
           reasoning -- as a two-word ribbon cut off at the edge. At 390 the
           document itself became 1027px wide and the entire page scrolled
           sideways. `table-layout: fixed` makes the widths declared here the
           widths used, whatever lands in them. */
        . "  table { table-layout: fixed; }\n"
        /* PROPORTIONS, NOT rem. Fixed layout obeys the widths declared here,
           so 10rem + 12rem left the third column 16px on a 390px screen and it
           overflowed anyway -- the page came out 493px wide and scrolled
           sideways whole. Percentages cannot ask for more than there is. */
        . "  td.k { font-weight: 600; width: 26%; overflow-wrap: anywhere; }\n"
        . "  td.v { width: 30%; font-variant-numeric: tabular-nums;\n"
        . "         overflow-wrap: anywhere; }\n"
        . "  td.m { opacity: .75; font-size: .9rem; overflow-wrap: anywhere; }\n"
        /* AND IT HAS A DARK ONE. #b00020 measures 7.33:1 on white and 2.56:1 on
           the dark canvas -- 1.87:1 once `.note` drops it to .75 opacity --
           which made the only red sentence on the screen the hardest thing to
           read on it, and it is the sentence that says why an option is
           impossible. The light value is unchanged. */
        . "  .bad { color: #b00020; font-weight: 700; }\n"
        . "  @media (prefers-color-scheme: dark) { .bad { color: #ff8f8f; } }\n"
        /* THE SETTINGS BOX, AND IT IS THE SITE'S. how-to-install-it.html opens
           on a small bordered box of "dials" -- an uppercase label, a row of
           pills, one short sentence that follows the choice -- and the reader
           who arrives here has just used it. Meeting two different ways of
           asking the same two questions, ten minutes apart, is the tool
           looking like two tools.

           SAME SHAPE, SAME RULE FOR WHAT GOES IN IT. On that page a dial is a
           choice that changes what the rest of the page SAYS; everything else
           sits lower. The same line is drawn here: the audience and the
           storage change what is installed, so they are dials; the update
           options change nothing about the install and stay a section below.

           NO SCRIPT, and that is not a preference: this page ships a
           `default-src 'none'` policy, so the pills are real radios with their
           label replaced, and the sentence that follows the choice is a
           `:has()` rule. A browser without `:has()` shows every sentence at
           once -- which is exactly what this page did before, so the fallback
           is the old behaviour rather than a broken one. */
        . "  .dials { margin: 0 0 1.6rem; padding: 1.1rem 1.2rem; border-radius: 10px;\n"
        . "           border: 1px solid rgba(128,128,128,.3); background: rgba(128,128,128,.07); }\n"
        . "  .dial-title { margin: 0 0 1.1rem; font-weight: 650; }\n"
        . "  .dial-row { display: grid; gap: 1.4rem 2.4rem;\n"
        . "              grid-template-columns: repeat(2, minmax(0, 1fr)); }\n"
        . "  @media (max-width: 34rem) { .dial-row { grid-template-columns: minmax(0, 1fr); } }\n"
        . "  .dial { border: 0; margin: 0; padding: 0; min-width: 0; }\n"
        . "  .dial legend { padding: 0; font-size: .78rem; font-weight: 650;\n"
        . "                 letter-spacing: .02em; text-transform: uppercase; opacity: .75; }\n"
        . "  .seg { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }\n"
        . "  .seg input { position: absolute; opacity: 0; width: 1px; height: 1px; }\n"
        . "  .seg label { cursor: pointer; }\n"
        . "  .seg span { display: inline-block; padding: .34rem .8rem; border-radius: 999px;\n"
        . "              border: 1px solid rgba(128,128,128,.45); font-size: .86rem;\n"
        . "              font-weight: 600; opacity: .8; }\n"
        . "  .seg input:checked + span { border-color: #0b53c0; background: #0b53c0;\n"
        . "              color: #fff; opacity: 1; }\n"
        . "  .seg input:focus-visible + span { outline: 2px solid #0b53c0; outline-offset: 2px; }\n"
        . "  @media (prefers-color-scheme: dark) {\n"
        . "    .seg input:checked + span { border-color: #8ab4ff; background: #8ab4ff; color: #10151c; }\n"
        . "    .seg input:focus-visible + span { outline-color: #8ab4ff; }\n"
        . "  }\n"
        . "  .dial-say { margin: .55rem 0 0; font-size: .85rem; opacity: .75; }\n"
        /* THE AUDIENCE PAIR HANGS OFF THE FORM, not off the box of dials: the
           settings further down carry the same two classes to say what an
           empty field becomes, and a rule scoped to .dials left both halves
           showing there -- which reads as the installer contradicting
           itself. */
        . "  form:has(#a-anyone:checked) .if-one,\n"
        . "  form:has(#a-one:checked) .if-anyone,\n"
        . "  .dials:has(#s-mysql:checked) .if-sqlite,\n"
        . "  .dials:has(#s-sqlite:checked) .if-mysql { display: none; }\n"
        /* The third dial's own sentences, and the two paragraphs UNDER the box
           that belong to two of its answers -- so this rule hangs off the form
           rather than off the box. */
        . "  form:has(#u-cron:checked) .if-url, form:has(#u-cron:checked) .if-self,\n"
        . "  form:has(#u-url:checked) .if-cron, form:has(#u-url:checked) .if-self,\n"
        . "  form:has(#u-self:checked) .if-cron, form:has(#u-self:checked) .if-url\n"
        . "      { display: none; }\n"
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
        /* IT WRAPS, IT DOES NOT SCROLL. `overflow-x: auto` kept the text and
           hid it: an overlay scrollbar shows nothing on a page nobody thinks
           to drag sideways. Measured on the screen that says "this screen is
           the only place it will ever appear" -- 58% of the update address
           was invisible at 390px, and 36% of the curl line at 1400. A secret
           shown once and cut in half is a secret lost. Long lines here are
           paths, URLs and crontab lines: wrapping one is ugly, losing one is
           not recoverable. */
        . "  pre { background: rgba(128,128,128,.14); padding: .8rem; border-radius: 6px;\n"
        . "        white-space: pre-wrap; overflow-wrap: anywhere; font-size: .9rem; }\n"
        . "  code { background: rgba(128,128,128,.14); padding: .1rem .3rem;\n"
        . "         border-radius: 3px; }\n"
        . "</style>\n</head>\n<body>\n";
    echo '<h1>annotepage</h1>' . "\n";
}

function ap_i_foot()
{
    echo "</body>\n</html>\n";
}

// --- 6. Self-deletion ------------------------------------------------------
//
// An installer that stays reachable AND writable on a live server is a
// liability: it writes a configuration file, and the only reason it is safe
// once installed is that it refuses to act. That refusal is one bug away.

function ap_i_delete_self($path)
{
    $name = basename($path);
    // clearstatcache first: a stale stat cache would let us report "deleted"
    // about a file that is still there.
    $gone = @unlink($path);
    clearstatcache(true, $path);
    if ($gone && !file_exists($path)) {
        return array(true, $name . ' is deleted. Nothing of the installer is left '
            . 'on this server.');
    }
    return array(false, $name . ' COULD NOT delete itself: the directory is not '
        . 'writable by the user PHP runs as, which is the normal state of a '
        . 'well-set-up server. Delete the file yourself, over FTP or from the '
        . 'file manager. Path: ' . $path);
}

// --- 7. The run ------------------------------------------------------------
//
// One call does the whole thing and never returns: every path below ends in
// exit or in the form. The caller has already sent nothing, so this owns the
// response.
//
// $options:
//   here          the directory the server is installed in (the entry point's)
//   self          absolute path of the entry point, the file offered for deletion
//   method        GET or POST -- see below, it is not read from the environment
//   report        rows already measured, shown above the form
//   lede          the sentence under the title
//   outbound_url  what the environment report requests to test the way out

function ap_i_run(array $options)
{
    /* THE OTHER FACE, BEFORE ANYTHING ELSE. Detected here rather than passed
       in, exactly as internal/update.php detects its own: one convention for
       the whole codebase, and a caller that cannot get it wrong. Nothing below
       this line has any meaning without a request. */
    if (PHP_SAPI === 'cli') {
        ap_i_cli($options);
        return;
    }

    // --- Dispatch. -----------------------------------------------------------

    $here       = $options['here'];
    $self       = $options['self'];
    $selfName   = basename($self);
    $configPath = $here . '/internal/config-local.php';
    $outboundUrl = isset($options['outbound_url'])
        ? $options['outbound_url'] : 'https://raw.githubusercontent.com/';
    // Rows measured BEFORE the flow started, by whoever called it. The bootstrap
    // puts what it downloaded and verified here, so that the one page the person
    // looks at carries the whole story and not the half of it this file saw.
    $report = isset($options['report']) ? $options['report'] : array();
    $lede = isset($options['lede']) ? $options['lede']
        : 'Upload the directory, open this page, press the button. '
          . 'Three questions, and all three have a default that works.';

    // The METHOD is an argument and not a reading of the environment: the caller
    // may have consumed a POST of its own -- the bootstrap's "fetch the release"
    // button is one -- and what follows it is the form, not an installation
    // nobody asked for.
    $method = isset($options['method'])
        ? strtoupper((string) $options['method'])
        : (isset($_SERVER['REQUEST_METHOD'])
            ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET');
    $configured = is_file($configPath);

    // The delete button, wherever it was pressed from. It is handled before
    // everything else because it is the one action that stays useful after the
    // installation is over.
    if ($method === 'POST' && isset($_POST['delete_self'])) {
        list($deleted, $message) = ap_i_delete_self($self);
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
                . 'was done. Open ' . ap_i_h($selfName) . ' directly and submit it from '
                . 'there.</p>' . "\n";
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
        echo '<p><code>api.php?action=diagnostic</code> answers in plain text. By '
            . 'default it says four things &mdash; the tool, its version, the format '
            . 'and the verdict &mdash; because that page has no authentication and '
            . "answers whoever asks for it.</p>\n";
        echo '<p>Put <code>\'diagnostic\' => \'full\'</code> in '
            . '<code>internal/config-local.php</code> and the same request reports the '
            . 'PHP really served, the storage, the declared projects and their origins, '
            . 'and what is left to do. Set it back afterwards. It is one request either '
            . "way, and it needs no shell.</p>\n";
        echo '<h2>Delete this file</h2>' . "\n";
        echo '<p>It is not needed any more. An installer that stays reachable and '
            . 'writable on a live server is a liability.</p>' . "\n";
        echo '<form method="post"><button type="submit" name="delete_self" value="1">'
            . 'Delete ' . ap_i_h($selfName) . "</button></form>\n";
        ap_i_foot();
        exit;
    }

    // ---------------------------------------------------------------------------
    // THE INSTALLATION ITSELF.
    // ---------------------------------------------------------------------------

    $errors = array();
    $installed = false;
    // Carried out of the POST branch because the last screen tells the operator
    // what is still theirs to do, and on a relay that is nothing.
    $installedRelay = false;

    /* AN ADDRESS THE OPERATOR TYPED IS TREATED LIKE ONE TYPED ON A COMMAND
       LINE. Left as it came -- the request's own -- nothing happens here: the
       request IS the proof that this directory answers at that address. Typed
       differently, it is proven the same way the shell face proves it, and a
       failure installs NOTHING rather than measuring somebody else's
       directory. This runs before $serverUrl is read, because everything shown
       and probed afterwards hangs off it. */
    if ($method === 'POST' && isset($_POST['api_address'])) {
        $wanted  = trim((string) $_POST['api_address']);
        $current = ap_i_base_url() . 'api.php';
        if ($wanted !== '' && $wanted !== $current) {
            $parts = parse_url($wanted);
            if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])
                || ($parts['scheme'] !== 'http' && $parts['scheme'] !== 'https')) {
                $errors[] = 'The address must be a full URL beginning with http:// or '
                    . 'https:// and ending in api.php. Nothing was installed.';
            } else {
                $urlDir = isset($parts['path']) ? rtrim(dirname($parts['path']), '/') : '';
                $host   = $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
                ap_i_base_url($parts['scheme'] . '://' . $host . $urlDir);
                ap_i_script_name(($urlDir === '' ? '' : $urlDir) . '/' . $selfName);

                $why = null;
                $askedTo = null;
                $leads = ap_i_address_leads_here($here, $why, $askedTo);
                if ($leads !== true) {
                    $errors[] = 'That address does not lead to this directory, so '
                        . 'nothing was installed. ' . $why;
                    $errors[] = 'Asked for: ' . $askedTo;
                    $errors[] = 'Written in: ' . $here;
                    $errors[] = 'Give the address this directory really answers at. '
                        . 'Without it, the check that proves your notes cannot be '
                        . "downloaded would be about somebody else's directory.";
                }
            }
        }
    }
    $serverUrl = ap_i_base_url() . 'api.php';

    if ($method === 'POST' && !$errors) {
        /* The answers arrive from the form here, and from the command line in
           the other face. Everything past this line is the same code either
           way -- see ap_i_install(). */
        $done = ap_i_install($_POST, $here, $configPath, $selfName, $report, $errors);
        $installed      = $done['installed'];
        $installedRelay = $done['relay'];
        $updateToken    = $done['token'];
        $autoUpdate     = $done['auto'];
        $wants          = $done['wants'];
    }

    // --- The page. -----------------------------------------------------------

    ap_i_head($installed ? 'annotepage -- installed' : 'annotepage -- install');

    if ($installed) {
        $screen = ap_i_screen_installed($installedRelay, $serverUrl, $here, $selfName,
                                        $report, $autoUpdate, $outboundUrl, $updateToken);
        ap_i_render_html($screen);
        ap_i_foot();
        exit;
    }

    // --- The form, and the report above it.

    echo '<p class="lede">' . ap_i_h($lede) . "</p>\n";

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

    /* WHAT THIS HOST OFFERS, FOLDED AWAY UNLESS SOMETHING IS WRONG.
       Eight rows of measurements, each with a paragraph explaining why it is
       measured, opened this page -- and the reader had to read a diagnostic
       before reaching the first question. On a phone the button sat four
       screens down, under a page whose own first line says "press the button".
       Nobody presses a button they cannot see.
       So: when everything this needs is here, the fold stays shut and says so
       in one line. When something is missing, THAT row is shown outside the
       fold, and the fold opens by itself -- the answer arrives before the
       evidence, which is the order somebody wants it in. */
    list($environment, $outbound) = ap_i_environment($here, $outboundUrl);
    $missing = array();
    foreach ($environment as $line) {
        if (!$line[2]) { $missing[] = $line; }
    }

    echo '<h2>What this server offers</h2>' . "\n";
    if ($missing) {
        echo '<p class="note bad">' . (count($missing) === 1
                ? 'One thing this needs is not here.'
                : ap_i_h((string) count($missing)) . ' things this needs are not here.')
            . " Until they are, installing gets you a server that answers wrongly "
            . "rather than one that does not answer.</p>\n";
        ap_i_render_html(array(array('table-env', $missing)));
    } else {
        echo '<p>Everything it needs is here: PHP ' . ap_i_h(PHP_VERSION)
            . ', the extensions, and a directory it can write to.'
            . ($outbound ? '' : ' It cannot reach the outside over HTTPS, which stops'
                . ' nothing here except automatic updates.')
            . "</p>\n";
    }
    /* AND IT STAYS SHUT EVEN THEN. Opening it printed the failing rows twice,
       once above and once inside, which is the noise this fold exists to
       remove. The row that failed carries its own explanation; the rest is
       for whoever wants it. */
    echo "<details>\n";
    echo '<summary>' . ($missing ? 'Everything that was measured' : 'What was measured')
        . ", one line each</summary>\n";
    ap_i_render_html(array(array('table-env', $environment)));
    echo "</details>\n";

    $postedMysql = ($method === 'POST' && isset($_POST['storage']) && $_POST['storage'] === 'mysql');
    $field = function ($name, $fallback = '') {
        return isset($_POST[$name]) ? (string) $_POST[$name] : $fallback;
    };

    $postedRelay = ($method === 'POST' && isset($_POST['audience'])
        && $_POST['audience'] === 'anyone');

    /* ?long=1 IS A READING, NOT A SETTING. It changes which of the two
       sentences each field carries and nothing else -- the form still posts to
       the bare address, so submitting from the long page installs exactly what
       submitting from the short one installs. */
    $long = isset($_GET['long']) && $_GET['long'] !== '' && $_GET['long'] !== '0';

    echo '<h2>Install</h2>' . "\n";
    echo '<form method="post" action="' . ap_i_h($selfName) . '">' . "\n";

    /* THE TWO DIALS, IN THE SITE'S OWN BOX. Everything the reader of
       how-to-install-it.html has just answered there, asked here in the same
       shape -- and only the two that change what gets installed. The long
       paragraph that used to sit under each radio is one sentence now, and it
       follows the choice instead of describing both. What that paragraph
       carried and is worth keeping is under the box, where it is read once
       rather than twice. */
    echo '<div class="dials">' . "\n";
    echo '<p class="dial-title">What this server is, and where it puts the '
        . "notes.</p>\n";
    echo '<div class="dial-row">' . "\n";

    ap_i_render_dial(ap_i_question('audience'), $postedRelay ? 'anyone' : 'one-site');

    ap_i_render_dial(ap_i_question('storage'), $postedMysql ? 'mysql' : 'sqlite');

    echo "</div>\n</div>\n";

    /* WHAT THE SHORT SENTENCES LEAVE OUT, AND IT IS ONE SENTENCE EACH. A relay
       costs disk and a hosting bill for notes nobody here can read; the SQLite
       probe is a refusal to install rather than a warning. Both were a
       paragraph under a radio, where they were read once and then scrolled
       past twice. */
    echo '<p class="note">A relay keeps what it cannot read, so it cannot moderate '
        . 'it either. With SQLite the installer requests the data file&rsquo;s own URL '
        . "and installs nothing unless it comes back refused.</p>\n";

    /* THE ADDRESS, SHOWN AND EDITABLE, AND IT WAS NEITHER. Opened in a browser
       this installer reads the address off the request that reached it, which
       is right almost always and invisible always -- and the two cases where
       it is wrong are ordinary: a site reached through a proxy or a CDN whose
       public name is not the one PHP sees, and an installation done through a
       temporary address before the real domain is pointed at it. The tag on
       every page carries this value; getting it silently wrong means a tag
       that loads nothing, on a screen that said everything went well.
       Pre-filled, so the normal case is still a button press. Changed, it is
       checked the way the command line checks it -- a file written here and
       asked for there -- because a typed address is a typed address whichever
       face typed it. */
    echo '<p><label>The address these pages will point at<br>'
        . '<input type="text" name="api_address" value="'
        . ap_i_h(ap_i_base_url() . 'api.php') . '"></label></p>' . "\n";
    echo '<p class="note">Read off the request that opened this page. Correct it if '
        . 'your visitors reach the site under another name &mdash; a proxy, a CDN, a '
        . 'temporary address. It is checked before anything is '
        . "installed.</p>\n";

    echo "<details" . ($postedMysql ? ' open' : '') . ">\n";
    echo "<summary>MySQL connection details</summary>\n";
    echo '<p>Only if you chose MySQL above. The installer connects and creates the tables '
        . 'before writing anything.</p>' . "\n";
    foreach (ap_i_credential_fields() as $box) {
        echo '<p><label>' . $box['label'] . '<br><input type="' . $box['type']
            . '" name="' . $box['name'] . '"';
        if ($box['default'] !== null) {
            echo ' value="' . ap_i_h($field($box['name'], $box['default'])) . '"';
        }
        echo "></label></p>\n";
    }
    echo "</details>\n";

    /* THREE WAYS, AND THEY ARE NOT EQUAL -- SO IT IS ONE CHOICE, IN ORDER.
       Two checkboxes said "tick what you like" over a paragraph explaining
       that the second is a mistake when the first is open to you. A dial says
       that by construction: three answers, one chosen, the first being the one
       that needs no permission granted to anybody. The site has drawn it this
       way since the install page was rebuilt. */
    $canDefer = ap_i_can_defer();
    $wants = ($method === 'POST' && isset($_POST['updates']))
        ? (string) $_POST['updates']
        : ($canDefer ? 'cron' : 'url');

    echo '<div class="dials">' . "\n";
    echo '<p class="dial-title">How this server gets its updates.</p>' . "\n";
    ap_i_render_dial(ap_i_question('updates'), $wants);
    echo "</div>\n";

    /* THE COST OF THE THIRD ANSWER, AND ONLY WHERE IT APPLIES. It is the one
       thing on this page somebody can regret, so it is said -- in two lines,
       not in the paragraph it used to be. --help has the paragraph. */
    echo '<p class="note if-self bad">Its cost: the code directory must be writable by '
        . 'PHP, and any file-writing bug on this account then becomes permanent code '
        . "execution. Setting the key back to false does not take the permission "
        . "away.</p>\n";
    echo '<p class="note if-url">The address is shown once, on the next screen. At most '
        . "one real check a day, however often it is called.</p>\n";

    if (!$canDefer) {
        echo '<p class="note bad">&ldquo;It updates itself&rdquo; cannot work on this '
            . 'host (<code>' . ap_i_h(PHP_SAPI) . '</code> cannot answer a visitor and '
            . "go on working). The address is chosen for you instead.</p>\n";
    }
    if (!$outbound) {
        echo '<p class="note bad">This server has no way out to HTTPS, so nothing here '
            . "can fetch anything until that is fixed.</p>\n";
    }

    /* AND EVERYTHING ELSE, FOLDED. The three questions stay the front door --
       a fourth dial would be a fourth question, and the page that draws this
       screen promises three. But asking three is not the same as deciding the
       rest behind somebody's back, and it did decide one: a relay was given a
       cap of 500 notes without a word, and that cap makes a project MUTE when
       it arrives. It is 6000 rows now, and it is a field like the others.
       Shut by default, so the screen is the length it was. Same table as the
       command line reads, so neither face can offer what the other cannot. */
    /* THE SAME TWO REGISTERS AS THE SHELL, AND THE SAME WAY OF ASKING. A form
       that only ever shows the short line leaves its reader with nowhere to go
       but the source; a form that shows the long one is the book this screen
       stopped being. So: a link, and the page comes back with the paragraphs
       -- the same ones `--help --verbose` prints, from the same table. It is a
       link and not a checkbox because there is no JavaScript here and never
       will be. */
    echo '<p class="note">All optional. Empty means the value in grey. '
        . ($long
            ? '<a href="' . ap_i_h($selfName) . '">Short version</a>'
            : '<a href="' . ap_i_h($selfName) . '?long=1">Why each of these?</a>')
        . " &mdash; the same sentences as <code>--help</code>.</p>\n";

    $section = null;
    $sections = ap_i_setting_sections();
    foreach (ap_i_settings() as $setting) {
        $key = $setting['key'];
        /* A SECTION OPENS WHEN ITS FIRST SETTING ARRIVES, and closes when the
           next one belongs elsewhere. The table's order IS the page's order,
           so there is one list to keep straight rather than a list and a
           layout that can disagree about what exists. */
        if ($setting['group'] !== $section) {
            if ($section !== null) {
                echo "</details>\n";
            }
            $section = $setting['group'];
            $shape = $sections[$section];
            echo '<details' . (!empty($shape['open']) ? ' open' : '') . ">\n";
            echo '<summary>' . ap_i_h($shape['title']) . "</summary>\n";
            $intro = $long ? $shape['say'] : $shape['hint'];
            if ($intro !== '') {
                echo '<p class="note' . (!empty($shape['warn']) ? ' bad' : '') . '">'
                    . $intro . "</p>\n";
            }
        }
        echo '<p><label>' . ap_i_h($setting['label']);
        if ($setting['kind'] === 'choice') {
            echo '<br><select name="' . $key . '">' . "\n";
            echo '<option value="">(leave it as it is)</option>' . "\n";
            foreach ($setting['values'] as $value) {
                echo '<option value="' . ap_i_h($value) . '"'
                    . ($field($key) === $value ? ' selected' : '') . '>'
                    . ap_i_h($value) . "</option>\n";
            }
            echo "</select>\n";
        } elseif ($setting['kind'] === 'bool') {
            echo '<br><select name="' . $key . '">' . "\n";
            echo '<option value="">(leave it as it is)</option>' . "\n";
            foreach (array('true', 'false') as $value) {
                echo '<option value="' . $value . '"'
                    . ($field($key) === $value ? ' selected' : '') . '>'
                    . $value . "</option>\n";
            }
            echo "</select>\n";
        } else {
            /* THE DEFAULT IS THE PLACEHOLDER, not the value. Written into the
               field it would be submitted, and every default would freeze into
               the file as though somebody had chosen it; greyed behind an empty
               field it says what happens if nothing is typed, which is what the
               person reading wants to know. */
            $default = ap_i_setting_default($key);
            /* AND WHERE THE INSTALLER DECIDES INSTEAD OF config.php, THE
               PLACEHOLDER SAYS NOTHING RATHER THAN SOMETHING FALSE. Four of
               these are written by this install according to the answers
               above -- a relay is capped at 2000 notes, a server carrying its
               own site has two counters turned off -- and showing config.php's
               number in the field would promise the opposite of what is about
               to be written. The sentence below says what each answer gets,
               and the CSS shows the half that applies. */
            $hint = isset($setting['decided'])
                ? $setting['unit']
                : trim($default . ' ' . $setting['unit']);
            echo '<br><input type="' . ($setting['kind'] === 'int' ? 'number' : 'text')
                . '" name="' . $key . '" value="' . ap_i_h($field($key)) . '"'
                . ($hint !== '' ? ' placeholder="' . ap_i_h($hint) . '"' : '')
                . ">\n";
        }
        echo "</label></p>\n";
        /* THE SHORT SENTENCE HERE, THE LONG ONE IN --help, AND IT IS NOT THE
           SAME READER. This screen printed `say` -- the full paragraph, for
           every setting -- and measured 1756 words, more than the entire
           install page of the website. Opening a fold looked like opening a
           book, so it stopped being read at all. What a form owes is the
           thing the label cannot say; a field whose name is enough gets
           nothing, and eight of them do. Whoever wants the paragraph types
           --help, where a paragraph is what they came for. */
        /* ONE LINE UNDER A FIELD, not two. The hint and "what an empty field
           gets you" were two paragraphs, which on four settings made a
           two-line stack under a one-line box. */
        $said = $long ? $setting['say'] : $setting['hint'];
        if ($said !== '' || isset($setting['decided'])) {
            echo '<p class="note">' . $said;
            if (isset($setting['decided'])) {
                echo ($said !== '' ? ' ' : '')
                    . '<span class="if-one">Empty: '
                    . ap_i_h($setting['decided']['one-site']) . '.</span>'
                    . '<span class="if-anyone">Empty: '
                    . ap_i_h($setting['decided']['anyone']) . '.</span>';
            }
            echo "</p>\n";
        }
    }
    if ($section !== null) {
        echo "</details>\n";
    }

    echo '<button type="submit">Install</button>' . "\n";
    echo "</form>\n";

    ap_i_foot();
}
