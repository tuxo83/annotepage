<?php
/**
 * update.php -- FETCHING A NEW VERSION OF THIS SERVER, AND PUTTING IT IN PLACE.
 *
 * WHAT TURNING THIS ON COSTS, said here because this is where it is
 * implemented. For a server to rewrite its own code, the directory holding
 * that code must be WRITABLE BY THE USER PHP RUNS AS. From that moment, any
 * bug anywhere on that account that can write a file -- in this code, in a
 * neighbouring application, in a plugin nobody remembers installing -- stops
 * being a defacement and becomes permanent code execution. That was
 * WordPress's largest attack surface for a decade, and it has nothing to do
 * with where the update comes from. It is off by default and it stays off
 * until somebody writes the key. See `auto_update` in config.php.
 *
 * WHAT IS TRUSTED, AND WHAT IS NOT. The trust anchor is GitHub over HTTPS with
 * certificate verification ON. An attacker who hijacks this server's DNS still
 * cannot present a valid certificate for the update host, so a DNS compromise
 * alone does not reach the update. Any code path that would disable peer
 * verification is the bug, not the workaround, and there is none in this file.
 * What is left is a GitHub account compromise, which two-factor authentication
 * answers, and it is written down rather than hidden.
 *
 * NO ARCHIVE. There is nothing to extract, and that is deliberate: shared PHP
 * hosting commonly ships without the zip and phar extensions, so a release
 * shipped as an archive would be unopenable on exactly the machines this
 * feature exists for. The release is a MANIFEST -- one SHA-256 per shipped
 * file -- and the per-file hash IS the integrity check. Each file is verified
 * AFTER it has landed on disk, by rereading it, so a truncated write and a
 * swapped file fail the same way.
 *
 * THE ORDER MATTERS, and it is the order of this file:
 *
 *   1. compare the running version with the published one. If they match,
 *      stop. Most runs must do nothing and say so;
 *   2. fetch the manifest, over HTTPS, verified;
 *   3. refuse early if the directory is not writable. That is the NORMAL case
 *      on a correctly hardened host, and it is not an error;
 *   4. download only the files whose hash differs, into a staging directory,
 *      under a name PHP will not execute (`.part`);
 *   5. verify every staged file. One mismatch aborts the whole update and
 *      NOTHING is changed -- there is no partial application;
 *   6. move the current files aside into a dated directory, then move the
 *      staged ones in. A failed upgrade is undone by putting that directory
 *      back, not by re-uploading from a hotel wifi.
 *
 * TWO FILES ARE NEVER TOUCHED:
 *   - `config-local.php`, which holds the declared projects, the origins and
 *     the paths to the credentials. It is not in the manifest, so this code
 *     cannot even name it, and it is refused a second time below;
 *   - `store.php` WHEN IT DIFFERS from the one we shipped. INSTALL.md tells
 *     people they may replace it; an update that silently restored ours would
 *     take their database with it.
 *
 * TWO WAYS IN, one code:
 *   - from the command line, `php internal/update.php`, by hand or from cron.
 *     Typing that command is itself the consent, so it runs whatever
 *     `auto_update` says;
 *   - from a web request, opportunistically, and ONLY if `auto_update` is on
 *     AND the response can be handed to the visitor first. See
 *     ap_update_schedule() at the bottom for why that second condition is not
 *     negotiable.
 */

if (!defined('AP_INTERNAL')) {
    // THE COMMAND-LINE ENTRY POINT. Over the web, an internal file called
    // directly answers 404 like every other one; from a shell there is no
    // api.php in front, so this file bootstraps what it needs itself.
    if (PHP_SAPI !== 'cli') {
        http_response_code(404);
        exit;
    }
    define('AP_INTERNAL', 1);
    define('AP_UPDATE_CLI', 1);
    require __DIR__ . '/errors.php';
    require __DIR__ . '/config.php';
}

/**
 * BUDGETS. Every one of them exists so that a request cannot hang and a
 * hostile or broken source cannot fill the disk. They are constants and not
 * configuration: an operator who needs to raise them is an operator who is
 * being lied to by the other end.
 */
