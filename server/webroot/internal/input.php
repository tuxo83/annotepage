<?php
/**
 * input.php -- THE TRUST BOUNDARY.
 *
 * Everything coming from the browser passes through here and nowhere else:
 * length bounds, control-character stripping, the shape of a page path, the
 * shape of a project id, the shape of an encrypted envelope, the existence and
 * the depth of the note being replied to.
 *
 * This file exists on its own because it is the only part of the tool where a
 * mistake is paid for. The rest, at worst, fails to display a note.
 *
 * What it does NOT do, and why:
 *  - it escapes nothing for HTML. Escaping belongs to the output format, not to
 *    the input: storing already-escaped text would make it wrong in the plain
 *    text export, and double in the JSON. The text is stored exactly as it was
 *    typed; api.php (JSON) and text-export.php (text) are what make it harmless
 *    in THEIR format.
 *  - it never concatenates anything into SQL. See store.php: prepared
 *    statements, without exception.
 *  - it DECRYPTS nothing, and cannot. In encrypted mode it checks the SHAPE of
 *    the envelope and its length, never its content: the key does not leave the
 *    browser. A consequence to write down rather than hide: the per-field
 *    bounds then become a client-side convention. A modified client can put
 *    3000 characters in the `author` field and the server will accept it -- it
 *    does not see an `author` field. That is the price of end-to-end
 *    encryption, and it is paid gladly: the tool addresses a review team, not a
 *    hostile audience.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

/**
 * Length in CHARACTERS, not in bytes: `e` and `e-acute` each count as one.
 * mbstring can be missing on any given host; we fall back on a UTF-8 regular
 * expression, then on bytes as a last resort.
 */
function ap_length($string)
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($string, 'UTF-8');
    }
    $n = preg_match_all('/./us', $string);
    return $n === false ? strlen($string) : $n;
}

/**
 * Cleanup common to every text field.
 *
 * - refusal of a byte that is not valid UTF-8: it would make the insert into
 *   utf8mb4 fail, or come back out mangled, and the team would conclude that
 *   the tool "loses notes";
 * - normalisation to \n of EVERYTHING a reader treats as an end of line, and
 *   not only \r\n. See below: that is the point that was caught out;
 * - removal of the C0 control characters, except \n and \t: they break the
 *   format of the text export, whose indentation is the contract.
 *
 * WHY THE LIST OF LINE ENDINGS IS LONGER THAN IT LOOKS
 *
 * The export format states the structure BY THE INDENTATION: a line with no
 * margin is a note, a line at four spaces is note text. Any character a reader
 * counts as an end of line, and that we let through as it stands, therefore
 * manufactures an unindented line IN THE MIDDLE of a text -- that is, a whole
 * note, with its page, its author and its date, that was never written.
 * Measured defect, fixed here:
 *
 *     text = "harmless<U+2028>note 999<U+2028>page /MANAGEMENT.html<U+2028>..."
 *
 * came out of the export as two notes, the second forged from end to end.
 * U+2028, U+2029 and U+0085 are NOT C0 control characters: the class that
 * stripped \x00-\x1F did not see them, and `cat -A` -- the tool of the
 * "byte for byte" check -- does not show them as line breaks either. So they
 * have to be named.
 *
 * They are brought back to \n rather than deleted: they ARE line endings, and
 * deleting them would glue two words together. Once brought back to \n they are
 * indented like any other line of the text, and can no longer manufacture
 * anything. The answer is never to loosen the format.
 *
 * The list covers exactly what a Unicode reader treats as an end of line
 * (Python str.splitlines, Unicode UAX #14): \n, \r, \v, \f, the separators
 * \x1C-\x1E, U+0085, U+2028 and U+2029. \v, \f and \x1C-\x1E already fall into
 * the C0 class stripped below.
 *
 * IN ENCRYPTED MODE this cleanup no longer has any hold on the text: it sleeps
 * in the envelope. It then happens at the PRODUCER of the export, after
 * decryption -- the only place where the text exists. This filter nevertheless
 * remains plain mode's line of defence, and text-export.php's second one.
 *
 * @param bool $multiline is the field allowed to contain line breaks?
 */
