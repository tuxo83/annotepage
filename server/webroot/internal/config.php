<?php
/**
 * config.php -- THE effective configuration of the tool.
 *
 * Two layers, and one single rule: this file knows NO server. It holds generic
 * default values, then merges in whatever a neighbouring `config-local.php`
 * file brings, if it exists.
 *
 * WITHOUT a local file, the tool is INACTIVE. That is deliberate: the safe
 * default is silence, not a connection attempted at random towards a database
 * nobody knows anything about. A directory copied onto a site by mistake
 * therefore does nothing at all.
 *
 * ONE CODE, TWO DEPLOYMENTS. The `deployment` key is `self-hosted` (the tool
 * sits on the site under review, behind the same access restriction as it) or
 * `relay` (the tool sits on a third-party machine and serves several sites).
 * This is NOT a switch between two implementations: the same code reads the
 * same table with the same query, and this value changes only three things,
 * each written in plain sight where it acts -- plain mode (impossible on a
 * relay), a missing Origin header (tolerated when self-hosted) and the
 * backfill action (refused on a relay).
 *
 * See config-local.example.php for the template to copy.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

/**
 * Default values. Every key is commented: this array is the reference
 * documentation of the configuration.
 */
function ap_config_defaults()
{
    return array(

        // Does the tool answer? False until a local file activates it.
        'active' => false,

        // `self-hosted` or `relay`. The default is the more restrictive of the
        // two: a badly declared relay would refuse plain mode and demand an
        // Origin header, which shows up at once. The other way round -- a relay
        // taken for a self-hosted install -- would serve plaintext to a third
        // party without anyone noticing.
        'deployment' => 'relay',

        // THE PROJECTS. Key = project id (22 base64url characters, derived
        // from the salt IN THE BROWSER: see FORMAT.md section 1.3). The server
        // does not compute it, it recognises it.
        //
        //   'projects' => array(
        //       '7Qb1kZ3xNvA9dLpEqKf2Zt' => array(
        //           'origins' => array('https://staging.example.com',
        //                              'https://www.example.com'),
        //           'mode'    => 'encrypted',
        //       ),
        //   )
        //
        // WHEN SELF-HOSTED, this array holds exactly ONE entry. That is not a
        // special case in the code: it is the same array, the same `project`
        // column, the same query. A single tenant is a multi-tenant with one
        // tenant.
        'projects' => array(),

        // OPEN REGISTRATION -- a relay that accepts projects it was never told
        // about, so that a tag copied from a web page works with nothing to
        // declare and nobody to ask. This is what a PUBLIC relay needs; it is
        // wrong everywhere else, and it is off unless it is switched on.
        //
        // WHAT IT OPENS, said plainly, because it is not nothing:
        //
        //   - any well-formed project id is served. There is no registration,
        //     no account, no approval. That is the point;
        //   - such a project has NO ORIGIN LOCK. It cannot have one: nobody
        //     declared its origins, and the server has no way to learn them
        //     that an abuser could not also use. So whoever reads the source of
        //     an annotated page finds the project id there -- it is in the tag,
        //     it has to be -- and can write notes into that project.
        //
        // WHY THAT IS SURVIVABLE, AND WHERE IT IS NOT. The notes are encrypted
        // with a salt this server never sees, so a stranger can insert bytes
        // but cannot read a word, and cannot write a note that DECRYPTS. What
        // they insert comes back to the reader as unreadable rows, counted and
        // shown as such -- a nuisance, not a disclosure. The real cost is
        // storage, which the rate limit and the per-project cap answer.
        //
        // A team that wants the origin lock declares its project in `projects`
        // above -- declared projects keep it -- or hosts its own server. Both
        // paths stay open; this one buys zero setup and pays for it in that
        // one coin.
        //
        // A project admitted this way is ALWAYS 'encrypted'. Plain mode on a
        // public relay would hand the operator every path, every name and every
        // remark of every site using it, which FORMAT.md section 2.3 says must
        // not happen. It is not an option here, it is a refusal.
        'open_registration' => false,

        // THE STORE'S CONFIGURATION SPACE (internal/store.php), which it alone
        // interprets. This file does not know what a "host" is: it carries
        // keys and resolves values, that is all. Whoever replaces store.php
        // also replaces the meaning of this sub-array.
        //
        // EVERY value accepts two forms:
        //   - a string, the value in the clear;
        //   - array('file' => '/absolute/path'), the value read from a file
        //     dropped OUTSIDE the web root.
        // The second form is the only generic way to read a secret without
        // writing it into a file served by the web server.
        'database' => array(
            'host'     => '127.0.0.1',
            'port'     => 3306,
            'name'     => null,
            'user'     => null,
            'password' => null,
        ),

        // Naming prefix of the storage. The store makes of it what it wants;
        // with the one shipped here, the tables will be called <prefix>notes
        // and <prefix>rate. Configurable so that an already busy storage does
        // not collide. The store checks its shape, because the store is what
        // knows where this value ends up.
        'table_prefix' => 'notes_',

        // Input bounds, applied on the server side (the client can lie). They
        // also size the columns of the table: changing them on an existing
        // database does not widen the existing columns.
        //
        // THEY APPLY IN PLAIN MODE ONLY. In encrypted mode the server sees
        // only an envelope: it does not know where the author ends and the
        // text begins. See FORMAT.md section 3.6 -- that is the price of
        // end-to-end encryption, and it is written down rather than hidden.
        'max_text_length'        => 4000,
        'max_author_length'      => 80,
        'max_page_length'        => 300,
        'max_selector_length'    => 500,
        'max_fingerprint_length' => 255,
        'max_excerpt_length'     => 300,
        // Note-taking context: site version, environment, window size.
        // Deliberately short -- these are labels, not content, and a long field
        // invites writing something else in it.
        'max_version_length'     => 60,
        'max_environment_length' => 20,
        'max_viewport_length'    => 20,

        // Bounds of the encrypted envelopes, in CHARACTERS. They are the only
        // ones the server can apply in encrypted mode. Values fixed by
        // FORMAT.md section 3.6: changing them without changing the format
        // means accepting that a note written here be refused elsewhere.
        'max_payload_length'            => 24000,
        'max_resolution_payload_length' => 2000,

        // BODY CAP, in bytes, checked on Content-Length BEFORE any read. A
        // 24000-character envelope plus the other fields fits with room to
        // spare in 64 KiB. Without this cap, a body of several megabytes would
        // be received in full and parsed by PHP before being refused field by
        // field.
        'max_body_bytes' => 65536,

        // RATE LIMITING. Fixed window, counted in the database (the tool
        // writes nothing to disk, and there is no shared cache on this kind of
        // hosting). A value of 0 disables the matching counter.
        //
        // What is counted: WRITES (add, resolve) and EXPORTS (text). Not
        // `list`: counting it would cost one database write per page load, to
        // defend against a request that makes nothing grow. The abuse that
        // matters is the one that fills the database or drains a whole
        // project; those two are the ones that are bounded.
        'rate_window_seconds'     => 300,
        'rate_writes_per_ip'      => 120,
        'rate_writes_per_project' => 300,
        'rate_exports_per_ip'     => 20,

        // Maximum number of notes per project, 0 = no limit. FORMAT.md section
        // 8.6 leaves quota and retention OPEN: this cap is therefore a tool,
        // not a policy. It erases nothing and expires nothing; it refuses the
        // write beyond, and says so.
        'max_notes_per_project' => 0,

        // Header carrying the client address when a proxy sits in front (for
        // example 'HTTP_X_FORWARDED_FOR'). NULL BY DEFAULT, and that default is
        // the point: a header the client can write itself would make rate
        // limiting bypassable in one line. Only fill it in if a trusted proxy
        // rewrites it on every request.
        'client_ip_header' => null,
    );
}