if (!defined('AP_UPDATE_INTERVAL')) {
    // At most one check per day. The published version changes a few times a
    // year; asking more often costs a request per visit and answers nothing.
    define('AP_UPDATE_INTERVAL', 86400);
}
/** Per-request network timeouts, in seconds: connect, then total. */
define('AP_UPDATE_CONNECT_TIMEOUT', 5);
define('AP_UPDATE_TIMEOUT', 15);
/** Whole-run wall clock. Beyond it the run stops, having changed nothing. */
define('AP_UPDATE_BUDGET', 90);
/** Download budget. A release of this server is a dozen files under 200 KiB. */
define('AP_UPDATE_MAX_FILES', 64);
define('AP_UPDATE_MAX_FILE_BYTES', 524288);
define('AP_UPDATE_MAX_TOTAL_BYTES', 2097152);
/** The manifest and the VERSION file, whose sizes are known within an order. */
define('AP_UPDATE_MAX_MANIFEST_BYTES', 65536);
define('AP_UPDATE_MAX_VERSION_BYTES', 64);
/** The diagnostic's probe is shorter still: somebody is waiting for the page. */
define('AP_UPDATE_PROBE_TIMEOUT', 5);

/** The served directory -- this file lives one level down, in internal/. */
function ap_update_root()
{
    return dirname(__DIR__);
}

/** Where staging, backups and the state file live. */
function ap_update_workdir()
{
    return ap_update_root() . '/.update';
}

/**
 * The base URL the release is fetched from, or null with a reason.
 *
 * HTTPS ONLY, and there is no flag to relax it. A plain-HTTP source would put
 * the whole feature back in reach of whoever sits on the wire, which is the
 * one thing the design buys.
 *
 * @param string|null $error filled in with a readable reason on refusal
 * @return string|null base URL, ending with a slash
 */
function ap_update_source(array $config, &$error = null)
{
    $error = null;
    $url = isset($config['update_source']) ? $config['update_source'] : '';
    if (!is_string($url) || $url === '') {
        $error = 'no update source is configured (`update_source` in config.php).';
        return null;
    }
    if (strtolower(substr($url, 0, 8)) !== 'https://') {
        $error = 'the update source must begin with https:// -- it is `'
            . substr(preg_replace('/[^\x20-\x7E]/', '', $url), 0, 60) . '`.';
        return null;
    }
    if (strpos($url, '..') !== false) {
        $error = 'the update source contains `..`, which it must not.';
        return null;
    }
    return rtrim($url, '/') . '/';
}

/** The version currently installed. */
function ap_update_installed_version()
{
    // Over the web, api.php has already defined this and it is the one that
    // answers to clients: two readers of one file would eventually disagree.
    // The fallback is for the standalone command-line run, where api.php is
    // not in the picture at all.
    if (function_exists('ap_version')) {
        return ap_version();
    }
    $path = ap_update_root() . '/VERSION';
    if (is_readable($path)) {
        $read = trim((string) file_get_contents($path));
        if (preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $read)) {
            return $read;
        }
    }
    return 'unknown';
}

// --- Transport ------------------------------------------------------------

/**
 * Which way out this host offers, or null.
 *
 * Shared hosting commonly ships without curl AND with `allow_url_fopen` off.
 * That host cannot use this feature at all, and it must be told so in one
 * sentence rather than discovering it as a blank page.
 */
function ap_update_transport()
{
    if (function_exists('curl_init') && function_exists('curl_exec')) {
        return 'curl';
    }
    if (ini_get('allow_url_fopen') && extension_loaded('openssl')) {
        return 'stream';
    }
    return null;
}

/** The sentence to show when there is no way out. Written once, said twice. */
function ap_update_no_transport_sentence()
{
    return 'This host has neither the curl extension nor `allow_url_fopen` with '
        . 'openssl, so it cannot make an outbound HTTPS request at all: updating '
        . 'from here is impossible, and the files must be copied over by hand.';
}

/**
 * Fetches one URL over HTTPS, with certificate verification ON.
 *
 * @param int $maxBytes hard ceiling; a longer body is a failure, not a
 *                      truncation. Truncating would hand the caller something
 *                      that hashes wrong for a reason nobody could see.
 * @return array array('ok' => bool, 'body' => string, 'error' => string)
 */