function ap_clean_text($value, $multiline, $label)
{
    $value = (string) $value;

    if (preg_match('//u', $value) !== 1) {
        throw new ApFailure(
            "The `" . $label . "` field contains characters that are not valid "
            . "UTF-8.", 400);
    }

    $value = str_replace(
        array("\r\n", "\r", "\xC2\x85", "\xE2\x80\xA8", "\xE2\x80\xA9"),
        "\n", $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value);

    if (!$multiline) {
        $value = str_replace(array("\n", "\t"), ' ', $value);
        $value = preg_replace('/ {2,}/', ' ', $value);
    } else {
        // At most two consecutive line breaks: a paragraph, not a blank page
        // that would deform the export.
        $value = preg_replace('/\n{3,}/', "\n\n", $value);
    }

    return trim($value);
}

/**
 * Reads a field, cleans it, bounds it.
 *
 * Going over the length returns 400 GIVING the limit: a silent truncation would
 * make the end of a remark disappear without anyone knowing, which is worse
 * than the refusal.
 */
function ap_field($source, $key, $max, $required, $label, $multiline = false)
{
    $raw = isset($source[$key]) ? $source[$key] : '';
    if (!is_string($raw)) {
        throw new ApFailure("The `" . $label . "` field is malformed.", 400);
    }

    $value = ap_clean_text($raw, $multiline, $label);

    if ($value === '') {
        if ($required) {
            throw new ApFailure("The `" . $label . "` field is required.", 400);
        }
        return '';
    }

    $length = ap_length($value);
    if ($length > $max) {
        throw new ApFailure(
            "The `" . $label . "` field is " . $length . " characters long; "
            . "the limit is " . $max . ".", 400);
    }

    return $value;
}

/**
 * Refuses a field that should not have been sent.
 *
 * Serves encrypted mode: receiving `author` or `text` in the clear next to an
 * envelope means the client got its mode wrong. We refuse instead of ignoring,
 * because ignoring would save the note without its author's name, and nobody
 * would notice before the next review.
 */
function ap_reject_field($source, $key, $label, $reason)
{
    if (!isset($source[$key])) {
        return;
    }
    if (is_string($source[$key]) && trim($source[$key]) === '') {
        return;
    }
    throw new ApFailure(
        "The `" . $label . "` field must not be sent: " . $reason . "\n"
        . "The note was not saved.", 400);
}

/**
 * A note id received from the browser.
 *
 * Exists because "everything coming from the browser passes through here" had a
 * second door: the entry point read $_POST['id'] and cast it to an integer
 * itself. Now (int) applied to a non-empty ARRAY is 1 -- so `id[]=x` designated
 * note number 1, and the operation succeeded with a 200. ap_field()'s
 * is_string() guard lives here, not elsewhere.
 *
 * @return int strictly positive id
 */
function ap_field_id($source, $key, $label)
{
    $raw = isset($source[$key]) ? $source[$key] : '';
    if (!is_string($raw)) {
        throw new ApFailure("The `" . $label . "` field is malformed.", 400);
    }
    $raw = trim($raw);
    if ($raw === '') {
        throw new ApFailure("The `" . $label . "` field is required.", 400);
    }
    if (!preg_match('/^[0-9]{1,10}$/', $raw) || (int) $raw <= 0) {
        throw new ApFailure(
            "The note id `" . $label . "` is malformed.", 400);
    }
    return (int) $raw;
}

/**
 * A PROJECT id received from the browser: 22 base64url characters.
 *
 * It is not checked here against the configuration -- that is the origin lock's
 * job, which knows which projects exist. Here we only check that it has the
 * SHAPE of an id, before it reaches a prepared statement or a rate counter key.
 */
function ap_field_project($source, $key = 'project')
{
    $raw = isset($source[$key]) ? $source[$key] : '';
    if (!is_string($raw)) {
        throw new ApFailure("The `project` field is malformed.", 400);
    }
    $raw = trim($raw);
    if ($raw === '') {
        throw new ApFailure(
            "The `project` field is required.\n"
            . "It is the project id declared by the page's tag.", 400);
    }
    if (!ap_is_well_formed_id($raw)) {
        throw new ApFailure(
            "The project id is malformed: 22 characters taken from "
            . "A-Z a-z 0-9 - _ are expected.", 400);
    }
    return $raw;
}

/**
 * A page's BLIND INDEX: truncated HMAC, in base64url, 22 characters.
 *
 * The server cannot check it -- that is the whole point: it groups by page
 * without knowing which page. So it only checks the SHAPE. It applies no path
 * normalisation, for the best of reasons: it sees no path. FORMAT.md section 4
 * freezes the normalisation on the client side (none), and there is nothing
 * here that could diverge from it.
 */
