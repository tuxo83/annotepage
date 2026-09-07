<?php
/**
 * config-local.php -- READY-MADE CONFIGURATION FOR THE FREE PUBLIC RELAY.
 *
 * Copy this file to webroot/internal/config-local.php on the machine that
 * serves the relay, fill in the four database values, and it is done. Every
 * other key keeps the default from config.php.
 *
 * WHAT THIS SETS, AND WHY EACH ONE
 *
 *   allow_plain_mode => false  it holds other people's notes, so none of them
 *                              may be kept readable
 *   require_origin_on_writes   a write here comes from another domain, and a
 *                       => true  browser always says so
 *   open_registration => true  it serves projects nobody declared, which is
 *                              what makes a copied tag work with nothing to ask
 *   projects => array()        stays empty; declaring nothing is the point
 *   max_note_age_days => 90    a relay open to strangers stores what it cannot
 *                              read, for people who will never tidy up. Without
 *                              a ceiling it only grows. Ninety days is a review
 *                              cycle with room to spare
 *   max_notes_per_project      stops ONE project from growing into an export
 *                              nobody can serve. It does NOT bound an abuser:
 *                              a project id costs nothing to invent, so they
 *                              start another. What bounds them is the write
 *                              rate per address, and what makes the total
 *                              converge is the retention above
 *   forward_root_to            somebody who reaches the bare host of a relay
 *                              should land on the page explaining what the
 *                              thing is, not on nothing
 *
 * Plain mode is refused here whatever a caller asks: a public relay storing
 * plaintext would hand its operator every path, every label and every remark of
 * every site using it. That refusal is in the code, not in this file.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

return array(

    'active'            => true,
    'allow_plain_mode'         => false,
    'require_origin_on_writes' => true,
    'open_registration' => true,
    'projects'          => array(),

    // Retention. 0 would mean "keep everything forever", which on this machine
    // means "grow forever".
    'max_note_age_days'     => 90,
    // ROWS, not remarks: a discussed thread is three of them. Simulated, six
    // reviewers over three months write 1200 remarks -- 3600 rows -- so the
    // 2000 this file used to carry stopped a working team in week two, and
    // past the cap nobody can even reply. 6000 is about 2000 remarks: 6.5 MB
    // of storage and a 4.7 MB export.
    'max_notes_per_project' => 6000,

    // Rate limiting. These are the defaults, repeated here so that whoever
    // operates the relay sees them without opening another file.
    'rate_window_seconds'     => 300,
    'rate_writes_per_ip'      => 120,
    'rate_writes_per_project' => 300,
    // Three exports per remark for an assistant -- read, reply, resolve, each
    // write dropping its ten-second cache. At 20 the simulated assistant was
    // refused in the middle of its seventh remark, on day one. 90 is thirty
    // remarks per window, with room for two assistants behind one address.
    'rate_exports_per_ip'     => 90,

    // AND `list`, THE CALL EVERY ANNOTATED PAGE MAKES. Off, as everywhere: 0
    // means the counter is never touched, so a page load costs no database
    // write. It is here, named rather than left out, because a relay is
    // exactly the machine that may one day need it -- a loop asking for one
    // page's notes is 200 bytes in and several hundred kilobytes out, and
    // nothing else bounds it. If this machine has a request cap in front of
    // PHP, that is the better place; if it does not, 600 is two a second and
    // no reviewer will ever meet it.
    'rate_reads_per_ip'       => 0,

    // WHERE A BARE VISIT GOES. Only the directory itself and install.php --
    // never api.php, never an action, never the diagnostic: a redirect on an
    // API endpoint breaks every caller. 302 and not 301, so changing our mind
    // is not cached into somebody's browser for a year.
    //
    // Someone who reaches this host with no path has usually just read a
    // project id in the source of a page and wants to know what it is. A blank
    // page answers nothing.
    'forward_root_to' => 'https://annotepage.com',

    // MySQL, and not the SQLite default: a relay takes concurrent writes from
    // strangers, and SQLite locks the whole file for each one.
    'storage'  => 'mysql',
    'database' => array(
        'host' => '127.0.0.1',
        'port' => 3306,

        // Read from files dropped OUTSIDE the web root, so this file carries no
        // secret and can be versioned. Count the levels from this file: '..'
        // reaches the served root, '../..' the directory it is mounted in.
        'name'     => array('file' => __DIR__ . '/../../../secrets/database-name'),
        'user'     => array('file' => __DIR__ . '/../../../secrets/database-user'),
        'password' => array('file' => __DIR__ . '/../../../secrets/database-password'),
    ),
);
