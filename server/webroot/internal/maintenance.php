<?php
/**
 * maintenance.php -- THE HOUSEKEEPING THIS SERVER CANNOT DO ON ITS OWN.
 *
 * TWO THINGS, both of which need a moment when nobody is waiting: it brings
 * the STORAGE in line with the code -- a table written by an older version
 * bounds its columns, and widening one rebuilds it -- and then it applies
 * RETENTION. The first is done once and never again; the second is the reason
 * this file was written, and what the rest of this header is about.
 *
 * WHY IT EXISTS, AND IT IS A PROMISE THAT WAS NOT BEING KEPT. A server with
 * `max_note_age_days` set tells everybody so: the client says it in the panel
 * on every annotated page, the installer says it on its last screen, and every
 * export carries it in its header. What actually swept was one line in api.php
 * -- on a WRITE, one time in fifty. On a busy relay that is often enough. On a
 * team's own server, quiet for a week, and above all on a project nobody comes
 * back to -- which is exactly the case retention exists for -- nothing expired,
 * ever, while three places went on announcing that it did.
 *
 * A sampled sweep cannot keep a promise measured in days. A daily job can, and
 * a server that has neither cron nor shell still has the opportunistic sweep,
 * which is better than nothing and is now the fallback rather than the plan.
 *
 * IT RUNS FROM THE UPDATE LINE. `php <your install>/internal/update.php`
 * maintains after it updates -- see ap_maintenance_run() below for why one
 * daily line and not two. This file still runs on its own, for the crontabs
 * written before that:
 *
 *     php <your install>/internal/maintenance.php
 *
 * It says what it did and exits 0 when there was nothing to do, so a scheduler
 * that reports failures has something to report on.
 *
 * IT IS NOT REACHABLE OVER THE WEB. Like every other file under internal/, a
 * direct request answers 404. Sweeping is not an action a visitor triggers:
 * there is no token here and no address, because the only thing it could buy
 * an attacker is making somebody else's deletions happen sooner.
 */

if (!defined('AP_INTERNAL')) {
    if (PHP_SAPI !== 'cli') {
        http_response_code(404);
        exit;
    }
    define('AP_INTERNAL', 1);
    define('AP_MAINTENANCE_CLI', 1);
    require __DIR__ . '/errors.php';
    require __DIR__ . '/config.php';
    /* THE NETS. Without them a configuration this file cannot read ends in a
       raw PHP fatal and exit 255 -- with a stack trace naming the path of that
       configuration, on the terminal of whoever runs the cron. With them it is
       one sentence on stderr and exit 1, which is what this file's own header
       promises a scheduler. */
    ap_install_handlers();
}

/**
 * THE HOUSEKEEPING, AS A FUNCTION, AND WHO CALLS IT.
 *
 * It was the body of this script, so the only way to run it was this file's
 * own cron line -- a second line beside the update one, which is two jobs to
 * schedule for one server, and a reader asked why. The daily line is
 * `php internal/update.php` now, and it calls this after its own work:
 * AFTER, so that when an update has just replaced the code, it is the NEW
 * maintenance that runs against the storage the new code expects. The URL
 * route calls it too, which gives a host with no shell its retention on time
 * instead of one write in fifty.
 *
 * THIS FILE STILL RUNS ON ITS OWN, and must: every server installed before
 * this change has it in a crontab, and a line that started failing would be
 * a sweep that silently stopped. Run directly it does the housekeeping and
 * nothing else -- the same as `update.php --only-maintenance`. Run both, and
 * the second finds nothing to do: everything below is idempotent.
 *
 * @return array ok => false only when there is no server to maintain;
 *               lines => what was done, for whoever reads the report
 */