function ap_update_fetch($url, $maxBytes, $timeout = AP_UPDATE_TIMEOUT)
{
    $fail = function ($message) {
        return array('ok' => false, 'body' => '', 'error' => $message);
    };
    $transport = ap_update_transport();

    if ($transport === 'curl') {
        $handle = curl_init();
        $body = '';
        $over = false;
        curl_setopt_array($handle, array(
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => false,
            // VERIFICATION ON, both of them. VERIFYPEER checks the chain,
            // VERIFYHOST => 2 checks that the name in the certificate is the
            // host we asked for. Turning either off is the bug.
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            // Redirects are NOT followed. A followed redirect is a second URL
            // nobody vetted, and the classic way back down to plain HTTP.
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => AP_UPDATE_CONNECT_TIMEOUT,
            CURLOPT_TIMEOUT        => (int) $timeout,
            CURLOPT_USERAGENT      => 'annotepage-update/' . ap_update_installed_version(),
            // Belt and braces: even with redirects off, no other scheme is
            // acceptable on this handle.
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
            CURLOPT_WRITEFUNCTION  => function ($ignored, $chunk) use (&$body, &$over, $maxBytes) {
                $body .= $chunk;
                if (strlen($body) > $maxBytes) {
                    $over = true;
                    return 0; // aborts the transfer
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
            return $fail('the server answered HTTP ' . $status . '.');
        }
        return array('ok' => true, 'body' => $body, 'error' => '');
    }

    if ($transport === 'stream') {
        $context = stream_context_create(array(
            'http' => array(
                'method'          => 'GET',
                'timeout'         => (int) $timeout,
                'follow_location' => 0,
                'user_agent'      => 'annotepage-update/' . ap_update_installed_version(),
                // We want to READ a 404 rather than have fopen fail namelessly.
                'ignore_errors'   => true,
            ),
            'ssl' => array(
                // The three of them together. verify_peer alone still accepts
                // a valid certificate issued for another name.
                'verify_peer'       => true,
                'verify_peer_name'  => true,
                'allow_self_signed' => false,
            ),
        ));
        // The warnings are COLLECTED, not swallowed. A failed TLS handshake
        // emits three of them and only the FIRST says why -- "certificate
        // verify failed". error_get_last() returns the last, which is the
        // useless one ("failed to open stream"), and that is exactly the
        // message an operator would have had to guess from.
        $warnings = array();
        set_error_handler(function ($number, $message) use (&$warnings) {
            $warnings[] = $message;
            return true;
        });
        $stream = fopen($url, 'rb', false, $context);
        restore_error_handler();
        if ($stream === false) {
            $why = $warnings ? implode(' / ', $warnings) : 'no reason given';
            return $fail('HTTPS request refused: ' . ap_truncate($why) . '.');
        }
        // $http_response_header is set by the wrapper in the local scope.
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
            return $fail('the server answered HTTP ' . $status . '.');
        }
        return array('ok' => true, 'body' => $body, 'error' => '');
    }

    return $fail(ap_update_no_transport_sentence());
}

// --- The manifest ---------------------------------------------------------

/**
 * Parses a MANIFEST into array(path => sha256), or null with a reason.
 *
 * STRICT ON PURPOSE. This text decides which files get written on this server;
 * anything not exactly in shape is refused rather than skipped, because a
 * skipped line is a file that silently keeps its old content.
 */
function ap_update_parse_manifest($text, &$error = null)
{
    $error = null;
    $files = array();
    $lines = explode("\n", str_replace("\r\n", "\n", (string) $text));
    foreach ($lines as $number => $line) {
        if ($line === '') {
            continue;
        }
        if (!preg_match('/^([0-9a-f]{64})  ([A-Za-z0-9._\/-]{1,120})$/', $line, $m)) {
            $error = 'line ' . ($number + 1) . ' of the manifest is not in shape.';
            return null;
        }
        $path = $m[2];
        // A path that climbs, starts at the root, or doubles a slash would be
        // resolved by the filesystem into somewhere nobody agreed to.
        if (strpos($path, '..') !== false || $path[0] === '/' || strpos($path, '//') !== false) {
            $error = 'the manifest names an unacceptable path: ' . $path;
            return null;
        }
        // Refused a second time, here, even though the generator never lists
        // it: this is the file that holds the credentials' whereabouts, and
        // one refusal in the tool that writes is not the same as one in the
        // tool that reads.
        if (basename($path) === 'config-local.php' || $path === 'MANIFEST') {
            $error = 'the manifest names a file that is never shipped: ' . $path;
            return null;
        }
        if (isset($files[$path])) {
            $error = 'the manifest lists ' . $path . ' twice.';
            return null;
        }
        $files[$path] = $m[1];
    }
    if (!$files) {
        $error = 'the manifest is empty.';
        return null;
    }
    return $files;
}

/** The manifest shipped with the running version, or null if there is none. */
function ap_update_local_manifest()
{
    $path = ap_update_root() . '/MANIFEST';
    if (!is_readable($path)) {
        return null;
    }
    $files = ap_update_parse_manifest((string) file_get_contents($path));
    return $files;
}

// --- State ----------------------------------------------------------------

function ap_update_state_path()
{
    return ap_update_workdir() . '/state.json';
}

/** What the last check found. Never fails: a missing state is a first run. */
function ap_update_state()
{
    $path = ap_update_state_path();
    if (!is_readable($path)) {
        return array();
    }
    $decoded = json_decode((string) @file_get_contents($path), true);
    return is_array($decoded) ? $decoded : array();
}

/** Records what happened. Best effort: housekeeping never breaks a response. */
function ap_update_save_state(array $state)
{
    if (!ap_update_ensure_workdir($why)) {
        return false;
    }
    $body = json_encode($state);
    if ($body === false) {
        return false;
    }
    return @file_put_contents(ap_update_state_path(), $body . "\n", LOCK_EX) !== false;
}

/**
 * Is a check due?
 *
 * ON EVERY WRITE, not one in fifty. The retention sweep and the counter
 * cleanup roll a die because their work is cheap, idempotent and wanted often;
 * here the gate is a DATE, and a die roll on top of it would mean a server
 * with forty writes a day never checks at all.
 */
function ap_update_due()
{
    $state = ap_update_state();
    $last = isset($state['last_check']) ? (int) $state['last_check'] : 0;
    return (time() - $last) >= AP_UPDATE_INTERVAL;
}

// --- The working directory ------------------------------------------------

/**
 * Creates .update/ if it is missing, with the two protections that matter.
 *
 * @param string|null $error filled in with a readable reason on failure
 */
function ap_update_ensure_workdir(&$error = null)
{
    $error = null;
    $dir = ap_update_workdir();
    if (is_dir($dir)) {
        return true;
    }
    $root = ap_update_root();
    if (!is_writable($root)) {
        $error = 'the directory ' . $root . ' is not writable by the user PHP runs as.';
        return false;
    }
    if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
        $error = 'could not create ' . $dir . '.';
        return false;
    }
    // FIRST protection, and the one that does not depend on the server's
    // configuration: staged files are written with a `.part` suffix, so the
    // PHP handler does not run them even if this .htaccess is ignored --
    // whether it is taken into account depends on AllowOverride, which is
    // never known from here.
    @file_put_contents($dir . '/.htaccess',
        "# annotepage's update staging. Nothing in here is meant to be reachable.\n"
        . "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
        . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    return true;
}

/** Removes a directory and what is under it. Used only on our own staging. */
function ap_update_remove_tree($dir)
{
    if (!is_dir($dir)) {
        return;
    }
    $entries = @scandir($dir);
    if ($entries === false) {
        return;
    }
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $full = $dir . '/' . $entry;
        if (is_dir($full) && !is_link($full)) {
            ap_update_remove_tree($full);
        } else {
            @unlink($full);
        }
    }
    @rmdir($dir);
}

// --- The run --------------------------------------------------------------

/**
 * Does the whole thing, and returns what it did.
 *
 * NEVER THROWS. It is called after the response has been handed to the
 * visitor, where an exception has nowhere to go, and from a command line where
 * a stack trace is worse than a sentence.
 *
 * @return array array('ok' => bool, 'changed' => bool, 'published' => string|null,
 *                     'summary' => string, 'lines' => array of strings)
 *
 * `ok` false means something went WRONG. A read-only code directory is `ok`
 * true: it is the state a well-run host is in, and a cron line that mailed an
 * error every night for it would train its reader to ignore the mail.
 */
function ap_update_run(array $config)
{
    $lines = array();
    $started = time();
    $say = function ($line) use (&$lines) {
        $lines[] = $line;
    };
    $stop = function ($summary, $ok = false) use (&$lines, $say) {
        $say($summary);
        return array('ok' => $ok, 'changed' => false, 'published' => null,
                     'summary' => $summary, 'lines' => $lines);
    };

    $installed = ap_update_installed_version();
    $say('running version: ' . $installed);

    $source = ap_update_source($config, $sourceError);
    if ($source === null) {
        return $stop('refused: ' . $sourceError);
    }
    $say('source: ' . $source);

    if (ap_update_transport() === null) {
        return $stop('impossible here: ' . ap_update_no_transport_sentence());
    }

    // --- 1. Versions. Most runs end here, and that is the point.
    $answer = ap_update_fetch($source . 'VERSION', AP_UPDATE_MAX_VERSION_BYTES);
    if (!$answer['ok']) {
        return $stop('could not read the published version: ' . $answer['error']);
    }
    $published = trim($answer['body']);
    if (!preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $published)) {
        return $stop('the published version is not in shape; nothing was done.');
    }
    $say('published version: ' . $published);
    if ($published === $installed) {
        $result = $stop('already up to date: nothing to do.', true);
        $result['published'] = $published;
        return $result;
    }

    // --- 2. The manifest, over the same verified channel.
    $answer = ap_update_fetch($source . 'MANIFEST', AP_UPDATE_MAX_MANIFEST_BYTES);
    if (!$answer['ok']) {
        return $stop('could not read the published manifest: ' . $answer['error']);
    }
    $manifestText = $answer['body'];
    $remote = ap_update_parse_manifest($manifestText, $manifestError);
    if ($remote === null) {
        return $stop('the published manifest was refused: ' . $manifestError);
    }
    if (count($remote) > AP_UPDATE_MAX_FILES) {
        return $stop('the published manifest lists ' . count($remote)
            . ' files; the ceiling is ' . AP_UPDATE_MAX_FILES . '. Nothing was done.');
    }

    $root = ap_update_root();
    $local = ap_update_local_manifest();

    // --- 3. What has to change, and what must not be touched.
    $wanted = array();
    $kept = array();
    foreach ($remote as $path => $hash) {
        $target = $root . '/' . $path;
        $current = is_readable($target) ? hash_file('sha256', $target) : null;
        if ($current === $hash) {
            continue;
        }
        if ($path === 'internal/store.php') {
            // INSTALL.md says the store may be replaced. If the one on disk is
            // not the one we shipped, it is somebody's, and restoring ours
            // would take their database with it. When there is no local
            // manifest we cannot tell -- and then we also do not touch it,
            // because the wrong guess here is unrecoverable.
            if ($local === null || !isset($local[$path])) {
                $kept[] = $path . ' (kept: no local manifest, so we cannot tell '
                    . 'ours from a replacement)';
                continue;
            }
            if ($current !== null && $current !== $local[$path]) {
                $kept[] = $path . ' (kept: it differs from the one we shipped, '
                    . 'so it was replaced on purpose)';
                continue;
            }
        }
        // Any other file that was edited locally IS replaced -- it is ours --
        // but it is said out loud, and the old bytes go into the backup
        // directory like every other one, so nothing is lost.
        if ($current !== null && $local !== null && isset($local[$path])
            && $current !== $local[$path]) {
            $say('note: ' . $path . ' had been edited here; the old file is kept in the backup.');
        }
        $wanted[$path] = $hash;
    }
    foreach ($kept as $line) {
        $say($line);
    }
    // Files we no longer ship are LEFT ALONE. Deleting on the word of a
    // downloaded list is a far bigger power than replacing, and everything
    // under internal/ refuses to run without the constant api.php sets.
    if ($local !== null) {
        foreach ($local as $path => $ignored) {
            if (!isset($remote[$path])) {
                $say('note: ' . $path . ' is no longer part of the release; it is left in place.');
            }
        }
    }

    if (!$wanted) {
        $result = $stop('version ' . $published . ' published, but every file already '
            . 'matches it. Only the manifest is refreshed.', true);
        $result['published'] = $published;
        // The manifest still has to land, otherwise the next run reasons from
        // a stale one -- which is what decides whether store.php is ours.
        if (is_writable($root) || is_writable($root . '/MANIFEST')) {
            @file_put_contents($root . '/MANIFEST', $manifestText);
        }
        return $result;
    }
    $say('to update: ' . implode(', ', array_keys($wanted)));

    // --- 4. Writability, BEFORE the first byte is downloaded. On a correctly
    // hardened host this is where it stops, and that is not an error.
    $unwritable = array();
    foreach (array_keys($wanted) as $path) {
        $directory = dirname($root . '/' . $path);
        if (!is_dir($directory) || !is_writable($directory)) {
            $unwritable[] = $directory;
        }
    }
    if (!is_writable($root)) {
        $unwritable[] = $root;
    }
    $unwritable = array_values(array_unique($unwritable));
    if ($unwritable) {
        $result = $stop('version ' . $published . ' is published, and this installation '
            . 'runs ' . $installed . ", but it cannot update itself: the code directory is "
            . "not writable by the user PHP runs as.\n"
            . "  not writable: " . implode(', ', $unwritable) . "\n"
            . "This is the SAFE state, not a fault. To update, copy webroot/ over the top "
            . "by hand, or grant write permission knowing what that costs "
            . "(see `auto_update` in internal/config.php).", true);
        $result['published'] = $published;
        return $result;
    }

    if (!ap_update_ensure_workdir($workdirError)) {
        $result = $stop('cannot prepare the staging directory: ' . $workdirError);
        $result['published'] = $published;
        return $result;
    }

    // --- 5. Download into staging, then VERIFY WHAT LANDED ON DISK.
    $staging = ap_update_workdir() . '/staging';
    ap_update_remove_tree($staging);
    if (!@mkdir($staging, 0755, true) && !is_dir($staging)) {
        $result = $stop('cannot create ' . $staging . '.');
        $result['published'] = $published;
        return $result;
    }

    $total = 0;
    $staged = array();
    $abort = null;
    foreach ($wanted as $path => $hash) {
        if ((time() - $started) > AP_UPDATE_BUDGET) {
            $abort = 'the run went past its ' . AP_UPDATE_BUDGET . ' second budget.';
            break;
        }
        $answer = ap_update_fetch($source . $path, AP_UPDATE_MAX_FILE_BYTES);
        if (!$answer['ok']) {
            $abort = 'could not download ' . $path . ': ' . $answer['error'];
            break;
        }
        $total += strlen($answer['body']);
        if ($total > AP_UPDATE_MAX_TOTAL_BYTES) {
            $abort = 'the release is larger than the ' . AP_UPDATE_MAX_TOTAL_BYTES
                . ' byte budget.';
            break;
        }
        // `.part`: a downloaded, NOT YET VERIFIED file must not be something
        // the PHP handler would run if anybody managed to reach it.
        $temporary = $staging . '/' . str_replace('/', '__', $path) . '.part';
        if (@file_put_contents($temporary, $answer['body']) === false) {
            $abort = 'could not write ' . $temporary . '.';
            break;
        }
        // Reread from disk rather than hash the string we hold: that is what
        // catches a short write and a full disk, which hashing the buffer
        // would sail straight past.
        $landed = hash_file('sha256', $temporary);
        if ($landed !== $hash) {
            $abort = 'CHECKSUM MISMATCH on ' . $path . "\n"
                . '  manifest says ' . $hash . "\n"
                . '  file on disk  ' . $landed . "\n"
                . 'The update is abandoned and NOTHING was changed.';
            break;
        }
        $staged[$path] = $temporary;
        $say('verified: ' . $path . ' (' . strlen($answer['body']) . ' bytes)');
    }

    if ($abort !== null) {
        ap_update_remove_tree($staging);
        $result = $stop('aborted: ' . $abort);
        $result['published'] = $published;
        return $result;
    }

    // --- 6. The swap. Aside first, in first afterwards, one file at a time,
    // and a rollback if any single move fails.
    $backupName = 'previous-' . preg_replace('/[^0-9A-Za-z.+-]/', '', $installed)
        . '-' . gmdate('Ymd-His');
    $backup = ap_update_workdir() . '/' . $backupName;
    if (!@mkdir($backup, 0755, true) && !is_dir($backup)) {
        ap_update_remove_tree($staging);
        $result = $stop('cannot create the backup directory .update/' . $backupName
            . '. Nothing was changed.');
        $result['published'] = $published;
        return $result;
    }

    $movedAside = array();   // path => backup file
    $installedFiles = array();
    $swapError = null;
    foreach ($staged as $path => $temporary) {
        $target = $root . '/' . $path;
        $aside = $backup . '/' . str_replace('/', '__', $path);
        if (is_file($target)) {
            if (!@rename($target, $aside)) {
                $swapError = 'could not move ' . $path . ' aside.';
                break;
            }
            $movedAside[$path] = $aside;
        }
        if (!@rename($temporary, $target)) {
            $swapError = 'could not put the new ' . $path . ' in place.';
            break;
        }
        @chmod($target, 0644);
        $installedFiles[] = $path;
    }

    if ($swapError !== null) {
        // Undo, in the opposite order: take the new files back out, put the
        // old ones back. A half-swapped installation is the one outcome this
        // whole file exists to avoid.
        foreach ($installedFiles as $path) {
            @unlink($root . '/' . $path);
        }
        foreach ($movedAside as $path => $aside) {
            @rename($aside, $root . '/' . $path);
        }
        ap_update_remove_tree($staging);
        $result = $stop('the swap failed and was undone: ' . $swapError
            . "\nThe installation is as it was, on version " . $installed . '.');
        $result['published'] = $published;
        return $result;
    }

    // The manifest LAST, and only once the files it describes are in place.
    // Written the other way round, a crash between the two would leave a
    // manifest describing files that are not there.
    if (is_file($root . '/MANIFEST')) {
        @rename($root . '/MANIFEST', $backup . '/MANIFEST');
    }
    if (@file_put_contents($root . '/MANIFEST', $manifestText) === false) {
        $say('WARNING: the new files are in place but MANIFEST could not be written. '
            . 'Copy it over by hand: the next run reads it to tell our store.php from a '
            . 'replaced one.');
    }
    ap_update_remove_tree($staging);

    // The backup is named RELATIVE to the served directory. This line is
    // recorded in .update/state.json and shown by the diagnostic; an absolute
    // path there would publish where this installation sits on disk, for no
    // gain to whoever has to go and move the files back.
    $summary = 'updated ' . $installed . ' -> ' . $published . ', '
        . count($installedFiles) . ' file(s) replaced. Previous version kept in '
        . '.update/' . $backupName . ' -- to undo, move those files back.';
    $say($summary);
    return array('ok' => true, 'changed' => true, 'published' => $published,
                 'summary' => $summary, 'lines' => $lines);
}

