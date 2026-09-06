/* text-export.mjs — READING AND WRITING THE GRAMMAR OF THE FOUR MARGINS.
 *
 * FORMAT.md section 5 describes TWO producers for ONE grammar: the server, in
 * plain mode; this package, in encrypted mode. This file is the half that
 * falls to us, and it works both ways — reading what the server sends,
 * writing what the assistant will read.
 *
 * Doing both in the same file is not a convenience: it is the only way for
 * the parser and the writer to stay in agreement. A format read here and
 * written elsewhere drifts at the first addition.
 *
 *      0 spaces   structure line of a note
 *      2 spaces   structure line of a reply
 *      4 spaces   text of a note
 *      6 spaces   text of a reply
 *
 * THE KEY IS NOT THE FIRST WORD. It is the longest prefix of the line that
 * appears in the CLOSED list of keys, and the value is the rest. Format 1 left
 * the rule implicit and contradicted itself: "to note" is two words,
 * "page-index" is one, but the header's "notes 128" begins with "note". We
 * read from the longest to the shortest, and the ambiguity disappears.
 *
 * THREE TRAPS OF THE PARSING, drawn from the grammar itself. They are not
 * theoretical: each one, ignored, gives a half-read export with nothing to
 * signal it.
 *
 *  1. AN EMPTY LINE DOES NOT ALWAYS SEPARATE TWO NOTES. A remark can contain
 *     an empty paragraph, and the writer then leaves a line that is REALLY
 *     empty, with no four spaces (trailing spaces are the first thing a
 *     fetching tool strips). An empty line is therefore held PENDING: it joins
 *     the text if a text line follows, it separates if a structure line does.
 *
 *  2. A TEXT CAN BE INDENTED MORE THAN ITS MARGIN. A remark that quotes code
 *     begins with spaces, and the writer keeps them. In a text block of margin
 *     M, any line of at least M spaces is text; only a line of FEWER than M
 *     spaces closes it. It is unambiguous because the two structure margins, 0
 *     and 2, are below the two text margins, 4 and 6 — which is exactly what
 *     the gap of four spaces buys.
 *
 *  3. AN UNKNOWN KEY IS IGNORED IN SILENCE, and an export of a higher format
 *     number is read anyway (FORMAT.md section 7). A reader that fails on what
 *     it does not know makes the first addition impossible. That is the exact
 *     opposite of the envelope rule, where a higher number is a flat refusal:
 *     one does not guess at cryptography, one does guess at a line of text.
 */

import { FORMAT, safeValue, indent, isoDate, normalisedLines } from './format.mjs';

/* -- The keys, by the place where they can appear ------------------------ */

const HEADER_KEYS = ['tool', 'format', 'version', 'project', 'encryption',
                     'export', 'notes'];

/* The footer of the export. These two keys are NEVER note fields, even when
   they follow a note: without that exception, the count of skipped lines
   would end up filed under the last remark of the list. */
const FOOTER_KEYS = ['skipped', 'skipped-reason'];

const COMMON_KEYS = ['mode', 'author', 'date', 'version', 'environment',
                     'viewport', 'status', 'resolved', 'text',
                     'payload', 'resolution-payload', 'title-payload'];

/* `title` and `title-payload` are the second pair in this list where one key
   is a prefix of another -- `page` / `page-index` is the first. Both resolve,
   and only because cut() reads longestFirst and requires a space after the
   key: see FORMAT.md section 5.1, which now says so for both pairs. */
const NOTE_KEYS = ['note', 'page', 'page-index', 'element', 'excerpt', 'title']
    .concat(COMMON_KEYS);

const REPLY_KEYS = ['reply', 'to note'].concat(COMMON_KEYS);

/** Every known key, from the longest to the shortest. */
const longestFirst = (list) => list.slice().sort((a, b) => b.length - a.length);

const KEYS_MARGIN_0 = longestFirst([].concat(HEADER_KEYS, FOOTER_KEYS, NOTE_KEYS));
const KEYS_MARGIN_2 = longestFirst(REPLY_KEYS);

/**
 * Cuts a line into "key" and "value", or returns null if no known key starts
 * it.
 *
 * The key must be followed by a space or by the end of the line: without that
 * requirement, "notes 128" would be read as the key "note" followed by
 * "s 128" in a list where "notes" did not yet appear.
 */
const cut = (line, keys) => {
    for (const key of keys) {
        if (line === key) return { key, value: '' };
        if (line.length > key.length && line.startsWith(key + ' ')) {
            return { key, value: line.slice(key.length + 1) };
        }
    }
    return null;
};

const countSpaces = (line) => {
    let n = 0;
    while (n < line.length && line.charAt(n) === ' ') n += 1;
    return n;
};

/**
 * "resolved <date> by <name> in <version>" -> the three pieces.
 *
 * In encrypted mode the server writes only the date: it does not know the
 * name. The key stays "resolved" and the value is the rest of the line — the
 * contract nowhere says that rest must contain a name.
 *
 * ACCEPTED AMBIGUITY, and better written down than discovered: a name
 * containing " in " surrounded by spaces reads wrong. We take the LAST
 * occurrence, because a version never contains one. A badly cut name still
 * shows in full under "resolved", which we do not rewrite.
 */
