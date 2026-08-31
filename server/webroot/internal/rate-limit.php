<?php
/**
 * rate-limit.php -- RATE LIMITING AND SIZE CAPS.
 *
 * A public relay will see abuse from day one. This file holds the POLICY; the
 * counting itself is in the store, which is the only thing that talks to the
 * database. The split is not decorative: it makes it possible to change one's
 * mind about what is limited without touching how it is counted, and the other
 * way round.
 *
 * WHAT IS COUNTED, AND WHAT IS NOT
 *
 * Counted: WRITES (add, resolve) and EXPORTS (text).
 * Not counted: `list`. Counting it would cost one database write per page load,
 * to defend against a request that makes nothing grow and whose cost is bounded
 * by what it can return. The abuse that matters is the one that fills the
 * database, and the one that drains a whole project in a loop; those two are
 * the ones that are bounded.
 *
 * A consequence to write down rather than hide: a loop of `list` on a known
 * page index is bounded by nothing here. It returns only one page's notes,
 * encrypted if the project is, but it does consume server. If that ever became
 * a problem, the answer would be a request cap in front of PHP, not a database
 * counter on every read.
 *
 * TWO COUNTERS, NOT ONE
 *
 *  - PER ADDRESS: stops a single machine from filling the database, whatever
 *    project it aims at;
 *  - PER PROJECT: stops one project, even from a thousand addresses, from
 *    taking the relay to itself. It is the counter that holds when the abuse is
 *    distributed, and the only one whose value the operator can see.
 *
 * WHEN THE COUNTER ITSELF IS BROKEN
 *
 * A limit that vanishes at the first error is not a limit. But refusing every
 * write from an internal site because a secondary table is missing is a
 * manufactured outage. The rule decides by what there is to lose:
 *   - RELAY: we refuse. A relay with no counter is a relay that will be
 *     filled, and the operator answers for it.
 *   - SELF-HOSTED: we let it through, and log it. The notes are behind the same
 *     access restriction as the site under review; abuse there is far less
 *     likely than the interruption.
 *
 * FIXED WINDOW, not sliding. A sliding window needs a timestamp per event,
 * hence one row per write: a counter that grows faster than what it protects.
 * The price of the fixed window is known: astride two windows, one can write
 * twice the limit. For a review tool, that has no consequence.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

/**
 * Body size cap, checked on Content-Length.
 *
 * BEFORE any field is read: without it, a body of several megabytes would be
 * received in full and parsed by PHP before being refused field by field. It is
 * the only refusal that costs less than the attack.
 *
 * Content-Length is declarative and can lie: this cap does not replace PHP's
 * `post_max_size` limit, it doubles it with a readable message instead of an
 * empty and unexplainable $_POST.
 */
function ap_check_body_size(array $config)
{
    $cap = (int) $config['max_body_bytes'];
    if ($cap <= 0 || !isset($_SERVER['CONTENT_LENGTH'])) {
        return;
    }
    $size = (int) $_SERVER['CONTENT_LENGTH'];
    if ($size > $cap) {
        throw new ApFailure(
            "The request body is " . $size . " bytes; the limit is "
            . $cap . ".\nNothing was saved.",
            413);
    }
}

/**
 * The client's address, as this server can know it.
 *
 * REMOTE_ADDR by default, and that is a default, not an oversight: behind a
 * proxy, REMOTE_ADDR is the proxy's, and every client then shares a single
 * counter. This is fixed by declaring `client_ip_header`, NEVER by trusting a
 * header by default -- a header the client writes itself makes the limit
 * bypassable in one line.
 */
function ap_client_address(array $config)
{
    $header = isset($config['client_ip_header']) ? $config['client_ip_header'] : null;
    if (is_string($header) && $header !== ''
        && isset($_SERVER[$header]) && is_string($_SERVER[$header])) {
        // X-Forwarded-For carries a LIST; the first entry is the original
        // client as the proxy saw it.
        $parts = explode(',', $_SERVER[$header]);
        $first = trim($parts[0]);
        if ($first !== '') {
            return $first;
        }
    }
    return isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : 'unknown';
}

/**
 * Counting key: a digest, never the value.
 *
 * This is NOT anonymisation -- the IPv4 address space is enumerated in a few
 * minutes, and whoever has the table can recover the address. It is hygiene:
 * the notes database must not hold, in the clear, a second list of the
 * addresses of those who annotate. The web server already keeps one, that is
 * its job; this one has no reason to exist.
 */
function ap_rate_key($scope, $value)
{
    return $scope . ':' . substr(hash('sha256', (string) $value), 0, 40);
}

/**
 * Applies rate limiting for a given action.
 *
 * @param string $action 'write' or 'export'
 */
function ap_apply_rate_limit(array $config, $store, $id, $action)
{
    $duration = (int) $config['rate_window_seconds'];
    if ($duration <= 0) {
        return;
    }
    $window = (int) floor(time() / $duration);

    $limits = array();
    if ($action === 'write') {
        $limits[] = array('ip',
            ap_rate_key('w-ip', ap_client_address($config)),
            (int) $config['rate_writes_per_ip'],
            "too many writes from this machine");
        $limits[] = array('project',
            ap_rate_key('w-pr', $id),
            (int) $config['rate_writes_per_project'],
            "too many writes on this project");
    } else {
        $limits[] = array('ip',
            ap_rate_key('x-ip', ap_client_address($config)),
            (int) $config['rate_exports_per_ip'],
            "too many exports requested from this machine");
    }

    foreach ($limits as $limit) {
        list($scope, $key, $cap, $sentence) = $limit;
        if ($cap <= 0) {
            continue;
        }
        try {
            $count = $store->consumeRate($key, $window);
        } catch (ApFailure $e) {
            // See the header: we refuse on a relay, we let it through when
            // self-hosted. In both cases we log it, because a broken counter
            // always ends up being discovered too late.
            ap_log('rate counter unavailable (' . $scope . ')');
            if (ap_is_self_hosted($config)) {
                return;
            }
            throw $e;
        }
        if ($count > $cap) {
            // Retry-After: the second the current window ends. A client that
            // retries at once only increments the counter, which pushes the end
            // of its punishment back by as much -- it is up to it to read the
            // header.
            $left = ($window + 1) * $duration - time();
            if (!headers_sent()) {
                header('Retry-After: ' . max(1, $left));
            }
            throw new ApFailure(
                "Too many requests: " . $sentence . ".\n"
                . "The limit is " . $cap . " per " . $duration
                . " seconds. Try again in " . max(1, $left) . " seconds.\n"
                . "Nothing was saved; the text you typed is not lost.",
                429);
        }
    }
}

/**
 * Cap on notes per project.
 *
 * FORMAT.md section 8.6 leaves quota and retention OPEN: this cap is therefore
 * a tool, not a policy. It is 0 -- no limit -- by default, it erases nothing, it
 * expires nothing. It refuses the write beyond and says so, which beats a relay
 * that grows until the host decides in its operator's place.
 */
function ap_check_note_cap(array $config, $store, $id)
{
    $cap = (int) $config['max_notes_per_project'];
    if ($cap <= 0) {
        return;
    }
    if ($store->count($id) >= $cap) {
        throw new ApFailure(
            "This project has reached the cap of " . $cap . " notes set by this "
            . "server's operator.\n"
            . "No note was erased: it is the write that is refused.\n"
            . "Nothing was saved; the text you typed is not lost.",
            403);
    }
}