/**
 * The effective configuration, computed once per request.
 *
 * @return array
 */
function ap_config()
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = ap_config_defaults();

    $local = __DIR__ . '/config-local.php';
    if (is_file($local)) {
        // READABILITY CHECKED BEFORE THE require, not after: a require on a
        // file that exists but cannot be read is a FATAL compile error, which
        // neither try/catch nor the exception handler catches. Without this
        // line, a single missing read permission also took out
        // ?action=diagnostic -- that is, the only way to learn remotely that
        // the permission is missing.
        if (!is_readable($local)) {
            throw new ApFailure(
                "The notes tool's configuration file exists but cannot be read by the "
                . "user PHP runs as.\n"
                . "File: " . $local . "\n"
                . "To pass on to the administrator: grant READ permission on this file "
                . "to the PHP user.",
                500);
        }
        $given = require $local;
        if (!is_array($given)) {
            throw new ApFailure(
                "The config-local.php file must RETURN an array "
                . "(return array(...);). It returned nothing usable.",
                500);
        }
        // One-level merge, plus the `database` sub-key: enough for the shape of
        // this configuration, and predictable to read.
        //
        // `projects` is NOT merged key by key: the local file replaces it
        // whole. Merging would let a project declared by mistake in the
        // defaults survive its removal from the local file, and one project too
        // many is one tenant too many.
        if (isset($given['database']) && is_array($given['database'])) {
            $config['database'] = array_merge($config['database'], $given['database']);
            unset($given['database']);
        }
        $config = array_merge($config, $given);
    }

    $config['active'] = !empty($config['active']);
    $config['open_registration'] = !empty($config['open_registration']);
    $config['local_config'] = $local;
    $config['local_config_present'] = is_file($local);

    // The deployment is normalised HERE, and an unknown value is a FAILURE,
    // never a silent fallback. `realy` instead of `relay` would fall back on
    // the default, and the default is precisely the other mode: we would serve
    // plaintext to a third party while believing the opposite.
    $deployment = isset($config['deployment']) ? strtolower(trim((string) $config['deployment'])) : '';
    if ($deployment !== 'self-hosted' && $deployment !== 'relay') {
        throw new ApFailure(
            "Invalid configuration: `deployment` is `"
            . substr(preg_replace('/[^\x20-\x7E]/', '', $deployment), 0, 30)
            . "`.\nThe only two accepted values are `self-hosted` and `relay`.",
            500);
    }
    $config['deployment'] = $deployment;

    return $config;
}

