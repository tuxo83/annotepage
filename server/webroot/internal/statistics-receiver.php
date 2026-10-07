<?php
/**
 * statistics-receiver.php -- THE OTHER END OF THE STATISTICS.
 *
 * Every annotepage server tells one address, once a day, how much it carries
 * (statistics.php, beside this file, is the whole of what they send). This
 * file is what answers at that address: it keeps one row per server -- what
 * that server declared, as far as the bounds below let it be believed -- and
 * gives the sum to anybody who asks.
 *
 *   GET  stats.php           {"instances": n, "active": n, "projects": n,
 *                             "notes": n, "pages": n, "as_of": "..."}
 *   GET  stats.php?history   {"days": [{"day": "2026-01-31", ...the five}, ...]}
 *   POST stats.php           id, version, projects, notes, pages -- one
 *                            declaration; answered with the sum of the day
 *                            before, which the server that declared shows
 *                            its readers
 *
 * IT IS ON EVERY SERVER AND IT ANSWERS ON ONE. Like everything in internal/,
 * no request reaches this file: called directly it is a 404. What calls it is
 * stats.php -- a few lines, written beside api.php by the one server that
 * has proved the receiving address leads to it (statistics.php, WHICH SERVER
 * RECEIVES) and by no other. And a door put somewhere by hand opens onto the
 * same refusal: this file asks again, itself, whether this server is the
 * receiver, and answers 404 when it is not.
 *
 * WHAT IS KEPT, AND THE LIST IS CLOSED. Per declaring server: the identifier
 * it drew at random, its version, its three totals, and the DAY of its first
 * and of its last declaration -- the day and not the second. Nothing else
 * exists to keep: a declaration carries no domain, no project id, no path.
 * It is kept where the notes are, in the table the store calls its memory,
 * one row per server: no file to create, no directory to make writable.
 *
 * THE TOTALS NEVER GO DOWN. They count what was ever carried, and what was
 * carried stays carried: a server that stops declaring keeps its numbers in
 * the sum, and a server that declares less than before -- a database emptied
 * -- keeps what it had said. `instances` is every server ever heard from;
 * `active` is those heard from in the last thirty days, and is the one figure
 * here that can fall.
 *
 * AND EACH DAY'S SUM IS KEPT, one row a day and for good: the five figures of
 * the sum as they stood the last time it was counted that day. That is what
 * lets anybody say how many notes, sites and servers there were on a given
 * date, and draw how it grew. It is a sum and nothing under it: no identifier,
 * no version, nothing about where a declaration came from -- a row that could
 * not name a server on the day it was written cannot name one a year later.
 * A day on which nobody declared and nobody asked has no row; the totals of
 * that day are those of the row before it.
 *
 * THE HISTORY IS GIVEN OUT ONLY FOR DAYS THAT COUNTED ENOUGH SERVERS. Between
 * two rows of a handful of servers, the difference is one server's day; kept
 * and published for good, that would say of somebody, years later, what
 * nobody was watching for at the time. Under HISTORY_FLOOR servers a day's
 * row is kept and not listed.
 *
 * A DECLARATION IS ANSWERED WITH YESTERDAY'S SUM, NOT WITH THE ONE IT HAS JUST
 * ENTERED. The server that declares shows that answer to its readers; were it
 * the sum of that very instant, it would be a mark of the moment that server
 * declared -- and whoever watches the public sum could read, at that moment,
 * what one named site's server had added. The last count of the day before is
 * the same for everybody who declares today, and marks nobody.
 *
 * THE NUMBERS ARE DECLARED, SO THEY CAN BE LIED ABOUT, and nothing here can
 * check a total against a database it never sees. What it does is make a lie
 * slow, and say how slow:
 *
 *   ONE ROW PER SERVER, AND ONE DECLARATION A DAY. A declaration replaces the
 *     previous one from the same identifier; a second one the same day changes
 *     nothing. Sending it a thousand times counts once.
 *   A NEW IDENTIFIER IS RATIONED. A handful a day from one network, and a
 *     ceiling a day for everybody together. Past either, 429.
 *   A ROW STARTS SMALL AND GROWS BY A FIXED STEP. The first declaration is
 *     clipped to the FIRST ceilings, and each later one may add at most one
 *     GROWTH -- one, however long the row was silent. A real server of a few
 *     thousand notes is whole within a month; a very large one takes longer,
 *     and is under-counted until then.
 *   THERE IS A LAST ROW. Past MAX_ROWS, rows silent for more than a month are
 *     folded into one running total -- their numbers stay in the sum, their
 *     identifiers are forgotten -- and if none can be folded, a new
 *     identifier is refused.
 *
 * WHAT THAT LEAVES OPEN, IN NUMBERS, because a bound nobody computed is a
 * hope. Somebody holding 67 networks can take every new identifier of a day:
 * 200 rows a day, each worth FIRST at once -- 200,000 invented notes the first
 * day, and real servers refused that day. The rows fill in 25 days, and from
 * then on 5,000 rows gain GROWTH a day: a million notes a day, some 350
 * million in a year. NOTHING REMOVES THEM ON THEIR OWN, which is the price of
 * totals that never fall: the remedy is a person deleting what was made up.
 * The page that shows these numbers should say "declared", not "measured".
 *
 * THIS SERVER'S OWN NOTES ARE COUNTED DIRECTLY, not declared: it can read its
 * own database, so its totals are exact and none of the clipping applies.
 *
 * THE ADDRESS IS NOT KEPT. Rationing new identifiers needs to know that two
 * requests came from the same place, for one day. What is written for that
 * is 16 BITS of a keyed digest of the NETWORK the request came from (a /24,
 * or a /64 for IPv6) -- one bucket out of 65,536, shared by hundreds of
 * networks -- beside a count, and beside no row. With the key in the same
 * table, a full digest would give the address back to whoever holds it, by
 * trying them all; sixteen bits give back a list too long to name anybody.
 * The key and the buckets are thrown away on the first request of any kind
 * that arrives on a later day.
 * THAT IS A STATEMENT ABOUT THIS TABLE. The web server in front of this file
 * logs what web servers log, the address of every request included, and
 * whoever holds both that log and this table can pair a new row with a line
 * of it on a quiet day. Nothing here can prevent that.
 *
 * TWO REQUESTS AT ONCE. A row is written whole, by one statement, so two
 * declarations never mix. The counters are read and then written, and so is
 * the folding: requests arriving in the same instant can each pass a ration
 * that had room for one -- measured, twenty-one through a ceiling of three
 * under forty at a time -- and can each fold the same silent rows, counting
 * them twice in the running total. So the ceilings are what holds against
 * requests that arrive one after another; against a burst they are softer by
 * about its width, and the numbers above are softer with them. No lock is
 * held across a database nobody else waits for: these are declared numbers,
 * and the honest thing to say about them is that they can be pushed.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

/** A new identifier: how many a day from one network, and from everybody. */
define('AP_STATS_NEW_PER_NETWORK', 3);
define('AP_STATS_NEW_PER_DAY', 200);
/** What a first declaration is clipped to. */
define('AP_STATS_FIRST_PROJECTS', 10);
define('AP_STATS_FIRST_NOTES', 1000);
define('AP_STATS_FIRST_PAGES', 200);
/** What one later declaration may add -- one a day at most. */
define('AP_STATS_GROWTH_PROJECTS', 2);
define('AP_STATS_GROWTH_NOTES', 200);
define('AP_STATS_GROWTH_PAGES', 50);
/** Days without a declaration before a server stops counting as active. */
define('AP_STATS_ACTIVE_DAYS', 30);
/** Rows kept before silent ones are folded into the running total. */
define('AP_STATS_MAX_ROWS', 5000);
/** Seconds this server's own count may be reused. */
define('AP_STATS_OWN_EVERY', 3600);
/** Seconds a computed sum may be reused, and a public answer cached. */
define('AP_STATS_SUM_EVERY', 300);
/** A declaration is five short fields. */
define('AP_STATS_MAX_BODY', 1024);

