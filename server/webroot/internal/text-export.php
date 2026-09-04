<?php
/**
 * text-export.php -- THE FORMAT OF READING FROM A DISTANCE.
 *
 * This file deserves to exist on its own because this format is a CONTRACT: it
 * is read by humans, and by assistants that fetch the page over a plain HTTP
 * request, with no access to the server.
 *
 * Five requirements dictate it, in this order:
 *
 *  1. text/plain, never JSON nor HTML. A fetching tool degrades formatting;
 *     JSON comes out of it broken, text comes out readable.
 *  2. No decorative punctuation -- no box, no line of dashes, no bullet.
 *     Everything that "looks nice" is what disappears first.
 *  3. One piece of information per line, in the form "key value". The key is
 *     NOT the first word: it is the longest prefix of the line that appears in
 *     the closed list of keys, and the value is the rest. The nuance is not
 *     theoretical -- `to note` is two words.
 *  4. One block per note, separated by an empty line. Replies follow their
 *     parent note, indented by TWO spaces.
 *  5. Dates in ISO 8601 with an explicit offset. A date with no timezone is not
 *     a date.
 *
 * THE INDENTATION ALONE SAYS WHAT ONE IS READING, and that is what makes the
 * format parseable without ambiguity:
 *
 *      0 spaces   structure line of a note
 *      2 spaces   structure line of a reply
 *      4 spaces   text of a note
 *      6 spaces   text of a reply
 *
 * Hence the gap of FOUR spaces between a key and its text, where two would have
 * been enough for the eye: without it, a remark beginning with the word `reply`
 * would be indistinguishable from the start of a reply.
 *
 * A missing line means an empty value: we do not write a key in order to say
 * there is nothing.
 *
 * TWO PRODUCERS, ONE GRAMMAR
 *
 * This file is the first of the two. In plain mode it produces the COMPLETE
 * export, byte for byte like format 1 apart from the header lines.
 *
 * In encrypted mode it cannot: it has neither the paths, nor the names, nor the
 * texts. It then produces a STRUCTURAL export -- the same grammar, with the only
 * keys it knows. The keys it cannot fill are ABSENT, which, by the contract,
 * means exactly "empty value". No `text` line is emitted: a `text` line
 * followed by nothing would announce an empty remark, which would be false. A
 * reader that fetches this export therefore knows, unambiguously and with no
 * special-case code, that it is missing the key.
 *
 * The complete export in encrypted mode is produced by annotepage-mcp, which
 * has the key. It has one single source for that: this address. That is why
 * the structural export ALSO emits the envelopes, under the keys `payload` and
 * `resolution-payload`. Without them the second producer would have nothing to
 * decrypt and the promise of section 5.3 would be empty. These are added keys,
 * which does not change the format number (FORMAT.md section 7): a reader that
 * does not know them ignores them, and what is left is exactly the structural
 * export. They make nothing readable -- that is their whole point.
 *
 * THE FORMAT DEFENDS ITSELF, AND DOES NOT TRUST THE STORAGE.
 *
 * input.php already brings back to \n everything a reader counts as an end of
 * line, and strips control characters. That would be enough if there were only
 * one way of writing into the storage and one single version of the code over
 * time. Neither is true:
 *
 *  - the table outlives updates of the tool. A note saved BEFORE the trust
 *    boundary knew about U+2028 is still there, and here it would manufacture a
 *    whole note that was never written;
 *  - whoever replaces store.php (that is planned: see its header) replaces the
 *    way of writing, not this file;
 *  - in encrypted mode the trust boundary saw NOTHING of the text: it sleeps in
 *    the envelope. The cleanup happens at the producer that decrypts, after
 *    decryption. Here there is nothing to clean, and that is exactly why it has
 *    to be named.
 *
 * Every value written therefore goes through ap_safe_value() or ap_indent(),
 * which bring line endings back and strip control characters a second time. It
 * is a redundancy we accept: the indentation contract is what an assistant with
 * no access to the server reads, and a format guarantee must depend on nothing
 * but the code that writes it.
 */

if (!defined('AP_INTERNAL')) {
    http_response_code(404);
    exit;
}

