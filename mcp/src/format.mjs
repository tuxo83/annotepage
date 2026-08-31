/* format.mjs — THE CONSTANTS OF THE FORMAT, AND NOTHING ELSE.
 *
 * This file implements FORMAT.md and nothing else. When a line here
 * contradicts FORMAT.md, this line is the one that is wrong.
 *
 * It is the only place in the package where the format number is written.
 * That number appears in three places in the format — the column of a row,
 * the prefix of an envelope, the header of an export — and the three must
 * agree: a single declaration is the only way for that to be true.
 */

/** The format number, an integer, with no dot. FORMAT.md section 7. */
export const FORMAT = 2;

/* HKDF's separation string. FROZEN by the format number: changing it makes
   every note already written unreadable. FORMAT.md section 1.3. */
export const HKDF_SALT_STRING = 'annotepage/1';

/** 32 bytes in base64url without padding. */
export const SALT_LENGTH = 43;

/* 12 bytes in base64url without padding. A reader that counts anything else
   refuses the row instead of guessing. FORMAT.md section 3.3. */
export const NONCE_LENGTH = 16;

/* 16 bytes in base64url without padding: the project id and the page index
   have the same length, and that is not a coincidence — it is the same
   truncation, made for the same reason. FORMAT.md section 1.3. */
export const ID_LENGTH = 22;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

export const utf8 = (t) => encoder.encode(String(t));
export const fromUtf8 = (bytes) => decoder.decode(bytes);

export const b64url = (source) =>
    Buffer.from(source instanceof Uint8Array ? source : new Uint8Array(source))
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Returns a Uint8Array, or null if the string is not base64url.
 *
 * Returning null rather than throwing: the caller is always in the middle of
 * reading a line that came off the network, and an unreadable line is
 * counted, it does not stop the reading of the others.
 *
 * Buffer.from() silently accepts what is not base64 — it skips it. So we
 * check the alphabet AND the expected length, without which a damaged
 * envelope would decode "almost" and fail further on, with a message that
 * does not name the cause.
 */
export const fromB64url = (text) => {
    const t = String(text);
    if (!/^[A-Za-z0-9_-]*$/.test(t)) return null;
    // A remainder of 1 character does not exist in base64: 4 characters give
    // 3 bytes, 3 give 2, 2 give 1.
    const rest = t.length % 4;
    if (rest === 1) return null;
    const expected = Math.floor(t.length / 4) * 3 + (rest === 0 ? 0 : rest - 1);
    const bytes = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (bytes.length !== expected) return null;
    return new Uint8Array(bytes);
};

/**
 * Brings every line ending, whatever it is, back to \n, and strips the
 * control characters that are neither \n nor \t.
 *
 * It is the server's list, word for word, and for the same reason: a
 * character a reader counts as an end of line and that we let through
 * manufactures, INSIDE the export, a structure line where there is nothing
 * but text — that is, a whole note that was never written.
 *
 * In encrypted mode the server saw NOTHING of the text: it slept in the
 * envelope, and its own cleanup had nothing to clean. This one is therefore
 * the first and the only one. That is what FORMAT.md section 5.1 calls
 * "after decryption, at the producer of the export", and this package is
 * that producer.
 */
export const normalisedLines = (text) =>
    String(text == null ? '' : text)
        .replace(/\r\n|\r|\u0085|\u2028|\u2029/g, '\n')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

/** A value written on a "key value" line: it cannot contain a line ending,
    on pain of manufacturing a second, unindented one. */
export const safeValue = (value) =>
    normalisedLines(value).replace(/\n/g, ' ').trim();

/**
 * Indents every line of a block of text.
 *
 * An empty line stays EMPTY, with no spaces: trailing spaces are exactly
 * what a fetching tool strips, and the block would then look inconsistent.
 * It is also what lets the parser recognise an empty line INSIDE a text —
 * see the header of text-export.mjs.
 */
export const indent = (text, margin) =>
    normalisedLines(text)
        .split('\n')
        .map((line) => (line === '' ? '' : margin + line) + '\n')
        .join('');

/** A date in ISO 8601 with an explicit offset. A date with no timezone is
    not a date. */
export const isoDate = (when) =>
    new Date(when === undefined ? Date.now() : when)
        .toISOString().replace(/\.\d{3}Z$/, '+00:00');
