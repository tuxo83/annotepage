<?php
/**
 * annotepage-install.php -- ONE FILE. Drop it on the host, open it in a
 * browser, and there is a server.
 *
 * It downloads the rest of the release itself, checks every file against the
 * published MANIFEST's SHA-256 before putting it in place, and then runs the
 * ordinary installation: the environment report, the one form, the data file
 * placed and PROVEN unreachable over HTTP, the configuration written, and the
 * offer to delete itself. There is nothing to unzip, nothing to upload but
 * this, and nothing left behind afterwards.
 *
 * IT KNOWS NOTHING ABOUT THE RELEASE, AND THAT IS DELIBERATE.
 *
 * There is no list of files in here. There is no version number in here. There
 * is no list of directories to create, no list of what is optional, no list of
 * what to skip. All of it is read from the MANIFEST it has just downloaded,
 * every time it runs. Add a file to the server, rename one, split one in two:
 * this installer keeps working, unchanged, because it was never told what the
 * server is made of.
 *
 * IF YOU ARE HERE TO ADD A FILE NAME, YOU ARE ABOUT TO BREAK THAT. The release
 * side already takes care of itself -- tools/build-server-manifest.mjs
 * generates the manifest and `npm run check` fails on a stale one -- and the
 * install side must not become the place somebody has to remember. Whatever
 * you were about to hard-code, read it out of the manifest instead.
 *
 * The two names it does carry, `update.php` and `install-flow.php`, are not
 * an inventory: they are the two pieces of code it CALLS. It looks each of
 * them up in the manifest by base name, so even moving them is survivable, and
 * it installs whatever the manifest lists, which it has never seen before.
 *
 * WHAT IS TRUSTED. The trust anchor is the release source over HTTPS with
 * certificate verification ON -- exactly update.php's, because it IS
 * update.php: this file downloads that one, verifies it against the published
 * manifest, requires it, and hands it the job. The manifest parsing, the
 * per-file download, the hash check on the bytes that landed on disk, and the
 * rule that ONE mismatch abandons everything and changes nothing are all its
 * code, called, not copied. A fresh install is an update from nothing.
 *
 * WHAT IS HERE THAT ALSO EXISTS IN THE RELEASE -- one HTTPS fetch, the control
 * probe, the cross-site check -- is here because it has to run BEFORE the
 * release exists on this machine. Code cannot download itself. From the moment
 * update.php is on disk, this file stops having opinions and calls it.
 *
 * WHAT IT REFUSES. A host with neither curl nor `allow_url_fopen` cannot make
 * an outbound HTTPS request at all, which is common on cheap hosting. This
 * file cannot work there, says so in one sentence on the first screen, and
 * names the route that does work: copy `webroot/` over FTP and open
 * install.php. That route stays supported and stays documented.
 *
 * NOTHING IS WRITTEN UNTIL IT VERIFIES. And if anything fails -- a bad hash, a
 * short read, a source that answers something else -- everything this file
 * created is removed before the page is drawn. A failed run leaves the
 * directory as it found it: this file, and nothing else.
 */

// --- 1. PHP version -------------------------------------------------------
// First executable statement, PHP 5.4 syntax only, exactly as in api.php and
// install.php: the version test below would never be reached if this file did
// not compile, and the version on the command line is not necessarily the one
// served.

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
// The installation proves the data file is unreachable by REQUESTING it over
// HTTP, and before that it requests this file, to establish that it can reach
// its own web server at all and that the URL it computed maps to this
// directory. This is the answer to that control request.
//
// It is answered before ANYTHING else happens -- nothing required, nothing
// read, no side effect of any kind -- and the token is reduced to letters and
// digits before being echoed, so this cannot be turned into a reflector for
// someone else's content.
//
// These eleven lines are the same eleven lines as in install.php, and they are
// written out in both for the one reason that makes duplication right here:
// when this file answers a control probe the release may not be on disk yet,
// so there is nothing to call. The string below is the one
// internal/install-flow.php looks for.