/**
 * Writes the complete export to standard output, AS A STREAM.
 *
 * Nothing is accumulated: neither here, nor in the database driver (see
 * ApStore::all()). The memory used therefore does not depend on the number of
 * notes, whose growth nothing bounds.
 *
 * This file does NOT know the storage: it receives a count and an iterator of
 * already-normalised notes. That is what makes it a format, and not a second
 * way of reading the database.
 *
 * @param string      $version   version of the tool, to know from a distance
 *                               what is online
 * @param string      $project   id of the exported project
 * @param array       $breakdown array('plain' => int, 'encrypted' => int)
 * @param int         $total     total number of notes, replies included
 * @param Traversable $notes     ordered notes: each parent followed by its own
 * @param int         $retention days a thread is kept, 0 when nothing expires.
 *                               Passed in rather than read from a global: this
 *                               file has no configuration in scope, and an
 *                               undefined variable read through empty() would
 *                               have silently printed nothing, forever.
 */
function ap_write_text_export($version, $project, array $breakdown, $total, $notes, $retention = 0)
{
    echo "tool annotepage\n";
    echo "format " . AP_FORMAT . "\n";
    echo "version " . ap_safe_value($version) . "\n";
    // The project id is written IN FULL, unlike in the diagnostic. That is not
    // an inconsistency: one has to have the id to obtain this export, so it
    // teaches its reader nothing, and it makes it possible to know which
    // project a file found six months later came from.
    echo "project " . ap_safe_value($project) . "\n";
    echo "encryption " . ap_encryption_word($breakdown) . "\n";
    echo "export " . gmdate('Y-m-d\TH:i:sP') . "\n";
    // RETENTION, when the server has one. FORMAT.md section 5.2 allows adding a
    // header line and never changing one, so an old reader ignores this and
    // keeps working. It is here because a reader -- a person or an assistant --
    // has to know that what is missing may have expired rather than never been
    // written. A server that quietly forgets is a server nobody can trust twice.
    if ((int) $retention > 0) {
        echo "retention " . ((int) $retention) . " days\n";
    }
    echo "notes " . $total . "\n";
    echo "\n";

    if ($total === 0) {
        echo "no notes recorded\n";
        return;
    }

    $written = 0;
    $skipped = 0;

    foreach ($notes as $row) {
        // Unknown mode: the row is SKIPPED, and counted. Neither guessed, nor
        // rendered empty without saying so -- a note shown without its text
        // looks like an empty note, and nobody is going to check in the
        // database.
        if ($row['mode'] !== 'plain' && $row['mode'] !== 'encrypted') {
            $skipped++;
            continue;
        }

        $encrypted = ($row['mode'] === 'encrypted');
        $isReply = $row['reply_to'] !== null;
        $margin = $isReply ? '  ' : '';

        if (!$isReply) {
            // An empty line SEPARATES notes; it does not precede all of them,
            // otherwise the first block would start with blankness.
            if ($written > 0) {
                echo "\n";
            }
            echo "note " . (int) $row['id'] . "\n";
            if (!$encrypted && $row['page'] !== '') {
                echo "page " . ap_safe_value($row['page']) . "\n";
            }
            if ($row['page_index'] !== '') {
                echo "page-index " . ap_safe_value($row['page_index']) . "\n";
            }
            if (!$encrypted && $row['selector'] !== '') {
                echo "element " . ap_safe_value($row['selector']) . "\n";
            }
            if (!$encrypted && $row['excerpt'] !== '') {
                echo "excerpt " . ap_safe_value($row['excerpt']) . "\n";
            }
        } else {
            echo "\n";
            echo $margin . "reply " . (int) $row['id'] . "\n";
            echo $margin . "to note " . (int) $row['reply_to'] . "\n";
        }

        // `mode encrypted` is emitted only for an encrypted note. A plain note
        // has no `mode` line, and neither does a format-1 note: the same
        // absence, the same meaning. Format-1 exports therefore stay valid as
        // they are.
        if ($encrypted) {
            echo $margin . "mode encrypted\n";
        }

        if (!$encrypted) {
            echo $margin . "author " . ap_safe_value($row['author']) . "\n";
        }
        echo $margin . "date " . ap_safe_value($row['created_at']) . "\n";
        // Note-taking context. Written only if it exists: an empty `version`
        // line would suggest an unknown version when the site simply did not
        // declare one.
        if (!$encrypted) {
            if ($row['version'] !== '') {
                echo $margin . "version " . ap_safe_value($row['version']) . "\n";
            }
            if ($row['environment'] !== '') {
                echo $margin . "environment " . ap_safe_value($row['environment']) . "\n";
            }
            if ($row['viewport'] !== '') {
                echo $margin . "viewport " . ap_safe_value($row['viewport']) . "\n";
            }
        }
        // Resolution state. A resolved note stays in the export: that is how
        // one checks that an announced fix really happened.
        //
        // In encrypted mode the DATE of the fix is known to the server (it uses
        // it to sort open/resolved without decrypting anything) but not the name
        // of the fixer: the line therefore stops at the date. The key stays
        // `resolved` and the value is the rest of the line -- nowhere does the
        // contract say that rest must contain a name.
        if ($row['resolved_at'] !== null) {
            echo $margin . "resolved " . ap_safe_value($row['resolved_at'])
                . (!$encrypted && $row['resolved_by'] !== ''
                    ? ' by ' . ap_safe_value($row['resolved_by']) : '')
                . (!$encrypted && $row['resolved_version'] !== ''
                    ? ' in ' . ap_safe_value($row['resolved_version']) : '')
                . "\n";
        } else {
            echo $margin . "status open\n";
        }

        if ($encrypted) {
            // The envelopes, for the second producer. They are base64url:
            // nothing to clean in them, but they go through ap_safe_value()
            // anyway, because a format guarantee that applies "except here" is
            // not one.
            if ($row['payload'] !== '') {
                echo $margin . "payload " . ap_safe_value($row['payload']) . "\n";
            }
            if ($row['resolution_payload'] !== '') {
                echo $margin . "resolution-payload "
                    . ap_safe_value($row['resolution_payload']) . "\n";
            }
        } else {
            echo $margin . "text\n";
            // Four spaces more than the structure: see the header.
            echo ap_indent($row['text'], $margin . '    ');
        }

        $written++;

        // As it goes: a long export must not wait for its end to start
        // arriving.
        if (($written % 25) === 0) {
            flush();
        }
    }

    echo "\n";

    if ($skipped > 0) {
        // Two lines, two keys: `skipped` is a prefix of `skipped-reason`, and
        // the reading rule takes the LONGEST prefix present in the list of
        // keys. A bare sentence at margin zero would be a structure line with
        // no key -- that is, noise in a format where every line reads
        // "key value".
        echo "skipped " . $skipped . "\n";
        echo "skipped-reason these notes carry a mode that this version of "
            . "annotepage does not know; they were not shown, and they were not "
            . "lost.\n";
    }
}

