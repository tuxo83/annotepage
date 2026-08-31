/* notes.mjs — FETCH, DECRYPT, WRITE.
 *
 * This is where the three other files meet: api.mjs goes and gets the export,
 * text-export.mjs reads it, crypto.mjs opens the envelopes. What comes out is
 * a list of readable notes, with the exact count of what we did NOT manage to
 * read.
 *
 * ONE SINGLE SOURCE FOR READING: ?action=text. Not ?action=list — that one
 * demands a page index, hence knowing in advance which page you are looking
 * at, which is precisely what an assistant does not know. The export returns
 * everything, and FORMAT.md section 8.5 accepts that it is not paginated.
 *
 * WHAT WE COULD NOT READ IS COUNTED AND SAID. A note that disappears in
 * silence is worse than a note we announce we cannot read: the first makes you
 * believe the review is finished. Three causes, and they do not blur into one
 * another:
 *
 *   newer       envelope of a newer format. Update the package.
 *   unreadable  wrong salt, note moved, damaged bytes. GCM does not say which
 *               of the three, and that is intended.
 *   unknown     a mode this version does not know.
 */

import { readExport, writeExport } from './text-export.mjs';
import { open, seal, indexOfPath, normalisedPath, EnvelopeError } from './crypto.mjs';
import {
    readCachedExport, forgetCache, add, resolve, ApiError,
} from './api.mjs';

export class UsageError extends Error {}

const PAYLOAD_FIELDS = ['page', 'selector', 'fingerprint', 'excerpt',
                        'author', 'text', 'version', 'environment', 'viewport'];

/**
 * Opens the envelope of a note and pours its content into the row.
 *
 * The index used for the AAD is the one the server WROTE on the line. It is
 * the only source we have, and it is harmless: a changed index does not make a
 * note read somewhere else, it makes decryption fail. That is exactly the
 * AAD's role.
 *
 * Corollary, used further down: when a note opens, the index the server
 * announced is AUTHENTICATED. It served to check the tag.
 */
const openNote = async (project, note, pageIndex, counts) => {
    if (note.mode === '' || note.mode === 'plain') return note;

    if (note.mode !== 'encrypted') {
        counts.unknown += 1;
        return null;
    }
    if (!project.keys) {
        // A plain-mode configuration facing an encrypted note. That is not a
        // format error: it is a mixed database read with half the means. We
        // count it as unreadable, and the message will say so.
        counts.noSalt += 1;
        return null;
    }
    if (note.payload === '') {
        counts.unreadable += 1;
        return null;
    }

    let object;
    try {
        object = await open(project.keys.encryptionKey, project.id, pageIndex,
                            'note', note.payload);
    } catch (e) {
        if (e instanceof EnvelopeError && e.reason === 'newer') counts.newer += 1;
        else counts.unreadable += 1;
        return null;
    }

    // UNKNOWN fields of the object are ignored in silence: that is what makes
    // it possible to add one some day without changing the format number.
    for (const key of PAYLOAD_FIELDS) {
        note[key] = object[key] === undefined ? '' : String(object[key]);
    }

    if (note.resolution_payload !== '') {
        try {
            const resolution = await open(project.keys.encryptionKey, project.id,
                                          pageIndex, 'resolution', note.resolution_payload);
            note.resolved_by = resolution.by === undefined ? '' : String(resolution.by);
            note.resolved_version = resolution.version === undefined
                ? '' : String(resolution.version);
        } catch (e) {
            /* The note reads, its resolution does not. We keep the note:
               "resolved by somebody" beats nothing, and the date of the fix is
               in the clear anyway. */
            note.resolved_by = '';
            note.resolved_version = '';
            counts.unreadable_resolutions += 1;
        }
    }

    return note;
};

const readableReasons = (counts) => {
    const pieces = [];
    if (counts.newer) {
        pieces.push(counts.newer + ' written by a newer version of annotepage '
            + '(update this package)');
    }
    if (counts.unreadable) {
        pieces.push(counts.unreadable + ' impossible to decrypt: wrong salt, note '
            + 'moved, or damaged bytes');
    }
    if (counts.noSalt) {
        pieces.push(counts.noSalt + ' encrypted, while the configuration of this '
            + 'project carries no salt');
    }
    if (counts.unknown) {
        pieces.push(counts.unknown + ' carrying a mode this version does not know');
    }
    return pieces.join(' ; ');
};

/**
 * The complete state of the project: header, readable notes, counts of what is
 * not readable.
 *
 * @returns {{header: object, notes: Array, counts: object, footer: object}}
 */