/* The names in the store's memory. `s:` and `b:` are prefixes: one row per
   declaring server, one row per bucket of the day. */
define('AP_STATS_ROW', 's:');
define('AP_STATS_BUCKET', 'b:');
define('AP_STATS_DAY', 'statistics-day');
define('AP_STATS_RETIRED', 'statistics-retired');
define('AP_STATS_OWN', 'statistics-own');
define('AP_STATS_SUM', 'statistics-sum');
/** One row per day, `h:2026-01-31`: the sum as last counted that day. */
define('AP_STATS_HISTORY', 'h:');
/** How many days one answer of the history carries, the latest ones. */
define('AP_STATS_HISTORY_DAYS', 400);
/** Servers a day must count before its row is given out: see THE HISTORY. */
define('AP_STATS_HISTORY_FLOOR', 10);
/* The last count of the current day, and the last count of the day before
   it that had one: what a declaration is answered with. */
define('AP_STATS_LAST', 'statistics-last');
define('AP_STATS_CLOSED', 'statistics-closed');

require __DIR__ . '/errors.php';
ap_install_handlers();
ob_start();
require __DIR__ . '/config.php';
require __DIR__ . '/rate-limit.php';
require __DIR__ . '/statistics.php';

/** Leaves, in plain text unless told otherwise. Every way out goes here. */
function ap_stats_leave($status, $text, array $headers = array())
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Content-Type-Options: nosniff');
    if (!$headers) {
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
    }
    foreach ($headers as $line) {
        header($line);
    }
    echo $text;
    exit;
}