// --- Triggering it from a web request -------------------------------------

/**
 * Hands the response to the visitor and returns whether that really happened.
 *
 * THIS IS THE CONDITION THE WHOLE WEB PATH RESTS ON. A visitor who wrote a
 * note must never wait on a fetch to GitHub -- not for the download, and not
 * for the version check either, which is a network round trip like any other.
 * Two interfaces can guarantee it, php-fpm and LiteSpeed, and on anything else
 * we do not guarantee it and therefore do not do it. Flushing with a
 * Content-Length was considered and refused: compression or a proxy in front
 * makes it silently stop working, and a guarantee that fails silently is not
 * one.
 */
function ap_update_release_visitor()
{
    if (PHP_SAPI === 'cli') {
        return true;   // nobody is waiting on a socket
    }
    if (function_exists('fastcgi_finish_request')) {
        @fastcgi_finish_request();
        return true;
    }
    if (function_exists('litespeed_finish_request')) {
        @litespeed_finish_request();
        return true;
    }
    return false;
}

/**
 * Called from api.php on WRITES only, next to the retention sweep.
 *
 * Off by default, at most one check per day, nothing on a read, and not one
 * byte leaves this machine while `auto_update` is false -- the key is read
 * before the state file is even looked at.
 */
function ap_update_schedule(array $config)
{
    if (empty($config['auto_update'])) {
        return;
    }
    // The daily gate is a FILE. If we cannot write it, the gate cannot hold,
    // and the failure mode is not "no update" but a fetch to GitHub on EVERY
    // write, for an update that could never be applied anyway -- the code
    // directory is what is not writable. Decline instead, and let
    // ?action=diagnostic say so: it reports auto_update ON against
    // code_writable no, which is the whole diagnosis in two lines.
    if (!is_writable(ap_update_root())) {
        return;
    }
    if (!ap_update_due()) {
        return;
    }
    // Registered rather than run: everything below happens AFTER api.php has
    // finished its response.
    register_shutdown_function('ap_update_deferred', $config);
}

