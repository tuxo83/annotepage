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
 * WITHOUT THIS SCRIPT THE SCREEN STILL WORKS. Every field is a plain input,
 * every block starts visible, and PHP judges everything again on arrival. What
 * this file adds is the derivation, the live warnings, and the refusal to drop
 * a key somebody has not copied. It hides; it never reveals.
 *
 * MIT, like the rest of annotepage.
 */
(function () {
    'use strict';

    var form     = document.getElementById('ap-form');
    var keyIn    = document.getElementById('ap-key');
    var projIn   = document.getElementById('ap-project');
    var projRow  = document.getElementById('ap-project-row');
    var button   = document.getElementById('ap-generate');
    var state    = document.getElementById('ap-state');
    var once     = document.getElementById('ap-once');
    var onceKey  = document.getElementById('ap-once-key');
    var kept     = document.getElementById('ap-kept');
    var save     = document.getElementById('ap-save');
    var open     = document.getElementById('ap-mode-open');
    var secure   = document.getElementById('ap-mode-secure');
    var chosen   = document.getElementById('ap-audience-chosen');
    var everyone = document.getElementById('ap-audience-everyone');
    var chosenIn = document.getElementById('ap-chosen');
    var wide     = document.getElementById('ap-wide');

    /* THE SENTENCES THIS FILE WRITES COME FROM PHP, already translated
       (annotepage_admin_text()). None is written here: a literal would be
       English on every site, and tools/check-wordpress.mjs refuses one. */
    var T = window.annotepageAdminText;

    /* Stop rather than half-run. A generator wired to elements the screen no
       longer has would leave the button doing nothing at all, which looks
       exactly like a slow one. */
    if (!form || !keyIn || !projIn || !projRow || !button || !state || !once
        || !onceKey || !kept || !save || !open || !secure || !chosen
        || !everyone || !chosenIn || !wide || !T || typeof T !== 'object') return;

    /* A translated sentence with its one value put in. The value goes in as
       text: every caller writes the result through textContent. */
    function fill(sentence, value) {
        return String(sentence).replace(/%[ds]/, String(value));
    }

    var KEY_SHAPE  = /^[A-Za-z0-9_-]{43}$/;
    var PROJ_SHAPE = /^[A-Za-z0-9_-]{22}$/;

    /* What the screen was loaded with. Every sentence below is about the
       difference between this and what is on screen now. */
    var savedKey     = keyIn.value.trim();
    var savedProject = projIn.value.trim();
    var savedMode    = secure.checked ? 'secure' : 'open';

    /* A key this browser has produced or derived from, and which the person
       may be about to lose: the copy box is shown for THIS and never for a key
       that is already stored and staying. */
    var shown = '';

    /* No WebCrypto, no derivation. A value from Math.random is worse than no
       value: it is guessable AND it looks like a key. The button says so and
       stays disabled -- an administrator on plain http gets a reason, not a
       dud -- and pasting still works, because pasting needs no crypto. */
    var able = !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);

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

    function bytesOfKey(text) {
        var padded = text.replace(/-/g, '+').replace(/_/g, '/') + '=';
        var raw;
        try { raw = atob(padded); } catch (e) { return null; }
        var out = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out.length === 32 ? out : null;
    }

    function mode() {
        return secure.checked ? 'secure' : 'open';
    }

    function audience() {
        var picked = form.querySelector('input[name="ap_audience"]:checked');
        return picked ? picked.value : 'admins';
    }

    /* WHAT THE PERSON IS ABOUT TO LOSE, said before they lose it.
       Three cases, and only the third is a loss:
         - the project is not moving          -> nothing to say
         - it is moving to one they named     -> which one, and that the old
                                                 notes stay where they are
         - the key itself is leaving this DB  -> copy it now, and prove it */
    function describe(id) {
        if (id === '') {
            return keyIn.value.trim() === ''
                ? T.noKey
                : fill(T.keyLength, keyIn.value.trim().length);
        }
        if (savedProject !== '' && id === savedProject) return fill(T.unchanged, id);
        if (savedKey !== '' && id === idOfSavedKey) return fill(T.unchanged, id);
        return fill(T.moved, id);
    }

    var idOfSavedKey = '';

    function paint() {
        var m = mode();
        var typed = keyIn.value.trim();
        var id = projIn.value.trim();

        /* Hidden, never revealed: a browser that never runs this line shows
           the block, which is the harmless direction. */
        chosenIn.hidden = (audience() !== 'chosen');
        projRow.hidden = (m !== 'secure');
        wide.style.display = (audience() === 'everyone' && m !== 'secure') ? '' : 'none';

        /* The key is about to leave WordPress when secure mode saves over a
           stored key, or when one was drawn here and will not be stored. */
        var leaving = (m === 'secure') && shown !== '';
        once.style.display = leaving ? '' : 'none';
        onceKey.textContent = leaving ? shown : '';

        var blocked = false;
        if (leaving && !kept.checked) blocked = true;
        if (m !== 'secure' && typed !== '' && !KEY_SHAPE.test(typed)) blocked = true;
        if (m === 'secure' && id !== '' && !PROJ_SHAPE.test(id)) blocked = true;
        save.disabled = blocked;

        /* textContent and never innerHTML: what goes in here is a project id
           and a length the person typed, and the day one of them arrives from
           somewhere else this line must already be the safe one. */
        if (m === 'secure') {
            state.textContent = id === ''
                ? T.noProject
                : describe(id);
        } else {
            state.textContent = describe(KEY_SHAPE.test(typed) ? id : '');
        }
    }

    /* Derive whenever the key field holds something of the right shape. The
       id field follows the key; it is only typed into on its own when there is
       no key, which is the "point this site at somebody else's project" case. */
    function derive() {
        var typed = keyIn.value.trim();
        if (!KEY_SHAPE.test(typed)) { paint(); return; }
        if (!able) {
            state.textContent = T.httpsDerive;
            return;
        }
        var bytes = bytesOfKey(typed);
        if (!bytes) { paint(); return; }
        projectIdFromSalt(bytes).then(function (id) {
            projIn.value = id;
            if (typed === savedKey) idOfSavedKey = id;
            paint();
        }, function () {
            state.textContent = T.refused;
        });
    }

    function draw() {
        /* The confirmation is the irreversibility, said once more at the only
           moment it costs something. A new key is a new project: the notes
           under the old one are not moved and not deleted, this site simply
           stops showing them. */
        if (keyIn.value.trim() !== '' || projIn.value.trim() !== '') {
            var ok = window.confirm(T.drawTitle + '\n\n' + T.drawBody);
            if (!ok) return;
        }

        var bytes = new Uint8Array(32);
        window.crypto.getRandomValues(bytes);
        var text = b64url(bytes);

        button.disabled = true;
        projectIdFromSalt(bytes).then(function (id) {
            keyIn.value = text;
            projIn.value = id;
            shown = text;
            kept.checked = false;
            button.disabled = false;
            paint();
        }, function () {
            button.disabled = false;
            state.textContent = T.refused;
        });
    }

    if (!able) {
        button.disabled = true;
        state.textContent = T.httpsDraw;
    } else {
        button.addEventListener('click', draw);
    }

    keyIn.addEventListener('input', derive);
    projIn.addEventListener('input', paint);
    kept.addEventListener('change', paint);
    open.addEventListener('change', paint);

    /* Moving to secure mode is what makes a stored key leave: it is shown at
       that moment, because it is the last moment it can be. */
    secure.addEventListener('change', function () {
        if (shown === '' && KEY_SHAPE.test(keyIn.value.trim())) {
            shown = keyIn.value.trim();
            kept.checked = false;
        }
        paint();
    });

    var radios = form.querySelectorAll('input[name="ap_audience"]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', paint);

    /* THE KEY MUST NOT BE SENT IN SECURE MODE, and a disabled input is not
       sent. Disabled here rather than on every repaint, so that the field can
       still be pasted into and derived from while the screen is open. PHP
       refuses to read it either way -- this is the belt, not the trousers. */
    form.addEventListener('submit', function () {
        if (mode() === 'secure') keyIn.disabled = true;
        else projIn.disabled = true;
    });

    if (KEY_SHAPE.test(savedKey)) derive();
    paint();
}());