export const retrieve = async (project, signal) => {
    const raw = await readCachedExport(project, signal);
    const read = readExport(raw);

    const counts = {
        newer: 0, unreadable: 0, unknown: 0, noSalt: 0,
        unreadable_resolutions: 0,
        /* The server may already have skipped lines on its side, for the same
           reason as us. Its count is not ours: we add them, we do not replace
           them. */
        server: parseInt(read.footer.skipped, 10) || 0,
    };

    const notes = [];
    for (const note of read.notes) {
        const pageIndex = note.page_index;
        const parent = await openNote(project, note, pageIndex, counts);
        if (!parent) continue;
        const replies = [];
        for (const reply of note.replies) {
            /* A reply INHERITS the page index of its parent: the server does
               not ask it for one and does not write it in the export. Its AAD
               is therefore the parent's, and that is exactly what the browser
               sealed — it was on the same page. */
            reply.page_index = pageIndex;
            const readReply = await openNote(project, reply, pageIndex, counts);
            if (readReply) replies.push(readReply);
        }
        parent.replies = replies;
        notes.push(parent);
    }

    const lost = counts.newer + counts.unreadable + counts.unknown
        + counts.noSalt + counts.server;

    return {
        header: read.header,
        notes,
        counts,
        footer: lost === 0 ? {} : {
            skipped: lost,
            'skipped-reason': readableReasons(counts)
                + (counts.server
                    ? (readableReasons(counts) ? ' ; ' : '')
                      + counts.server + ' already skipped by the server'
                    : '')
                + '. They were not shown, and they were not lost.',
        },
    };
};

/** The complete export, filled in, in the grammar of the four margins. */
export const filledExport = (state, project) =>
    writeExport({
        format: state.header.format,
        version: state.header.version,
        project: state.header.project || project.id,
        encryption: state.header.encryption,
    }, state.notes, state.footer);

/** A note is open as long as it has no date of fix. */
export const isOpen = (note) => !note.resolved_at;

export const findNote = (state, id) => {
    const wanted = parseInt(id, 10);
    for (const note of state.notes) {
        if (note.id === wanted) return { note, parent: null };
        for (const reply of note.replies) {
            if (reply.id === wanted) return { note: reply, parent: note };
        }
    }
    return null;
};

/* -- Writing ------------------------------------------------------------- */

/**
 * This package's write policy. FORMAT.md section 8.4 leaves the question open:
 * "what an MCP server is allowed to do on its own" is not written, and the
 * format allows all of it. Here is what is settled HERE, and it binds only
 * this package:
 *
 *  - read_only in the configuration cuts every write. It is the setting to
 *    choose when plugging an assistant onto a review you do not know yet;
 *  - every write is SIGNED with the name declared in the configuration. A
 *    thread where everybody signs and one voice does not is a thread you doubt
 *    entirely. The "author" field is therefore required as soon as writing is
 *    allowed;
 *  - this package NEVER creates a new note, only replies and resolutions. An
 *    annotepage note is pinned to an element of a page: with no selector and
 *    no fingerprint, it is not a note in context, it is a message in a note
 *    database. The assistant has no browser, so it has no element to point at,
 *    and a note it manufactured would be undisplayable where it counts — on
 *    the page. The thread of an existing note is the place provided for it to
 *    speak;
 *  - nothing is ever erased. That is the tool's rule since format 1 and it has
 *    no exception here: marking resolved and reopening are the only two state
 *    changes.
 */
const requireWrite = (project) => {
    if (project.read_only) {
        throw new UsageError(
            'The project "' + project.name + '" is declared read-only in the '
            + 'configuration.\nNothing was written. Remove "read_only" to allow '
            + 'replies and resolutions.');
    }
    if (!project.author) {
        throw new UsageError(
            'The project "' + project.name + '" declares no "author" field.\n'
            + 'This package publishes nothing anonymous: in a thread where everybody '
            + 'signs, a voice that does not sign casts doubt on the whole thread.\n'
            + 'Add "author": "..." to the configuration of this project.');
    }
};

/**
 * Checks that the index used for sealing really is the one of the parent
 * note's page, and returns it.
 *
 * Two guarantees, and they complete each other:
 *
 *  - the parent OPENED with this index: it served to check the authentication
 *    tag, so it is the one the browser sealed. A server that had changed it
 *    would have made decryption fail;
 *  - we RECOMPUTE it anyway from the decrypted path, because nothing costs
 *    less than an HMAC and because that check also covers plain mode, where no
 *    tag authenticated anything at all.
 *
 * If the two do not agree, we do not write. A reply sealed under an index that
 * is not its parent's is a reply nobody will be able to read, and nothing is
 * ever erased in this tool.
 */