/** The deferred half. Runs once the visitor has their answer. */
function ap_update_deferred(array $config)
{
    // The day's slot is claimed BEFORE any work, so that two simultaneous
    // writes do not both go and fetch, and so that a run which crashes does
    // not come straight back on the next request.
    if (!ap_update_save_state(array(
            'last_check' => time(),
            'when'       => gmdate('Y-m-d\TH:i:sP'),
            'result'     => 'started',
        ))) {
        // Same reasoning as the guard in ap_update_schedule: no record means
        // no gate, and no gate means one network fetch per write. Stop.
        ap_log('cannot record the update check; not attempting it');
        return;
    }

    if (!ap_update_release_visitor()) {
        ap_update_save_state(array(
            'last_check' => time(),
            'when'       => gmdate('Y-m-d\TH:i:sP'),
            'result'     => 'not attempted: this PHP interface (' . PHP_SAPI . ') cannot '
                . 'hand the response to the visitor before doing more work, and a visitor '
                . 'must not wait on a network fetch. Run `php internal/update.php` from '
                . 'cron instead.',
        ));
        return;
    }

    // The visitor is gone: their browser closing must not kill us halfway
    // through a swap.
    @ignore_user_abort(true);
    @set_time_limit(AP_UPDATE_BUDGET + 30);

    // ap_update_run does not throw, and this catches the day it does anyway.
    // We are past the response: an exception escaping here would land in the
    // handlers of errors.php, which would write a message into a connection
    // that is already closed -- a failure with no reader at all.
    try {
        $report = ap_update_run($config);
    } catch (Exception $e) {
        ap_log('update failed : ' . $e->getMessage());
        ap_update_save_state(array(
            'last_check' => time(),
            'when'       => gmdate('Y-m-d\TH:i:sP'),
            'result'     => 'failed with an unexpected error; see the PHP error log.',
        ));
        return;
    }
    ap_update_save_state(array(
        'last_check' => time(),
        'when'       => gmdate('Y-m-d\TH:i:sP'),
        'published'  => $report['published'],
        'changed'    => $report['changed'],
        'result'     => $report['summary'],
    ));
    if ($report['changed']) {
        ap_log('updated to ' . $report['published']);
    }
}

