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
function ap_i_script_name()
{
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

// --- 4. Writing the configuration ------------------------------------------

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
        $text .= "    // THIS SERVER IS OPEN TO ANYBODY, which is what was asked for at\n";
        $text .= "    // install time. It serves several sites and not one, so none of\n";
        $text .= "    // the shortcuts a single-tenant install may take apply here --\n";
        $text .= "    // see internal/config.php for what the two modes change.\n";
        $text .= "    'deployment' => 'relay',\n\n";

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
        $text .= "    // This server sits on the site under review, behind the same access\n";
        $text .= "    // restriction as it. Change to 'relay' only on a machine serving\n";
        $text .= "    // several sites -- see internal/config.php for what that changes.\n";
        $text .= "    'deployment' => 'self-hosted',\n\n";
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

    if ($relay) {
        $text .= "    // WHAT BOUNDS THE DISK. Both ship as 0, meaning no limit, which is\n";
        $text .= "    // right for a server holding one team's notes and wrong for one\n";
        $text .= "    // holding strangers': it stores what it cannot read, for people who\n";
        $text .= "    // will never come back to tidy up, so without a ceiling it only\n";
        $text .= "    // grows. Ninety days is a review cycle with room to spare. The cap\n";
        $text .= "    // per project is the only thing bounding what a single abuser costs,\n";
        $text .= "    // since an abuser cannot be told from a project.\n";
        $text .= "    'max_note_age_days'     => 90,\n";
        $text .= "    'max_notes_per_project' => 500,\n\n";
    }

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
        $text .= "    'forward_root_to' => '',\n\n";
    } else {
        $text .= "    // WHERE A BARE VISIT GOES. Empty: a visit to this directory with no\n";
        $text .= "    // path gets a 404 and api.php is unaffected either way. Put an\n";
        $text .= "    // absolute http(s) URL here and such a visit is sent there with a 302\n";
        $text .= "    // -- what a public relay wants, so somebody landing on the bare host\n";
        $text .= "    // reaches a page explaining what the thing is instead of nothing.\n";
        $text .= "    'forward_root_to' => '',\n\n";
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
    $text .= "    'diagnostic' => 'minimal',\n";
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
    $serverUrl = ap_i_base_url() . 'api.php';

    if ($method === 'POST') {
        $storage = isset($_POST['storage']) && $_POST['storage'] === 'mysql' ? 'mysql' : 'sqlite';
        $autoUpdate = !empty($_POST['auto_update']);

        // WHO IT IS FOR. Compared against the one exact string the form sends,
        // never tested for truth: a missing field, a mangled one, a value from
        // an older form or a hand-made request all land on 'self-hosted'. The
        // wrong answer in this direction costs a manual edit; the wrong answer
        // in the other opens somebody's disk to strangers without them asking.
        $deployment = (isset($_POST['audience']) && $_POST['audience'] === 'anyone')
            ? 'relay' : 'self-hosted';

        /* 32 bytes, base64url, from the same source as everything else that
           must not be guessable. Generated HERE and shown once: the installer
           is the only screen that will ever have a reason to print it. */
        $updateToken = '';
        if (!empty($_POST['update_url'])) {
            $updateToken = rtrim(strtr(base64_encode(
                function_exists('random_bytes') ? random_bytes(32)
                    : openssl_random_pseudo_bytes(32)), '+/', '-_'), '=');
        }

        $values = array(
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

            $created = array();
            $location = null;

            if (!$errors) {
                $location = ap_i_pick_location($here, $docRoot);
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
            if (is_file($configPath)) {
                $errors[] = 'internal/config-local.php appeared while this page was '
                    . 'working. Nothing was written.';
            } else {
                $text = ap_i_config_text($values);
                $written = @file_put_contents($configPath, $text, LOCK_EX);
                if ($written === false) {
                    $errors[] = 'internal/config-local.php could not be written. Grant the '
                        . 'user PHP runs as write permission on the internal/ directory, '
                        . 'then reload this page. Path: ' . $configPath;
                } else {
                    // It holds credentials on the MySQL route. 0600 rather than
                    // whatever umask the host happens to have.
                    @chmod($configPath, 0600);
                    $installed = true;
                    $installedRelay = ($deployment === 'relay');
                }
            }
        }
    }

    // --- The page. -----------------------------------------------------------

    ap_i_head($installed ? 'annotepage -- installed' : 'annotepage -- install');

    if ($installed) {
        echo '<p class="lede">Installed. One line left to paste.</p>' . "\n";

        echo '<h2>The line</h2>' . "\n";
        echo '<p>The tag on the pages you want to annotate carries this address:</p>' . "\n";
        echo '<pre>data-server="' . ap_i_h($serverUrl) . '"</pre>' . "\n";
        if ($installedRelay) {
            echo '<p>The rest of the tag &mdash; the script source and the project id '
                . '&mdash; comes from the client, and there is nothing to declare here: '
                . 'this server answers about any project id it is given. The key never '
                . 'reaches it, in any form: that is what makes the notes unreadable to '
                . "it, and to you.</p>\n";
        } else {
            echo '<p>The rest of the tag &mdash; the script source and the project id '
                . '&mdash; comes from the client. Add the tag to a page, open it, and the '
                . 'setup screen generates the key in your browser and hands you the block '
                . 'to paste into <code>internal/config-local.php</code> under '
                . '<code>projects</code>. The key never reaches this server, in any form: '
                . "that is what makes the notes unreadable to it.</p>\n";
        }

        echo '<h2>What was measured</h2>' . "\n";
        echo "<table>\n";
        foreach ($report as $line) {
            echo '<tr><td class="k">' . ap_i_h($line[0]) . '</td><td class="v">'
                . ap_i_h($line[1]) . '</td><td class="m">' . ap_i_h($line[2]) . "</td></tr>\n";
        }
        echo "</table>\n";

        echo '<h2>Check it, in one request</h2>' . "\n";
        echo '<pre>' . ap_i_h($serverUrl) . '?action=diagnostic</pre>' . "\n";
        echo '<p>Plain text, and short by default: the tool, its version, the format '
            . 'and the verdict &mdash; running, or not, and what to do about it. That '
            . 'page has no authentication, so what it publishes it publishes to '
            . "everybody.</p>\n";
        echo '<p>The configuration just written carries '
            . '<code>\'diagnostic\' => \'minimal\'</code>. Change it to '
            . '<code>\'full\'</code> for the whole report &mdash; the PHP really '
            . 'served, the storage and its state, the declared projects with their '
            . 'origins &mdash; and change it back when you are done. No credential '
            . "value ever appears there, under either value.</p>\n";

        echo '<h2>Now delete this file</h2>' . "\n";
        echo '<p>It has done its job. It refuses to act while the configuration exists, '
            . 'but an installer that stays reachable and writable on a live server is a '
            . 'liability all the same.</p>' . "\n";
        echo '<form method="post"><button type="submit" name="delete_self" value="1">'
            . 'Delete ' . ap_i_h($selfName) . "</button></form>\n";
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

    echo '<h2>What this server offers</h2>' . "\n";
    list($environment, $outbound) = ap_i_environment($here, $outboundUrl);
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

    $postedRelay = ($method === 'POST' && isset($_POST['audience'])
        && $_POST['audience'] === 'anyone');

    echo '<h2>Install</h2>' . "\n";
    echo '<form method="post" action="' . ap_i_h($selfName) . '">' . "\n";

    echo "<fieldset>\n<legend>Who this server is for</legend>\n";
    echo '<label class="choice"><input type="radio" name="audience" value="one-site"'
        . ($postedRelay ? '' : ' checked') . '> <strong>One site, mine</strong> '
        . "&mdash; I declare its project by hand</label>\n";
    echo '<label class="choice"><input type="radio" name="audience" value="anyone"'
        . ($postedRelay ? ' checked' : '') . '> <strong>Anyone</strong> '
        . "&mdash; a relay, open to projects nobody declared</label>\n";
    echo '<p class="note">Then notes from people you have never heard of land on your '
        . 'disk and in your hosting bill. They are encrypted with a key this server '
        . 'never receives, so you keep what you cannot read and cannot moderate. The '
        . 'generated configuration bounds it: 500 notes per project, nothing kept past '
        . '90 days.</p>' . "\n";
    echo "</fieldset>\n";

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

    /* THE QUESTION THE FIRST ONE DOES NOT ANSWER. Ticking auto_update above
       buys nothing on a host whose PHP interface cannot hand the response to
       the visitor before working -- `cgi-fcgi` is the common one, and it is
       most of cheap hosting. Such a host declines the web path and points at
       cron, and plenty of it has no cron either, or a cron that can only fetch
       a URL. This is the answer for all of them, and it is one line to paste
       into whatever scheduler exists. */
    /* PRE-TICKED WHERE IT IS THE ONLY WAY, AND THE HOST IS ASKED, NOT GUESSED
       AT. The opportunistic path needs an interface that can hand the response
       to the visitor before working: php-fpm and LiteSpeed can, `cgi-fcgi` and
       the rest cannot, and on those the checkbox above buys nothing at all.
       Somebody installing on such a host should not have to know that to end
       up with a working server -- so the box is already ticked, and the note
       says which interface answered. */
    $canDefer = PHP_SAPI === 'cli'
        || function_exists('fastcgi_finish_request')
        || function_exists('litespeed_finish_request');
    $wantsUrl = ($method === 'POST') ? !empty($_POST['update_url']) : !$canDefer;

    echo '<label class="choice"><input type="checkbox" name="update_url" value="1"'
        . ($wantsUrl ? ' checked' : '')
        . "> Give me an address a scheduler can call to update this server</label>\n";
    if (!$canDefer) {
        echo '<p class="note bad">This PHP interface (<code>' . ap_i_h(PHP_SAPI)
            . '</code>) cannot hand the response to the visitor before doing more '
            . 'work, and a visitor must never wait on a fetch to GitHub. The option '
            . 'above therefore does nothing here, whether you tick it or not: THIS is '
            . "the one that works on this host, and it is ticked for you.</p>\n";
    }
    echo '<p class="note">For a host with no cron and no shell, or one whose cron can '
        . 'only fetch a URL. A secret is written into the configuration and the address '
        . 'is shown once, on the next screen. Whoever calls it waits while the update '
        . 'runs &mdash; that is allowed there and nowhere else, because they came for it '
        . 'and nobody else is kept waiting. At most one real check a day, however often '
        . "it is called.</p>\n";
    echo "</fieldset>\n";

    echo '<button type="submit">Install</button>' . "\n";
    echo "</form>\n";

    ap_i_foot();
}