const readResolved = (value) => {
    const space = value.indexOf(' ');
    if (space === -1) return { date: value, by: '', version: '' };
    const date = value.slice(0, space);
    let rest = value.slice(space + 1);
    if (!rest.startsWith('by ')) return { date, by: '', version: '' };
    rest = rest.slice(3);
    const at = rest.lastIndexOf(' in ');
    if (at === -1) return { date, by: rest, version: '' };
    return { date, by: rest.slice(0, at), version: rest.slice(at + 4) };
};

const emptyNote = () => ({
    id: 0, reply_to: null, mode: 'plain',
    page: '', page_index: '', selector: '', excerpt: '', title: '',
    author: '', text: '', created_at: '',
    version: '', environment: '', viewport: '',
    resolved_at: null, resolved_by: '', resolved_version: '',
    payload: '', resolution_payload: '', title_payload: '',
    replies: [],
});

/** Files a "key value" line into a note. Unknown keys never get here: cut()
    has already ignored them. */
const place = (note, key, value) => {
    switch (key) {
        case 'note': case 'reply': note.id = parseInt(value, 10) || 0; break;
        case 'to note': note.reply_to = parseInt(value, 10) || 0; break;
        case 'page': note.page = value; break;
        case 'page-index': note.page_index = value; break;
        case 'element': note.selector = value; break;
        case 'excerpt': note.excerpt = value; break;
        case 'title': note.title = value; break;
        case 'mode': note.mode = value; break;
        case 'author': note.author = value; break;
        case 'date': note.created_at = value; break;
        case 'version': note.version = value; break;
        case 'environment': note.environment = value; break;
        case 'viewport': note.viewport = value; break;
        case 'payload': note.payload = value; break;
        case 'resolution-payload': note.resolution_payload = value; break;
        case 'title-payload': note.title_payload = value; break;
        case 'status': break;   // "status open": the absence of "resolved" says it
        case 'resolved': {
            const read = readResolved(value);
            note.resolved_at = read.date;
            note.resolved_by = read.by;
            note.resolved_version = read.version;
            break;
        }
        default: break;
    }
};

/**
 * Parses an export and returns { header, notes, footer }.
 *
 * The notes are in the order of the export, each parent carrying its replies.
 * Nothing is validated beyond the grammar: a date that is not one comes back
 * as it stands. That is not negligence — this parser also reads exports of a
 * format newer than its own, and refusing a value we do not understand would
 * lose the others.
 */
export const readExport = (text) => {
    const header = {};
    const footer = {};
    const notes = [];

    let current = null;       // the parent note in progress
    let target = null;        // the note or reply that receives the lines
    let textMargin = -1;      // -1: we are not inside a text block
    let textParts = [];
    let pendingBlanks = 0;

    const closeText = () => {
        if (textMargin === -1) return;
        // The empty lines PENDING at the moment of closing are lost: they are
        // the ones separating this note from the next, not lines of the text.
        // That is the exact converse of trap 1.
        target.text = textParts.join('\n');
        textMargin = -1;
        textParts = [];
    };

    /* NORMALISED ON THE WAY IN, not only on the way out. FORMAT.md section 5.1
       says every end of line is reduced to a plain line feed "on writing AND on
       reading back", and this reader was doing only the first half: an export
       that crossed a proxy which rewrote its line endings arrived with a `\r`
       glued to the end of every value, and it travelled into a name. The
       function is the one the writer already uses, so the two halves cannot
       drift apart. */
    for (const line of normalisedLines(String(text == null ? '' : text)).split('\n')) {
        if (line.trim() === '') {
            // Pending: this empty line belongs to the text if text follows, it
            // separates two notes otherwise. We cannot decide here.
            pendingBlanks += 1;
            continue;
        }

        const spaces = countSpaces(line);

        if (textMargin !== -1 && spaces >= textMargin) {
            for (let i = 0; i < pendingBlanks; i += 1) textParts.push('');
            pendingBlanks = 0;
            textParts.push(line.slice(textMargin));
            continue;
        }

        closeText();
        pendingBlanks = 0;

        if (spaces === 0) {
            const piece = cut(line, KEYS_MARGIN_0);
            if (!piece) continue;              // unknown key: silence (trap 3)

            if (FOOTER_KEYS.includes(piece.key)) {
                footer[piece.key] = piece.value;
                continue;
            }
            if (piece.key === 'note') {
                current = emptyNote();
                target = current;
                notes.push(current);
                place(target, piece.key, piece.value);
                continue;
            }
            if (current === null) {
                // Before the first note: this is the header.
                if (HEADER_KEYS.includes(piece.key)) header[piece.key] = piece.value;
                continue;
            }
            if (piece.key === 'text') {
                target = current;
                textMargin = 4;
                continue;
            }
            target = current;
            place(target, piece.key, piece.value);
            continue;
        }

        if (spaces === 2 && current !== null) {
            const piece = cut(line.slice(2), KEYS_MARGIN_2);
            if (!piece) continue;
            if (piece.key === 'reply') {
                target = emptyNote();
                target.reply_to = current.id;
                current.replies.push(target);
                place(target, piece.key, piece.value);
                continue;
            }
            if (target === null || target === current) {
                // A reply line with no "reply" starting it: the line is an
                // orphan, we file it nowhere rather than attribute it to the
                // parent.
                continue;
            }
            if (piece.key === 'text') {
                textMargin = 6;
                continue;
            }
            place(target, piece.key, piece.value);
            continue;
        }

        // Unexpected margin outside a text block: we ignore it, like an
        // unknown key. It comes from a newer format, or from a file copied
        // wrong; in both cases the rest reads.
    }

    closeText();

    return { header, notes, footer };
};

