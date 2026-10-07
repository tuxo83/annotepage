<?php
/**
 * statistics.php -- THREE TOTALS, ONCE A DAY, TO ONE ADDRESS.
 *
 * WHAT IT IS FOR. Nobody can say how many servers run this tool, or how much
 * they carry: each one is installed from a file and never heard of again. The
 * only way to know is for each server to say so, and that is all this does.
 *
 * WHAT LEAVES THIS MACHINE, AND THE LIST IS CLOSED:
 *
 *   id         22 characters drawn at random on THIS server, the first time it
 *              has something to report. It is derived from nothing -- not the
 *              domain, not the database, not a project. Its one use is to let
 *              the receiver REPLACE yesterday's numbers instead of adding to
 *              them.
 *   version    the version of this server.
 *   projects   how many projects it has ever carried.
 *   notes      how many remarks it has ever carried, the expired ones included.
 *   pages      how many pages those were on.
 *
 * WHAT DOES NOT, EVER: a domain name, a project id, a page path, a line of a
 * note, a key, a name. No Referer and no Origin either -- this is a request a
 * server makes, and it has no page to speak for.
 *
 * WHAT THE RECEIVER LEARNS ANYWAY, because no request can avoid it: the
 * address this server calls from, and when. It is said here rather than
 * denied. The identifier is random; the connection is not anonymous.
 *
 * AND ONE OTHER REQUEST, ON A SERVER SOMEBODY CALLS BY THE RECEIVER'S NAME:
 * it asks that address, once per version, for a file it has just written
 * here, to find out whether it is the receiver (WHICH SERVER RECEIVES, lower
 * down). That request carries nothing but the file's random name.
 *
 * ON, UNLESS SOMEBODY SAYS NO. `report_statistics => false` in
 * internal/config-local.php, and nothing is sent, whoever asks and under
 * whatever name: no request is made of any kind, no identifier is drawn and
 * no table is made. The refusal is read before anything else is.
 *
 * AN INSTALLATION NOBODY HAS USED IS NOT COUNTED. With no remark ever written
 * there is nothing to report, nothing is sent and no identifier is drawn -- a
 * server stood up to try the installer is not a site somebody reviews.
 *
 * IT NEVER COSTS A NOTE, AND IT IS BOUNDED IN TIME. Nothing here throws. The
 * request has a deadline measured on the clock, on both transports -- the
 * stream wrapper's own timeout is per read, and a receiver answering one byte
 * a second would hold a connection for ever, so that wrapper is not used: the
 * socket is opened and read here, against a deadline. It is made after an
 * answer that was a success, and after that answer has LEFT wherever the
 * interface can let a visitor go first (php-fpm, LiteSpeed); elsewhere one
 * visitor a day waits for it, on the shorter deadline. The deadlines are
 * honest to about a second -- a connection and its handshake each get their
 * share, and a read ends on the second. What is NOT bounded, on either
 * transport, is the name lookup: the system resolver decides that.
 *
 * THE BOUNDS BELOW ARE AGAINST REQUESTS THAT COME ONE AFTER ANOTHER. "Once a
 * day", "one try an hour": each is a row read and then written, and two
 * requests arriving in the same instant can both read it before either
 * writes -- measured, two declarations a millisecond apart in three rounds of
 * forty. The receiver keeps one. Nothing here is a lock, and nothing here
 * needs to be: what a burst buys is a second identical request.
 *
 * THE DAY'S SLOT IS CLAIMED BEFORE ANYTHING IS COUNTED OR SENT, in the store.
 * A receiver that does not answer is asked again tomorrow and not on every
 * write; and a store that cannot record the slot costs each write a few small
 * statements that fail, in milliseconds and without a line in any log --
 * never the count, which walks the whole table.
 *
 * THE STORE MAY BE OLDER THAN THIS FILE -- the updater keeps a store it did
 * not ship (see maintenance.php). Every method it needs is asked for first,
 * and a store that lacks one simply does not report.
 *
 * AND ONE SERVER RECEIVES INSTEAD OF SENDING -- the one the address above
 * leads to. Nothing is configured for that: see WHICH SERVER RECEIVES, lower
 * down, for how a server finds out that it is the one, and why it cannot be
 * told so from outside.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

/**
 * Where the numbers go. A constant and not a default of config.php: nobody
 * installing this tool has a reason to choose it, and a field for it on the
 * installer would be a question with one right answer. `statistics_address`
 * in config-local.php overrides it, for a fork that runs its own receiver.
 */
define('AP_STATISTICS_ADDRESS', 'https://api.annotepage.com/stats.php');
/**
 * At most one report in this many seconds: twenty-three hours, for "once a
 * day". A full day would make a server on a daily cron line skip every other
 * day -- today's run comes a second earlier than yesterday's, finds the last
 * report 23 h 59 min 59 s old, and waits for tomorrow.
 */
