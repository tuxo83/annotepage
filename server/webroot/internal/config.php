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
        // from the key IN THE BROWSER: see FORMAT.md section 1.3). The server
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
        // with a key this server never sees, so a stranger can insert bytes
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

        // SELF-UPDATE -- may this server fetch a newer version of its own code
        // from the project's repository and put it in place, on its own, from
        // a web request? Off, and it stays off until somebody writes this key.
        //
        // WHAT TURNING IT ON COSTS, and it is not nothing:
        //
        //   - the code directory (webroot/ and internal/) must be WRITABLE BY
        //     THE USER PHP RUNS AS. That permission is the price, and it is
        //     paid whether or not an update ever arrives;
        //   - from that moment, any bug ANYWHERE ON THAT ACCOUNT that can
        //     write a file -- in this code, in a neighbouring application, in
        //     a plugin nobody remembers installing -- stops being a defacement
        //     and becomes permanent code execution. That was WordPress's
        //     largest attack surface for a decade, and it has nothing to do
        //     with where the update comes from;
        //   - it is not undone by turning this key back off. The permission
        //     stays until somebody takes it away.
        //
        // WHY IT IS OFFERED ANYWAY. A server nobody updates is a server that
        // keeps a fixed bug forever, and the hosting this tool targets has no
        // shell and no scheduled task. The trust anchor is the repository over
        // HTTPS with certificate verification on: whoever hijacks this
        // machine's DNS still cannot present a valid certificate for the
        // update host, so a DNS compromise alone does not reach the update.
        // Every downloaded file is checked against a SHA-256 published in the
        // manifest, and one mismatch abandons the whole update.
        //
        // WHAT IT NEVER TOUCHES: this file, and a store.php that differs from
        // the one we shipped -- INSTALL.md says the store may be replaced, and
        // restoring ours would take somebody's database with it.
        //
        // THE OTHER WAY, AND THE BETTER ONE. `php internal/update.php` does
        // exactly the same thing from a shell or from cron, with the code
        // directory writable by YOU and not by the web server. If you have a
        // shell, use that and leave this key alone.
        //
        // With this off, not one byte goes out on a visitor's request.
        // ?action=diagnostic still reports the running and the published
        // version, because that costs no permission and it is the part every
        // installation wants.
        'auto_update' => false,

        // THE UPDATE URL, FOR A HOST WITH NO CRON AND NO SHELL.
        //
        // The web path above cannot run everywhere: it hands the response to
        // the visitor first and then works, and only php-fpm and LiteSpeed can
        // guarantee that. On anything else -- `cgi-fcgi` among them -- it
        // declines, and says so in ?action=diagnostic. INSTALL.md then points
        // at `php internal/update.php` from cron, which is the right answer
        // for anybody who has cron. Plenty of hosting has neither.
        //
        // Written here, this token turns on `?action=update&token=...`, which
        // runs the update IN the request and answers with what it did. Nobody
        // is made to wait for somebody else: whoever calls that URL asked for
        // it. Put it in any external scheduler, or open it by hand.
        //
        // WHY A TOKEN AND NOT AN OPEN ACTION. The action makes this server
        // fetch code and rewrite itself. It can only ever install the version
        // published at `update_source`, every file hash-checked against the
        // manifest, so the worst a stranger could do is make it do its job at
        // a moment of their choosing -- but "at a moment of their choosing" is
        // exactly what one does not hand out. Empty, and the action does not
        // exist at all: not refused, unknown, like any address nobody wrote.
        //
        // 32 characters or more, and it is compared in constant time.
        'update_token' => '',

        // Where an update is fetched from. HTTPS ONLY -- there is no flag to
        // relax that, and any code path that disabled certificate verification
        // would be the bug, not the workaround. It is configurable so that a
        // fork, or a mirror inside a network with no way out to GitHub, can be
        // pointed at; it is not meant to be changed otherwise.
        'update_source' =>
            'https://raw.githubusercontent.com/tuxo83/annotepage/main/server/webroot/',

        // WHICH STORE ANSWERS -- `sqlite`, `mysql`, or left empty.
        //
        //   sqlite  internal/store-sqlite.php. ONE FILE, nothing to create.
        //           pdo_sqlite is compiled into PHP on nearly every host, so
        //           this is what makes "upload it and open install.php" true;
        //   mysql   internal/store.php. A database server, its credentials,
        //           and everything that follows. Fully supported, and the
        //           right answer for a busy relay: SQLite locks the whole file
        //           for a write.
        //
        // LEFT EMPTY, WHICH IS THE DEFAULT, IT IS DEDUCED -- and the deduction
        // exists for one case only: an installation configured before this key
        // existed. Such a file always names a `database.name`, because the
        // MySQL store cannot open without one. So:
        //
        //   database.name set    -> mysql. An existing installation keeps its
        //                           database. Flipping it to SQLite on an
        //                           update would show an empty panel and read
        //                           as three months of review erased;
        //   database.name unset  -> sqlite.
        //
        // install.php writes this key explicitly, so a fresh installation
        // never depends on the deduction. Read it in ?action=diagnostic under
        // `config.storage`.
        //
        // IT CHOOSES A FILE, NOT AN ENGINE. INSTALL.md says the store may be
        // replaced; a replacement dropped over `internal/store.php` is
        // selected by 'mysql' and one dropped over `internal/store-sqlite.php`
        // by 'sqlite', whatever it actually talks to. Nothing here inspects
        // what is inside those files, which is the point of the contract in
        // store.php's header.
        'storage' => '',

        // THE STORE'S CONFIGURATION SPACE, which the store alone interprets.
        // This file does not know what a "host" is: it carries keys and
        // resolves values, that is all. Whoever replaces the store also
        // replaces the meaning of this sub-array.
        //
        // EVERY value accepts two forms:
        //   - a string, the value in the clear;
        //   - array('file' => '/absolute/path'), the value read from a file
        //     dropped OUTSIDE the web root.
        // The second form is the only generic way to read a secret without
        // writing it into a file served by the web server.
        //
        // `file` is the SQLite store's only key: the absolute path of the
        // database file. install.php picks it, creates it, and PROVES over
        // HTTP that no URL serves it. The other five are the MySQL store's.
        'database' => array(
            'file'     => null,
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

        // RETENTION -- how many days a thread is kept. 0 keeps everything, and
        // that is the default: on a server holding one team's notes, a remark
        // that vanishes on its own is a remark nobody can answer any more.
        //
        // A PUBLIC RELAY IS THE OTHER CASE. It stores for strangers, it cannot
        // read what it stores, and nobody will ever come and tidy up. Without a
        // ceiling it only grows. Ninety days is a review cycle with room to
        // spare.
        //
        // WHAT IT REMOVES: whole threads whose LAST message is older than this.
        // A thread, so that a reply is never cut off its remark; dated by its
        // last message, so that a live discussion is never cut short.
        //
        // NOBODY CHOOSES WHICH. There is still no moderation and no takedown --
        // that is the point of saying age and only age. But "nothing is ever
        // deleted" stops being true on a server where this is set, so the
        // diagnostic and the export header both announce it. Do not set it
        // quietly.
        'max_note_age_days' => 0,

        // Header carrying the client address when a proxy sits in front (for
        // example 'HTTP_X_FORWARDED_FOR'). NULL BY DEFAULT, and that default is
        // the point: a header the client can write itself would make rate
        // limiting bypassable in one line. Only fill it in if a trusted proxy
        // rewrites it on every request.
        'client_ip_header' => null,

        // WHERE A BARE VISIT GOES -- empty, and nothing redirects until
        // somebody types a URL here.
        //
        // What it is for: a public relay whose host somebody reaches with no
        // path gets a blank page or a 404, and the visitor learns nothing.
        // Pointing it at the project that explains what the thing is turns
        // that dead end into an answer. It is the OPERATOR's decision, on the
        // OPERATOR's server; nothing here ships with a destination.
        //
        // WHERE IT APPLIES, and the list is short on purpose: the directory
        // itself (index.php) and install.php once the configuration exists.
        // NEVER api.php, never an action, never the diagnostic -- a redirect
        // on an API endpoint breaks every caller, and the failure would be
        // baffling to diagnose from a browser that followed it silently.
        //
        // 302 and not 301: a permanent redirect is cached by browsers and
        // would outlive the operator changing their mind.
        //
        // It is VALIDATED before it reaches a Location header -- absolute
        // http(s) only, no control character. A value written by whoever
        // installs is exactly the input one is tempted to trust, and an
        // unvalidated string in that header is a header injection.
        'forward_root_to' => '',

        // SERVE OVER PLAIN http AS WELL? No: https is required, and every http
        // request is answered with a 308 towards the same URL over https.
        //
        // 308, and not 301 or 302: those two turn a POST into a GET in many
        // clients. The note being written would arrive with no body, the
        // server would refuse it, and the failure would read as a bug in the
        // client -- which is where nobody would find it.
        //
        // THIS FLAG IS NOT A SECURITY PREFERENCE. It is the way out when the
        // detection is wrong on a given host. The scheme is read from HTTPS,
        // REQUEST_SCHEME, the server port and the two forwarding headers --
        // see ap_request_scheme_detail() below -- and a host that reports none
        // of them for a visitor who IS on https redirects every request to a
        // URL that arrives here looking exactly the same. That is an infinite
        // loop, and it takes the API down for every caller. Set this to true,
        // read `request.scheme` in ?action=diagnostic to see what the request
        // actually arrived as, and report the host: that is what it is for.
        //
        // It does NOT make plain http usable by the client. The browser gives
        // WebCrypto only in a secure context, so over http the widget cannot
        // derive a key or open an envelope at all.
        'allow_plain_http' => false,   // true: serve over http as well

        // HOW MUCH ?action=diagnostic PUBLISHES. Three values, and the default
        // is the quiet one.
        //
        //   'minimal'  the tool, its version, the format it speaks, and the
        //              verdict: running, or not, and what to do about it. THE
        //              DEFAULT;
        //   'full'     everything the page has ever printed -- the PHP really
        //              served and its extensions, the storage engine and its
        //              version, the path of this file on disk, the tables, the
        //              update source and what it answered, the caps and the
        //              rate limits, the declared projects with their origins;
        //   'off'      the action does not exist. It is refused exactly as an
        //              action nobody ever heard of is refused, same code, same
        //              body, so that the page cannot be told from a typo.
        //
        // WHY THE DEFAULT IS NOT `full`, since `full` is what every version
        // before this one did. That page has no authentication of any kind and
        // it never had: it is written for the operator, and it answers whoever
        // else asks in exactly the same words. A PHP version and a MariaDB
        // version are what somebody with a working exploit searches the web
        // for; the path of the configuration on disk is the other half of a
        // file-read bug; the update source and the declared projects say what
        // this machine is and who it serves. None of that is a vulnerability
        // here, and all of it shortens somebody else's afternoon.
        //
        // `full` is meant to be set for the length of a diagnosis and set back
        // -- it costs nothing to turn on, and INSTALL.md says so where it
        // documents the page. `minimal` still answers when this very file is
        // unreadable or malformed, which is the moment the page exists for.
        //
        // An unknown value is read as `minimal`, and logged. It is not a
        // refusal: a key that decides how much a page prints must not take the
        // notes down when it is misspelt, and a value nobody can read must
        // never be read as "publish everything". `deployment` refuses for the
        // opposite reason -- getting THAT one wrong discloses.
        'diagnostic' => 'minimal',
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
    $config['auto_update'] = !empty($config['auto_update']);
    $config['allow_plain_http'] = !empty($config['allow_plain_http']);
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
 * WHICH STORE ANSWERS: 'sqlite' or 'mysql'. See the `storage` key above for
 * the deduction and, above all, for why it deduces `mysql` rather than the
 * default when a `database.name` is present.
 *
 * An unknown value is a FAILURE and never a silent fallback, for the same
 * reason `deployment` is: falling back would open a different, empty storage
 * while the operator believed they were pointing at their own.
 */
function ap_store_kind(array $config)
{
    $declared = isset($config['storage'])
        ? strtolower(trim((string) $config['storage'])) : '';

    if ($declared === 'sqlite' || $declared === 'mysql') {
        return $declared;
    }
    if ($declared !== '') {
        throw new ApFailure(
            "Invalid configuration: `storage` is `"
            . substr(preg_replace('/[^\x20-\x7E]/', '', $declared), 0, 30) . "`.\n"
            . "The only two accepted values are `sqlite` and `mysql`.",
            500);
    }

    $db = isset($config['database']) && is_array($config['database'])
        ? $config['database'] : array();
    return empty($db['name']) ? 'sqlite' : 'mysql';
}

/** The file that defines ApStore for this configuration. */
function ap_store_file(array $config)
{
    return __DIR__ . (ap_store_kind($config) === 'mysql'
        ? '/store.php' : '/store-sqlite.php');
}

/**
 * Loads the store the configuration asks for.
 *
 * The two files both declare `class ApStore`, which is the point: everything
 * downstream -- api.php, the text export, the diagnostic -- names one class and
 * knows nothing about what is behind it. It also means exactly one of them may
 * ever be loaded in a request, so this is the only place that decides.
 */
function ap_require_store(array $config)
{
    require_once ap_store_file($config);
}

/**
 * The validated redirect for a bare visit, or null.
 *
 * NEVER THROWS, and that is the choice: a mistyped URL here must not take the
 * server down. It is refused, logged, and reported by ?action=diagnostic. The
 * cost of the other behaviour -- a whole installation returning 500 because
 * somebody left a trailing space in a courtesy redirect -- is not payable.
 *
 * What passes: an absolute http:// or https:// URL with a host. What does not:
 * a relative path, any other scheme (`javascript:` first among them), and
 * anything carrying a control character -- a newline in a Location header is a
 * header injection, and this value is typed by hand.
 */
function ap_forward_root_to(array $config)
{
    $url = isset($config['forward_root_to'])
        ? trim((string) $config['forward_root_to']) : '';
    if ($url === '') {
        return null;
    }
    if (preg_match('/[\x00-\x1F\x7F]/', $url)) {
        ap_log('forward_root_to refused: it contains a control character');
        return null;
    }
    if (!preg_match('#^https?://[^\s/?\#]+#i', $url)) {
        ap_log('forward_root_to refused: it is not an absolute http(s) URL');
        return null;
    }
    return $url;
}

/**
 * HOW THE REQUEST REALLY ARRIVED: 'https' or 'http', and what said so.
 *
 * $_SERVER['HTTPS'] is the obvious answer and it is the WRONG one on its own.
 * On shared hosting the TLS is very often terminated by a load balancer or a
 * CDN, and PHP is reached over plain http from the machine next door: HTTPS is
 * then empty -- or the literal string `off` -- while the visitor's address bar
 * says https. Deciding on that alone means redirecting a visitor who is
 * already on https to a URL that arrives here looking exactly the same, which
 * the browser follows, and follows again. That is not a cosmetic bug: it is an
 * infinite loop, and it takes the API down for every caller on that host.
 *
 * So five sources are read, most direct first:
 *
 *   HTTPS              set by the web server when IT terminated the TLS;
 *   REQUEST_SCHEME     Apache's own name for the same knowledge;
 *   SERVER_PORT 443    the port WE are listening on, not something a caller
 *                      claims;
 *   X-Forwarded-Proto  what the proxy in front reports. Chained proxies append
 *   X-Forwarded-Ssl    to it -- `https, http` -- so only the FIRST value, the
 *                      one that faced the client, is read.
 *
 * The last two are request headers, so a caller can write them itself and skip
 * the redirect. That is accepted DELIBERATELY: this redirect authorises
 * nothing and hides nothing -- a caller that wants plain http can already just
 * not follow it -- while refusing to read those headers produces the loop
 * above on a large share of real hosting. Contrast `client_ip_header`, which
 * is off by default precisely because rate limiting IS a boundary.
 *
 * The reported source is reduced to printable ASCII before being returned: it
 * comes from a request header and it is displayed by ?action=diagnostic, whose
 * whole format is one line per key.
 *
 * @return array{scheme: string, from: string}
 */
function ap_request_scheme_detail()
{
    $clean = function ($value) {
        return substr(preg_replace('/[^\x20-\x7E]/', '', (string) $value), 0, 30);
    };

    $https = isset($_SERVER['HTTPS']) ? trim((string) $_SERVER['HTTPS']) : '';
    $lower = strtolower($https);
    if ($https !== '' && $lower !== 'off' && $lower !== '0') {
        return array('scheme' => 'https', 'from' => 'HTTPS=' . $clean($https));
    }

    $scheme = isset($_SERVER['REQUEST_SCHEME'])
        ? strtolower(trim((string) $_SERVER['REQUEST_SCHEME'])) : '';
    if ($scheme === 'https') {
        return array('scheme' => 'https', 'from' => 'REQUEST_SCHEME=https');
    }

    if (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443) {
        return array('scheme' => 'https', 'from' => 'SERVER_PORT=443');
    }

    $proto = isset($_SERVER['HTTP_X_FORWARDED_PROTO'])
        ? (string) $_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
    if ($proto !== '') {
        $parts = explode(',', $proto);
        if (strtolower(trim($parts[0])) === 'https') {
            return array('scheme' => 'https', 'from' => 'X-Forwarded-Proto: https');
        }
    }

    $ssl = isset($_SERVER['HTTP_X_FORWARDED_SSL'])
        ? strtolower(trim((string) $_SERVER['HTTP_X_FORWARDED_SSL'])) : '';
    if ($ssl === 'on' || $ssl === '1') {
        return array('scheme' => 'https', 'from' => 'X-Forwarded-Ssl: on');
    }

    return array(
        'scheme' => 'http',
        'from'   => ($proto !== '' || $ssl !== '')
            ? 'no source says https (a forwarding header is present and says otherwise)'
            : 'no source says https',
    );
}

/** True when the request reached us over https, however that was established. */
function ap_request_is_https()
{
    $detail = ap_request_scheme_detail();
    return $detail['scheme'] === 'https';
}

/**
 * How much ?action=diagnostic may publish: `minimal`, `full` or `off`.
 * See `diagnostic` above for what each one shows and why the default is short.
 */
function ap_diagnostic_mode(array $config)
{
    $value = isset($config['diagnostic'])
        ? strtolower(trim((string) $config['diagnostic'])) : '';
    if ($value === 'full' || $value === 'off' || $value === 'minimal') {
        return $value === '' ? 'minimal' : $value;
    }
    if ($value !== '') {
        // Logged, because the short report cannot say it: an operator who
        // typed `ful` sees a page that shows four lines and no reason, and the
        // log is then the only place the answer can be.
        ap_log('diagnostic: unknown value in the configuration, `minimal` applied');
    }
    return 'minimal';
}

/** True when plain http must be redirected. See `allow_plain_http` above. */
function ap_https_required(array $config)
{
    return empty($config['allow_plain_http']);
}

/**
 * The same URL as this request, over https -- or null if it cannot be built.
 *
 * The host comes from the Host header, which is written by the CLIENT. Copied
 * unchecked into a Location it is two bugs at once: a header injection if it
 * carries a newline, and an open redirect if it names somebody else's site. It
 * is therefore matched against a host name and nothing else, and a host that
 * does not match returns null -- the request is then served rather than sent
 * somewhere a stranger chose.
 */
function ap_https_url_of_this_request()
{
    $host = isset($_SERVER['HTTP_HOST']) ? trim((string) $_SERVER['HTTP_HOST']) : '';
    if ($host === '') {
        $host = isset($_SERVER['SERVER_NAME']) ? trim((string) $_SERVER['SERVER_NAME']) : '';
    }
    if (!preg_match('/^(\[[0-9A-Fa-f:]{2,45}\]|[A-Za-z0-9.\-]{1,253})(:[0-9]{1,5})?$/', $host)) {
        return null;
    }
    // :80 is the plain-http port. Carried over to an https URL it points at a
    // door that is not open, and the redirect fails instead of working.
    if (substr($host, -3) === ':80') {
        $host = substr($host, 0, -3);
    }

    $uri = isset($_SERVER['REQUEST_URI']) ? (string) $_SERVER['REQUEST_URI'] : '';
    if ($uri === '' || $uri[0] !== '/' || preg_match('/[\x00-\x1F\x7F]/', $uri)) {
        $uri = '/';
    }
    return 'https://' . $host . $uri;
}

/**
 * REDIRECTS PLAIN http TO https, or returns and lets the request be served.
 *
 * Called first thing by every entry point, before any routing, so that no
 * action, no note and no configuration error is ever answered over http while
 * https is required.
 *
 * IT NEVER THROWS, and it loads the configuration itself rather than being
 * handed one: it runs before the point where a configuration failure is
 * reported, and a broken local file must not turn this guard into a 500. A
 * configuration that will not load falls back on the defaults, which require
 * https -- the same answer the operator gets on a working server.
 *
 * The 308 is sent WITH `Cache-Control: no-store`. The status code has to be
 * permanent to preserve the method, but the operator who later sets
 * `allow_plain_http` must not find the redirect burned into every browser that
 * ever saw it.
 */
function ap_require_https()
{
    if (ap_request_is_https()) {
        return;
    }

    $config = null;
    try {
        $config = ap_config();
    } catch (Exception $e) {
        $config = null;
    } catch (Throwable $e) {
        $config = null;
    }
    if ($config === null) {
        $config = ap_config_defaults();
    }
    if (!ap_https_required($config)) {
        return;
    }

    $target = ap_https_url_of_this_request();
    if ($target === null) {
        ap_log('https redirect skipped: the Host header is not a usable host name');
        return;
    }

    // 308 and not 301 or 302. Those two turn a POST into a GET in many
    // clients, and a note would arrive with an empty body.
    header('HTTP/1.1 308 Permanent Redirect', true, 308);
    header('Location: ' . $target);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Content-Type-Options: nosniff');
    echo $target . "\n";
    exit;
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