// --- The diagnostic -------------------------------------------------------

/**
 * Level 1: what every installation gets, including those that will never turn
 * the option on. Writes nothing, needs no permission on anything.
 *
 * It DOES make one outbound request, on purpose, because "is the published
 * version newer than mine" cannot be answered without one -- and that request
 * happens only when a human asks for ?action=diagnostic.
 *
 * @return array list of array(key, value), the shape ap_write_diagnostic wants
 */
function ap_update_diagnostic_lines(array $config)
{
    $lines = array();
    $add = function ($key, $value) use (&$lines) {
        $lines[] = array($key, $value);
    };

    $add('update.running_version', ap_update_installed_version());
    $add('update.auto_update', empty($config['auto_update'])
        ? 'off -- this server never rewrites itself from a web request'
        : 'ON -- this server may rewrite its own code from a web request. That '
          . 'needs the code directory writable by the PHP user (see '
          . 'update.code_writable below), which turns any file-writing bug on '
          . 'this account into permanent code execution.');

    $transport = ap_update_transport();
    $add('update.transport', $transport === null
        ? 'NONE -- ' . ap_update_no_transport_sentence()
        : ($transport === 'curl' ? 'curl' : 'allow_url_fopen + openssl'));

    $source = ap_update_source($config, $sourceError);
    $add('update.source', $source === null ? 'REFUSED -- ' . $sourceError : $source);

    $root = ap_update_root();
    $add('update.code_writable', is_writable($root)
        ? 'yes -- ' . $root . ' can be rewritten by the PHP user'
        : 'no -- ' . $root . ' is read-only to the PHP user (the safe state; an '
          . 'update must then be copied over by hand)');

    if ($transport === null || $source === null) {
        $add('update.https_outbound', 'NOT TESTED -- there is no way out to test with');
        $add('update.published_version', 'unknown');
        return array_merge($lines, ap_update_state_lines());
    }

    $answer = ap_update_fetch($source . 'VERSION', AP_UPDATE_MAX_VERSION_BYTES,
                              AP_UPDATE_PROBE_TIMEOUT);
    if (!$answer['ok']) {
        $add('update.https_outbound', 'NO -- ' . $answer['error']);
        $add('update.published_version', 'unknown');
        return array_merge($lines, ap_update_state_lines());
    }
    $published = trim($answer['body']);
    if (!preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $published)) {
        $add('update.https_outbound', 'yes -- but the answer was not a version number');
        $add('update.published_version', 'unknown');
        return array_merge($lines, ap_update_state_lines());
    }
    $add('update.https_outbound', 'yes -- certificate verified');
    $add('update.published_version', $published
        . ($published === ap_update_installed_version()
            ? ' -- this installation is up to date'
            : ' -- NEWER than what runs here'));

    return array_merge($lines, ap_update_state_lines());
}