function ap_field_index($source, $key, $required, $label = 'index')
{
    $raw = isset($source[$key]) ? $source[$key] : '';
    if (!is_string($raw)) {
        throw new ApFailure("The `" . $label . "` field is malformed.", 400);
    }
    $raw = trim($raw);
    if ($raw === '') {
        if ($required) {
            throw new ApFailure(
                "The `" . $label . "` field is required: it is what says which page "
                . "the note belongs to.", 400);
        }
        return '';
    }
    if (!ap_is_well_formed_id($raw)) {
        throw new ApFailure(
            "The page index is malformed: 22 characters taken from "
            . "A-Z a-z 0-9 - _ are expected.", 400);
    }
    return $raw;
}

/**
 * A yes/no flag received from the browser.
 *
 * Same reason as above: a missing field takes the default, an array is refused
 * instead of being converted at random.
 */
function ap_field_flag($source, $key, $default, $label)
{
    if (!isset($source[$key])) {
        return $default;
    }
    $raw = $source[$key];
    if (!is_string($raw)) {
        throw new ApFailure("The `" . $label . "` field is malformed.", 400);
    }
    $raw = strtolower(trim($raw));
    if ($raw === '0' || $raw === 'no' || $raw === 'false' || $raw === '') {
        return false;
    }
    if ($raw === '1' || $raw === 'yes' || $raw === 'true') {
        return true;
    }
    throw new ApFailure(
        "The `" . $label . "` field expects 0 or 1. Received: "
        . ap_readable_excerpt($raw) . ".", 400);
}

/**
 * A note's mode: `plain` or `encrypted`.
 *
 * It is written PER ROW and never recomputed. An installation may have run in
 * the clear for two weeks before encryption was switched on, or may have
 * migrated from self-hosted to a relay: a half-plain, half-encrypted database
 * must stay entirely readable, and the only way is for each row to say what it
 * is itself.
 *
 * ONE SINGLE RULE FOR BOTH REFUSALS, and that is no accident: plain mode is
 * accepted only if the deployment is self-hosted AND the project declares plain
 * mode. On a relay the first term is false -- that is the refusal FORMAT.md
 * section 3.4 demands. On a project that has moved to encryption, it is the
 * second: there is no going back, the database does not decrypt itself.
 */
function ap_field_mode($source, array $config, $id, array $project)
{
    $raw = isset($source['mode']) ? $source['mode'] : '';
    if (!is_string($raw)) {
        throw new ApFailure("The `mode` field is malformed.", 400);
    }
    $raw = strtolower(trim($raw));
    if ($raw === '') {
        throw new ApFailure(
            "The `mode` field is required: `plain` or `encrypted`.\n"
            . "It is written into the note and never recomputed.", 400);
    }
    if ($raw !== 'plain' && $raw !== 'encrypted') {
        throw new ApFailure(
            "The `mode` field expects `plain` or `encrypted`. Received: "
            . ap_readable_excerpt($raw) . ".", 400);
    }
    if ($raw === 'plain' && !(ap_is_self_hosted($config) && $project['mode'] === 'plain')) {
        throw new ApFailure(
            "Plain write refused for project " . ap_short_project($id) . ".\n"
            . (ap_is_self_hosted($config)
                ? "This project is declared in `encrypted` mode: there is no going back, "
                  . "the database does not decrypt itself."
                : "This server is a relay. Plain mode is impossible here: it has no "
                  . "access restriction to offer, and the notes would be readable by its "
                  . "operator.")
            . "\nThe note was not saved.",
            400);
    }
    return $raw;
}

/**
 * An encrypted envelope, checked on its SHAPE alone.
 *
 *     ap<format>.<base64url nonce, 16 characters>.<base64url ciphertext+tag>
 *
 * Three checks, and each one avoids a row nobody will be able to read again:
 *
 *  - the prefix IS the format number. The server accepts only its own: it
 *    writes `format 2` in the column, and storing an `ap3` envelope under a
 *    format 2 would make a row that lies about itself. A format 3 client needs
 *    a format 3 server, and the message says so;
 *  - the nonce is exactly 16 characters (12 bytes). A reader that counts
 *    anything else must refuse the row instead of guessing; better not to write
 *    it in the first place;
 *  - the alphabet is base64url without padding, which travels through a query
 *    string, an urlencoded body and a SQL column without escaping.
 *
 * The content is not checked: it cannot be. The key does not leave the browser,
 * and that is the sole reason for all of this.
 */
