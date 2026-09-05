/* annotepage -- the settings screen's only script.
 *
 * THE KEY IS DRAWN HERE, IN THIS BROWSER, AND GOES NOWHERE.
 *
 * Nothing in this file transmits. There is no fetch, no XMLHttpRequest, no
 * image with a query string, no beacon -- that absence is the claim, and it is
 * checkable by reading a hundred lines. The value reaches the network exactly
 * once, in the form POST that stores it, and in secure mode not even then: the
 * key input is disabled before submit, so the browser does not send it and
 * annotepage_save() does not read it.
 *
 * It is the same computation the client's own setup screen performs, and the
 * same one docs/how-to-install-it.html runs. That is not a coincidence to be
 * hoped for: tools/check-landing-derivation.mjs EXTRACTS the block below and
 * runs it against the MCP's implementation. A drift here would hand out a tag
 * naming a project the client never computes -- and nothing, anywhere, would
 * raise an error. The person would simply never see a note.
 *
 * MIT, like the rest of annotepage.
 */
(function () {
    'use strict';

    var keyIn    = document.getElementById('ap-key');
    var projIn   = document.getElementById('ap-project');
    var button   = document.getElementById('ap-generate');
    var state    = document.getElementById('ap-state');
    var once     = document.getElementById('ap-once');
    var onceKey  = document.getElementById('ap-once-key');
    var mismatch = document.getElementById('ap-mismatch');
    var save     = document.getElementById('ap-save');
    var open     = document.getElementById('ap-mode-open');
    var secure   = document.getElementById('ap-mode-secure');

    /* Stop rather than half-run. A generator wired to elements the screen no
       longer has would leave the button doing nothing at all, which looks
       exactly like a slow one. */
    if (!keyIn || !projIn || !button || !state || !once || !onceKey
        || !mismatch || !save || !open || !secure) return;

    /* No WebCrypto, no key. A value from Math.random is worse than no value:
       it is guessable AND it looks like a key. The button says so and stays
       disabled -- an administrator on plain http gets a reason, not a dud. */
    if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
        button.disabled = true;
        state.textContent =
            'This screen must be served over https to draw a key.';
        return;
    }

    /* ---- BEGIN derivation: must agree with mcp/src/crypto.mjs.
            tools/check-landing-derivation.mjs runs this against it. ---- */
    var HKDF_SALT_STRING = 'annotepage/1';

    function b64url(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function projectIdFromSalt(keyBytes) {
        var enc = new TextEncoder();
        return window.crypto.subtle
            .importKey('raw', keyBytes, 'HKDF', false, ['deriveBits'])
            .then(function (master) {
                return window.crypto.subtle.deriveBits({
                    name: 'HKDF',
                    hash: 'SHA-256',
                    /* HKDF's "salt" is NOT our key: ours is the input keying
                       material. Swapping the two yields a system that works
                       and whose ids disagree with every other implementation. */
                    salt: enc.encode(HKDF_SALT_STRING),
                    info: enc.encode('id')
                }, master, 256);
            })
            .then(function (bits) {
                /* 16 bytes, not 32: this value is copied by hand into a tag
                   and a configuration file. 22 characters can be; 43 cannot. */
                return b64url(new Uint8Array(bits).subarray(0, 16));
            });
    }
    /* ---- END derivation ---- */

    /* What the screen was loaded with. A mode change is only real once a key
       for it has been drawn, and that is enforced here rather than explained
       in a paragraph: the Save button will not go through on a mode whose
       credential does not exist. Irreversible means the screen has to make
       the cost happen in front of the person, not after them. */
    var savedMode = secure.checked ? 'secure' : 'open';
    var drew = false;

    var fresh = { key: '', id: '' };

    function mode() {
        return secure.checked ? 'secure' : 'open';
    }

    function paint() {
        var m = mode();
        var needsKey = (m !== savedMode) && !drew;

        mismatch.style.display = needsKey ? '' : 'none';
        save.disabled = needsKey;

        /* THE KEY IS SHOWN EXACTLY WHEN IT IS ABOUT TO BE LOST. In secure mode
           it is not stored, so this block is the only place it will ever be
           readable; in public mode it stays in the page and on this screen,
           and a scary "copy it now" box there would be noise. */
        var show = (m === 'secure') && fresh.key !== '';
        once.style.display = show ? '' : 'none';
        onceKey.textContent = show ? fresh.key : '';

        /* NEVER BOTH, and the browser must not even be able to send both: a
           disabled input is not submitted. The server decides again on its own
           side -- this is the belt, not the trousers. */
        keyIn.disabled  = (m === 'secure');
        projIn.disabled = (m !== 'secure');

        if (drew) {
            state.textContent = (m === 'secure')
                ? 'New project ' + fresh.id + '. Save to write it into the tag.'
                : 'New key drawn. Save to write it into the tag.';
        }
    }

    function draw() {
        /* The confirmation is the irreversibility, said once more at the only
           moment it costs something. A new key is a new project: the notes
           under the old one are not moved and not deleted, this site simply
           stops showing them. */
        if ((keyIn.value || projIn.value) && !drew) {
            var ok = window.confirm(
                'Draw a new key?\n\n'
                + 'A new key is a new project. The notes already written stay '
                + 'where they are and this site stops showing them. There is no '
                + 'way back.');
            if (!ok) return;
        }

        var bytes = new Uint8Array(32);
        window.crypto.getRandomValues(bytes);
        var text = b64url(bytes);

        button.disabled = true;
        projectIdFromSalt(bytes).then(function (id) {
            fresh.key = text;
            fresh.id = id;
            keyIn.value = text;
            projIn.value = id;
            drew = true;
            button.disabled = false;
            paint();
        }, function () {
            button.disabled = false;
            state.textContent = 'The browser refused to derive the project id. Nothing was changed.';
        });
    }

    button.addEventListener('click', draw);
    open.addEventListener('change', paint);
    secure.addEventListener('change', paint);

    paint();
}());
