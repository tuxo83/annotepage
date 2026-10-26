/*
 * input.js -- THE TRUST BOUNDARY, ported from input.php.
 *
 * Everything coming from the browser passes through here and nowhere else:
 * length bounds, control-character stripping, the shape of a page path, of a
 * project id, of an encrypted envelope, and the existence and depth of the note
 * a reply hangs from.
 *
 * What it does NOT do, and why -- unchanged from the PHP:
 *  - it escapes nothing for HTML. The text is stored exactly as typed; the JSON
 *    response and the text export are what make it harmless in THEIR format.
 *  - it never builds SQL. The store uses prepared statements, without exception.
 *  - it DECRYPTS nothing, and cannot. In encrypted mode it checks the SHAPE of
 *    the envelope and its length, never its content. The per-field bounds then
 *    become a client-side convention -- the price of end-to-end encryption, and
 *    the tool addresses a review team, not a hostile audience.
 *
 * ONE DIFFERENCE from the PHP, named rather than hidden: the PHP refuses a byte
 * that is not valid UTF-8, because it is about to insert into utf8mb4. By the
 * time a request body reaches this code it is already a decoded JS string, so
 * that check has nothing left to test and is not ported. The line-ending
 * normalisation, which is the one that defends the export's format, is.
 */

import { ApFailure } from './errors.js';
import {
    AP_FORMAT, AP_LEN_TEXT, AP_LEN_AUTHOR, AP_LEN_PAGE, AP_LEN_SELECTOR,
    AP_LEN_FINGERPRINT, AP_LEN_EXCERPT, AP_LEN_VERSION, AP_LEN_ENVIRONMENT,
    AP_LEN_VIEWPORT, AP_LEN_PAYLOAD,
} from './constants.js';

/** A short, printable fragment of a doubtful value, for an error message. */
export function readableExcerpt(value) {
    return String(value).replace(/[^\x20-\x7E]/g, '').slice(0, 60);
}

/** The first six characters of an id, for a message. NEVER the whole id: it is
 *  what gives access to the project's rows, and a message gets copied into a
 *  ticket, a log, a screenshot. */
export function shortProject(id) {
    return String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 6) + '...';
}

/** 22 base64url characters: the shape of a project id and of a blind index. */
export function isWellFormedId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{22}$/.test(id);
}

/** Length in CODE POINTS, not UTF-16 units: an astral character counts as one,
 *  as a character does for the PHP's mb_strlen. */
function lengthChars(string) {
    return [...string].length;
}

/**
 * Cleanup common to every text field. Brings every end-of-line a reader knows
 * back to \n -- not only \r\n, but \r, U+0085, U+2028 and U+2029, which a
 * "byte for byte" eye and `cat -A` both miss -- then strips the C0 controls
 * except \n and \t. The export states its structure BY INDENTATION, so a stray
 * line ending left in a value would manufacture a whole note that was never
 * written (see input.php for the measured defect).
 *
 * @param {string} value
 * @param {boolean} multiline is the field allowed to contain line breaks?
 */
function cleanText(value, multiline) {
    value = String(value);
    // \r\n, \r, U+0085, U+2028, U+2029 -> \n. (\v, \f and \x1C-\x1E are C0 and
    // fall to the strip below.)
    value = value.replace(/\r\n|\r|\u0085|\u2028|\u2029/g, '\n');
    value = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (!multiline) {
        value = value.replace(/[\n\t]/g, ' ').replace(/ {2,}/g, ' ');
    } else {
        // At most two consecutive line breaks: a paragraph, not a blank page
        // that would deform the export.
        value = value.replace(/\n{3,}/g, '\n\n');
    }
    return value.trim();
}

/**
 * A view over the request parameters that rejects a key sent more than once.
 * The PHP guards every read with is_string() because `id[]=x` arrives as an
 * array and (int) of a non-empty array is 1. The URL/body parser here turns a
 * repeated key into several values; a field this code reads may have only one.
 */
export class Params {
    /** @param {URLSearchParams} search */
    constructor(search) {
        this.search = search;
    }