function ap_field_envelope($source, $key, $max, $required, $label)
{
    $raw = isset($source[$key]) ? $source[$key] : '';
    if (!is_string($raw)) {
        throw new ApFailure("The `" . $label . "` field is malformed.", 400);
    }
    $raw = trim($raw);
    if ($raw === '') {
        if ($required) {
            throw new ApFailure(
                "The `" . $label . "` field is required in encrypted mode: it is what "
                . "carries the note.", 400);
        }
        return '';
    }

    // The length BEFORE the shape: on a 24000-character body, a regular
    // expression that fails at the end costs for nothing.
    $length = strlen($raw);   // ASCII by construction: bytes = characters
    if ($length > $max) {
        throw new ApFailure(
            "The `" . $label . "` envelope is " . $length . " characters long; "
            . "the limit is " . $max . ".\n"
            . "No truncation is applied: a truncated envelope does not decrypt, it is "
            . "lost.", 400);
    }

    $parts = explode('.', $raw);
    if (count($parts) !== 3 || $parts[0] !== 'ap' . AP_FORMAT) {
        if (count($parts) === 3 && preg_match('/^ap([0-9]{1,3})$/', $parts[0], $m)) {
            throw new ApFailure(
                "This note was written by a newer version of annotepage "
                . "(format " . $m[1] . " ; this server writes format " . AP_FORMAT . ").\n"
                . "The server does not store it: it would write `format " . AP_FORMAT
                . "` on a row that is not one.\n"
                . "Update the server.", 400);
        }
        throw new ApFailure(
            "The `" . $label . "` envelope is malformed.\n"
            . "Expected shape: ap" . AP_FORMAT . ".<nonce>.<content>", 400);
    }
    if (strlen($parts[1]) !== 16) {
        throw new ApFailure(
            "The `" . $label . "` envelope carries a nonce of "
            . strlen($parts[1]) . " characters instead of 16 (12 bytes).", 400);
    }
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $parts[1])
        || !preg_match('/^[A-Za-z0-9_-]+$/', $parts[2])) {
        throw new ApFailure(
            "The `" . $label . "` envelope contains characters outside base64url "
            . "without padding (A-Z a-z 0-9 - _).", 400);
    }

    return $raw;
}

/**
 * The path of the annotated page.
 *
 * We accept exactly what `location.pathname` produces: an absolute path
 * beginning with a single slash. The full URL is refused (another site has no
 * business here), so is the protocol-relative path `//host/...` and any `..`
 * segment, which would mix two pages into the same list of notes.
 *
 * Only called in plain mode and by the backfill action. In encrypted mode the
 * path never crosses the browser.
 */
function ap_field_page($source, $key, $max)
{
    $page = ap_field($source, $key, $max, true, 'page');

    if ($page[0] !== '/' || (isset($page[1]) && $page[1] === '/')) {
        throw new ApFailure(
            "The page path must begin with a single slash. "
            . "Received: " . $page, 400);
    }
    if (strpos($page, '..') !== false) {
        throw new ApFailure("The page path cannot contain `..`.", 400);
    }
    if (!preg_match('#^/[A-Za-z0-9/._~%()@+,;=:&-]*$#', $page)) {
        throw new ApFailure(
            "The page path contains unexpected characters. Received: " . $page, 400);
    }

    return $page;
}

/**
 * The id of the note being replied to.
 *
 * Three checks, and the last two are the ones that matter:
 *  - the parent note must EXIST;
 *  - it must belong to THE SAME PROJECT. A note id is a counter global to the
 *    server (FORMAT.md section 2.4): without this test, one project would reply
 *    to another's notes by guessing an integer, which is not hard;
 *  - it must not itself be a reply. The tool holds a single depth -- a thread
 *    that sinks would be unreadable in the text export, whose indentation is
 *    precisely the contract.
 *
 * @param ApStore $store the only object that talks to the database
 * @return array|null  the parent note, or null if this is not a reply
 */
