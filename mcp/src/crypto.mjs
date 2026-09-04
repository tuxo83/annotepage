/* crypto.mjs — THE KEY, THE THREE DERIVATIONS, THE ENVELOPE.
 *
 * This is the twin, on the assistant's side, of client/src/20-crypto.js. Both
 * implement FORMAT.md sections 1, 3 and 4; if one of the two becomes cleverer
 * than the other, the browser's notes stop being readable here, and nobody
 * notices before needing them.
 *
 * THE DIFFERENCE WITH THE CLIENT IS ENTIRELY HERE: the browser keeps its key
 * in localStorage, this machine keeps it in a configuration file. It is the
 * same secret, with the same consequence — whoever reads the file reads every
 * note of the project — and so the file is never committed. See config.mjs,
 * which refuses a file readable by everyone.
 *
 * We use Node's webcrypto, and not the classic "crypto" module: it is the
 * same API as in the browser, hence the same code to reread when a doubt
 * comes up about a derivation. An HKDF written twice in two different ways is
 * an HKDF nobody compares any more.
 */

import { webcrypto } from 'node:crypto';
import {
    FORMAT, HKDF_SALT_STRING, KEY_LENGTH, NONCE_LENGTH,
    utf8, fromUtf8, b64url, fromB64url,
} from './format.mjs';

const subtle = webcrypto.subtle;

/**
 * The text of a key -> its 32 bytes, or null.
 *
 * We refuse what does not have exactly the right shape instead of "cleaning"
 * the spaces or the dashes: a key that is almost right gives a wrong project
 * id, and the message "this key is not the key of this project" would then
 * send you looking in the wrong place.
 */
export const keyFromText = (text) => {
    const t = String(text == null ? '' : text).trim();
    if (t.length !== KEY_LENGTH || !/^[A-Za-z0-9_-]+$/.test(t)) return null;
    const bytes = fromB64url(t);
    return bytes && bytes.length === 32 ? bytes : null;
};

/**
 * The three derivations, in one go.
 *
 * TRAP, named because it costs dearly: HKDF's "salt" parameter is NOT our
 * key. Our key is the input keying material (IKM); HKDF's salt is the
 * fixed, public string "annotepage/1", which separates this tool from any
 * other software one might one day trust with the same secret. Swapping them
 * produces a system that works, that encrypts, and whose notes become
 * unreadable on the first reimplementation — this one, for instance.
 */