/** What the last opportunistic check recorded, if there ever was one. */
function ap_update_state_lines()
{
    $state = ap_update_state();
    if (!$state) {
        return array(array('update.last_check', 'never'));
    }
    $lines = array(array('update.last_check',
        isset($state['when']) ? $state['when'] : 'unknown'));
    if (isset($state['result'])) {
        $lines[] = array('update.last_result', str_replace("\n", ' ', (string) $state['result']));
    }
    return $lines;
}

// --- The command line -----------------------------------------------------

if (defined('AP_UPDATE_CLI')) {
    // Typing this command IS the consent, so `auto_update` does not gate it:
    // it gates the WEB path, where nobody typed anything. A host that will
    // never make its code directory writable to the web server can still be
    // updated from a shell or from cron, which is the arrangement INSTALL.md
    // recommends.
    $config = ap_config();
    $report = ap_update_run($config);
    foreach ($report['lines'] as $line) {
        echo $line . "\n";
    }
    ap_update_save_state(array(
        'last_check' => time(),
        'when'       => gmdate('Y-m-d\TH:i:sP'),
        'published'  => $report['published'],
        'changed'    => $report['changed'],
        'result'     => $report['summary'],
    ));
    // 0 when there was nothing wrong -- including "already up to date" and
    // "not writable", which are both correct outcomes. A cron line that mailed
    // on those would teach its reader to ignore the mail.
    exit($report['ok'] ? 0 : 1);
}