/* THE SENTENCES OF api.php ARE ABOUT NOTES, and an uncaught failure here would
   borrow them: "your notes may not have been saved", on an address that saves
   none. This file says its own. */
set_exception_handler(function ($e) {
    ap_log('statistics: ' . $e->getMessage());
    ap_stats_leave(503, "The statistics are not available.\n");
});

/** The same answer as a file that is not there. */
function ap_stats_absent()
{
    ap_stats_leave(404, '');
}

/** Today, or a day counted back from it, as the rows write days. */
function ap_stats_day($now, $back = 0)
{
    return gmdate('Y-m-d', $now - $back * 86400);
}

/** One remembered thing, decoded: an array, or $otherwise. */
function ap_stats_recall($store, $name, array $otherwise)
{
    $decoded = json_decode((string) $store->remembered($name), true);
    return is_array($decoded) ? array_merge($otherwise, $decoded) : $otherwise;
}

/** One row as it is kept: short names, because the column is short. */
function ap_stats_row_text(array $row)
{
    return json_encode(array('f' => $row['first'], 'l' => $row['last'], 'v' => $row['version'],
        'p' => (int) $row['projects'], 'n' => (int) $row['notes'], 'g' => (int) $row['pages']));
}

/** And as it is read back, or null when it is not one. */
function ap_stats_row($text)
{
    $kept = json_decode((string) $text, true);
    if (!is_array($kept) || !isset($kept['f'], $kept['l'], $kept['p'], $kept['n'], $kept['g'])) {
        return null;
    }
    return array('first' => (string) $kept['f'], 'last' => (string) $kept['l'],
        'version' => isset($kept['v']) ? (string) $kept['v'] : '',
        'projects' => (int) $kept['p'], 'notes' => (int) $kept['n'], 'pages' => (int) $kept['g']);
}

/**
 * The network a request came from, as text: a /24, or a /64 for IPv6.
 *
 * NOT THE ADDRESS. One machine holds a whole /64 and often a whole /24, so
 * rationing by address rations nothing; and the less of the address goes into
 * the digest, the less the digest can say about it.
 */
