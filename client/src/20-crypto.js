/* -- 6. The key, the three derivations, the envelope --------------------

   This whole file implements FORMAT.md sections 1, 3 and 4, and nothing
   else. When a line here contradicts FORMAT.md, this line is wrong.

   THE KEY NEVER LEAVES THE BROWSER. It is not sent to the server in any
   form, in any mode, derived forms included. The only path out of here is
   the setup screen, which shows it to the person who has just generated it
   so that they can put it away. */

const HKDF_SALT_STRING = 'annotepage/1';
const KEY_LENGTH = 43;         // 32 bytes in base64url without padding
const NONCE_LENGTH = 16;        // 12 bytes in base64url without padding

/* WebCrypto only exists in a SECURE context: https, or localhost. On a
   staging site served over bare http, subtle is missing and the tool can do
   NOTHING -- not even compute the page index, which is an HMAC in both modes.
   We find that out here, once, so we can say it on screen instead of
   throwing an unreadable error on the first click. */
const CRYPTO = window.crypto && window.crypto.subtle ? window.crypto : null;

/** 32 bytes from the browser's generator, and from nowhere else. */
const generateSalt = () => {
    const bytes = new Uint8Array(32);
    CRYPTO.getRandomValues(bytes);
    return b64url(bytes);
};

/**
 * The text of a key -> its 32 bytes, or null.
 *
 * We refuse anything that has not exactly the right shape rather than
 * "cleaning up" spaces or dashes: an almost-right key derives a wrong
 * project id, and the message "this key is not the key of this project"
 * would then send someone looking in the wrong place.
 */
const keyFromText = (text) => {
    const t = String(text == null ? '' : text).trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(t)) return null;
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
 * unreadable on the first reimplementation.
 */