export const derive = async (keyBytes) => {
    const params = (label) => ({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: utf8(HKDF_SALT_STRING),   // HKDF's salt, NOT our key: see above
        info: utf8(label),
    });

    const master = await subtle.importKey(
        'raw', keyBytes, 'HKDF', false, ['deriveBits', 'deriveKey']);

    const [idBytes, encryptionKey, indexBytes] = await Promise.all([
        subtle.deriveBits(params('id'), master, 256),
        /* Non-extractable, as in the browser. That is hygiene, not a barrier:
           the key sleeps in a file right next to it, and whoever reads one
           rebuilds the other in three lines. We write it down so that nobody
           takes this "false" for a protection it is not. */
        subtle.deriveKey(params('encrypted'), master,
            { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
        subtle.deriveBits(params('index'), master, 256),
    ]);

    const indexKey = await subtle.importKey(
        'raw', indexBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

    return {
        /* 16 bytes and not 32: this value travels in a query string, a tag
           attribute, a configuration file and an indexed column. 128 bits are
           unguessable, and 22 characters can be copied by hand — 43 cannot. */
        id: b64url(new Uint8Array(idBytes).subarray(0, 16)),
        encryptionKey,
        indexKey,
    };
};

/**
 * page_index = HMAC(index_key, path), first 16 bytes, base64url.
 *
 * NO normalisation other than format 1's (a single leading slash, no ".."
 * segment): no lowercasing, no stripping of a trailing slash, no decoding of
 * %xx. "/Contact" and "/contact" are two pages; "/a/" and "/a" are two pages.
 * It is what the browser gives, it is what we index — and it is the only way
 * two implementations agree.
 *
 * This package needs it for one single thing, but it matters: writing a reply
 * to a note whose path we know only because we have just DECRYPTED it. It
 * then redoes the same computation as the browser, and finds the same index —
 * otherwise the AAD does not match and the reply would be unreadable by the
 * person it is addressed to.
 */
export const normalisedPath = (path) => {
    let c = String(path == null ? '/' : path) || '/';
    if (c.charAt(0) !== '/') c = '/' + c;
    c = c.replace(/^\/+/, '/');
    if (c.indexOf('/../') !== -1 || /\/\.\.$/.test(c)) {
        c = c.split('/').filter((s) => s !== '..').join('/') || '/';
        if (c.charAt(0) !== '/') c = '/' + c;
    }
    return c;
};

export const indexOfPath = async (indexKey, path) => {
    const signature = await subtle.sign('HMAC', indexKey, utf8(path));
    return b64url(new Uint8Array(signature).subarray(0, 16));
};

/* -- The envelope --------------------------------------------------------
   AES-256-GCM, no exception and no fallback. No choice of algorithm, no
   negotiation, no "suite": a format that negotiates is a format that gets
   pushed down onto its weakest option. */

/**
 * The AAD binds the envelope to its place. Without it, a malicious server can
 * move a note from one page to another, or from one project to another:
 * decryption would succeed and the remark would appear under an element it
 * was not aimed at.
 *
 * Consequence for this package, which has never seen the page: the index used
 * here is the one the server WROTE on the line. That is a trust we cannot
 * avoid when reading — we have no other source — and it is harmless: a
 * changed index does not make a note read somewhere else, it makes decryption
 * fail. That is exactly the AAD's role.
 *
 * When WRITING, on the other hand, the index is recomputed from the decrypted
 * path of the parent note (see notes.mjs). A reply sealed under an index the
 * server whispers to us would be a reply it could hang somewhere else.
 */
const aad = (project, pageIndex, role) =>
    utf8(FORMAT + '\n' + project + '\n' + pageIndex + '\n' + role);

export class EnvelopeError extends Error {
    constructor(reason, message) {
        super(message);
        this.reason = reason;
    }
}

/** An empty field is ABSENT from the object, it is not written as "". Same
    rule as in the text export, and for the same reason: do not write a key to
    say there is nothing. */
const compact = (object) => {
    const clean = {};
    for (const key of Object.keys(object)) {
        const v = object[key];
        if (v !== undefined && v !== null && String(v) !== '') clean[key] = String(v);
    }
    return clean;
};

export const seal = async (encryptionKey, project, pageIndex, role, object) => {
    /* A 12-byte nonce drawn at EVERY encryption. Never a counter, never
       derived from the content, never reused: a nonce repeated with the same
       key under GCM does not leak a note, it leaks the authentication key. */
    const nonce = webcrypto.getRandomValues(new Uint8Array(12));
    const plain = utf8(JSON.stringify(compact(object)));
    const ciphertext = await subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(project, pageIndex, role), tagLength: 128 },
        encryptionKey, plain);
    return 'ap' + FORMAT + '.' + b64url(nonce) + '.' + b64url(new Uint8Array(ciphertext));
};

/**
 * Returns the JSON object of the envelope.
 *
 * Throws an EnvelopeError whose reason is:
 *   'newer'       the envelope carries a format number above ours. We do not
 *                 guess at cryptography: flat refusal, the note is skipped
 *                 and COUNTED, and the tool says that it exists.
 *   'unreadable'  invalid shape, or decryption failed — wrong key, note
 *                 moved by the server, damaged bytes. All three are worth the
 *                 same to the reader: there is nothing to read.
 */
export const open = async (encryptionKey, project, pageIndex, role, envelope) => {
    const parts = String(envelope == null ? '' : envelope).split('.');
    const refuse = () => { throw new EnvelopeError('unreadable', 'unreadable envelope'); };

    if (parts.length !== 3) refuse();

    const mark = /^ap(\d+)$/.exec(parts[0]);
    if (!mark) refuse();
    const number = parseInt(mark[1], 10);
    if (number > FORMAT) {
        throw new EnvelopeError('newer',
            'this note was written by a newer version of annotepage');
    }
    if (number !== FORMAT) refuse();

    // A reader that counts a nonce of another length refuses the row instead
    // of guessing.
    if (parts[1].length !== NONCE_LENGTH) refuse();
    const nonce = fromB64url(parts[1]);
    const ciphertext = fromB64url(parts[2]);
    if (!nonce || nonce.length !== 12 || !ciphertext) refuse();

    let plain;
    try {
        plain = await subtle.decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: aad(project, pageIndex, role), tagLength: 128 },
            encryptionKey, ciphertext);
    } catch (e) {
        /* GCM does not say WHY it refuses, and that is intended: wrong key,
           different AAD, one changed byte, everything lands here. So the
           message we raise must claim nothing more than what we know. */
        refuse();
    }

    let object = null;
    try {
        object = JSON.parse(fromUtf8(new Uint8Array(plain)));
    } catch (e) {
        refuse();
    }
    if (!object || typeof object !== 'object' || Array.isArray(object)) refuse();
    return object;
};