define('AP_STATISTICS_EVERY', 82800);
/** The deadlines of the one request, in seconds on the clock. */
define('AP_STATISTICS_CONNECT_TIMEOUT', 3);
define('AP_STATISTICS_TIMEOUT', 5);
/** And when a visitor's connection could not be released first. */
define('AP_STATISTICS_TIMEOUT_WAITING', 2);
/** The name under which the store remembers what this file needs. */
define('AP_STATISTICS_MEMORY', 'statistics');
/** Seconds before a proof that got no answer is tried again. */
define('AP_STATISTICS_PROVE_EVERY', 3600);
/** And how many times, on one hint, before the hint is dropped. */
define('AP_STATISTICS_PROVE_TRIES', 3);
/**
 * THE DOOR: the whole of stats.php, on the one server that has it. A few
 * lines that hand over to internal/statistics-receiver.php, which is where
 * the receiving is written and which refuses by itself on a server that is
 * not the receiver. Written by ap_statistics_door(), never shipped.
 */
define('AP_STATISTICS_DOOR', "<?php\n"
    . "/* stats.php -- written by annotepage ON THE ONE SERVER THAT RECEIVES THE\n"
    . "   STATISTICS OF THE OTHERS, and on no other (internal/statistics.php says\n"
    . "   how a server finds out that it is that one). Not part of a release: the\n"
    . "   updater neither installs it nor removes it. Deleted, it comes back for\n"
    . "   as long as this server is still that one. */\n"
    . "if (!defined('PHP_VERSION_ID') || PHP_VERSION_ID < 70400\n"
    . "    || !is_file(__DIR__ . '/internal/statistics-receiver.php')) {\n"
    . "    header('HTTP/1.1 404 Not Found');\n"
    . "    exit;\n"
    . "}\n"
    . "define('AP_INTERNAL', 1);\n"
    . "require __DIR__ . '/internal/statistics-receiver.php';\n");

/* NOTHING HERE LEANS ON ANOTHER FILE OF internal/. maintenance.php can be run
   alone, by a crontab older than the daily update line, and it loads only the
   errors and the configuration: a helper borrowed from update.php would be
   missing there, the day's slot would be claimed, and that server would never
   report at all. So the three small things this needs are written here. */

/**
 * How an outbound request can be made on this host, or null.
 *
 * THE SAME TWO ANSWERS AS THE UPDATER, AND NO THIRD. A socket needs neither
 * curl nor `allow_url_fopen`, so this file could call out from a host on
 * which the installer and the diagnostic both say, truthfully of the updater,
 * that there is no way out -- measured: "no way out" on the screen, and a
 * declaration leaving. A host that turned `allow_url_fopen` off has said PHP
 * opens no address; that is honoured here, though nothing here uses fopen.
 */
function ap_statistics_transport()
{
    if (function_exists('curl_init') && function_exists('curl_exec')) {
        return 'curl';
    }
    if (ini_get('allow_url_fopen') && extension_loaded('openssl')
        && function_exists('stream_socket_client')) {
        return 'socket';
    }
    return null;
}

/** The version of this server, as its VERSION file says it. */
function ap_statistics_version()
{
    $path = dirname(__DIR__) . '/VERSION';
    $read = is_readable($path) ? trim((string) file_get_contents($path)) : '';
    return preg_match('/^[0-9A-Za-z.+-]{1,32}\z/', $read) ? $read : 'unknown';
}

