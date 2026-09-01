<?php
/**
 * api.php -- annotepage's SINGLE HTTP ENTRY POINT, on the server side.
 *
 * No other file of this tool is meant to be called by the web. Everything under
 * internal/ refuses to run without the constant set here, and nothing is
 * published that does not serve.
 *
 * ONE CODE, TWO DEPLOYMENTS. The same file runs on the site under review
 * (self-hosted) and on a third-party machine (relay). The configuration says
 * which, and that value changes only three things, each written where it acts:
 * plain mode, the requirement for the Origin header, the backfill action. There
 * are NOT two implementations -- they would diverge at the second fix.
 *
 * FIVE SERVICE ACTIONS, PLUS ONE FOR MAINTENANCE
 *
 *   GET  api.php?action=list&project=<id>&index=<page_index>
 *        The notes of one page, in JSON, for the client. The REAL PATH is never
 *        sent, in any mode: only the blind index is. Sending the path in plain
 *        mode and the index in encrypted mode would make two code paths, and
 *        the second would be the less tested one.
 *
 *   POST api.php?action=add
 *        Fields (application/x-www-form-urlencoded):
 *          project, mode                                   always
 *          index                                           new note
 *          reply_to                                        reply to a note
 *          payload                                         encrypted mode
 *          author, text                                    plain mode
 *          page, selector, fingerprint, excerpt            plain mode, new note
 *          version, environment, viewport                  plain mode, optional
 *        A reply INHERITS its parent's page index, and in plain mode its page
 *        and its element: the designation fields are then ignored.
 *        We do NOT move to JSON: an urlencoded body is a "simple request" in the
 *        CORS sense and triggers no preflight, which spares the relay a whole
 *        OPTIONS machinery. So there is NO OPTIONS handler here: if you see any
 *        in a log, a client is sending a header it should not.
 *
 *   POST api.php?action=resolve
 *        Fields: project, id, resolved (0 reopens, default 1),
 *                resolution_payload (encrypted mode), by and version (plain).
 *        The MODE is not asked for here: it is the mode of the note aimed at,
 *        which has been fixed since the note was written.
 *        Nothing is ever deleted: a resolved note moves into history, from where
 *        it comes back out if the fix turns out to be incomplete.
 *
 *   GET  api.php?action=text&project=<id>
 *        ALL the notes of the project, in structured text/plain. This is the
 *        address an assistant reads from outside. In encrypted mode it returns
 *        the STRUCTURAL export plus the envelopes: the genuinely readable
 *        document exists only on the machine that holds the salt.
 *
 *   GET  api.php?action=diagnostic
 *        State of the server, in text/plain. No parameter, and above all no
 *        project. No credential VALUE ever appears in it -- not even its length;
 *        a project id appears only through its first six characters, because
 *        the id is what gives access to the rows.
 *        It answers EVEN when the local configuration is unreadable or
 *        malformed, because that is precisely when it is needed.
 *
 *   GET|POST api.php?action=backfill
 *        MAINTENANCE, refused in relay mode. It serves once, when taking over a
 *        database written by "in-context notes" 1.2.0: the server enumerates the
 *        page paths still without a blind index, the client computes each index
 *        (it has the salt, the server does not) and sends it back. See the
 *        header of internal/store.php for what the server can and cannot take
 *        over on its own.
 *        This action is not one of the format's five addresses: it is an
 *        addition, and FORMAT.md section 7 says an added action does not change
 *        the format number. It can disappear the day no 1.2.0 database runs any
 *        more.
 *
 * RESPONSE CONTRACT, as the client must read it:
 *
 *   200 + application/json   normal response: {"ok":true, ...}
 *   200 + application/json   with {"ok":false,"active":false}: the tool is
 *                            DROPPED IN here but not configured, or the project
 *                            asked for is not declared. The client stands down
 *                            IN SILENCE.
 *                            Why 200 and not 404: the browser itself logs every
 *                            error code in the console of EVERY page. A 404 on
 *                            the most common path -- the tool copied in, not
 *                            configured yet -- therefore left a trace on the
 *                            screen of whoever opens the console, when the
 *                            promise is "not a word". Measured: 3 console
 *                            messages with the 404, 2 without, that is exactly
 *                            those of the bare page. Only the `list` action
 *                            answers this way; the others, which a human calls
 *                            by hand, keep their explained 404.
 *   403 + text/plain         origin refused (domain lock), or project cap
 *                            reached.
 *   413 + text/plain         body too large.
 *   429 + text/plain         rate limited, with Retry-After.
 *   4xx or 5xx + text/plain  message written for a human: TO BE SHOWN as it
 *                            stands. That is how "the database is unreachable"
 *                            reaches a reviewer's screen.
 *   404 + text/plain         there is nothing at this address, or the tool is
 *                            not configured here: the client stands down in
 *                            silence.
 *   anything else            PHP is not executed (source served in the clear,
 *                            server error page): the client stands down in
 *                            silence, without a word in the console.
 *
 * ONE DEPARTURE, AND IT IS INTENDED: a refused origin returns 403 even on
 * `list`. The rule of silence protects the installation that is not configured
 * yet; it does not have to protect the site trying to consume somebody else's
 * project.
 *
 * WHAT THE PROJECT ID GIVES: everything. It is a bearer token, there is no
 * authentication, and that was already the case in format 1. In encrypted mode
 * the rows obtained are unusable without the salt; in plain mode they are
 * readable, and that is exactly why plain mode is reserved for self-hosting.
 *
 * HEADERS: they are set by PHP's header(), never by a .htaccess. The server's
 * headers module may be off -- it is on this tool's original hosting -- and a
 * protection that depends on an unverified module is not one. That holds for
 * the cross-origin sharing headers too: the lock computes them, PHP sets them.
 *
 * SYNTAX: this file uses PHP 5.4 constructs only. That is not coquetry -- the
 * version test a few lines below would NEVER be reached if the file did not
 * compile. The files in internal/, included AFTER that test, may use PHP 7.4.
 */