const derive = (keyBytes) => {
    const params = (label) => ({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: utf8(HKDF_SALT_STRING),   // HKDF's salt, NOT our key: see above
        info: utf8(label)
    });

    return CRYPTO.subtle
        .importKey('raw', keyBytes, 'HKDF', false, ['deriveBits', 'deriveKey'])
        .then((master) => Promise.all([
            CRYPTO.subtle.deriveBits(params('id'), master, 256),
            // The encryption key is generated NON-EXTRACTABLE. That is
            // hygiene, not a barrier: the key sleeps in localStorage right
            // next to it, and whoever reads one rebuilds the other in three
            // lines. We write it down so that nobody takes this "false" for
            // a protection it is not.
            CRYPTO.subtle.deriveKey(params('encrypted'), master,
                { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
            CRYPTO.subtle.deriveBits(params('index'), master, 256)
        ]))
        .then((three) => CRYPTO.subtle
            .importKey('raw', three[2], { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
            .then((indexKey) => ({
                // 16 bytes and not 32: this value travels in a query string,
                // a tag attribute, a configuration file and an indexed
                // column. 128 bits are unguessable, and 22 characters can be
                // copied by hand -- 43 cannot.
                id: b64url(new Uint8Array(three[0]).subarray(0, 16)),
                encryptionKey: three[1],
                indexKey: indexKey
            })));
};

/**
 * page_index = HMAC(index_key, path), first 16 bytes, base64url.
 *
 * NO normalisation other than format 1's (a single leading slash, no ".."
 * segment): no lowercasing, no stripping of a trailing slash, no decoding of
 * %xx. "/Contact" and "/contact" are two pages; "/a/" and "/a" are two
 * pages. It is what the browser gives, it is what we index -- and it is the
 * only way two implementations agree.
 *
 * The computation happens IN BOTH MODES: one code path, one way of grouping.
 * Two would have diverged by the second fix.
 */
const pagePath = () => {
    let c = String(location.pathname || '/');
    if (c.charAt(0) !== '/') c = '/' + c;
    c = c.replace(/^\/+/, '/');
    if (c.indexOf('/../') !== -1 || /\/\.\.$/.test(c)) {
        c = c.split('/').filter((s) => s !== '..').join('/') || '/';
        if (c.charAt(0) !== '/') c = '/' + c;
    }
    return c;
};

const indexOfPath = (indexKey, path) =>
    CRYPTO.subtle.sign('HMAC', indexKey, utf8(path))
        .then((signature) => b64url(new Uint8Array(signature).subarray(0, 16)));

/* -- The envelope --------------------------------------------------------
   AES-256-GCM, no exception and no fallback. No choice of algorithm, no
   negotiation, no "suite": a format that negotiates is a format that gets
   pushed down onto its weakest option. */

/**
 * The AAD binds the envelope to its place. Without it, a malicious server
 * can move a note from one page to another, or from one project to another:
 * decryption would succeed and the remark would appear under an element it
 * was not aimed at.
 */
const aad = (project, pageIndex, role) =>
    utf8(FORMAT + '\n' + project + '\n' + pageIndex + '\n' + role);

const envelopeError = (reason) => {
    const e = new Error('envelope ' + reason);
    e.reason = reason;
    return e;
};

/** An empty field is ABSENT from the object, it is not written as "". Same
    rule as in the text export, and for the same reason: do not write a key
    to say there is nothing. */
const compact = (object) => {
    const clean = {};
    Object.keys(object).forEach((key) => {
        const v = object[key];
        if (v !== undefined && v !== null && String(v) !== '') clean[key] = String(v);
    });
    return clean;
};

const seal = (encryptionKey, project, pageIndex, role, object) => {
    // A 12-byte nonce drawn at EVERY encryption. Never a counter, never
    // derived from the content, never reused: a nonce repeated with the same
    // key under GCM does not leak a note, it leaks the authentication key.
    const nonce = new Uint8Array(12);
    CRYPTO.getRandomValues(nonce);
    const plain = utf8(JSON.stringify(compact(object)));
    return CRYPTO.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(project, pageIndex, role), tagLength: 128 },
        encryptionKey, plain
    ).then((ciphertext) => 'ap' + FORMAT + '.' + b64url(nonce) + '.' + b64url(ciphertext));
};

/**
 * Returns the JSON object of the envelope.
 *
 * Rejects with a reason:
 *   'newer'       the envelope carries a format number above ours. We do not
 *                 guess at cryptography: flat refusal, the note is skipped
 *                 and counted, and the tool SAYS that it exists.
 *   'unreadable'  invalid shape, or decryption failed -- wrong key, note
 *                 moved by the server, damaged bytes. All three are worth
 *                 the same to the reader: there is nothing to read.
 */
const open = (encryptionKey, project, pageIndex, role, envelope) => {
    const parts = String(envelope == null ? '' : envelope).split('.');
    if (parts.length !== 3) return Promise.reject(envelopeError('unreadable'));

    const mark = /^ap(\d+)$/.exec(parts[0]);
    if (!mark) return Promise.reject(envelopeError('unreadable'));
    const number = parseInt(mark[1], 10);
    if (number > FORMAT) return Promise.reject(envelopeError('newer'));
    if (number !== FORMAT) return Promise.reject(envelopeError('unreadable'));

    // A reader that counts a nonce of another length refuses the row instead
    // of guessing.
    if (parts[1].length !== NONCE_LENGTH) return Promise.reject(envelopeError('unreadable'));
    const nonce = fromB64url(parts[1]);
    const ciphertext = fromB64url(parts[2]);
    if (!nonce || nonce.length !== 12 || !ciphertext) {
        return Promise.reject(envelopeError('unreadable'));
    }

    return CRYPTO.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad(project, pageIndex, role), tagLength: 128 },
        encryptionKey, ciphertext
    ).then((plain) => {
        let object = null;
        try {
            object = JSON.parse(fromUtf8(new Uint8Array(plain)));
        } catch (e) {
            throw envelopeError('unreadable');
        }
        if (!object || typeof object !== 'object' || Array.isArray(object)) {
            throw envelopeError('unreadable');
        }
        return object;
    }, () => {
        // GCM does not say WHY it refuses, and that is intended: wrong key,
        // different AAD, one changed byte, everything lands here.
        throw envelopeError('unreadable');
    });
};