if (isset($_GET['probe'])) {
    $token = preg_replace('/[^A-Za-z0-9]/', '', (string) $_GET['probe']);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    echo 'annotepage-install-probe ' . substr($token, 0, 64) . "\n";
    exit;
}

// --- 3. Where the release comes from ---------------------------------------

/**
 * HTTPS ONLY, and there is no flag to relax it -- the same rule as
 * update.php's `update_source`, checked here on the two files this file
 * fetches by itself and checked again by ap_update_source() on every file the
 * updater fetches afterwards.
 *
 * ALREADY DEFINED means something was loaded before this file, which only a
 * php.ini directive can arrange -- that is, a shell. It is how this installer
 * is tested against a stand-in for the real source. No web request can reach
 * it: nothing in this file reads a URL out of $_GET, $_POST, a header or a
 * cookie, and an https:// source is required either way.
 */
if (!defined('AP_B_SOURCE')) {
    define('AP_B_SOURCE',
        'https://raw.githubusercontent.com/tuxo83/annotepage/main/server/webroot/');
}

/**
 * Budgets for the two fetches this file makes on its own -- the manifest, and
 * the one file it has to have before it can call anything. Every other
 * download is under update.php's own budgets, which are the ones that matter.
 */
define('AP_B_MAX_MANIFEST_BYTES', 65536);
define('AP_B_MAX_FILE_BYTES', 524288);
define('AP_B_CONNECT_TIMEOUT', 5);
define('AP_B_TIMEOUT', 20);

// --- 4. The one fetch this file makes on its own ---------------------------

/** Which way out this host offers, or null. update.php reasons the same way. */
function ap_b_transport()
{
    if (function_exists('curl_init') && function_exists('curl_exec')) {
        return 'curl';
    }
    if (ini_get('allow_url_fopen') && extension_loaded('openssl')) {
        return 'stream';
    }
    return null;
}

/**
 * Fetches one URL over HTTPS with certificate verification ON, exactly as
 * update.php does and for the same reason: an attacker who hijacks this
 * server's DNS still cannot present a valid certificate for the source, so a
 * DNS compromise alone does not reach the download. Any code path that
 * disabled peer verification would be the bug, not the workaround, and there
 * is none in this file.
 *
 * @return array array('ok' => bool, 'body' => string, 'error' => string)
 */
function ap_b_fetch($url, $maxBytes)
{
    $fail = function ($message) {
        return array('ok' => false, 'body' => '', 'error' => $message);
    };
    if (strtolower(substr($url, 0, 8)) !== 'https://') {
        return $fail('the release source is not https:// -- refused.');
    }
    $transport = ap_b_transport();

    if ($transport === 'curl') {
        $handle = curl_init();
        $body = '';
        $over = false;
        curl_setopt_array($handle, array(
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            // Redirects are NOT followed: a followed redirect is a second URL
            // nobody vetted, and the classic way back down to plain HTTP.
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => AP_B_CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => AP_B_TIMEOUT,
            CURLOPT_USERAGENT      => 'annotepage-install',
            CURLOPT_WRITEFUNCTION  => function ($ignored, $chunk) use (&$body, &$over, $maxBytes) {
                $body .= $chunk;
                if (strlen($body) > $maxBytes) {
                    $over = true;
                    return 0;
                }
                return strlen($chunk);
            },
        ));
        curl_exec($handle);
        $errno = curl_errno($handle);
        $message = curl_error($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        if ($over) {
            return $fail('the answer is longer than the ' . $maxBytes . ' bytes allowed.');
        }
        if ($errno !== 0) {
            return $fail('HTTPS request refused: ' . $message . ' (curl ' . $errno . ').');
        }
        if ($status !== 200) {
            return $fail('the source answered HTTP ' . $status . '.');
        }
        return array('ok' => true, 'body' => $body, 'error' => '');
    }

    if ($transport === 'stream') {
        $context = stream_context_create(array(
            'http' => array(
                'method'          => 'GET',
                'timeout'         => AP_B_TIMEOUT,
                'follow_location' => 0,
                'user_agent'      => 'annotepage-install',
                'ignore_errors'   => true,
            ),
            'ssl' => array(
                // The three of them together. verify_peer alone still accepts a
                // valid certificate issued for another name.
                'verify_peer'       => true,
                'verify_peer_name'  => true,
                'allow_self_signed' => false,
            ),
        ));
        // The warnings are COLLECTED, not swallowed: a failed TLS handshake
        // emits three and only the FIRST says why. error_get_last() returns the
        // last, which is the useless one.
        $warnings = array();
        set_error_handler(function ($number, $message) use (&$warnings) {
            $warnings[] = $message;
            return true;
        });
        $stream = fopen($url, 'rb', false, $context);
        restore_error_handler();
        if ($stream === false) {
            $why = $warnings ? implode(' / ', $warnings) : 'no reason given';
            return $fail('HTTPS request refused: ' . substr(str_replace(array("\r", "\n"), ' ', $why), 0, 200));
        }
        $status = 0;
        if (isset($http_response_header) && is_array($http_response_header)) {
            foreach ($http_response_header as $line) {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                    $status = (int) $m[1];
                }
            }
        }
        $body = '';
        while (!feof($stream)) {
            $chunk = fread($stream, 8192);
            if ($chunk === false) {
                break;
            }
            $body .= $chunk;
            if (strlen($body) > $maxBytes) {
                fclose($stream);
                return $fail('the answer is longer than the ' . $maxBytes . ' bytes allowed.');
            }
        }
        fclose($stream);
        if ($status !== 200 && $status !== 0) {
            return $fail('the source answered HTTP ' . $status . '.');
        }
        return array('ok' => true, 'body' => $body, 'error' => '');
    }

    return $fail(ap_b_no_transport_sentence());
}