// --- 1. PHP version -------------------------------------------------------
// First executable statement. The version seen on the command line is not
// necessarily the one the web server serves: only a page actually served can
// tell, and knowing must not require a shell.

if (!defined('PHP_VERSION_ID') || PHP_VERSION_ID < 70400) {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    if (function_exists('http_response_code')) {
        http_response_code(500);
    } else {
        header('HTTP/1.1 500 Internal Server Error');
    }
    echo "annotepage requires PHP 7.4 or newer.\n";
    echo 'Version served by this web server: '
        . (defined('PHP_VERSION') ? PHP_VERSION : 'unknown') . "\n";
    echo "No note can be saved until this is fixed.\n";
    exit;
}

// --- 2. Nets and dependencies ---------------------------------------------
// The guard constant is set HERE and nowhere else: it, and not the .htaccess,
// is what prevents a direct call to a file in internal/. It depends on no
// server module.

define('AP_INTERNAL', 1);

/**
 * THE FORMAT NUMBER, an integer, with no dot. It appears in three places and
 * the three must agree: the `format` column of every row, the `ap<n>` prefix of
 * every envelope, the `format` line of the export header. It is declared once,
 * here, so that this stays true.
 *
 * It is PER ROW, not per installation: a database may carry rows of format 1, 2
 * and 3, each read according to its own.
 */
define('AP_FORMAT', 2);

require __DIR__ . '/internal/errors.php';
ap_install_handlers();

// Everything is buffered: a failure occurring in the middle of a response must
// be able to REPLACE it, not add to it. The streamed export empties this buffer
// before it starts.
ob_start();

require __DIR__ . '/internal/config.php';
require __DIR__ . '/internal/origins.php';
require __DIR__ . '/internal/input.php';
require __DIR__ . '/internal/rate-limit.php';
require __DIR__ . '/internal/store.php';
require __DIR__ . '/internal/text-export.php';

// --- 3. Response helpers --------------------------------------------------

/**
 * Version of the TOOL, read from the VERSION file that accompanies it.
 *
 * It is returned in the diagnostic and in every JSON response: that is what
 * makes it possible to know FROM A DISTANCE which version is really online,
 * with no access to the server.
 */
function ap_version()
{
    static $version = null;
    if ($version !== null) {
        return $version;
    }
    $version = 'unknown';
    // The file lives in the served part; the second path only covers the case
    // where the tool is served from its complete directory.
    $candidates = array(__DIR__ . '/VERSION', __DIR__ . '/../VERSION');
    foreach ($candidates as $path) {
        if (is_readable($path)) {
            $read = trim((string) file_get_contents($path));
            if ($read !== '' && preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $read)) {
                $version = $read;
                break;
            }
        }
    }
    return $version;
}