    /** The single string under `key`, '' when absent, or a thrown 400 when the
     *  key was sent more than once (the array-injection shape). */
    get(key) {
        const all = this.search.getAll(key);
        if (all.length === 0) {
            return '';
        }
        if (all.length > 1) {
            throw new ApFailure('The `' + key + '` field is malformed.', 400);
        }
        return all[0];
    }

    has(key) {
        return this.search.getAll(key).length > 0;
    }
}

/** Reads a field, cleans it, bounds it. Over the length is a 400 GIVING the
 *  limit -- a silent truncation would drop the end of a remark unseen. */
export function field(params, key, max, required, label, multiline = false) {
    const value = cleanText(params.get(key), multiline);
    if (value === '') {
        if (required) {
            throw new ApFailure('The `' + label + '` field is required.', 400);
        }
        return '';
    }
    const length = lengthChars(value);
    if (length > max) {
        throw new ApFailure(
            'The `' + label + '` field is ' + length + ' characters long; '
            + 'the limit is ' + max + '.', 400);
    }
    return value;
}

/** Refuses a field that should not have been sent -- an `author` beside an
 *  envelope means the client got its mode wrong. Refused, not ignored: ignoring
 *  would save the note without its author's name, unnoticed until the next
 *  review. */
export function rejectField(params, key, label, reason) {
    if (!params.has(key)) {
        return;
    }
    if (params.get(key).trim() === '') {
        return;
    }
    throw new ApFailure(
        'The `' + label + '` field must not be sent: ' + reason + '\n'
        + 'The note was not saved.', 400);
}

/** A strictly positive note id from the browser. */
export function fieldId(params, key, label) {
    const raw = params.get(key).trim();
    if (raw === '') {
        throw new ApFailure('The `' + label + '` field is required.', 400);
    }
    if (!/^[0-9]{1,10}$/.test(raw) || Number(raw) <= 0) {
        throw new ApFailure('The note id `' + label + '` is malformed.', 400);
    }
    return Number(raw);
}

/** A project id from the browser: 22 base64url characters. Not checked against
 *  the configuration here -- that is the origin lock's job. */
export function fieldProject(params, key = 'project') {
    const raw = params.get(key).trim();
    if (raw === '') {
        throw new ApFailure(
            'The `project` field is required.\n'
            + "It is the project id declared by the page's tag.", 400);
    }
    if (!isWellFormedId(raw)) {
        throw new ApFailure(
            'The project id is malformed: 22 characters taken from '
            + 'A-Z a-z 0-9 - _ are expected.', 400);
    }
    return raw;
}

/** A page's blind index: 22 base64url characters. The server cannot check it
 *  -- that is the point -- so it checks the shape, and applies no path
 *  normalisation: it sees no path. */
export function fieldIndex(params, key, required, label = 'index') {
    const raw = params.get(key).trim();
    if (raw === '') {
        if (required) {
            throw new ApFailure(
                'The `' + label + '` field is required: it is what says which page '
                + 'the note belongs to.', 400);
        }
        return '';
    }
    if (!isWellFormedId(raw)) {
        throw new ApFailure(
            'The page index is malformed: 22 characters taken from '
            + 'A-Z a-z 0-9 - _ are expected.', 400);
    }
    return raw;
}

/** A yes/no flag. A missing field takes the default; anything but the known
 *  words is a 400. */
export function fieldFlag(params, key, dflt, label) {
    if (!params.has(key)) {
        return dflt;
    }
    const raw = params.get(key).toLowerCase().trim();
    if (raw === '0' || raw === 'no' || raw === 'false' || raw === '') {
        return false;
    }
    if (raw === '1' || raw === 'yes' || raw === 'true') {
        return true;
    }
    throw new ApFailure(
        'The `' + label + '` field expects 0 or 1. Received: ' + readableExcerpt(raw) + '.', 400);
}

/**
 * A note's mode: `plain` or `encrypted`, written per row and never recomputed.
 * ONE RULE FOR BOTH REFUSALS: plain is accepted only if the deployment allows
 * it AND the project declares plain. On a relay the first is false; on a
 * project that moved to encryption the second is -- there is no going back, the
 * database does not decrypt itself.
 *
 * @param {boolean} allowsPlain does this deployment allow plain mode at all?
 */