/** Said on the first screen, and said again if anything asks for it. */
function ap_b_no_transport_sentence()
{
    return 'This host has neither the curl extension nor `allow_url_fopen` with '
        . 'openssl, so it cannot make an outbound HTTPS request at all. This '
        . 'installer downloads the server, so it cannot work here -- and nothing '
        . 'was written.';
}

/** What to do instead. One route, and it is the one INSTALL.md documents. */
function ap_b_fallback_sentence()
{
    return 'Copy the release\'s `webroot/` directory onto the host over FTP or SFTP '
        . '-- it is the same files this page would have downloaded -- and open '
        . '`install.php` inside it. That route needs no way out to the network, and '
        . 'it installs exactly the same server.';
}

// --- 5. Reading the manifest, without becoming a second parser --------------

/**
 * Finds the ONE file in a manifest whose base name is $basename.
 *
 * This is a lookup, not a parse: the strict parse -- which decides what gets
 * written -- is ap_update_parse_manifest(), in update.php, and it runs on the
 * same text a moment later. This exists because one file has to be found
 * BEFORE update.php can be loaded, and the same lookup then finds the flow to
 * hand over to.
 *
 * By BASE NAME, deliberately: a release that moves internal/update.php
 * somewhere else still installs. A release that has two of them, or none, is
 * refused rather than guessed at.
 *
 * @return array|null array('path' => string, 'hash' => string)
 */
function ap_b_find($manifestText, $basename)
{
    $found = null;
    foreach (explode("\n", str_replace("\r\n", "\n", (string) $manifestText)) as $line) {
        if (!preg_match('/^([0-9a-f]{64})  ([A-Za-z0-9._\/-]{1,120})$/', $line, $m)) {
            continue;
        }
        if (strpos($m[2], '..') !== false || $m[2][0] === '/') {
            continue;
        }
        if (basename($m[2]) !== $basename) {
            continue;
        }
        if ($found !== null) {
            return null;   // two of them: this installer will not choose
        }
        $found = array('path' => $m[2], 'hash' => $m[1]);
    }
    return $found;
}

/** The installed flow file, located through the manifest on disk, or null. */
function ap_b_flow($here)
{
    $manifest = $here . '/MANIFEST';
    if (!is_readable($manifest)) {
        return null;
    }
    $found = ap_b_find((string) @file_get_contents($manifest), 'install-flow.php');
    if ($found === null) {
        return null;
    }
    $path = $here . '/' . $found['path'];
    return is_readable($path) ? $path : null;
}