function ap_field_reply_to($source, $key, $store, $id)
{
    $raw = isset($source[$key]) ? trim((string) $source[$key]) : '';
    if ($raw === '' || $raw === '0') {
        return null;
    }
    if (!preg_match('/^[0-9]{1,10}$/', $raw)) {
        throw new ApFailure("The id of the note being replied to is malformed.", 400);
    }

    $parent = $store->note((int) $raw, $id);
    if ($parent === null) {
        throw new ApFailure(
            "The note you are replying to does not exist (any more). "
            . "Reload the page to see the current notes.", 400);
    }
    if ($parent['reply_to'] !== null) {
        throw new ApFailure(
            "One does not reply to a reply: reply to the original note.", 400);
    }

    return $parent;
}

/**
 * Assembles a note ready to be saved, from the request.
 *
 * ONE SINGLE ROW SHAPE FOR BOTH MODES: the same columns, the same insert, the
 * same read-back query. The mode decides only what is FILLED IN -- the plain
 * fields, or the envelope. There are not two code paths here, and that is
 * intended: the second one would be the less tested.
 *
 * A reply INHERITS its parent's page index -- and, in plain mode, its page, its
 * selector, its fingerprint and its excerpt. Asking the client for them again
 * would open the door to a reply attached somewhere other than the note it
 * comments on.
 */
function ap_note_from_request($source, array $config, $store, $id, $mode)
{
    $parent = ap_field_reply_to($source, 'reply_to', $store, $id);

    $note = array(
        'project'            => $id,
        'format'             => AP_FORMAT,
        'mode'               => $mode,
        'reply_to'           => $parent === null ? null : (int) $parent['id'],
        'page'               => '',
        'selector'           => '',
        'fingerprint'        => '',
        'excerpt'            => '',
        'author'             => '',
        'text'               => '',
        'version'            => '',
        'environment'        => '',
        'viewport'           => '',
        'payload'            => '',
        'resolution_payload' => '',
    );

    // THE BLIND INDEX is computed in BOTH modes, by the client, and inherited
    // from a parent when this is a reply.
    $note['page_index'] = $parent !== null
        ? $parent['page_index']
        : ap_field_index($source, 'index', true);

    if ($mode === 'encrypted') {
        // Everything typed or observed is in the envelope: the page, the
        // author, the excerpt, the version included. Encrypting the text alone
        // would hand over the site's tree, the wording of its elements and its
        // reviewers -- that is, a good part of what a staging site has not
        // published yet. See FORMAT.md section 2.3.
        $note['payload'] = ap_field_envelope(
            $source, 'payload', $config['max_payload_length'], true, 'payload');

        foreach (array('author', 'text', 'page', 'selector', 'fingerprint',
                       'excerpt', 'version', 'environment', 'viewport') as $plain) {
            ap_reject_field($source, $plain, $plain,
                "this project is in encrypted mode, and this field would travel in the "
                . "clear to the server.");
        }
        return $note;
    }

    $note['author'] = ap_field($source, 'author', $config['max_author_length'],
                               true, 'author');
    $note['text']   = ap_field($source, 'text', $config['max_text_length'],
                               true, 'text', true);

    // Note-taking context, set by the client and never typed by hand. It holds
    // for a REPLY as much as for a note: two people can reply from two versions
    // of the site, and that is exactly what one wants to be able to tell apart
    // when a remark seems to contradict another.
    $note['version']     = ap_field($source, 'version',
                                    $config['max_version_length'], false, 'version');
    $note['environment'] = ap_field($source, 'environment',
                                    $config['max_environment_length'], false, 'environment');
    $note['viewport']    = ap_field($source, 'viewport',
                                    $config['max_viewport_length'], false, 'viewport');

    if ($parent !== null) {
        $note['page']        = $parent['page'];
        $note['selector']    = $parent['selector'];
        $note['fingerprint'] = $parent['fingerprint'];
        $note['excerpt']     = $parent['excerpt'];
    } else {
        $note['page']        = ap_field_page($source, 'page', $config['max_page_length']);
        $note['selector']    = ap_field($source, 'selector',
                                        $config['max_selector_length'], false, 'selector');
        $note['fingerprint'] = ap_field($source, 'fingerprint',
                                        $config['max_fingerprint_length'], false, 'fingerprint');
        $note['excerpt']     = ap_field($source, 'excerpt',
                                        $config['max_excerpt_length'], false, 'excerpt');
    }

    return $note;
}