/** Headers common to ALL responses, errors included. */
function ap_common_headers()
{
    // Without no-store, a cache in front of the server could serve one
    // reviewer's list to another, or a stale list to a reviewer.
    header('Cache-Control: no-store');
    // Since the server's headers module may be off, PHP is what sets this one.
    // There is no .html file to protect anyway: the tool drops none on disk.
    header('X-Robots-Tag: noindex, nofollow');
    // A text/plain must not be reinterpreted by the browser.
    header('X-Content-Type-Options: nosniff');
    // Cross-origin sharing, computed by the domain lock. Empty as long as no
    // origin has been verified, which is the case when self-hosted.
    foreach (ap_cors_headers() as $line) {
        header($line);
    }
}

function ap_respond_json(array $payload)
{
    if (!function_exists('json_encode')) {
        throw new ApFailure(
            "The PHP extension `json` is missing on this server: annotepage cannot "
            . "answer the client.", 503);
    }
    $body = json_encode($payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

    if ($body === false) {
        throw new ApFailure("Response impossible to encode as JSON.", 500);
    }

    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    ap_common_headers();
    echo $body;
    exit;
}

function ap_begin_text()
{
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    header('Content-Type: text/plain; charset=utf-8');
    ap_common_headers();
}

/** The common envelope of every JSON service response. */
function ap_response_envelope(array $extra)
{
    return array_merge(array(
        'ok'      => true,
        'tool'    => 'annotepage',
        'format'  => AP_FORMAT,
        'version' => ap_version(),
    ), $extra);
}

/** Requires the POST method for an action that changes state. */
function ap_require_post($what)
{
    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
    if (strtoupper($method) !== 'POST') {
        throw new ApFailure(
            $what . " is done with POST. Method received: "
            . strtoupper(preg_replace('/[^A-Za-z]/', '', $method)) . ".",
            405);
    }
}

// --- 4. Diagnostic --------------------------------------------------------
//
// ONE SINGLE REQUEST, FROM OUTSIDE, must be enough to settle: is PHP executed,
// in which version, with which extensions, are the credentials readable, does
// the database answer, does the table exist, are the projects declared, and
// what is left to backfill from a 1.2.0 database. Those are exactly the
// questions one cannot settle without access to the server -- and nobody, on
// this kind of hosting, has a shell.
//
// THREE RULES, without exception:
//   - no credential VALUE is ever displayed. We say where it comes from and
//     whether it is readable; that is all one needs;
//   - a PROJECT id appears only through its first six characters. Six are
//     enough to confirm one is looking at the right one, and the whole id is
//     what gives access to the rows;
//   - no effect. The diagnostic does not create the table it comes looking for,
//     does not complete a schema, does not attach any row to any project.

function ap_diag_line($key, $value)
{
    echo $key . ' ' . $value . "\n";
}

function ap_yes_no($boolean)
{
    return $boolean ? 'yes' : 'NO';
}

function ap_write_diagnostic($config, $version, $configError)
{
    ap_diag_line('tool', 'annotepage');
    ap_diag_line('version', $version);
    ap_diag_line('format', AP_FORMAT);
    ap_diag_line('date', gmdate('Y-m-d\TH:i:sP'));
    echo "\n";

    // --- PHP really served by the web server ------------------------------
    ap_diag_line('php.version', PHP_VERSION);
    ap_diag_line('php.interface', PHP_SAPI);
    $user = 'unknown';
    if (function_exists('posix_geteuid') && function_exists('posix_getpwuid')) {
        $info = posix_getpwuid(posix_geteuid());
        if (isset($info['name'])) {
            $user = $info['name'];
        }
    } elseif (function_exists('get_current_user')) {
        $user = get_current_user();
    }
    ap_diag_line('php.user', $user === '' ? 'unknown' : $user);

    // The extensions the TOOL needs, plus those the store asks for. The entry
    // point does not know what the store asks for, nor why: that is what makes
    // it possible to replace the store without leaving behind a diagnostic that
    // demands an extension nobody uses any more.
    $extensions = array_merge(array('json', 'mbstring', 'filter'),
                              ApStore::requiredExtensions());
    foreach ($extensions as $extension) {
        ap_diag_line('php.extension.' . $extension,
            extension_loaded($extension) ? 'present' : 'MISSING');
    }
    echo "\n";

    // --- Configuration ----------------------------------------------------
    // This block is written EVEN when the configuration could not be loaded:
    // that is the only case where the diagnostic is really needed, and it was
    // precisely the only one where it died with a 500 naming nothing.
    $path = __DIR__ . '/internal/config-local.php';
    ap_diag_line('config.file', $path);
    ap_diag_line('config.present', ap_yes_no(is_file($path)));
    ap_diag_line('config.readable',
        ap_yes_no(is_file($path) && is_readable($path)));

    if ($configError !== null) {
        ap_diag_line('config.loading', 'FAILED');
        echo "\n";
        echo $configError . "\n";
        echo "\n";
        ap_diag_line('verdict',
            "the configuration could not be loaded: nothing else can be checked until "
            . "this is fixed.");
        return;
    }

    ap_diag_line('config.loading', 'SUCCEEDED');
    ap_diag_line('config.active', ap_yes_no($config['active']));
    ap_diag_line('config.deployment', $config['deployment']);
    ap_diag_line('config.open_registration',
        ap_open_registration($config) ? 'yes -- any project id is served, no origin lock' : 'no');
    ap_diag_line('config.max_note_age_days',
        empty($config['max_note_age_days'])
            ? '0 -- nothing expires'
            : ((int) $config['max_note_age_days']) . ' -- threads older than this are removed');
    ap_diag_line('config.max_text_length', $config['max_text_length']);
    ap_diag_line('config.max_author_length', $config['max_author_length']);
    ap_diag_line('config.max_payload_length', $config['max_payload_length']);
    ap_diag_line('config.max_body_bytes', $config['max_body_bytes']);
    ap_diag_line('rate.window_seconds', $config['rate_window_seconds']);
    ap_diag_line('rate.writes_per_ip', $config['rate_writes_per_ip']);
    ap_diag_line('rate.writes_per_project', $config['rate_writes_per_project']);
    ap_diag_line('rate.exports_per_ip', $config['rate_exports_per_ip']);
    ap_diag_line('rate.client_ip_header',
        $config['client_ip_header'] === null ? 'none (REMOTE_ADDR)' : $config['client_ip_header']);
    ap_diag_line('quota.notes_per_project',
        (int) $config['max_notes_per_project'] > 0
            ? $config['max_notes_per_project'] : 'no limit');
    echo "\n";

    // --- Projects ---------------------------------------------------------
    // The origins are shown IN FULL: they are public domain names, and they are
    // exactly the line one comes to compare, character by character, with what
    // the browser sends. The ids are shortened: see the three rules above.
    try {
        $projects = ap_declared_projects($config);
        ap_diag_line('projects.declared', count($projects));
        foreach ($projects as $id => $project) {
            // The ellipsis of the short form is removed HERE, and only here: in
            // a key like `project.xxxxxx.mode` it would give
            // `project.xxxxxx....mode`, which one rereads three times before
            // realising it is not a typo.
            $short = rtrim(ap_short_project($id), '.');
            ap_diag_line('project.' . $short . '.mode', $project['mode']);
            ap_diag_line('project.' . $short . '.origins',
                implode(', ', $project['origins']));
        }
        $backfill = ap_backfill_project($config);
        ap_diag_line('projects.backfill_possible',
            $backfill === null
                ? 'no (relay, or several declared projects)'
                : 'yes, towards ' . ap_short_project($backfill));
    } catch (ApFailure $e) {
        ap_diag_line('projects.declared', 'FAILED');
        echo "\n" . $e->getMessage() . "\n\n";
        ap_diag_line('verdict',
            "the project declaration is invalid: no note will be served until this is "
            . "fixed.");
        return;
    }
    echo "\n";

    if (!$config['active']) {
        ap_diag_line('verdict',
            "tool INACTIVE. Drop in internal/config-local.php "
            . "(template: config-local.example.php).");
        return;
    }

    // --- Storage ----------------------------------------------------------
    // What follows comes ENTIRELY from the store, which is the only thing that
    // knows what the storage is. We display "key value" pairs without
    // interpreting them.
    try {
        $lines = (new ApStore($config))->diagnosticLines();
    } catch (ApFailure $e) {
        echo $e->getMessage() . "\n\n";
        ap_diag_line('verdict', 'the storage cannot even be questioned.');
        return;
    }
    foreach ($lines as $line) {
        if ($line[0] === '') {
            echo $line[1] === '' ? "\n" : $line[1] . "\n";
            continue;
        }
        ap_diag_line($line[0], $line[1]);
    }
}

// --- 5. Routing -----------------------------------------------------------

$action = isset($_GET['action']) ? $_GET['action'] : '';
if (!is_string($action)) {
    $action = '';
}
$action = strtolower(trim($action));

// The order follows that of the list shown for an unknown action, below: the
// two are read together, and an action missing here would be refused by the
// message that announces it.
$actions = array('list', 'add', 'resolve', 'text', 'diagnostic', 'backfill');

if (!in_array($action, $actions, true)) {
    // Never an empty body: whoever gets the address wrong must read what they
    // should have written.
    throw new ApFailure(
        ($action === ''
            ? "No action requested."
            : "Unknown action: " . ap_readable_excerpt($action) . ".")
        . "\nAvailable actions:\n"
        . "  ?action=list&project=<id>&index=<index>  the notes of a page (JSON)\n"
        . "  ?action=add                              write a note (POST)\n"
        . "  ?action=resolve                          mark resolved (POST)\n"
        . "  ?action=text&project=<id>                every note (plain text)\n"
        . "  ?action=diagnostic                       state of the server (plain text)\n"
        . "  ?action=backfill&project=<id>            backfill of a 1.2.0 database",
        400);
}

// The configuration is loaded WITHOUT interrupting the diagnostic if it fails.
// A malformed local file throws here; the diagnostic, though, must be able to
// say WHICH and WHY, and that is all one can know from a distance when nothing
// answers any more.
$config = null;
$configError = null;
try {
    $config = ap_config();
} catch (ApFailure $e) {
    $configError = $e->getMessage();
} catch (Exception $e) {
    $configError = "The local configuration file could not be loaded: "
        . get_class($e) . '.';
} catch (Throwable $e) {
    // Syntax error in the local file: since PHP 7, a ParseError in an INCLUDED
    // file is catchable. The raw message is not displayed -- it may carry a
    // fragment of the configuration -- but the fact that there is a syntax
    // error, and in which file, is said.
    ap_log('local configuration unreadable : ' . $e->getMessage());
    $configError = "The file internal/config-local.php contains a PHP syntax error.\n"
        . "The detail is in the server's PHP error log.";
}

// The diagnostic ALWAYS answers: it is precisely what one questions when
// nothing else does. It goes through no origin lock -- it is not called by a
// page, it is called by a human with an address bar, and it never returns a
// note.
if ($action === 'diagnostic') {
    ap_begin_text();
    ap_write_diagnostic($config, ap_version(), $configError);
    exit;
}

// Outside the diagnostic, a configuration that could not be loaded is a failure
// like any other: it is displayed.
if ($configError !== null) {
    throw new ApFailure($configError . "\nSee ?action=diagnostic.", 500);
}

// Tool DROPPED IN but not configured. The safe default is silence, not a
// connection attempted at random: a directory copied onto a site by mistake does
// strictly nothing.
//
// `list` answers 200 with active=false, and the client stands down without a
// word. The other actions keep their explained 404: they are only called by
// hand, by somebody who is looking for why nothing works.
if (!$config['active']) {
    if ($action === 'list') {
        ap_respond_json(array(
            'ok'      => false,
            'active'  => false,
            'tool'    => 'annotepage',
            'format'  => AP_FORMAT,
            'version' => ap_version(),
            'message' => "annotepage is inactive on this server. See ?action=diagnostic.",
        ));
    }
    throw new ApFailure(
        "annotepage is inactive on this server: no internal/config-local.php file.\n"
        . "See ?action=diagnostic.",
        404);
}

// The body cap is checked BEFORE everything else: it is the only refusal that
// costs less than the request it refuses.
ap_check_body_size($config);

// The source of the fields follows the method, not the action: a service action
// in GET reads the query string, a write reads the body. PHP fills $_POST only
// for an urlencoded or multipart body, which is exactly what the client sends.
$input = (strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '') === 'POST')
    ? $_POST : $_GET;