// --- 6. Downloading the release --------------------------------------------

/**
 * Does the whole download, and returns what happened.
 *
 * NOTHING IS LEFT BEHIND ON FAILURE. Every directory and every file this
 * function creates is recorded as it is created, and removed in the opposite
 * order the moment anything goes wrong -- including a failure inside
 * update.php, which abandons its own staging by itself. What the caller then
 * shows is a report and a directory containing this file and nothing else.
 *
 * @return array array('ok' => bool, 'lines' => array of strings,
 *                     'version' => string, 'files' => int, 'fallback' => bool)
 */
function ap_b_install($here)
{
    $lines = array();
    $files = array();          // absolute paths, in creation order
    $directories = array();    // idem

    $say = function ($line) use (&$lines) {
        $lines[] = $line;
    };
    /**
     * Undo, then report. `fallback` true means the host itself cannot do this,
     * so the page must name the other route rather than suggest trying again.
     */
    $stop = function ($message, $fallback = false)
            use (&$lines, &$files, &$directories, $here, $say) {
        // update.php's own staging first: it removes it itself on the paths it
        // controls, and this covers the ones it does not reach.
        if (function_exists('ap_update_remove_tree') && is_dir($here . '/.update')) {
            ap_update_remove_tree($here . '/.update');
        }
        foreach (array_reverse($files) as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }
        foreach (array_reverse($directories) as $path) {
            @rmdir($path);   // fails harmlessly if something else is in there
        }
        $say($message);
        $say('Nothing was written: the directory is as it was.');
        return array('ok' => false, 'lines' => $lines, 'version' => '',
                     'files' => 0, 'fallback' => $fallback);
    };

    /** mkdir -p under $here, recording what it really created. */
    $ensure = function ($relative) use ($here, &$directories) {
        $path = $here;
        foreach (explode('/', trim($relative, '/')) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            $path .= '/' . $part;
            if (!is_dir($path)) {
                if (!@mkdir($path, 0755) && !is_dir($path)) {
                    return false;
                }
                $directories[] = $path;
            }
        }
        return true;
    };

    if (ap_b_transport() === null) {
        return $stop(ap_b_no_transport_sentence(), true);
    }
    if (!is_writable($here)) {
        return $stop('The directory this file sits in is not writable by the user PHP '
            . 'runs as, so the release cannot be written into it: ' . $here, true);
    }

    // --- The manifest. It is the only thing this file asks for by name, and
    // everything that gets installed is named by IT and not by anything here.
    $answer = ap_b_fetch(AP_B_SOURCE . 'MANIFEST', AP_B_MAX_MANIFEST_BYTES);
    if (!$answer['ok']) {
        return $stop('The release manifest could not be read from ' . AP_B_SOURCE
            . 'MANIFEST -- ' . $answer['error']);
    }
    $manifestText = $answer['body'];
    $say('manifest: ' . strlen($manifestText) . ' bytes from ' . AP_B_SOURCE);

    // --- The updater, which is the only file this one downloads by itself.
    $updater = ap_b_find($manifestText, 'update.php');
    if ($updater === null) {
        return $stop('This release does not name exactly one `update.php` in its '
            . 'manifest, and that file is the one this installer needs before it can '
            . 'fetch anything else.');
    }
    if (!$ensure(dirname($updater['path']))) {
        return $stop('Could not create ' . $here . '/' . dirname($updater['path']) . '.');
    }
    $answer = ap_b_fetch(AP_B_SOURCE . $updater['path'], AP_B_MAX_FILE_BYTES);
    if (!$answer['ok']) {
        return $stop('Could not download ' . $updater['path'] . ' -- ' . $answer['error']);
    }
    // `.part` first, and the hash is taken from the file ON DISK: hashing the
    // string in memory would sail straight past a short write and a full disk,
    // which is exactly what this check is for. It is update.php's own rule,
    // applied to update.php itself.
    $target = $here . '/' . $updater['path'];
    $partial = $target . '.part';
    if (@file_put_contents($partial, $answer['body']) === false) {
        return $stop('Could not write ' . $partial . '.');
    }
    $files[] = $partial;
    $landed = hash_file('sha256', $partial);
    if ($landed !== $updater['hash']) {
        return $stop('CHECKSUM MISMATCH on ' . $updater['path'] . ' -- the manifest says '
            . $updater['hash'] . ' and the file that arrived hashes ' . $landed
            . '. Nothing was installed.');
    }
    if (!@rename($partial, $target)) {
        return $stop('Could not put ' . $updater['path'] . ' in place.');
    }
    array_pop($files);
    $files[] = $target;
    @chmod($target, 0644);
    $say('verified: ' . $updater['path'] . ' (' . strlen($answer['body']) . ' bytes)');

    // From here on this file writes nothing and decides nothing about the
    // release: it is update.php's code that downloads, verifies and installs.
    require $target;

    // --- The manifest again, THROUGH the code we just verified. If the fetch
    // above had been subtly wrong -- a truncation taken for a body, a
    // certificate not really checked -- the two would differ. The one that is
    // trusted afterwards is the one update.php read.
    $answer = ap_update_fetch(AP_B_SOURCE . 'MANIFEST', AP_UPDATE_MAX_MANIFEST_BYTES);
    if (!$answer['ok']) {
        return $stop('The manifest could not be read back through the updater -- '
            . $answer['error']);
    }
    if ($answer['body'] !== $manifestText) {
        return $stop('The manifest read twice gave two different answers. Something '
            . 'between here and the source is not stable, and nothing was installed.');
    }
    $manifest = ap_update_parse_manifest($manifestText, $manifestError);
    if ($manifest === null) {
        return $stop('The published manifest was refused: ' . $manifestError);
    }

    // --- Every directory the manifest names, and not one this file chose.
    foreach (array_keys($manifest) as $path) {
        $directory = dirname($path);
        if ($directory !== '' && $directory !== '.' && !$ensure($directory)) {
            return $stop('Could not create ' . $here . '/' . $directory . '.');
        }
    }

    // --- The manifest ON DISK, before the updater runs, because the updater
    // reads it: it is how it tells the store it shipped from one somebody
    // replaced. Without a local manifest it declines to touch either store --
    // correct when updating, and on a fresh install that would leave a server
    // with no store at all.
    if (@file_put_contents($here . '/MANIFEST', $manifestText) === false) {
        return $stop('Could not write ' . $here . '/MANIFEST.');
    }
    $files[] = $here . '/MANIFEST';

    // --- The download itself. A fresh install is an update from nothing: no
    // VERSION file means no installed version, every listed hash differs from
    // what is on disk, and the whole release is fetched -- each file verified
    // after it has landed, one mismatch abandoning all of it.
    $report = ap_update_run(array('update_source' => AP_B_SOURCE));
    foreach ($report['lines'] as $line) {
        $say($line);
    }
    if (!$report['ok'] || !$report['changed']) {
        return $stop('The release was not installed.');
    }

    // The staging and backup directory goes: it exists to undo an upgrade, and
    // this installation has no previous version to go back to.
    ap_update_remove_tree($here . '/.update');

    return array('ok' => true, 'lines' => $lines,
                 'version' => ap_update_installed_version(),
                 'files' => count($manifest), 'fallback' => false);
}