/**
 * `yes`, `no` or `mixed`.
 *
 * `mixed` is the normal case of an installation that changed its mind: it ran
 * in the clear, then encryption was switched on. It is said, it is not hidden --
 * a reader that only gets half the texts must know why before concluding that
 * the tool loses notes.
 */
function ap_encryption_word(array $breakdown)
{
    $plain     = (int) $breakdown['plain'];
    $encrypted = (int) $breakdown['encrypted'];
    if ($encrypted > 0 && $plain > 0) {
        return 'mixed';
    }
    return $encrypted > 0 ? 'yes' : 'no';
}

/**
 * Brings every line ending, whatever it is, back to \n, and strips the control
 * characters that are neither \n nor \t.
 *
 * The list is input.php's, and for the same reason: a character a reader counts
 * as an end of line and that we let through manufactures a structure line where
 * there is nothing but text.
 */
function ap_normalised_lines($text)
{
    $text = str_replace(
        array("\r\n", "\r", "\xC2\x85", "\xE2\x80\xA8", "\xE2\x80\xA9"),
        "\n", (string) $text);
    $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text);
    // preg_replace returns null on a string that is not valid UTF-8: we then
    // fall back on a byte-by-byte version rather than erase the note. Losing an
    // accent beats losing a remark.
    if ($clean === null) {
        $clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text);
    }
    return (string) $clean;
}

/**
 * A value written on a "key value" line: it cannot contain a line ending,
 * on pain of manufacturing a second, unindented one.
 */
function ap_safe_value($value)
{
    return trim(str_replace("\n", ' ', ap_normalised_lines($value)));
}

/**
 * Indents every line of a block of text.
 *
 * An empty line stays EMPTY, with no spaces: trailing spaces are exactly what a
 * fetching tool strips, and the block would then look inconsistent.
 */
function ap_indent($text, $margin)
{
    $out = '';
    $lines = explode("\n", ap_normalised_lines($text));
    foreach ($lines as $line) {
        $out .= ($line === '' ? '' : $margin . $line) . "\n";
    }
    return $out;
}