/** True if the tool sits on the site it reviews. */
function ap_is_self_hosted(array $config)
{
    return $config['deployment'] === 'self-hosted';
}

/**
 * Does this server admit projects nobody declared?
 *
 * Only a relay can. Self-hosted, the array holds the one project of the one
 * site, and an id nobody declared is a mistake worth reporting -- most often a
 * tag copied from another site, which open registration would silently accept
 * and store forever.
 */
function ap_open_registration(array $config)
{
    return !empty($config['open_registration']) && !ap_is_self_hosted($config);
}

/**
 * Resolves a configuration value given either in the clear or in the form
 * array('file' => '/absolute/path').
 *
 * Three explicit refusals, each for a failure already seen elsewhere:
 *
 *  1. non-absolute path. PHP resolves a relative path against the process's
 *     WORKING DIRECTORY, not against the file that writes it -- and under some
 *     server configurations that directory is not the one you think. A
 *     relative path would produce a misleading "unreadable file"; we refuse,
 *     naming the path we got.
 *  2. unreadable file. We name the PATH, never the content, and we give the
 *     sentence to pass on to the administrator.
 *  3. empty file. An empty password would fail further on, with an
 *     incomprehensible driver message.
 *
 * @param mixed  $value the declared value
 * @param string $label the name of the key, for the message
 * @return string
 */
function ap_configured_value($value, $label)
{
    if (is_array($value) && isset($value['file'])) {
        $path = (string) $value['file'];

        if ($path === '' || $path[0] !== '/') {
            throw new ApFailure(
                "Invalid configuration for `" . $label . "`: the file path must be "
                . "ABSOLUTE.\n"
                . "Path obtained: " . $path . "\n"
                . "Anchor it on __DIR__, for example "
                . "__DIR__ . '/../../secrets/database-user'.",
                500);
        }
        if (!is_readable($path)) {
            throw new ApFailure(
                "The notes tool cannot read its credential `" . $label . "`.\n"
                . "Expected file: " . $path . "\n"
                . (is_file($path)
                    ? "The file exists but cannot be read by the user PHP runs as.\n"
                      . "To pass on to the administrator: grant READ permission on this "
                      . "file to the PHP user."
                    : "The file is missing. Check the path, including the number of "
                      . "levels climbed.")
                . "\nNo note can be saved until this is fixed.",
                503);
        }
        $content = file_get_contents($path);
        if ($content === false) {
            throw new ApFailure(
                "Cannot read " . $path . " (credential `" . $label . "`).",
                503);
        }
        $content = trim($content);
        if ($content === '') {
            throw new ApFailure(
                "The file " . $path . " is empty: the credential `" . $label
                . "` has no value.",
                503);
        }
        return $content;
    }

    if ($value === null || $value === '') {
        throw new ApFailure(
            "Incomplete configuration: `" . $label . "` is not set in "
            . "config-local.php.",
            503);
    }

    return (string) $value;
}

/**
 * Describes a configuration value WITHOUT reading it and WITHOUT ever
 * throwing.
 *
 * Serves the diagnostic, whose whole value rests on one rule: we say where the
 * value comes from and whether it is readable; we NEVER display the value. A
 * diagnostic that leaks a password is worse than no diagnostic.
 *
 * @param bool $secret is the value sensitive? A host and a port are not, and
 *                     showing them saves a round trip to whoever is
 *                     diagnosing. A user and a password are, and they never
 *                     leave this function.
 * @return string a line readable by an administrator
 */
function ap_describe_configured_value($value, $label, $secret = true)
{
    if (is_array($value) && isset($value['file'])) {
        $path = (string) $value['file'];
        if ($path === '' || $path[0] !== '/') {
            return 'file ' . $path . ' : PATH NOT ABSOLUTE, refused';
        }
        if (!is_file($path)) {
            return 'file ' . $path . ' : MISSING';
        }
        if (!is_readable($path)) {
            return 'file ' . $path . ' : NOT READABLE by the PHP user';
        }
        // The SIZE is not displayed either: the length of a password is not
        // nothing, and this address is protected by an IP restriction alone.
        // "readable" answers the question asked.
        return 'file ' . $path . ' : readable (content not shown)';
    }

    if ($value === null || $value === '') {
        return 'NOT SET';
    }

    return $secret
        ? 'value written in the configuration (not shown)'
        : (string) $value;
}