/* -- Writing -------------------------------------------------------------
   What this package produces is, word for word, what the server would produce
   if it had the key. A tool that reads the export does not know — and does
   not have to know — which of the two producers wrote it. That is FORMAT.md
   section 5.3, and it is why there is NO "produced by the MCP package" line
   here: it would be handy, and it would break the chapter's only promise. */

const keyLine = (margin, key, value) => {
    const v = safeValue(value);
    return v === '' ? '' : margin + key + ' ' + v + '\n';
};

const block = (note, margin, isReply) => {
    let out = '';
    if (isReply) {
        out += margin + 'reply ' + (parseInt(note.id, 10) || 0) + '\n';
        out += margin + 'to note ' + (parseInt(note.reply_to, 10) || 0) + '\n';
    } else {
        out += 'note ' + (parseInt(note.id, 10) || 0) + '\n';
        out += keyLine('', 'page', note.page);
        out += keyLine('', 'page-index', note.page_index);
        out += keyLine('', 'element', note.selector);
        out += keyLine('', 'excerpt', note.excerpt);
        /* Under the excerpt, because it answers what the excerpt cannot: the
           excerpt is the text of the element and says WHERE the remark is; the
           title says what is wrong with it. Absent when nobody has written one,
           which is what `open --untitled` looks for. */
        out += keyLine('', 'title', note.title);
    }

    /* "mode encrypted" is emitted only for an encrypted note. A plain note has
       no "mode" line, and neither does a format-1 note: the same absence, the
       same meaning. Format-1 exports therefore stay valid as they are. */
    if (note.mode === 'encrypted') out += margin + 'mode encrypted\n';

    out += keyLine(margin, 'author', note.author);
    out += keyLine(margin, 'date', note.created_at);
    out += keyLine(margin, 'version', note.version);
    out += keyLine(margin, 'environment', note.environment);
    out += keyLine(margin, 'viewport', note.viewport);

    if (note.resolved_at) {
        out += margin + 'resolved ' + safeValue(note.resolved_at)
            + (note.resolved_by ? ' by ' + safeValue(note.resolved_by) : '')
            + (note.resolved_version ? ' in ' + safeValue(note.resolved_version) : '')
            + '\n';
    } else {
        out += margin + 'status open\n';
    }

    /* The envelopes are NOT rewritten. The server emits them because it has
       nothing else to offer; we have the text, and an envelope copied next to
       its own plaintext teaches nobody anything — it only adds a thousand
       characters to a document meant to be read. Whoever wants them asks the
       server, it is the same address. */

    out += margin + 'text\n';
    out += indent(note.text, margin + '    ');
    return out;
};

/**
 * The complete export, filled in, in the grammar of the four margins.
 *
 * @param {object} header  tool, format, version, project, encryption
 * @param {Array}  notes   decrypted notes, each with its replies
 * @param {object} footer  skipped, skipped-reason — what we did NOT manage to
 *                         read
 */
export const writeExport = (header, notes, footer) => {
    let out = '';
    out += 'tool annotepage\n';
    out += 'format ' + (header.format || FORMAT) + '\n';
    out += keyLine('', 'version', header.version);
    out += keyLine('', 'project', header.project);
    out += keyLine('', 'encryption', header.encryption);
    out += 'export ' + isoDate() + '\n';
    out += 'notes ' + notes.reduce((n, m) => n + 1 + m.replies.length, 0) + '\n';
    out += '\n';

    if (notes.length === 0) {
        out += 'no notes recorded\n';
    }

    notes.forEach((note, position) => {
        if (position > 0) out += '\n';
        out += block(note, '', false);
        for (const reply of note.replies) {
            out += '\n' + block(reply, '  ', true);
        }
    });

    out += '\n';

    /* What we could not read is SAID, and counted. A note that disappears in
       silence is worse than a note we announce we cannot read: the first makes
       you believe the review is finished. */
    if (footer && footer.skipped) {
        out += 'skipped ' + footer.skipped + '\n';
        out += keyLine('', 'skipped-reason', footer['skipped-reason']);
    }

    return out;
};