const indexForWriting = async (project, parent) => {
    const announced = parent.page_index;
    if (!project.keys || !parent.page) {
        if (!announced) {
            throw new UsageError(
                'Note ' + parent.id + ' carries no page index, and its path is not '
                + 'known: there is no way to seal a reply in its place.');
        }
        return announced;
    }
    const recomputed = await indexOfPath(project.keys.indexKey, normalisedPath(parent.page));
    if (announced && recomputed !== announced) {
        throw new UsageError(
            'The page index the server announces for note ' + parent.id
            + ' does not match the path of that note.\n'
            + 'Path              : ' + parent.page + '\n'
            + 'Announced index   : ' + announced + '\n'
            + 'Recomputed index  : ' + recomputed + '\n'
            + 'Nothing was written: a reply sealed under the wrong index would be '
            + 'unreadable by the person it is addressed to.');
    }
    return recomputed;
};

/**
 * Replies to a note. A reply IS a note: same table, same envelope role, one
 * single thread depth.
 */
export const reply = async (project, state, id, text, signal) => {
    requireWrite(project);

    const clean = String(text == null ? '' : text).trim();
    if (clean === '') {
        throw new UsageError('An empty reply means nothing and cannot be erased.');
    }

    const found = findNote(state, id);
    if (!found) {
        throw new UsageError('No note ' + id + ' in this project.');
    }
    if (found.parent) {
        /* One single thread depth, as in format 1. The server refuses too,
           with a 400; we refuse here in order to name the parent note, which
           the server cannot do — it reads nothing. */
        throw new UsageError(
            'Row ' + id + ' is already a reply to note ' + found.parent.id + '.\n'
            + 'The thread has one depth only: reply to note ' + found.parent.id + '.');
    }

    const parent = found.note;
    const fields = { reply_to: String(parent.id), mode: parent.mode || 'plain' };

    if (fields.mode === 'encrypted') {
        if (!project.keys) {
            throw new UsageError(
                'Note ' + parent.id + ' is encrypted and the configuration of this '
                + 'project carries no salt: there is nothing to seal a reply with.');
        }
        const index = await indexForWriting(project, parent);
        fields.payload = await seal(project.keys.encryptionKey, project.id, index,
                                    'note', { author: project.author, text: clean });
    } else {
        fields.author = project.author;
        fields.text = clean;
    }

    const answer = await add(project, fields, signal);
    forgetCache(project);
    return answer;
};

/**
 * Marks a note resolved, stamping the version the fix ships in.
 *
 * THE VERSION IS THE POINT OF THE TOOL, and it has a visible consequence: the
 * client compares the version of the fix with the one the site declares it is
 * serving. Newer than the site: the note stays UNDER THE EYES of the reviewer,
 * because the defect is still on screen. Equal or older: the note moves into
 * folded history. Empty or unreadable version: the fix is taken as NOT
 * deployed, and the note stays visible.
 *
 * So we accept an empty version — a signed fix with no version beats a fix
 * never marked — but the caller has to write it explicitly, so that it knows
 * what it is buying.
 */
export const markResolved = async (project, state, id, version, signal) => {
    requireWrite(project);

    const found = findNote(state, id);
    if (!found) throw new UsageError('No note ' + id + ' in this project.');

    const note = found.note;
    if (note.resolved_at) {
        throw new UsageError(
            'Note ' + id + ' is already marked resolved, on '
            + note.resolved_at + (note.resolved_by ? ' by ' + note.resolved_by : '') + '.\n'
            + 'Nothing was changed. Reopen it first if the fix was incomplete.');
    }

    const fields = { id: String(note.id), resolved: '1' };
    const clean = String(version == null ? '' : version).trim();

    if ((note.mode || 'plain') === 'encrypted') {
        if (!project.keys) {
            throw new UsageError(
                'Note ' + id + ' is encrypted and the configuration of this project '
                + 'carries no salt: the fixer\'s name would travel in the clear.');
        }
        const parent = found.parent || note;
        const index = await indexForWriting(project, parent);
        /* A second envelope, its own nonce, its own role: it is written later,
           by somebody else. Melting it into the note's envelope would force
           re-encrypting a remark nobody is allowed to rewrite. */
        fields.resolution_payload = await seal(
            project.keys.encryptionKey, project.id, index, 'resolution',
            { by: project.author, version: clean });
    } else {
        fields.by = project.author;
        fields.version = clean;
    }

    const answer = await resolve(project, fields, signal);
    forgetCache(project);
    return answer;
};

/**
 * Reopens a note whose fix turned out to be incomplete.
 *
 * Reopening writes nothing: the server clears the resolution. So we do not ask
 * for the fixer's name in order to CANCEL the fix, and the reply thread is not
 * touched.
 */
export const reopen = async (project, state, id, signal) => {
    requireWrite(project);

    const found = findNote(state, id);
    if (!found) throw new UsageError('No note ' + id + ' in this project.');
    if (!found.note.resolved_at) {
        throw new UsageError('Note ' + id + ' is not marked resolved.');
    }

    const answer = await resolve(project, { id: String(found.note.id), resolved: '0' }, signal);
    forgetCache(project);
    return answer;
};

export { ApiError };
