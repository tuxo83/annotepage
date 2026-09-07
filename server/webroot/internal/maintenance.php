<?php
/**
 * maintenance.php -- THE HOUSEKEEPING THIS SERVER CANNOT DO ON ITS OWN.
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
 * ONE LINE IN A CRONTAB, beside the update one:
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
    require __DIR__ . '/errors.php';
    require __DIR__ . '/config.php';
    /* THE NETS. Without them a configuration this file cannot read ends in a
       raw PHP fatal and exit 255 -- with a stack trace naming the path of that
       configuration, on the terminal of whoever runs the cron. With them it is
       one sentence on stderr and exit 1, which is what this file's own header
       promises a scheduler. */
    ap_install_handlers();
}

$config = ap_config();

if (empty($config['active'])) {
    fwrite(STDERR, "annotepage is not active on this server: no internal/config-local.php.\n");
    exit(1);
}

$days = isset($config['max_note_age_days']) ? (int) $config['max_note_age_days'] : 0;
if ($days <= 0) {
    echo "Retention is off (max_note_age_days = 0). Nothing expires, nothing to sweep.\n";
    exit(0);
}

ap_require_store($config);
$store = new ApStore($config);

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
echo 'Swept: ' . $gone . ' row' . ($gone === 1 ? '' : 's')
    . ' -- whole threads whose last message was older than ' . $days . " days.\n";
if ($shrunk) {
    echo "The database file was rewritten, so the freed pages are given back.\n";
}
exit(0);