// --- 7. The two screens this file draws on its own -------------------------
//
// Two, and only two: the offer to download, and the failure to. Everything
// after the release lands is drawn by internal/install-flow.php, which is the
// same page install.php shows. There is no shell to borrow before the download
// -- that is what the download is for -- so this one is deliberately plain and
// carries no opinion the real one would have to agree with.

function ap_b_head($title)
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; "
        . "form-action 'self'; base-uri 'none'");
    echo "<!doctype html>\n<html lang=\"en\">\n<head>\n";
    echo "<meta charset=\"utf-8\">\n";
    echo "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n";
    echo "<meta name=\"robots\" content=\"noindex, nofollow\">\n";
    echo '<title>' . ap_b_h($title) . "</title>\n";
    echo "<style>\n"
        . "  :root { color-scheme: light dark; }\n"
        . "  body { margin: 0 auto; padding: 2rem 1.25rem 6rem; max-width: 46rem;\n"
        . "         font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }\n"
        . "  h1 { font-size: 1.5rem; margin: 0 0 .25rem; }\n"
        . "  h2 { font-size: 1.05rem; margin: 2.25rem 0 .5rem; }\n"
        . "  p.lede { margin: 0 0 1.5rem; opacity: .8; }\n"
        . "  .bad { color: #b00020; font-weight: 700; }\n"
        . "  button { font: inherit; font-weight: 700; padding: .6rem 1.4rem;\n"
        . "           border-radius: 6px; cursor: pointer; }\n"
        . "  pre { background: rgba(128,128,128,.14); padding: .8rem; border-radius: 6px;\n"
        . "        overflow-x: auto; font-size: .9rem; white-space: pre-wrap; }\n"
        . "  code { background: rgba(128,128,128,.14); padding: .1rem .3rem;\n"
        . "         border-radius: 3px; }\n"
        . "  p.note { opacity: .75; font-size: .9rem; }\n"
        . "</style>\n</head>\n<body>\n";
    echo "<h1>annotepage</h1>\n";
}