function ap_stats_network($address)
{
    $packed = @inet_pton((string) $address);
    if ($packed === false) {
        return 'unknown';
    }
    if (strlen($packed) === 4) {
        return bin2hex(substr($packed, 0, 3));
    }
    // An IPv4 address written the IPv6 way is still that IPv4 network.
    if (substr($packed, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
        return bin2hex(substr($packed, 12, 3));
    }
    return bin2hex(substr($packed, 0, 8));
}

/** One field of a declaration: digits only, and not many of them. */
function ap_stats_number($name)
{
    $raw = isset($_POST[$name]) && is_string($_POST[$name]) ? $_POST[$name] : '';
    if (!preg_match('/^[0-9]{1,9}\z/', $raw)) {
        ap_stats_leave(400, "`" . $name . "` has to be a whole number.\n");
    }
    return (int) $raw;
}

/** Every kept row, id => row. Rows that are not what this writes are skipped. */
function ap_stats_rows($store)
{
    $rows = array();
    foreach ($store->rememberedLike(AP_STATS_ROW) as $name => $text) {
        $row = ap_stats_row($text);
        if ($row !== null) {
            $rows[substr($name, strlen(AP_STATS_ROW))] = $row;
        }
    }
    return $rows;
}

/**
 * Room for one more row, made if it can be: rows silent for longer than
 * ACTIVE_DAYS are folded into the running total. Their numbers stay in every
 * sum; their identifiers and their dates are forgotten.
 *
 * @return bool is there room now?
 */
function ap_stats_make_room($store, $now)
{
    $rows = ap_stats_rows($store);
    if (count($rows) < AP_STATS_MAX_ROWS) {
        return true;
    }
    $limit = ap_stats_day($now, AP_STATS_ACTIVE_DAYS);
    $retired = ap_stats_recall($store, AP_STATS_RETIRED,
        array('instances' => 0, 'projects' => 0, 'notes' => 0, 'pages' => 0));
    $left = count($rows);
    foreach ($rows as $id => $row) {
        if ($row['last'] >= $limit) {
            continue;
        }
        // THE TOTAL FIRST, THEN THE ROW. Interrupted between the two, a
        // server is counted twice until somebody looks; the other order
        // would lose what it carried, and totals here do not go down.
        $retired['instances'] += 1;
        $retired['projects'] += $row['projects'];
        $retired['notes'] += $row['notes'];
        $retired['pages'] += $row['pages'];
        if (!$store->remember(AP_STATS_RETIRED, json_encode($retired))) {
            break;
        }
        $store->forget(AP_STATS_ROW . $id);
        $left -= 1;
    }
    return $left < AP_STATS_MAX_ROWS;
}

/** What this server holds itself, or null when it could not be counted. */
function ap_stats_count_own($store)
{
    try {
        $counted = method_exists($store, 'serverTotals') ? $store->serverTotals() : null;
        if (!is_array($counted)) {
            return null;
        }
        return array(
            'projects' => (int) $counted['projects'],
            'notes'    => (int) $counted['notes'] + (int) $counted['expired_notes'],
            'pages'    => (int) $counted['pages'] + (int) $counted['expired_pages'],
        );
    } catch (Throwable $e) {
        ap_log('statistics: own totals: ' . $e->getMessage());
        return null;
    }
}

/**
 * The sum, counted or recalled: instances, active, projects, notes, pages, at.
 *
 * NOT COUNTED ON EVERY REQUEST. This address is public and unauthenticated,
 * and counting reads every row: the sum is kept for a few minutes, and a
 * declaration that changes it throws the kept one away.
 */
function ap_stats_sum($store, $now)
{
    $sum = ap_stats_recall($store, AP_STATS_SUM, array());
    if (isset($sum['at'], $sum['instances']) && $now - (int) $sum['at'] < AP_STATS_SUM_EVERY) {
        return $sum;
    }
    /* THIS SERVER, COUNTED AND NOT DECLARED -- and less often still: the count
       walks the whole notes table (see `publish_server_totals` in config.php
       for what that costs). A count that failed leaves the last one standing
       rather than a row of zeros. */
    $own = ap_stats_recall($store, AP_STATS_OWN, array('at' => 0, 'projects' => 0, 'notes' => 0, 'pages' => 0));
    if ($now - (int) $own['at'] >= AP_STATS_OWN_EVERY) {
        $counted = ap_stats_count_own($store);
        $own = array_merge($own, $counted === null ? array() : $counted, array('at' => $now));
        $store->remember(AP_STATS_OWN, json_encode($own));
    }
    $retired = ap_stats_recall($store, AP_STATS_RETIRED,
        array('instances' => 0, 'projects' => 0, 'notes' => 0, 'pages' => 0));
    $activeSince = ap_stats_day($now, AP_STATS_ACTIVE_DAYS);
    // Itself included, once it holds a note -- the rule every other server
    // applies before declaring anything.
    $counts = (int) $own['notes'] > 0 ? 1 : 0;
    $sum = array(
        'at'        => $now,
        'instances' => $counts + (int) $retired['instances'],
        'active'    => $counts,
        'projects'  => (int) $own['projects'] + (int) $retired['projects'],
        'notes'     => (int) $own['notes'] + (int) $retired['notes'],
        'pages'     => (int) $own['pages'] + (int) $retired['pages'],
    );
    foreach (ap_stats_rows($store) as $row) {
        $sum['instances'] += 1;
        $sum['active'] += $row['last'] >= $activeSince ? 1 : 0;
        $sum['projects'] += $row['projects'];
        $sum['notes'] += $row['notes'];
        $sum['pages'] += $row['pages'];
    }
    $store->remember(AP_STATS_SUM, json_encode($sum));
    $today = ap_stats_day($now);
    $last = ap_stats_recall($store, AP_STATS_LAST, array());
    /* A REQUEST THAT BEGAN BEFORE MIDNIGHT AND COUNTS AFTER ANOTHER HAS OPENED
       THE NEW DAY writes nothing about days: its clock is yesterday's, and it
       would close the new day as if it were over and put yesterday back. */
    if (isset($last['day']) && is_string($last['day']) && $last['day'] > $today) {
        return $sum;
    }
    /* THE DAY BEFORE IS CLOSED WHEN A NEW ONE IS FIRST COUNTED: what was the
       last count until now becomes the sum declarations are answered with,
       all day. Then this count takes its place. */
    /* ONCE FOR A DAY, AND NOT AGAIN: two requests astride midnight can each
       read the last count before the other writes, and the second would close
       the day a second time with other numbers -- so that the first server
       answered that day would hold a sum nobody else was given. */
    $closed = ap_stats_recall($store, AP_STATS_CLOSED, array());
    if (isset($last['day'], $last['i'], $last['p'], $last['n']) && $last['day'] < $today
        && !(isset($closed['for']) && is_string($closed['for']) && $closed['for'] >= $today)) {
        $last['for'] = $today;
        $store->remember(AP_STATS_CLOSED, json_encode($last));
        if (function_exists('ap_statistics_keep_world')) {
            // What this server shows its own readers: the same closed day.
            ap_statistics_keep_world($store, array('instances' => (int) $last['i'],
                'projects' => (int) $last['p'], 'notes' => (int) $last['n']), $now);
        }
    }
    $store->remember(AP_STATS_LAST, json_encode(array('day' => $today,
        'i' => $sum['instances'], 'p' => $sum['projects'], 'n' => $sum['notes'])));
    /* AND THE DAY'S ROW OF THE HISTORY, written over at each count: what a
       day keeps is its last count. Short names, as the rows of the servers
       have: i, a, p, n, g. */
    $store->remember(AP_STATS_HISTORY . ap_stats_day($now), json_encode(array(
        'i' => $sum['instances'], 'a' => $sum['active'], 'p' => $sum['projects'],
        'n' => $sum['notes'], 'g' => $sum['pages'])));
    return $sum;
}

/** What a declaration is answered with: the word, and the sum beside it. */
function ap_stats_answered($store, $now, $word)
{
    $said = array('result' => $word);
    try {
        // Counted, so that the day's row holds this declaration; answered
        // with the day before -- and with the word alone while there is none.
        ap_stats_sum($store, $now);
        $closed = ap_stats_recall($store, AP_STATS_CLOSED, array());
        if (isset($closed['i'], $closed['p'], $closed['n'])) {
            $said['instances'] = (int) $closed['i'];
            $said['projects'] = (int) $closed['p'];
            $said['notes'] = (int) $closed['n'];
            // And the day it is HERE: the server that declared keeps the sum
            // to show from the day after, and a clock of its own that is
            // behind this one must not make that day come early.
            $said['day'] = ap_stats_day($now);
        }
    } catch (Throwable $e) {
        // The declaration was kept, and that is the answer; the sum is a
        // courtesy, and a server that gets none shows none.
        ap_log('statistics: sum for a declaration: ' . $e->getMessage());
    }
    ap_stats_leave(200, json_encode($said) . "\n", array(
        'Content-Type: application/json; charset=utf-8', 'Cache-Control: no-store'));
}

// --- Who may be answered at all ---------------------------------------------

try {
    $config = ap_config();
} catch (Throwable $e) {
    // A configuration this cannot read is api.php's to explain, not ours.
    ap_stats_absent();
}
if (empty($config['active'])) {
    ap_stats_absent();
}
ap_require_https();
try {
    ap_require_store($config);
    $store = new ApStore($config);
} catch (Throwable $e) {
    ap_log('statistics: ' . $e->getMessage());
    ap_stats_leave(503, "The statistics are not available.\n");
}
foreach (array('remembered', 'remember', 'rememberedLike', 'forget') as $needed) {
    if (!method_exists($store, $needed)) {
        ap_stats_absent();   // a store older than this file: not a receiver
    }
}
/* THE DOOR IS NOT WHAT DECIDES. A stats.php can be copied anywhere; whether
   this server receives is what it proved, or what its configuration says --
   asked here, of the same function the sender asks before it stands down. */
if (!ap_statistics_receives($config, $store)) {
    ap_stats_absent();
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$now = time();
$today = ap_stats_day($now);

/* YESTERDAY'S KEY AND BUCKETS GO, on the first request of a later day -- a
   declaration or somebody reading the sum, whichever comes first. They were
   kept to know that two requests came from one place DURING a day; after it
   they would only be something about addresses that is still lying around. */
$day = ap_stats_recall($store, AP_STATS_DAY, array('date' => '', 'key' => '', 'new' => 0));
if ($day['date'] !== $today) {
    foreach ($store->rememberedLike(AP_STATS_BUCKET) as $name => $ignored) {
        $store->forget($name);
    }
    if ($day['date'] !== '') {
        $store->forget(AP_STATS_DAY);
    }
    $day = array('date' => '', 'key' => '', 'new' => 0);
}

// --- A declaration ---------------------------------------------------------

if ($method === 'POST') {
    // The length is ASKED FOR, not trusted to be absent: a body sent in
    // pieces carries none, and would be read whole before anything said no.
    if (!isset($_SERVER['CONTENT_LENGTH']) || !preg_match('/^[0-9]+\z/', (string) $_SERVER['CONTENT_LENGTH'])) {
        ap_stats_leave(411, "A declaration says how long it is.\n");
    }
    if ((int) $_SERVER['CONTENT_LENGTH'] > AP_STATS_MAX_BODY) {
        ap_stats_leave(413, "A declaration is five short fields.\n");
    }
    $id = isset($_POST['id']) && is_string($_POST['id']) ? $_POST['id'] : '';
    if (!preg_match('/^[A-Za-z0-9_-]{22}\z/', $id)) {
        ap_stats_leave(400, "`id` has to be 22 characters, as a server draws them.\n");
    }
    $version = isset($_POST['version']) && is_string($_POST['version']) ? $_POST['version'] : '';
    if (!preg_match('/^[0-9A-Za-z.+-]{1,32}\z/', $version)) {
        ap_stats_leave(400, "`version` is not a version.\n");
    }
    $declared = array(
        'projects' => ap_stats_number('projects'),
        'notes'    => ap_stats_number('notes'),
        'pages'    => ap_stats_number('pages'),
    );
    /* ITS OWN DECLARATION IS NOT ONE. This server counts itself, and does not
       declare -- but at its very first proof, a request that started before
       the answer was known can still declare, to the door that has just been
       written: measured, three bursts in eight. Recorded, this server would
       be in the sum twice for ever, since nothing removes a row. What it
       drew as its own identifier is in its own memory, so it knows. */
    $mine = ap_statistics_memory($store);
    if ($mine !== null && $mine['id'] !== '' && hash_equals($mine['id'], $id)) {
        ap_stats_answered($store, $now, 'kept');
    }
    $known = ap_stats_row($store->remembered(AP_STATS_ROW . $id));

    if ($known !== null && $known['last'] === $today) {
        // Heard today already. Not an error -- a server restarted, or two of
        // its requests crossed -- and nothing is written.
        ap_stats_answered($store, $now, 'kept');
    }

    if ($known === null) {
        // The first new server of the day draws the day's key.
        if ($day['date'] !== $today || !is_string($day['key']) || strlen($day['key']) !== 32) {
            $day = array('date' => $today, 'key' => bin2hex(random_bytes(16)), 'new' => 0);
        }
        $network = ap_stats_network(ap_client_address($config));
        $bucket = AP_STATS_BUCKET . substr(hash_hmac('sha256', $network, $day['key']), 0, 4);
        $seen = explode('|', (string) $store->remembered($bucket));
        $from = count($seen) === 2 && $seen[0] === $today ? (int) $seen[1] : 0;
        if ($from >= AP_STATS_NEW_PER_NETWORK || (int) $day['new'] >= AP_STATS_NEW_PER_DAY
            || !ap_stats_make_room($store, $now)) {
            // Nothing is written for a refusal: a flood of made-up
            // identifiers must not buy a write each.
            ap_stats_leave(429, "Too many new servers declared today. Tomorrow is another day.\n");
        }
        $day['new'] = (int) $day['new'] + 1;
        $store->remember(AP_STATS_DAY, json_encode($day));
        $store->remember($bucket, $today . '|' . ($from + 1));
        $row = array(
            'first'    => $today,
            'projects' => min($declared['projects'], AP_STATS_FIRST_PROJECTS),
            'notes'    => min($declared['notes'], AP_STATS_FIRST_NOTES),
            'pages'    => min($declared['pages'], AP_STATS_FIRST_PAGES),
        );
    } else {
        /* ONE STEP, HOWEVER LONG IT WAS SILENT -- a row left alone for a
           month does not come back with a month of credit -- AND NEVER
           DOWN: what a server carried, it carried. */
        $step = function ($name, $growth) use ($declared, $known) {
            return max($known[$name], min($declared[$name], $known[$name] + $growth));
        };
        $row = array(
            'first'    => $known['first'],
            'projects' => $step('projects', AP_STATS_GROWTH_PROJECTS),
            'notes'    => $step('notes', AP_STATS_GROWTH_NOTES),
            'pages'    => $step('pages', AP_STATS_GROWTH_PAGES),
        );
    }
    $row['last'] = $today;
    $row['version'] = $version;
    if (!$store->remember(AP_STATS_ROW . $id, ap_stats_row_text($row))) {
        ap_stats_leave(503, "The declaration could not be kept.\n");
    }
    $store->forget(AP_STATS_SUM);   // counted again, this declaration in it
    ap_stats_answered($store, $now, 'recorded');
}

if ($method !== 'GET' && $method !== 'HEAD') {
    ap_stats_leave(405, "GET reads the totals, POST declares.\n", array(
        'Content-Type: text/plain; charset=utf-8', 'Cache-Control: no-store', 'Allow: GET, HEAD, POST'));
}

// --- The sum ---------------------------------------------------------------

/* THE HISTORY, when it is what was asked for: the days in order, the latest
   ones. Every row is a sum this address has already given to whoever asked
   that day. */
if (isset($_GET['history'])) {
    ap_stats_sum($store, $now);   // today has its row before it is listed
    $days = array();
    foreach ($store->rememberedLike(AP_STATS_HISTORY) as $name => $text) {
        $date = substr($name, strlen(AP_STATS_HISTORY));
        $kept = json_decode((string) $text, true);
        if (!preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}\z/', $date) || !is_array($kept)
            || !isset($kept['i'], $kept['a'], $kept['p'], $kept['n'], $kept['g'])
            || (int) $kept['i'] < AP_STATS_HISTORY_FLOOR) {
            continue;
        }
        $days[$date] = array('day' => $date, 'instances' => (int) $kept['i'], 'active' => (int) $kept['a'],
            'projects' => (int) $kept['p'], 'notes' => (int) $kept['n'], 'pages' => (int) $kept['g']);
    }
    ksort($days);
    $days = array_slice(array_values($days), -AP_STATS_HISTORY_DAYS);
    ap_stats_leave(200, $method === 'HEAD' ? '' : json_encode(array('days' => $days)) . "\n", array(
        'Content-Type: application/json; charset=utf-8',
        'Cache-Control: public, max-age=' . AP_STATS_SUM_EVERY,
        'Access-Control-Allow-Origin: *',
    ));
}

$sum = ap_stats_sum($store, $now);
$answer = array(
    'instances' => (int) $sum['instances'],
    'active'    => (int) $sum['active'],
    'projects'  => (int) $sum['projects'],
    'notes'     => (int) $sum['notes'],
    'pages'     => (int) $sum['pages'],
    'as_of'     => gmdate('Y-m-d\TH:i:s\Z', (int) $sum['at']),
);

/* PUBLIC, AND MEANT TO BE SHOWN ON A PAGE SERVED FROM ELSEWHERE: the star is
   right here and nowhere else in this server. There is no credential to
   protect and nothing in the answer that is anybody's -- five numbers and the
   moment they were counted. */
ap_stats_leave(200, $method === 'HEAD' ? '' : json_encode($answer) . "\n", array(
    'Content-Type: application/json; charset=utf-8',
    'Cache-Control: public, max-age=' . AP_STATS_SUM_EVERY,
    'Access-Control-Allow-Origin: *',
));