export function fieldMode(params, allowsPlain, id, project) {
    const raw = params.get('mode').toLowerCase().trim();
    if (raw === '') {
        throw new ApFailure(
            'The `mode` field is required: `plain` or `encrypted`.\n'
            + 'It is written into the note and never recomputed.', 400);
    }
    if (raw !== 'plain' && raw !== 'encrypted') {
        throw new ApFailure(
            'The `mode` field expects `plain` or `encrypted`. Received: '
            + readableExcerpt(raw) + '.', 400);
    }
    if (raw === 'plain' && !(allowsPlain && project.mode === 'plain')) {
        throw new ApFailure(
            'Plain write refused for project ' + shortProject(id) + '.\n'
            + (allowsPlain
                ? 'This project is declared in `encrypted` mode: there is no going back, '
                  + 'the database does not decrypt itself.'
                : 'This server is a relay. Plain mode is impossible here: it has no '
                  + 'access restriction to offer, and the notes would be readable by its '
                  + 'operator.')
            + '\nThe note was not saved.', 400);
    }
    return raw;
}

/**
 * An encrypted envelope, checked on its SHAPE alone:
 *   ap<format>.<16-char base64url nonce>.<base64url content>
 * The prefix must be this server's own format; a newer one is refused with the
 * message FORMAT.md section 7 demands -- the server will not write `format 2`
 * on a row that is not one. The content is not checked: it cannot be.
 */
export function fieldEnvelope(params, key, max, required, label) {
    const raw = params.get(key).trim();
    if (raw === '') {
        if (required) {
            throw new ApFailure(
                'The `' + label + '` field is required in encrypted mode: it is what '
                + 'carries the note.', 400);
        }
        return '';
    }
    // Length before shape: on a 24000-character body a regex that fails at the
    // end costs for nothing. ASCII by construction, so length is bytes.
    if (raw.length > max) {
        throw new ApFailure(
            'The `' + label + '` envelope is ' + raw.length + ' characters long; '
            + 'the limit is ' + max + '.\n'
            + 'No truncation is applied: a truncated envelope does not decrypt, it is '
            + 'lost.', 400);
    }
    const parts = raw.split('.');
    if (parts.length !== 3 || parts[0] !== 'ap' + AP_FORMAT) {
        const m = parts.length === 3 ? /^ap([0-9]{1,3})$/.exec(parts[0]) : null;
        if (m) {
            throw new ApFailure(
                'This note was written by a newer version of annotepage (format '
                + m[1] + ' ; this server writes format ' + AP_FORMAT + ').\n'
                + 'The server does not store it: it would write `format ' + AP_FORMAT
                + '` on a row that is not one.\nUpdate the server.', 400);
        }
        throw new ApFailure(
            'The `' + label + '` envelope is malformed.\n'
            + 'Expected shape: ap' + AP_FORMAT + '.<nonce>.<content>', 400);
    }
    if (parts[1].length !== 16) {
        throw new ApFailure(
            'The `' + label + '` envelope carries a nonce of ' + parts[1].length
            + ' characters instead of 16 (12 bytes).', 400);
    }
    if (!/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) {
        throw new ApFailure(
            'The `' + label + '` envelope contains characters outside base64url '
            + 'without padding (A-Z a-z 0-9 - _).', 400);
    }
    return raw;
}

/** The path of the annotated page, plain mode only. Exactly what
 *  location.pathname produces: a single leading slash, no `..`, a bounded
 *  alphabet. The full URL and the protocol-relative `//host/...` are refused. */
export function fieldPage(params, key, max) {
    const page = field(params, key, max, true, 'page');
    if (page[0] !== '/' || page[1] === '/') {
        throw new ApFailure(
            'The page path must begin with a single slash. Received: ' + page, 400);
    }
    if (page.includes('..')) {
        throw new ApFailure('The page path cannot contain `..`.', 400);
    }
    if (!/^\/[A-Za-z0-9/._~%()@+,;=:&-]*$/.test(page)) {
        throw new ApFailure(
            'The page path contains unexpected characters. Received: ' + page, 400);
    }
    return page;
}

