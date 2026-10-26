/*
 * text-export.js -- THE FORMAT OF READING FROM A DISTANCE, ported from
 * text-export.php.
 *
 * This format is a CONTRACT (FORMAT.md section 5): it is read by humans and by
 * assistants that fetch the address over a plain HTTP request, with no access
 * to the server. The indentation ALONE says what one is reading:
 *
 *      0 spaces   structure line of a note
 *      2 spaces   structure line of a reply
 *      4 spaces   text of a note
 *      6 spaces   text of a reply
 *
 * A missing line means an empty value: a key is never written to say there is
 * nothing. One piece of information per line, "key value", the key being the
 * longest prefix of the line that is in the closed list of keys.
 *
 * TWO PRODUCERS, ONE GRAMMAR. This is the first. In plain mode it produces the
 * COMPLETE export. In encrypted mode it cannot -- it has neither paths, names
 * nor texts -- so it produces a STRUCTURAL export: the same grammar with the
 * only keys it knows, plus the envelopes under `payload`, `resolution-payload`
 * and `title-payload` so the second producer (annotepage-mcp, which has the
 * key) has something to decrypt. The keys it cannot fill are absent.
 *
 * THE FORMAT DEFENDS ITSELF and does not trust the storage: every value goes
 * through safeValue() or indent(), which bring line endings back to \n and
 * strip control characters a second time. The trust boundary already did this
 * on the way in, but a row can predate it, a store can be replaced, and in
 * encrypted mode the boundary saw nothing of the text -- it slept in the
 * envelope, and is cleaned here after the only producer that can.
 *
 * ONE DIFFERENCE from the PHP: it returns the whole export as a string rather
 * than streaming it. A review table holds thousands of rows, and a string an
 * embedded handler returns is what a Response wraps anyway. The order the store
 * walks in is still the contract's, since store.all() keeps it.
 */

import { AP_FORMAT } from './constants.js';
import { apIsoDate, utcStamp } from './notes.js';

// The line endings a reader counts as one, built from code points so no line
// separator sits in this source. The control characters that are neither \n
// nor \t are stripped after.
const EOL_SEPARATORS = new RegExp('[' + String.fromCharCode(0x0D, 0x85, 0x2028, 0x2029) + ']', 'g');
const CONTROLS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function normalisedLines(text) {
    return String(text == null ? '' : text)
        .replace(/\r\n/g, '\n')
        .replace(EOL_SEPARATORS, '\n')
        .replace(CONTROLS, '');
}

/** A value on a "key value" line: it cannot contain a line ending, on pain of
 *  manufacturing a second, unindented one. */
function safeValue(value) {
    return normalisedLines(value).replace(/\n/g, ' ').trim();
}

/** Indents every line of a block of text. An empty line stays empty, with no
 *  spaces -- trailing spaces are what a fetching tool strips. */
function indent(text, margin) {
    return normalisedLines(text).split('\n').map((line) => (line === '' ? '' : margin + line)).join('\n') + '\n';
}

/** `yes`, `no` or `mixed`. `mixed` is the normal case of an installation that
 *  changed its mind; it is said, not hidden. */
function encryptionWord(breakdown) {
    const plain = Number(breakdown.plain);
    const encrypted = Number(breakdown.encrypted);
    if (encrypted > 0 && plain > 0) {
        return 'mixed';
    }
    return encrypted > 0 ? 'yes' : 'no';
}

/**
 * Produces the complete export for a project, as a string. Gathers the counts
 * and the ordered notes from the store -- in the PHP's order: the counts first,
 * then the walk, because the header's `notes`/`threads` are written before the
 * first row.
 *
 * @param {object} args `{ config, store, id }`
 * @returns {string}
 */
