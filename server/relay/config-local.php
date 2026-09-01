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
 *   deployment => relay        it serves several sites, not one
 *   open_registration => true  it serves projects nobody declared, which is
 *                              what makes a copied tag work with nothing to ask
 *   projects => array()        stays empty; declaring nothing is the point
 *   max_note_age_days => 90    a relay open to strangers stores what it cannot
 *                              read, for people who will never tidy up. Without
 *                              a ceiling it only grows. Ninety days is a review
 *                              cycle with room to spare
 *   max_notes_per_project      the only thing bounding what one abuser costs,
 *                              since an abuser cannot be told from a project
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
    'deployment'        => 'relay',
    'open_registration' => true,
    'projects'          => array(),

    // Retention. 0 would mean "keep everything forever", which on this machine
    // means "grow forever".
    'max_note_age_days'     => 90,
    'max_notes_per_project' => 500,

    // Rate limiting. These are the defaults, repeated here so that whoever
    // operates the relay sees them without opening another file.
    'rate_window_seconds'     => 300,
    'rate_writes_per_ip'      => 120,
    'rate_writes_per_project' => 300,
    'rate_exports_per_ip'     => 20,

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