/** Everything that reaches the page goes through this. No exception. */
function ap_b_h($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function ap_b_foot()
{
    echo "</body>\n</html>\n";
}

// --- 8. Dispatch ------------------------------------------------------------

$here = __DIR__;
$flow = ap_b_flow($here);
$method = isset($_SERVER['REQUEST_METHOD'])
    ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';

// THE RELEASE IS ALREADY HERE. Reopening this page after a download, pressing
// the form's button, pressing the delete button: all of them land here, and
// all of them are the ordinary installation. This file has nothing left to
// say.
if ($flow !== null) {
    require $flow;
    ap_i_run(array(
        'here'         => $here,
        'self'         => __FILE__,
        'outbound_url' => AP_B_SOURCE,
        'report'       => array(array('Release', 'already downloaded',
            'The files are in this directory and each one was checked against the '
            . 'published MANIFEST when it arrived. `sha256sum -c MANIFEST` in here '
            . 'says the same thing again, with nothing of ours involved.')),
    ));
    exit;
}

// A cross-site POST could otherwise make this host download and install a
// server nobody on it asked for. Browsers send Origin on a cross-site form
// submission; a mismatch is refused. Its ABSENCE is not: a missing Origin
// means a client that is not a browser, and this check is aimed at the browser
// somebody else's page is driving. install-flow.php does the same, for the
// same reason, on the form it owns.
if ($method === 'POST' && isset($_SERVER['HTTP_ORIGIN'])) {
    $sent = parse_url((string) $_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
    $mine = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : '';
    $mine = parse_url('http://' . $mine, PHP_URL_HOST);
    if ($sent === null || strcasecmp((string) $sent, (string) $mine) !== 0) {
        http_response_code(403);
        ap_b_head('annotepage -- install');
        echo '<p class="bad">This form was submitted from another site, so nothing '
            . 'was done. Open this file directly and press the button there.</p>' . "\n";
        ap_b_foot();
        exit;
    }
}

// THE DOWNLOAD. On POST only: a GET must not write fifteen files because a
// crawler, a link checker or a browser's prefetch touched the URL.
if ($method === 'POST') {
    $result = ap_b_install($here);

    if ($result['ok']) {
        $flow = ap_b_flow($here);
    }
    if ($result['ok'] && $flow !== null) {
        require $flow;
        // METHOD 'GET': the POST that just happened was "download it", and what
        // follows a download is the form -- not an installation nobody filled in.
        ap_i_run(array(
            'here'         => $here,
            'self'         => __FILE__,
            'method'       => 'GET',
            'outbound_url' => AP_B_SOURCE,
            'lede'         => 'The server is downloaded. Two questions, and both have '
                              . 'a default that works.',
            'report'       => array(
                array('Release', $result['version'],
                    'Downloaded from ' . AP_B_SOURCE . ' over HTTPS with certificate '
                    . 'verification on.'),
                array('Files', $result['files'] . ' verified',
                    'Every file the release\'s MANIFEST names, each one hashed after it '
                    . 'landed on disk and compared with the published SHA-256 before '
                    . 'being put in place. One mismatch would have abandoned all of it.'),
            ),
        ));
        exit;
    }

    // It did not work, and nothing is on disk. Say what happened, in the words
    // the run itself used.
    http_response_code(500);
    ap_b_head('annotepage -- install');
    echo '<p class="lede">The server was not installed.</p>' . "\n";
    if ($result['ok']) {
        echo '<p class="bad">The files were downloaded, but '
            . '<code>install-flow.php</code> is not among what this release '
            . "names. Nothing can continue from here.</p>\n";
    }
    echo "<h2>What happened</h2>\n";
    echo '<pre>' . ap_b_h(implode("\n", $result['lines'])) . "</pre>\n";
    if ($result['fallback']) {
        echo "<h2>The route that works here</h2>\n";
        echo '<p>' . ap_b_h(ap_b_fallback_sentence()) . "</p>\n";
    } else {
        echo "<h2>What to do</h2>\n";
        echo '<p>Nothing was written, so reloading this page and pressing the button '
            . 'again costs nothing and is the right first move &mdash; a source that '
            . "answered badly once often answers correctly a minute later.</p>\n";
        echo '<p class="note">' . ap_b_h(ap_b_fallback_sentence()) . "</p>\n";
    }
    ap_b_foot();
    exit;
}

// THE FIRST SCREEN. One button, and everything a person needs to press it is
// on it. Whoever reads nothing gets a correct installation.
$transport = ap_b_transport();

ap_b_head('annotepage -- install');

if ($transport === null) {
    // The prerequisite this host does not meet, said here, at the moment it
    // matters, rather than in a document nobody opened.
    echo '<p class="lede">This installer cannot work on this host.</p>' . "\n";
    echo '<p class="bad">' . ap_b_h(ap_b_no_transport_sentence()) . "</p>\n";
    echo "<h2>The route that works here</h2>\n";
    echo '<p>' . ap_b_h(ap_b_fallback_sentence()) . "</p>\n";
    echo '<p class="note">Everything else about that installation is identical: the '
        . 'same files, the same one-page form, the same proof that the data file '
        . "cannot be downloaded. Only the copying is done by you.</p>\n";
    ap_b_foot();
    exit;
}

echo '<p class="lede">One file, and it fetches the rest. Press the button.</p>' . "\n";
echo '<form method="post"><button type="submit" name="fetch" value="1">'
    . "Download the server and continue</button></form>\n";

echo "<h2>What that does</h2>\n";
echo '<p>It downloads the release from ' . '<code>' . ap_b_h(AP_B_SOURCE) . '</code> '
    . 'over HTTPS with certificate verification on, and installs it <strong>into this '
    . 'directory</strong>:</p>' . "\n";
echo '<pre>' . ap_b_h($here) . "</pre>\n";
echo '<p>Every file is checked against the release\'s own <code>MANIFEST</code> '
    . '&mdash; one SHA-256 per file &mdash; after it has landed on disk and before it '
    . 'is put in place. One mismatch abandons the whole thing and leaves this '
    . 'directory exactly as it is now. There is no archive to extract, which is '
    . 'deliberate: shared hosting often has neither the zip nor the phar '
    . "extension.</p>\n";
echo '<p>Then the ordinary installation opens: what this PHP offers, one form with '
    . 'two questions, the data file placed where the web server refuses to serve it '
    . '&mdash; proven by requesting it &mdash; the configuration written, and the '
    . "offer to delete this file.</p>\n";
echo '<p class="note">Way out to HTTPS: ' . ap_b_h($transport === 'curl'
        ? 'curl' : 'allow_url_fopen + openssl')
    . '. Nothing has been downloaded and nothing has been written yet.</p>' . "\n";

ap_b_foot();