/** The parent of a reply, or null. It must exist, belong to THE SAME PROJECT (a
 *  note id is global to the server), and not itself be a reply (one depth). */
export function fieldReplyTo(params, key, store, id) {
    const raw = params.get(key).trim();
    if (raw === '' || raw === '0') {
        return null;
    }
    if (!/^[0-9]{1,10}$/.test(raw)) {
        throw new ApFailure('The id of the note being replied to is malformed.', 400);
    }
    const parent = store.note(Number(raw), id);
    if (parent === null) {
        throw new ApFailure(
            'The note you are replying to does not exist (any more). '
            + 'Reload the page to see the current notes.', 400);
    }
    if (parent.reply_to !== null) {
        throw new ApFailure('One does not reply to a reply: reply to the original note.', 400);
    }
    return parent;
}

/**
 * Assembles a note ready to be saved, from the request. Ported from
 * ap_note_from_request().
 *
 * ONE ROW SHAPE FOR BOTH MODES: the same columns, the same insert. The mode
 * decides only what is FILLED IN -- the plain fields, or the envelope. There
 * are not two code paths, and that is intended: the second would be the less
 * tested one.
 *
 * A reply INHERITS its parent's page index -- and, in plain mode, its page,
 * selector, fingerprint and excerpt. Asking the client for them again would
 * open the door to a reply attached somewhere other than the note it comments.
 *
 * @param {Params} params
 * @param {boolean} allowsPlain unused here; the mode was settled by fieldMode
 * @param {object} store
 * @param {string} id project id
 * @param {'plain'|'encrypted'} mode
 */
export function noteFromRequest(params, allowsPlain, store, id, mode) {
    const parent = fieldReplyTo(params, 'reply_to', store, id);

    const note = {
        project: id,
        format: AP_FORMAT,
        mode,
        reply_to: parent === null ? null : Number(parent.id),
        page: '',
        selector: '',
        fingerprint: '',
        excerpt: '',
        author: '',
        text: '',
        version: '',
        environment: '',
        viewport: '',
        payload: '',
        resolution_payload: '',
    };

    // The blind index is computed in both modes by the client, and inherited
    // from a parent when this is a reply.
    note.page_index = parent !== null
        ? parent.page_index
        : fieldIndex(params, 'index', true);

    if (mode === 'encrypted') {
        // Everything typed or observed is in the envelope: the page, the
        // author, the excerpt, the version included (FORMAT.md section 2.3).
        note.payload = fieldEnvelope(params, 'payload', AP_LEN_PAYLOAD, true, 'payload');
        for (const plain of ['author', 'text', 'page', 'selector', 'fingerprint',
            'excerpt', 'version', 'environment', 'viewport']) {
            rejectField(params, plain, plain,
                'this project is in encrypted mode, and this field would travel in the '
                + 'clear to the server.');
        }
        return note;
    }

    note.author = field(params, 'author', AP_LEN_AUTHOR, true, 'author');
    note.text = field(params, 'text', AP_LEN_TEXT, true, 'text', true);
    note.version = field(params, 'version', AP_LEN_VERSION, false, 'version');
    note.environment = field(params, 'environment', AP_LEN_ENVIRONMENT, false, 'environment');
    note.viewport = field(params, 'viewport', AP_LEN_VIEWPORT, false, 'viewport');

    if (parent !== null) {
        note.page = parent.page;
        note.selector = parent.selector;
        note.fingerprint = parent.fingerprint;
        note.excerpt = parent.excerpt;
    } else {
        note.page = fieldPage(params, 'page', AP_LEN_PAGE);
        note.selector = field(params, 'selector', AP_LEN_SELECTOR, false, 'selector');
        note.fingerprint = field(params, 'fingerprint', AP_LEN_FINGERPRINT, false, 'fingerprint');
        note.excerpt = field(params, 'excerpt', AP_LEN_EXCERPT, false, 'excerpt');
    }
    return note;
}