/** Lets the visitor go before the request, where the interface can. */
function ap_statistics_release_visitor()
{
    if (PHP_SAPI === 'cli') {
        return true;
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
 * Is that value a yes?
 *
 * `'false'` BETWEEN QUOTES IS A NO. To PHP a non-empty string is true, so a
 * configuration written `'report_statistics' => 'false'` would go on sending
 * for somebody who had refused in writing. On the one key that sends data off
 * the machine, what the person meant wins over what the language reads.
 */
function ap_statistics_yes($value)
{
    if (is_string($value)) {
        return !in_array(strtolower(trim($value)), array('', '0', 'false', 'no', 'off'), true);
    }
    return !empty($value);
}

/** Does this server report at all? The default is yes. */
function ap_statistics_reports(array $config)
{
    return !array_key_exists('report_statistics', $config)
        || ap_statistics_yes($config['report_statistics']);
}

/**
 * Where the numbers go, or null with a reason.
 *
 * HTTPS, like the update source and for the same reason. Plain http is taken
 * only where the server itself was told to accept it (`allow_plain_http`),
 * which is a development machine talking to another one.
 */
function ap_statistics_address(array $config, &$error = null)
{
    $error = null;
    $url = isset($config['statistics_address']) && $config['statistics_address'] !== ''
        ? $config['statistics_address'] : AP_STATISTICS_ADDRESS;
    if (!is_string($url)) {
        $error = '`statistics_address` has to be text.';
        return null;
    }
    $lower = strtolower($url);
    $secure = substr($lower, 0, 8) === 'https://';
    $plain = substr($lower, 0, 7) === 'http://' && !empty($config['allow_plain_http']);
    if (!$secure && !$plain) {
        $error = '`statistics_address` must begin with https://.';
        return null;
    }
    if (preg_match('/[\x00-\x20\x7F-\xFF]/', $url) || !is_string(parse_url($url, PHP_URL_HOST))) {
        $error = '`statistics_address` is not an address.';
        return null;
    }
    return $url;
}

/**
 * The three numbers, or null when the store cannot give them.
 *
 * EVER CARRIED, not held today: a server with retention deletes every night,
 * and a total that shrank with it would read as a tool people are leaving
 * (the same reasoning as serverTotals() itself).
 */
function ap_statistics_figures($store)
{
    if (!method_exists($store, 'serverTotals')) {
        return null;
    }
    $totals = $store->serverTotals();
    if (!is_array($totals)) {
        return null;
    }
    $read = function ($name) use ($totals) {
        return isset($totals[$name]) ? max(0, (int) $totals[$name]) : 0;
    };
    return array(
        'projects' => $read('projects'),
        'notes'    => $read('notes') + $read('expired_notes'),
        'pages'    => $read('pages') + $read('expired_pages'),
    );
}

/**
 * What this server remembers, or null when its store cannot remember.
 *
 * ONE ROW, so that the question every write asks costs one read:
 *
 *   id, last, quiet   the daily report: who this is, when it last reported,
 *                     and whether a failure has already been said
 *   role, for, hint,  which end this server is: see WHICH SERVER RECEIVES.
 *   tried             `hint` is how many tries of the proof are left
 *
 * @return array|null
 */
function ap_statistics_memory($store)
{
    $empty = array('id' => '', 'last' => 0, 'quiet' => false, 'role' => '', 'for' => '', 'hint' => 0,
        'tried' => 0);
    if (!method_exists($store, 'remembered') || !method_exists($store, 'remember')) {
        return null;
    }
    $raw = $store->remembered(AP_STATISTICS_MEMORY);
    if (!is_string($raw) || $raw === '') {
        return $empty;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $empty;
    }
    $text = function ($name, $shape) use ($decoded) {
        return isset($decoded[$name]) && is_string($decoded[$name])
            && preg_match($shape, $decoded[$name]) ? $decoded[$name] : '';
    };
    return array(
        'id'    => $text('id', '/^[A-Za-z0-9_-]{22}\z/'),
        'last'  => isset($decoded['last']) ? (int) $decoded['last'] : 0,
        'quiet' => !empty($decoded['quiet']),
        'role'  => $text('role', '/^(receiver|sender)\z/'),
        'for'   => $text('for', '/^[0-9A-Za-z.+-]{1,32}\z/'),
        'hint'  => isset($decoded['hint']) ? max(0, min(AP_STATISTICS_PROVE_TRIES, (int) $decoded['hint'])) : 0,
        'tried' => isset($decoded['tried']) ? (int) $decoded['tried'] : 0,
    );
}

/** Writes it back. False when the store could not. */
function ap_statistics_remember($store, array $memory)
{
    return (bool) $store->remember(AP_STATISTICS_MEMORY, json_encode(array(
        'id'    => $memory['id'],
        'last'  => (int) $memory['last'],
        'quiet' => $memory['quiet'] ? 1 : 0,
        'role'  => $memory['role'],
        'for'   => $memory['for'],
        'hint'  => (int) $memory['hint'],
        'tried' => (int) $memory['tried'],
    )));
}

/** 16 bytes from the system's generator, in base64url: 22 characters. */
function ap_statistics_new_id()
{
    try {
        $bytes = random_bytes(16);
    } catch (Throwable $e) {
        return '';
    }
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

/**
 * Could this server report at all, whatever the date? Reads NO store.
 *
 * Everything that can be known from the configuration and the host is asked
 * here, so that a server that will never send -- refused, misaddressed, or
 * with no way out -- registers nothing and reads nothing on a write.
 */
function ap_statistics_able(array $config)
{
    return ap_statistics_reports($config)
        && ap_statistics_address($config) !== null
        && ap_statistics_transport() !== null;
}

/** What went wrong, fit for one line of a cron mail. */
function ap_statistics_plain($text)
{
    $text = trim(preg_replace('/[^\x20-\x7E]+/', ' ', (string) $text));
    return strlen($text) > 120 ? substr($text, 0, 120) . '...' : $text;
}

/**
 * One request, and what came back: its status, and the first $keep bytes.
 *
 * Certificate verification ON and redirects never followed, as in
 * ap_update_fetch(): a followed redirect is a second address nobody chose.
 *
 * @param string $method POST with a form-encoded $body, or GET with none
 * @param int    $keep   how many bytes of the answer the caller wants; the
 *                       rest is thrown away as it arrives
 * @return array array('ok' => bool, 'status' => int, 'error' => string,
 *               'answer' => string)
 */
function ap_statistics_request($method, $url, $body, $agent, $timeout, $keep = 0)
{
    $timeout = max(1, (int) $timeout);
    $keep = max(0, (int) $keep);
    $verdict = function ($status, $answer) {
        return $status >= 200 && $status < 300
            ? array('ok' => true, 'status' => $status, 'error' => '', 'answer' => $answer)
            : array('ok' => false, 'status' => $status, 'answer' => $answer,
                'error' => $status > 0 ? 'the receiver answered HTTP ' . $status
                                       : 'the receiver did not answer in time');
    };
    $refused = function ($why) {
        return array('ok' => false, 'status' => 0, 'error' => $why, 'answer' => '');
    };
    $post = $method === 'POST';
    $transport = ap_statistics_transport();

    if ($transport === 'curl') {
        $handle = curl_init();
        $answer = '';
        $options = array(
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => min(AP_STATISTICS_CONNECT_TIMEOUT, $timeout),
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_USERAGENT      => $agent,
            // http is reachable only where ap_statistics_address() let an
            // http address through, which is `allow_plain_http`.
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS | CURLPROTO_HTTP,
            // THE ANSWER IS THROWN AWAY AS IT ARRIVES, past what was asked
            // for. Kept whole, one that never ends fills the memory limit
            // before the deadline.
            CURLOPT_WRITEFUNCTION  => function ($ignored, $chunk) use (&$answer, $keep) {
                if (strlen($answer) < $keep) {
                    $answer .= substr($chunk, 0, $keep - strlen($answer));
                }
                return strlen($chunk);
            },
        );
        if ($post) {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = $body;
            $options[CURLOPT_HTTPHEADER] = array('Content-Type: application/x-www-form-urlencoded');
        }
        curl_setopt_array($handle, $options);
        curl_exec($handle);
        $errno = curl_errno($handle);
        $message = curl_error($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        // Dropped, not closed: curl_close() has done nothing since PHP 8.0 and
        // is reported as deprecated by 8.5 every time it runs.
        unset($handle);
        if ($errno !== 0 && $status === 0) {
            return $refused('request refused: ' . ap_statistics_plain($message) . ' (curl ' . $errno . ')');
        }
        return $verdict($status, $answer);
    }

    if ($transport === 'socket') {
        $parts = parse_url($url);
        $secure = isset($parts['scheme']) && strtolower($parts['scheme']) === 'https';
        $host = isset($parts['host']) ? $parts['host'] : '';
        $port = isset($parts['port']) ? (int) $parts['port'] : ($secure ? 443 : 80);
        $path = (isset($parts['path']) && $parts['path'] !== '' ? $parts['path'] : '/')
            . (isset($parts['query']) ? '?' . $parts['query'] : '');
        if ($host === '') {
            return $refused('the address names no host');
        }
        $context = stream_context_create(array('ssl' => array(
            // The three of them together: verify_peer alone still accepts a
            // valid certificate issued for another name.
            'verify_peer'       => true,
            'verify_peer_name'  => true,
            'allow_self_signed' => false,
            'peer_name'         => trim($host, '[]'),
        )));
        $deadline = microtime(true) + $timeout;
        $errno = 0;
        $errstr = '';
        // HALF THE DEADLINE, because it is spent twice: once on the
        // connection and once more, separately, on the handshake.
        $socket = @stream_socket_client(($secure ? 'ssl://' : 'tcp://') . $host . ':' . $port,
            $errno, $errstr, max(1, min(AP_STATISTICS_CONNECT_TIMEOUT, (int) floor($timeout / 2))),
            STREAM_CLIENT_CONNECT, $context);
        if ($socket === false) {
            return $refused('request refused' . ($errstr !== '' ? ': ' . ap_statistics_plain($errstr) : ''));
        }
        // Each read gives up after a second, so the loop below comes back to
        // look at the clock: THE CLOCK is the deadline, not the read.
        stream_set_timeout($socket, 1);
        $default = $secure ? 443 : 80;
        @fwrite($socket, $method . ' ' . $path . " HTTP/1.1\r\n"
            . 'Host: ' . $host . ($port === $default ? '' : ':' . $port) . "\r\n"
            . 'User-Agent: ' . $agent . "\r\n"
            . ($post ? "Content-Type: application/x-www-form-urlencoded\r\n"
                . 'Content-Length: ' . strlen($body) . "\r\n" : '')
            . "Connection: close\r\n\r\n" . ($post ? $body : ''));
        /* NOT feof(): after a read that timed out, feof() answers true, and
           the loop would give up on the first silent second whatever the
           deadline says -- measured, at 1.0 s for a deadline of 6. The stream
           says for itself whether it ended or merely waited.
           What is read is the status line, and then -- only when the caller
           asked for some of the answer -- what follows it, headers included,
           up to a ceiling: the caller looks for something IN it. */
        $ceiling = $keep > 0 ? $keep + 2048 : 512;
        $read = '';
        while (microtime(true) < $deadline && strlen($read) < $ceiling
            && ($keep > 0 || strpos($read, "\n") === false)) {
            $asked = microtime(true);
            $chunk = @fread($socket, 512);
            if ($chunk === false || $chunk === '') {
                // Nothing came: a second of silence, or the end. Some
                // versions answer false for the first and '' for the second,
                // others the reverse, so the stream is asked which it was.
                $meta = stream_get_meta_data($socket);
                if (empty($meta['timed_out']) || !empty($meta['eof'])) {
                    break;   // the other end closed: nothing more will come
                }
                /* AND A READ THAT CAME BACK EMPTY AT ONCE IS THE END TOO. Over
                   TLS a stream that waited once keeps saying it timed out
                   after the other end has gone, and answers every read
                   instantly: believed, this loop spins until the deadline --
                   measured, 3.5 s of processor for 5 s of clock. A real wait
                   takes its second. */
                if (microtime(true) - $asked < 0.2) {
                    break;
                }
                continue;
            }
            $read .= $chunk;
        }
        @fclose($socket);
        return $verdict(preg_match('#^HTTP/\S+\s+(\d{3})#', $read, $m) ? (int) $m[1] : 0, $read);
    }

    return $refused('this host cannot make an outbound request');
}

/** One declaration: a POST, form-encoded, and nothing of the answer kept. */
function ap_statistics_post($url, array $fields, $timeout)
{
    return ap_statistics_request('POST', $url, http_build_query($fields, '', '&'),
        'annotepage-statistics/' . (isset($fields['version']) ? $fields['version'] : ''), $timeout);
}

/* -- WHICH SERVER RECEIVES --------------------------------------------------

   One server does not send: the one the address leads to. It receives what
   the others declare (internal/statistics-receiver.php) and counts itself.

   NOBODY TELLS IT SO. A key in its configuration would be a machine to log
   into, and the updater never writes a configuration. So it finds out, and
   the way it finds out is the whole point:

   A SERVER DOES NOT KNOW ITS OWN NAME. It knows the name each request claims
   to be for, and that is whatever the request says: "is my name the
   receiver's?" is a question anybody can answer for it, falsely. Believed,
   it would let a stranger switch on a receiver on somebody else's server.

   SO THE NAME IS A HINT, AND THE PROOF IS A FILE. A request that claims the
   receiver's name leaves a note that this server MIGHT be it. Then, once per
   version, the server writes a file with a random name and random content
   beside api.php, and asks for it AT THE RECEIVER'S ADDRESS, over https, with
   the certificate checked. If what comes back is what it wrote, the address
   leads here: nothing a stranger says can make that happen on a server the
   name does not point to. The file is removed either way.

   WHAT THE ANSWER CHANGES. A server that is the receiver writes stats.php --
   the door, a few lines -- beside api.php, and stops declaring to itself. A
   server that is not removes a door it once wrote. The receiving code is on
   every server, in this directory, which no request reaches; the door exists
   on one.

   A HINT THAT IS FALSE COSTS ONE FILE AND ONE REQUEST, once per version, and
   then the server knows it is not the receiver and does not ask again.

   ONLY A PLAIN ANSWER SETTLES IT. The address answering that the file is not
   there -- a 404 -- or answering with something that is not the witness says
   this server is not the one. No answer, or an answer that is about the
   moment rather than the file (a 5xx, a 429, a 403, a redirect), says
   nothing: a server busy for a second must not conclude that it is not the
   receiver and stay wrong until the next release. The question stays open,
   asked again no more than once an hour and no more than a few times; after
   that the hint is dropped, and it takes somebody calling the server by that
   name again to reopen it -- which, on the real receiver, is every request.

   A SERVER THAT REFUSED THE STATISTICS TRIES NOTHING. With
   `report_statistics => false` and nothing said about collecting, a request
   that claims the name is a request like any other: no witness, no call out.
   The one machine that refuses to report AND is the receiver says so with
   `collect_statistics => true`.

   AND A CONFIGURATION CAN STILL SAY IT. `collect_statistics => true` makes a
   server the receiver without the proof -- for a host that cannot write
   beside api.php or cannot call itself, where the door is then put there by
   hand -- and `=> false` makes sure it never is. */

/**
 * The name the receiving address is reached under, as a request would claim
 * it: lowercase, with its port when the address names one that is not the
 * scheme's own. '' when there is no usable address.
 */
function ap_statistics_receiver_host(array $config)
{
    $url = ap_statistics_address($config);
    $parts = $url === null ? false : parse_url($url);
    if (!is_array($parts) || !isset($parts['host'])) {
        return '';
    }
    $usual = isset($parts['scheme']) && strtolower($parts['scheme']) === 'https' ? 443 : 80;
    return strtolower($parts['host'])
        . (isset($parts['port']) && (int) $parts['port'] !== $usual ? ':' . (int) $parts['port'] : '');
}

/** Does THIS request claim to be for the receiving address? A hint only. */
function ap_statistics_named_here(array $config)
{
    $claimed = isset($_SERVER['HTTP_HOST']) && is_string($_SERVER['HTTP_HOST'])
        ? strtolower(trim($_SERVER['HTTP_HOST'])) : '';
    // A request may spell out the port everybody uses; the address does not.
    $claimed = preg_replace('/:(80|443)\z/', '', $claimed);
    return $claimed !== '' && $claimed === ap_statistics_receiver_host($config);
}

/** What the configuration says about it: true, false, or null for nothing. */
function ap_statistics_told(array $config)
{
    return array_key_exists('collect_statistics', $config)
        ? ap_statistics_yes($config['collect_statistics']) : null;
}

/**
 * Is this server the one that receives? Reads at most one row, proves nothing.
 *
 * @param array|null $memory what ap_statistics_memory() gave, when the caller
 *                           already has it
 */
function ap_statistics_receives(array $config, $store, $memory = null)
{
    $told = ap_statistics_told($config);
    if ($told !== null) {
        return $told;
    }
    if ($memory === null) {
        $memory = is_object($store) ? ap_statistics_memory($store) : null;
    }
    return $memory !== null && $memory['role'] === 'receiver';
}

/**
 * The proof: does the receiving address lead to this very directory?
 *
 * @return bool|null true or false once it is known; null when it is not --
 *                   the directory cannot be written, or nothing answered
 */
function ap_statistics_prove(array $config, $timeout)
{
    $url = ap_statistics_address($config);
    $root = dirname(__DIR__);
    if ($url === null || ap_statistics_transport() === null) {
        return false;
    }
    try {
        $name = 'ap-witness-' . bin2hex(random_bytes(16)) . '.txt';
        $said = bin2hex(random_bytes(24));
    } catch (Throwable $e) {
        return null;
    }
    if (!is_writable($root)) {
        return null;
    }
    // A witness a killed process left behind is nobody's any more.
    $stale = glob($root . '/ap-witness-*.txt');
    foreach (is_array($stale) ? $stale : array() as $left) {
        if (@filemtime($left) < time() - 600) {
            @unlink($left);
        }
    }
    if (@file_put_contents($root . '/' . $name, $said) !== strlen($said)) {
        @unlink($root . '/' . $name);
        return null;
    }
    // The same directory as the address, under the witness's name -- built
    // from the address's parts, so that one with no path still names a host.
    $parts = parse_url($url);
    $path = isset($parts['path']) ? $parts['path'] : '/';
    $ask = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '')
        . substr($path, 0, (int) strrpos($path, '/')) . '/' . $name;
    $got = ap_statistics_request('GET', $ask, '',
        'annotepage-statistics/' . ap_statistics_version(), $timeout, 256);
    @unlink($root . '/' . $name);
    if ($got['ok']) {
        return strpos($got['answer'], $said) !== false;
    }
    // "Not there" is an answer about the file. Anything else -- silence, a
    // 5xx, a 429, a 403, a redirect -- is an answer about the moment.
    return $got['status'] === 404 ? false : null;
}

/**
 * Puts the door where the role says, and says whether stats.php is there.
 *
 * It writes a door that is missing, repairs one that is not what this version
 * writes, and removes one THIS code wrote from a server that stopped being the
 * receiver. A stats.php somebody else put there is never touched.
 */
function ap_statistics_door($receiver)
{
    $path = dirname(__DIR__) . '/stats.php';
    $there = is_file($path) ? (string) @file_get_contents($path) : null;
    $ours = $there !== null && strpos($there, 'written by annotepage ON THE ONE SERVER') !== false;
    if ($receiver) {
        if ($there === AP_STATISTICS_DOOR) {
            return true;
        }
        if ($there !== null && !$ours) {
            return true;   // put there by hand: left as it is
        }
        return @file_put_contents($path, AP_STATISTICS_DOOR) === strlen(AP_STATISTICS_DOOR);
    }
    if ($ours) {
        @unlink($path);
    }
    return false;
}

/** Was a proof attempted during this request? Said by settle, asked by run. */
function ap_statistics_proving($now = null)
{
    static $attempted = false;
    if ($now === true) {
        $attempted = true;
    }
    return $attempted;
}

/**
 * Finds out which end this server is, when it does not know yet. NEVER THROWS.
 *
 * Asked on every write and at every daily run, and it does something once per
 * version: a server that has decided for the version it runs returns after
 * comparing two strings.
 *
 * @param bool $named did this request claim to be for the receiving address?
 * @return array the memory, as it stands afterwards (or null: no memory)
 */
function ap_statistics_settle(array $config, $store, $named, $timeout = AP_STATISTICS_TIMEOUT)
{
    try {
        $memory = ap_statistics_memory($store);
        $told = ap_statistics_told($config);
        if ($told !== null) {
            ap_statistics_door($told);
            return $memory;
        }
        if ($memory === null) {
            return null;
        }
        $version = ap_statistics_version();
        if ($memory['for'] === $version && $memory['role'] !== '') {
            if ($memory['role'] === 'receiver') {
                ap_statistics_door(true);   // deleted by somebody: it comes back
            }
            return $memory;
        }
        if (!ap_statistics_reports($config)) {
            // REFUSED, and nothing said about collecting: this server tries
            // nothing, whatever name a request claims. See the section above.
            return $memory;
        }
        if (!$named && $memory['hint'] < 1) {
            // Nobody ever called this server by that name: not it, and no
            // proof is attempted -- which is every server but one or two.
            return $memory;
        }
        if (time() - $memory['tried'] < AP_STATISTICS_PROVE_EVERY) {
            return $memory;   // tried not long ago, and nothing settled it
        }
        if ($named) {
            $memory['hint'] = AP_STATISTICS_PROVE_TRIES;
        }
        /* THE TRY IS RECORDED BEFORE IT IS MADE: one fewer left, and the hour
           started. Recorded after, a dozen requests arriving together would
           each see nothing tried and each write a witness and call out --
           measured, nine at once. And if it cannot be recorded, it is not
           made: no record, no bound. */
        $memory['hint'] -= 1;
        $memory['tried'] = time();
        if (!ap_statistics_remember($store, $memory)) {
            return $memory;
        }
        ap_statistics_proving(true);
        $proved = ap_statistics_prove($config, $timeout);
        if ($proved === null) {
            return $memory;   // not known: asked again in an hour, if tries are left
        }
        $memory['tried'] = 0;
        $memory['role'] = $proved ? 'receiver' : 'sender';
        $memory['for'] = $version;
        // A SERVER PROVED NOT TO BE IT FORGETS THE HINT, so a stranger who
        // lied about the name once has to lie again to cost it another try.
        $memory['hint'] = $proved ? AP_STATISTICS_PROVE_TRIES : 0;
        ap_statistics_remember($store, $memory);
        ap_statistics_door($proved);
        return $memory;
    } catch (Throwable $e) {
        ap_log('statistics: ' . $e->getMessage());
        return null;
    }
}

/**
 * Reports if a report is owed. NEVER THROWS.
 *
 * @param int $timeout the deadline of the request, in seconds
 * @return array array('sent' => bool, 'line' => string) -- the line is what
 *               the daily command prints, '' when there is nothing to say
 */
function ap_statistics_run(array $config, $store, $timeout = AP_STATISTICS_TIMEOUT, $named = false)
{
    $quiet = array('sent' => false, 'line' => '');
    try {
        // REFUSED, AND NOT TOLD TO COLLECT: nothing at all, and nothing said
        // -- a line a day, for ever, to somebody who said no, would be the
        // statistics still making themselves heard. The diagnostic says it.
        if (!ap_statistics_reports($config) && ap_statistics_told($config) === null) {
            return $quiet;
        }
        // WHICH END NEXT: the receiver counts itself and declares to nobody.
        $settled = ap_statistics_settle($config, $store, $named, $timeout);
        if (ap_statistics_receives($config, $store, $settled)) {
            return $quiet;
        }
        if (!ap_statistics_reports($config)) {
            return $quiet;
        }
        /* ONE CALL OUT PER REQUEST. Where a visitor waits on this, a proof
           just made has spent the deadline; the report keeps for the next
           write, which is minutes away on a server that is written to. */
        if (PHP_SAPI !== 'cli' && ap_statistics_proving()) {
            return $quiet;
        }
        $url = ap_statistics_address($config, $why);
        if ($url === null) {
            return array('sent' => false, 'line' => 'Statistics: not sent -- ' . $why);
        }
        if (ap_statistics_transport() === null) {
            return $quiet;
        }
        $memory = $settled !== null ? $settled : ap_statistics_memory($store);
        if ($memory === null) {
            return $quiet;
        }
        $now = time();
        if ($now - $memory['last'] < AP_STATISTICS_EVERY) {
            return $quiet;
        }
        // THE SLOT FIRST, before the count and before the request. No record
        // means no gate, and then nothing at all is done: the next write
        // finds the same refusal after one read, and never reaches the count.
        $memory['last'] = $now;
        if (!ap_statistics_remember($store, $memory)) {
            return $quiet;
        }
        $figures = ap_statistics_figures($store);
        if ($figures === null || $figures['notes'] === 0) {
            // Nothing was ever written here: not a site, not counted, and no
            // identifier is drawn for it.
            return $quiet;
        }
        if ($memory['id'] === '') {
            $memory['id'] = ap_statistics_new_id();
            if ($memory['id'] === '' || !ap_statistics_remember($store, $memory)) {
                return $quiet;
            }
            // TWO FIRST WRITES AT ONCE each draw one. What the store holds
            // afterwards is the one both of them send, so the receiver sees
            // one server and not two.
            $kept = ap_statistics_memory($store);
            if ($kept !== null && $kept['id'] !== '') {
                $memory['id'] = $kept['id'];
            }
        }
        $sent = ap_statistics_post($url, array(
            'id'       => $memory['id'],
            'version'  => ap_statistics_version(),
            'projects' => $figures['projects'],
            'notes'    => $figures['notes'],
            'pages'    => $figures['pages'],
        ), $timeout);

        if (!$sent['ok']) {
            /* A 404 OR A 429 IS NOT NEWS. The receiver is one door on one
               machine and may not be there -- a fork, a mirror, the days
               before it was put in place -- or it may be rationing new
               servers, which is its job on the day every server updates.
               Nobody running THIS server can act on either. */
            if ($sent['status'] === 404 || $sent['status'] === 429) {
                return $quiet;
            }
            /* ANYTHING ELSE IS SAID ONCE, AND THEN NOT AGAIN until a report
               goes through. A host that cannot reach the outside fails the
               same way every morning, and the same line in every cron mail
               teaches its reader to stop reading them.
               SAID BY THE DAILY COMMAND, WHICH IS THE ONE THAT CAN SAY IT.
               After a web write this line goes nowhere; marking it said then
               would spend the one telling on nobody. */
            if ($memory['quiet']) {
                return $quiet;
            }
            if (PHP_SAPI !== 'cli') {
                return $quiet;
            }
            $memory['quiet'] = true;
            ap_statistics_remember($store, $memory);
            return array('sent' => false, 'line' => 'Statistics: not sent -- ' . $sent['error']
                . '. Nothing else depends on it, it is tried again every day, and this is'
                . ' not repeated until one goes through.');
        }
        if ($memory['quiet']) {
            $memory['quiet'] = false;
            ap_statistics_remember($store, $memory);
        }
        return array('sent' => true, 'line' => 'Statistics: sent this server\'s random'
            . ' identifier, its version and three totals -- ' . $figures['projects'] . ' project'
            . ($figures['projects'] === 1 ? '' : 's') . ', ' . $figures['notes'] . ' note'
            . ($figures['notes'] === 1 ? '' : 's') . ', ' . $figures['pages'] . ' page'
            . ($figures['pages'] === 1 ? '' : 's') . '. report_statistics => false turns it off.');
    } catch (Throwable $e) {
        ap_log('statistics: ' . $e->getMessage());
        return $quiet;
    }
}

/**
 * From a web request, on a write: registers the report for AFTER the answer.
 *
 * NOTHING IS ASKED OF THE STORE HERE. Whether a report is owed is a question
 * for the deferred half: asked now it would be a query before the note is
 * written, and on a database that is down, a second wait in front of the
 * failure the visitor is about to get anyway.
 */
function ap_statistics_schedule(array $config, $store)
{
    try {
        // The name this request claims is read NOW, while it is this
        // request's; whether it is believed is the deferred half's business.
        $told = ap_statistics_told($config);
        if (!ap_statistics_reports($config) && $told === null) {
            return;   // refused: nothing is registered, whatever name is claimed
        }
        $named = ap_statistics_named_here($config);
        if (!$named && !ap_statistics_able($config) && $told === null) {
            return;
        }
        register_shutdown_function('ap_statistics_deferred', $config, $store, $named);
    } catch (Throwable $e) {
        // Statistics never stand between a visitor and their note.
    }
}

/** The deferred half. Runs once the visitor has their answer. */
function ap_statistics_deferred(array $config, $store, $named = false)
{
    try {
        // ONLY AFTER A WRITE THAT WAS ONE. A request refused for a malformed
        // field is not a note, and must not spend the day's report -- or let
        // a stranger with a project id decide when this server calls out.
        if (PHP_SAPI !== 'cli' && http_response_code() !== 200) {
            return;
        }
        $memory = ap_statistics_memory($store);
        if ($memory === null) {
            return;
        }
        $undecided = ap_statistics_told($config) === null
            && ($memory['for'] !== ap_statistics_version() || $memory['role'] === '')
            && ($named || $memory['hint'] > 0)
            && time() - $memory['tried'] >= AP_STATISTICS_PROVE_EVERY;
        $due = ap_statistics_able($config) && $memory['role'] !== 'receiver'
            && time() - $memory['last'] >= AP_STATISTICS_EVERY;
        // A receiver whose door somebody deleted puts it back: one look at
        // the directory, on the one server that has a door at all.
        $mend = $memory['role'] === 'receiver' && !is_file(dirname(__DIR__) . '/stats.php');
        if (!$undecided && !$due && !$mend && ap_statistics_told($config) === null) {
            return;   // the common case: one read, and nothing to do
        }
        // Where the connection cannot be released, the visitor waits on this
        // request: it gets the shorter deadline, once a day, and no retry.
        $released = ap_statistics_release_visitor();
        @ignore_user_abort(true);
        ap_statistics_run($config, $store,
            $released ? AP_STATISTICS_TIMEOUT : AP_STATISTICS_TIMEOUT_WAITING, $named);
    } catch (Throwable $e) {
        // Past the response: there is nobody left to tell.
    }
}

/** The lines the diagnostic shows. Sends nothing, proves nothing. */
function ap_statistics_diagnostic_lines(array $config, $store = null)
{
    // The refusal first: a server that said no is asked nothing further.
    if (!ap_statistics_reports($config) && ap_statistics_told($config) === null) {
        return array(array('config.report_statistics', 'no -- nothing is sent'));
    }
    if (ap_statistics_receives($config, $store)) {
        return array(array('config.report_statistics',
            'no -- this server receives the statistics of the others and counts itself'));
    }
    if (!ap_statistics_reports($config)) {
        return array(array('config.report_statistics', 'no -- nothing is sent'));
    }
    $url = ap_statistics_address($config, $why);
    if ($url === null) {
        return array(array('config.report_statistics', 'yes, but REFUSED -- ' . $why));
    }
    if (ap_statistics_transport() === null) {
        return array(array('config.report_statistics',
            'yes, but this host cannot make an outbound request -- nothing is sent'));
    }
    if (is_object($store) && (!method_exists($store, 'remembered') || !method_exists($store, 'remember'))) {
        return array(array('config.report_statistics',
            'yes, but this store is older than this server and cannot remember a date -- nothing is sent'));
    }
    return array(array('config.report_statistics',
        'yes -- once a day: a random id, the version and three totals, to ' . $url));
}