export function writeTextExport({ config, store, id }) {
    const version = config.version;
    const retention = config.maxNoteAgeDays;
    const total = store.count(id);
    const threads = store.countThreads(id);
    const breakdown = store.modeBreakdown(id);

    const out = [];
    out.push('tool annotepage\n');
    out.push('format ' + AP_FORMAT + '\n');
    out.push('version ' + safeValue(version) + '\n');
    // The project id is written IN FULL, unlike in the diagnostic: one has to
    // have it to obtain this export, so it teaches its reader nothing, and it
    // says which project a file found later came from.
    out.push('project ' + safeValue(id) + '\n');
    out.push('encryption ' + encryptionWord(breakdown) + '\n');
    out.push('export ' + apIsoDate(utcStamp()) + '\n');
    if (retention > 0) {
        out.push('retention ' + retention + ' days\n');
    }
    // Two counts: `notes` is entries (replies included), `threads` is remarks.
    out.push('notes ' + total + '\n');
    out.push('threads ' + threads + '\n');
    out.push('\n');

    if (total === 0) {
        out.push('no notes recorded\n');
        return out.join('');
    }

    let written = 0;
    let skipped = 0;

    for (const row of store.all(id)) {
        // Unknown mode: skipped and counted, neither guessed nor shown empty.
        if (row.mode !== 'plain' && row.mode !== 'encrypted') {
            skipped++;
            continue;
        }
        const encrypted = row.mode === 'encrypted';
        const isReply = row.reply_to !== null;
        const margin = isReply ? '  ' : '';

        if (!isReply) {
            if (written > 0) {
                out.push('\n');   // separates notes, never precedes the first
            }
            out.push('note ' + Number(row.id) + '\n');
            if (!encrypted && row.page !== '') {
                out.push('page ' + safeValue(row.page) + '\n');
            }
            if (row.page_index !== '') {
                out.push('page-index ' + safeValue(row.page_index) + '\n');
            }
            if (!encrypted && row.selector !== '') {
                out.push('element ' + safeValue(row.selector) + '\n');
            }
            if (!encrypted && row.excerpt !== '') {
                out.push('excerpt ' + safeValue(row.excerpt) + '\n');
            }
            if (!encrypted && row.title !== '') {
                out.push('title ' + safeValue(row.title) + '\n');
            }
        } else {
            out.push('\n');
            out.push(margin + 'reply ' + Number(row.id) + '\n');
            out.push(margin + 'to note ' + Number(row.reply_to) + '\n');
        }

        if (encrypted) {
            out.push(margin + 'mode encrypted\n');
        }
        if (!encrypted) {
            out.push(margin + 'author ' + safeValue(row.author) + '\n');
        }
        out.push(margin + 'date ' + safeValue(row.created_at) + '\n');
        if (!encrypted) {
            if (row.version !== '') {
                out.push(margin + 'version ' + safeValue(row.version) + '\n');
            }
            if (row.environment !== '') {
                out.push(margin + 'environment ' + safeValue(row.environment) + '\n');
            }
            if (row.viewport !== '') {
                out.push(margin + 'viewport ' + safeValue(row.viewport) + '\n');
            }
        }
        if (row.resolved_at !== null) {
            out.push(margin + 'resolved ' + safeValue(row.resolved_at)
                + (!encrypted && row.resolved_by !== '' ? ' by ' + safeValue(row.resolved_by) : '')
                + (!encrypted && row.resolved_version !== '' ? ' in ' + safeValue(row.resolved_version) : '')
                + '\n');
        } else {
            out.push(margin + 'status open\n');
        }

        if (encrypted) {
            // The envelopes, for the second producer. base64url, nothing to
            // clean, but through safeValue() anyway: a guarantee that applies
            // "except here" is not one.
            if (row.payload !== '') {
                out.push(margin + 'payload ' + safeValue(row.payload) + '\n');
            }
            if (row.resolution_payload !== '') {
                out.push(margin + 'resolution-payload ' + safeValue(row.resolution_payload) + '\n');
            }
            if (row.title_payload !== '') {
                out.push(margin + 'title-payload ' + safeValue(row.title_payload) + '\n');
            }
        } else {
            out.push(margin + 'text\n');
            out.push(indent(row.text, margin + '    '));   // four more than the structure
        }
        written++;
    }

    out.push('\n');
    if (skipped > 0) {
        // Two keys: `skipped` is a prefix of `skipped-reason`, and the reader
        // takes the longest prefix in the list.
        out.push('skipped ' + skipped + '\n');
        out.push('skipped-reason these notes carry a mode that this version of annotepage '
            + 'does not know; they were not shown, and they were not lost.\n');
    }
    return out.join('');
}

export default writeTextExport;