// THE PROJECT, FIRST. It decides everything that follows: which origins are
// admitted, which mode is accepted, which rows are visible.
$id = ap_field_project($input, 'project');
$projects = ap_declared_projects($config);

if (!isset($projects[$id]) && ap_open_registration($config)) {
    // A PUBLIC RELAY. The tag was copied from a web page, nobody declared
    // anything, and that is the whole point -- see `open_registration` in
    // internal/config.php for what it opens and what it costs.
    //
    // Encrypted, always. Never the mode the caller asks for: a public relay
    // that stored plaintext would hand its operator every path, every name and
    // every remark of every site using it.
    //
    // No origin list. Not an empty one -- null, which ap_apply_origin_lock
    // reads as "any". An empty array would refuse everything, and the failure
    // would read as a configuration mistake nobody made.
    $projects[$id] = array(
        'origins' => null,
        'mode'    => 'encrypted',
    );
}

if (!isset($projects[$id])) {
    // Unknown project: same rule as an unconfigured tool. `list` keeps quiet,
    // the others explain.
    //
    // This does tell "declared project" from "unknown project" from the
    // outside, by the origin lock's 403 in one case and this 200 in the other.
    // The leak is nil: the project id is a bearer token, and whoever has it can
    // already read the rows. Whoever does not learns nothing by guessing 128
    // bits.
    if ($action === 'list') {
        ap_respond_json(array(
            'ok'      => false,
            'active'  => false,
            'tool'    => 'annotepage',
            'format'  => AP_FORMAT,
            'version' => ap_version(),
            'message' => "Project unknown to this server. See ?action=diagnostic.",
        ));
    }
    throw new ApFailure(
        "Project unknown to this server: " . ap_short_project($id) . "\n"
        . "Declare it in internal/config-local.php, with its origins.\n"
        . "See ?action=diagnostic.",
        404);
}
$project = $projects[$id];