if (!function_exists('ap_maintenance_run')) {
function ap_maintenance_run(array $config)
{
    $lines = array();
    if (empty($config['active'])) {
        return array('ok' => false, 'lines' => array(
            'annotepage is not active on this server: no internal/config-local.php.'));
    }

    ap_require_store($config);
    $store = new ApStore($config);

    /* -- THE STORAGE FIRST, AND BEFORE THE RETENTION QUESTION ------------------
       A table written before 2.15 bounds its columns with a VARCHAR width, where
       this version writes TEXT. It works: those widths are the numbers the code
       still refuses past. But a width in a column is a second opinion on a limit,
       and the database settles a disagreement badly -- an error that loses the
       text in strict mode, a silent truncation on a permissive sql_mode.

       THIS IS WHERE IT GETS FIXED, and not on a request: the change rebuilds the
       table. Measured on MariaDB 10.11 -- 2.4 s for 50,000 rows, and a failure
       ("the table is full", rolled back, table untouched) on 211 MB with 580 MB
       free. So it is a cron line's job, it stops at a size, it stops when the disk
       cannot take a copy, and whatever it decides it prints the SQL.

       ABOVE the retention check on purpose: a server that keeps everything for
       ever has no sweep to run and is exactly as entitled to a storage that
       matches its code. That check used to exit(0) two lines from here. */
    if (method_exists($store, 'widenColumns')) {
        $widen = $store->widenColumns();
        if ($widen['bounded'] && $widen['done']) {
            $lines[] = 'Storage: ' . $widen['reason'] . " -- " . implode(', ', $widen['bounded'])
                . '.';
        } elseif ($widen['bounded']) {
            $lines[] = 'Storage: ' . count($widen['bounded']) . ' column'
                . (count($widen['bounded']) === 1 ? '' : 's') . " still carry a width "
                . 'from an older version, and this run did NOT change them.';
            $lines[] = 'Why: ' . $widen['reason'] . '.';
            $lines[] = 'The exact SQL, to run when it suits you:';
            $lines[] = '';
            $lines[] = '    ' . $widen['sql'];
            $lines[] = '';
        }
    }

    $days = isset($config['max_note_age_days']) ? (int) $config['max_note_age_days'] : 0;
    if ($days <= 0) {
        $lines[] = 'Retention is off (max_note_age_days = 0). Nothing expires, nothing to sweep.';
        return array('ok' => true, 'lines' => $lines);
    }

    $gone = $store->expireOlderThan($days);

    /* THE SPACE IS NOT GIVEN BACK BY DELETING: a SQLite file marks its pages free
       and reuses them, so a file that held a year of notes keeps that size for
       ever unless it is rewritten. Only when something was actually removed --
       rewriting a whole database nightly to reclaim nothing is the kind of job
       that gets switched off. The store decides whether it has anything to do:
       the MySQL one answers false and says why, and this script does not have to
       know which one is behind it.

       AND THE STORE MAY BE OLDER THAN THIS SCRIPT. update.php keeps a store file
       it did not ship, so a server can run today's maintenance against a store
       that has never heard of compact(). Unguarded, this line killed the sweep --
       AFTER the deletion, so the notes were gone and only the report failed, on
       the first night something actually expired and not before. */
    $shrunk = ($gone > 0 && method_exists($store, 'compact')) ? $store->compact() : false;

    /* ROWS, not threads: a thread is one remark and its replies, and all of them
       went. The count of threads is the one kept in the tally, project by project,
       and it is what the panel shows on the annotated pages. */
    $lines[] = 'Swept: ' . $gone . ' row' . ($gone === 1 ? '' : 's')
        . ' -- whole threads whose last message was older than ' . $days . ' days.';
    if ($shrunk) {
        $lines[] = 'The database file was rewritten, so the freed pages are given back.';
    }
    return array('ok' => true, 'lines' => $lines);
}
}

/* -- RUN DIRECTLY: the housekeeping, alone -------------------------------- */
if (defined('AP_MAINTENANCE_CLI')) {
    $report = ap_maintenance_run(ap_config());
    foreach ($report['lines'] as $line) {
        if ($report['ok']) {
            echo $line . "\n";
        } else {
            fwrite(STDERR, $line . "\n");
        }
    }
    exit($report['ok'] ? 0 : 1);
}