// THE DOMAIN LOCK. Anti-abuse, and nothing else: see internal/origins.php.
$write = ($action === 'add' || $action === 'resolve' || $action === 'backfill');
ap_apply_origin_lock($config, $id, $project, $write);

// The store receives the backfill id through the configuration: it is the store
// that will attach the format-1 rows when the `project` column appears, and it
// does not have to know what an origin is for that.
$config['backfill_project'] = ap_backfill_project($config);
$store = new ApStore($config);

// RETENTION, opportunistically. There is no scheduled task on the hosting this
// tool targets -- the counter cleanup in store.php already works this way, and
// says why. One write in fifty pays for the sweep: nothing on a quiet server,
// often on a busy one, which is where it matters.
//
// ON WRITES ONLY. Reads are the common path and they grow nothing; making every
// `list` roll a die would spend latency where there is no problem to solve.
//
// BEFORE the write, and it cannot cost a note: expireOlderThan swallows its own
// database errors and returns 0, because a relay that refused a remark over its
// own housekeeping would be worse than one that grows. Running before also means
// the note just written is never a candidate -- the cutoff is days in the past.
if ($write && !empty($config['max_note_age_days']) && mt_rand(1, 50) === 1) {
    $store->expireOlderThan($config['max_note_age_days']);
}

switch ($action) {

    case 'list':
        $index = ap_field_index($input, 'index', true);
        ap_respond_json(ap_response_envelope(array(
            'project' => $id,
            'index'   => $index,
            'notes'   => $store->byPage($id, $index),
        )));
        break;

    case 'add':
        ap_require_post("Writing a note");
        ap_apply_rate_limit($config, $store, $id, 'write');
        ap_check_note_cap($config, $store, $id);
        $mode = ap_field_mode($input, $config, $id, $project);
        $note = ap_note_from_request($input, $config, $store, $id, $mode);
        ap_respond_json(ap_response_envelope(array(
            'project' => $id,
            'note'    => $store->add($note),
        )));
        break;

    case 'resolve':
        /* Marks a note resolved, or undoes that mark.
           With POST, like every write: an action that changes state must not
           start from a link somebody follows or a crawler explores. */
        ap_require_post("Resolving a note");
        ap_apply_rate_limit($config, $store, $id, 'write');
        /* Both fields go through input.php like all the others. They did not in
           the original tool: `id` was cast to an integer right here, and (int)
           on a non-empty ARRAY is 1 -- so `id[]=x` marked note number 1
           resolved, with a 200. Either there is one trust boundary, or there is
           none. */
        $noteId = ap_field_id($input, 'id', 'id');
        /* The note is looked for IN THIS PROJECT. A note id is a counter global
           to the server: without that scope, one project would mark another's
           notes resolved by guessing an integer. */
        $target = $store->note($noteId, $id);
        if ($target === null) {
            throw new ApFailure("Note not found in this project: " . $noteId . ".", 404);
        }
        /* THE MODE COMES FROM THE NOTE, NOT FROM THE REQUEST. It is the only
           place in the code where it is not asked of the client, and that is
           the right answer: a resolution attaches to a note already written,
           whose mode has been fixed ever since. A half-plain, half-encrypted
           database therefore resolves row by row, without anyone having to
           remember what the installation was on the day the remark was
           made. */
        $mode = $target['mode'];
        if ($mode !== 'plain' && $mode !== 'encrypted') {
            throw new ApFailure(
                "This note carries a mode that this version of annotepage does not "
                . "know.\nIt was not modified.", 400);
        }
        /* `resolved=0` reopens. The case exists: a fix believed done and then
           found incomplete must be able to come back into view, without having
           to recreate the remark and lose its thread of replies. */
        $resolved = ap_field_flag($input, 'resolved', true, 'resolved');

        $by = '';
        $fixVersion = '';
        $resolutionPayload = '';
        if ($mode === 'encrypted') {
            /* The fixer's name and the version of the fix are payload: they go
               into a SECOND envelope, with role `resolution`. It has its own
               nonce and it is written later, by somebody else -- melting the two
               together would force re-encrypting a remark nobody is allowed to
               rewrite. */
            $resolutionPayload = ap_field_envelope(
                $input, 'resolution_payload', $config['max_resolution_payload_length'],
                $resolved, 'resolution_payload');
            ap_reject_field($input, 'by', 'by',
                "this project is in encrypted mode, and the fixer's name would travel in "
                . "the clear to the server.");
            ap_reject_field($input, 'version', 'version',
                "this project is in encrypted mode, and the version of the fix would "
                . "travel in the clear to the server.");
        } else {
            /* The name is REQUIRED only to mark a fix: it is what signs it. To
               reopen, it used to be demanded and then thrown away by the store,
               which sets resolved_by back to empty -- we were asking for the
               fixer's name in order to cancel the fix. */
            $by = ap_field($input, 'by', $config['max_author_length'],
                           $resolved, 'by');
            $fixVersion = ap_field($input, 'version',
                                   $config['max_version_length'], false, 'version');
        }

        ap_respond_json(ap_response_envelope(array(
            'project' => $id,
            'note'    => $store->resolve($noteId, $id, $by, $fixVersion,
                                         $resolutionPayload, $resolved),
        )));
        break;

    case 'text':
        ap_apply_rate_limit($config, $store, $id, 'export');
        // The two counting queries are issued BEFORE all(): the streamed walk
        // occupies the connection, and an unreachable database must come out as
        // a 503, not in the middle of an export already started.
        $total = $store->count($id);
        $breakdown = $store->modeBreakdown($id);
        $notes = $store->all($id);
        ap_begin_text();
        ap_write_text_export(ap_version(), $id, $breakdown, $total, $notes,
            isset($config['max_note_age_days']) ? (int) $config['max_note_age_days'] : 0);
        break;

    case 'backfill':
        /* MAINTENANCE. Refused on a relay: a relay never had a 1.2.0 database
           to take over, and this action enumerates page paths IN THE CLEAR --
           which only makes sense where they are already readable, on the site
           under review itself. */
        if (!ap_is_self_hosted($config)) {
            throw new ApFailure(
                "The backfill only exists when self-hosted.\n"
                . "It serves to attach the notes written by `in-context notes` 1.2.0, "
                . "and it enumerates page paths in the clear: that only makes sense on "
                . "the site under review itself.",
                404);
        }
        $attached = $store->attachOrphans();

        $method = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '');
        if ($method !== 'POST') {
            /* State of the backfill: what is left to do, and for which paths.
               The client computes each index -- it has the salt, the server never
               will -- and sends them back one by one. */
            ap_respond_json(ap_response_envelope(array(
                'project'  => $id,
                'attached' => $attached,
                'pages'    => $store->pagesWithoutIndex($id),
            )));
        }

        /* One pair per request. An array of pairs in an urlencoded body would
           need an array syntax, hence a parser, and there is no other one in
           this tool. A review database holds a few dozen pages: a few dozen
           requests, once in the life of the installation. */
        $page = ap_field_page($input, 'page', $config['max_page_length']);
        $index = ap_field_index($input, 'index', true);
        ap_respond_json(ap_response_envelope(array(
            'project'   => $id,
            'attached'  => $attached,
            'page'      => $page,
            'index'     => $index,
            'updated'   => $store->assignIndex($id, $page, $index),
            'remaining' => count($store->pagesWithoutIndex($id)),
        )));
        break;
}
