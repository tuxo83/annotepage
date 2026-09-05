/* ============================================================================
   annotepage -- the annotation layer, browser side.

   Package version : 2.4.0
   Format version  : 2   (see FORMAT.md)
   Licence : MIT

   GENERATED FILE -- do not edit it by hand. The sources are in src/, and
   "npm run build" remakes this file. A fix made here would be lost at the
   next build, and the published SRI digest would no longer match anything.
   ============================================================================ */

(function () {
    'use strict';

    /* Injected by the build: they come from package.json and from
       src/styles.css, so that no value is written in two places and can
       therefore diverge. */
    const TOOL_VERSION = "2.4.0";
    const FORMAT = 2;
    const STYLES = "/* ============================================================================\n   styles.css -- THE STYLES OF THE TOOL, AND OF NO OTHER ELEMENT.\n\n   This sheet is INLINED into the served file by the build, then put into the\n   tool's shadow root -- as a constructed sheet when the browser can do it, in\n   a <style> otherwise. It was loaded by a <link> in the original tool; the\n   move to a CDN under SRI brought it inside the file, so that there is only\n   one digest to keep up to date. The containment itself has not changed, and\n   is still twofold:\n\n     - from the tool towards the site: no rule from here can reach an element\n       of the host site, the browser sees to that. That is what makes the\n       claim \"the layer touches nothing\" checkable rather than promised;\n     - from the site towards the tool: no rule of the site can reach an\n       element here. A redesign of the site's stylesheet therefore cannot\n       distort the tool, nor the other way round.\n\n   The \"ap-\" prefix on every class is the third safeguard: the day somebody\n   loads these styles WITHOUT a shadow root -- by mistake, or to debug --\n   nothing would answer a selector of the site.\n\n   NO RULE TARGETS html, body, * OR ANY SELECTOR OF THE SITE. That is the one\n   absolute prohibition of this file.\n\n   COLOURS: the tool has its OWN palette, defined on the shadow root. It\n   reads neither the site's variables nor its theme attribute: it has no\n   reason to know how the site names its colours, and it must stay readable\n   on a light site as on a dark one. The switch follows the system\n   preference, the only information the tool has without asking anyone.\n   ============================================================================ */\n\n\n:host {\n    --ap-bg: #ffffff;\n    --ap-bg-soft: #f4f6f8;\n    --ap-bg-raised: #e9edf2;\n    --ap-text: #1a1d21;\n    --ap-text-soft: #5b6570;\n    --ap-border: #d5dbe2;\n    --ap-accent: #2f6fed;\n    --ap-accent-dark: #1d55c8;\n    --ap-accent-text: #ffffff;\n    --ap-accent-veil: rgba(47, 111, 237, 0.14);\n    --ap-alert-bg: #fdeceb;\n    --ap-alert-border: #e3a9a4;\n    --ap-alert-text: #8a1f16;\n    --ap-shadow: 0 6px 24px rgba(16, 24, 40, 0.18);\n    --ap-radius: 10px;\n    --ap-font: system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\",\n                  Arial, sans-serif;\n}\n\n@media (prefers-color-scheme: dark) {\n    :host {\n        --ap-bg: #1d2126;\n        --ap-bg-soft: #262b32;\n        --ap-bg-raised: #323942;\n        --ap-text: #e9ecf0;\n        --ap-text-soft: #a4adb8;\n        --ap-border: #3a424c;\n        --ap-accent: #6d9bff;\n        --ap-accent-dark: #8fb4ff;\n        --ap-accent-text: #10151c;\n        --ap-accent-veil: rgba(109, 155, 255, 0.18);\n        --ap-alert-bg: #3a1f1c;\n        --ap-alert-border: #7c3a33;\n        --ap-alert-text: #ffb9b1;\n        --ap-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);\n    }\n}\n\n/* ----------------------------------------------------------------------------\n   The layer.\n\n   It covers the viewport and receives NO click: that is what lets the page\n   behave exactly as usual as long as the tool is not in annotation mode.\n   Each widget re-enables clicks for itself alone.\n   ---------------------------------------------------------------------------- */\n\n.ap-layer {\n    position: absolute;\n    inset: 0;\n    pointer-events: none;\n    font-family: var(--ap-font);\n    font-size: 14px;\n    line-height: 1.45;\n    color: var(--ap-text);\n    text-align: left;\n    -webkit-font-smoothing: antialiased;\n}\n\n.ap-layer button,\n.ap-layer input,\n.ap-layer textarea {\n    font-family: inherit;\n    font-size: inherit;\n    line-height: inherit;\n    color: inherit;\n    margin: 0;\n    box-sizing: border-box;\n}\n\n/* ----------------------------------------------------------------------------\n   The button: the only thing visible when the tool is at rest.\n   ---------------------------------------------------------------------------- */\n\n.ap-button {\n    position: fixed;\n    right: 16px;\n    bottom: 16px;\n    display: inline-flex;\n    align-items: center;\n    gap: 8px;\n    padding: 9px 14px;\n    border: 1px solid var(--ap-border);\n    border-radius: 999px;\n    background: var(--ap-bg);\n    color: var(--ap-text);\n    box-shadow: var(--ap-shadow);\n    cursor: pointer;\n    pointer-events: auto;\n    opacity: 0.92;\n    transition: opacity 0.15s ease, transform 0.15s ease;\n}\n\n.ap-button:hover,\n.ap-button:focus-visible {\n    opacity: 1;\n    transform: translateY(-1px);\n}\n\n.ap-button:focus-visible {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 2px;\n}\n\n.ap-button[aria-pressed=\"true\"] {\n    background: var(--ap-accent);\n    border-color: var(--ap-accent);\n    color: var(--ap-accent-text);\n    opacity: 1;\n}\n\n.ap-button-dot {\n    display: inline-block;\n    width: 8px;\n    height: 8px;\n    border-radius: 50%;\n    background: var(--ap-accent);\n    flex: none;\n}\n\n.ap-button[aria-pressed=\"true\"] .ap-button-dot {\n    background: var(--ap-accent-text);\n}\n\n.ap-button-count {\n    padding: 1px 7px;\n    border-radius: 999px;\n    background: var(--ap-bg-raised);\n    color: var(--ap-text-soft);\n    font-size: 12px;\n}\n\n.ap-button[aria-pressed=\"true\"] .ap-button-count {\n    background: rgba(255, 255, 255, 0.22);\n    color: var(--ap-accent-text);\n}\n\n/* ----------------------------------------------------------------------------\n   The pointing highlight.\n\n   It is DRAWN HERE, from the coordinates of the element being pointed at.\n   Nothing is put on the element itself: no class, no attribute, no style. So\n   the site cannot move by a single pixel because of the pointing.\n   ---------------------------------------------------------------------------- */\n\n.ap-highlight {\n    position: fixed;\n    border: 2px solid var(--ap-accent);\n    border-radius: 3px;\n    background: var(--ap-accent-veil);\n    pointer-events: none;\n    display: none;\n}\n\n.ap-highlight-label {\n    position: fixed;\n    max-width: 320px;\n    padding: 4px 8px;\n    border-radius: 6px;\n    background: var(--ap-accent);\n    color: var(--ap-accent-text);\n    font-size: 12px;\n    white-space: nowrap;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    pointer-events: none;\n    display: none;\n    box-shadow: var(--ap-shadow);\n}\n\n/* ----------------------------------------------------------------------------\n   The markers: \"there are already notes here\".\n   ---------------------------------------------------------------------------- */\n\n.ap-marker {\n    position: fixed;\n    min-width: 22px;\n    height: 22px;\n    padding: 0 6px;\n    border: 2px solid var(--ap-bg);\n    border-radius: 999px;\n    background: var(--ap-accent);\n    color: var(--ap-accent-text);\n    font-size: 12px;\n    font-weight: 700;\n    line-height: 18px;\n    text-align: center;\n    cursor: pointer;\n    pointer-events: auto;\n    box-shadow: var(--ap-shadow);\n}\n\n.ap-marker:focus-visible {\n    outline: 2px solid var(--ap-accent-dark);\n    outline-offset: 2px;\n}\n\n/* ----------------------------------------------------------------------------\n   The panel.\n   ---------------------------------------------------------------------------- */\n\n.ap-panel {\n    position: fixed;\n    top: 12px;\n    right: 12px;\n    bottom: 72px;\n    width: 360px;\n    max-width: calc(100vw - 24px);\n    display: none;\n    flex-direction: column;\n    border: 1px solid var(--ap-border);\n    border-radius: var(--ap-radius);\n    background: var(--ap-bg);\n    box-shadow: var(--ap-shadow);\n    pointer-events: auto;\n    overflow: hidden;\n}\n\n.ap-panel.ap-open {\n    display: flex;\n}\n\n.ap-panel-header {\n    display: flex;\n    align-items: baseline;\n    gap: 8px;\n    padding: 12px 14px;\n    border-bottom: 1px solid var(--ap-border);\n    background: var(--ap-bg-soft);\n}\n\n.ap-panel-title {\n    font-size: 15px;\n    font-weight: 600;\n    flex: 1 1 auto;\n}\n\n.ap-panel-instructions {\n    padding: 10px 14px;\n    border-bottom: 1px solid var(--ap-border);\n    color: var(--ap-text-soft);\n    font-size: 13px;\n}\n\n.ap-panel-body {\n    flex: 1 1 auto;\n    overflow-y: auto;\n    overscroll-behavior: contain;\n    padding: 4px 14px 14px;\n}\n\n.ap-panel-footer {\n    padding: 8px 14px;\n    border-top: 1px solid var(--ap-border);\n    background: var(--ap-bg-soft);\n    color: var(--ap-text-soft);\n    font-size: 12px;\n    display: flex;\n    align-items: center;\n    gap: 8px;\n}\n\n.ap-section-title {\n    margin: 14px 0 6px;\n    color: var(--ap-text-soft);\n    font-size: 12px;\n    font-weight: 600;\n    text-transform: uppercase;\n    letter-spacing: 0.04em;\n}\n\n.ap-section-help {\n    margin: 0 0 8px;\n    color: var(--ap-text-soft);\n    font-size: 12px;\n}\n\n.ap-empty {\n    margin: 16px 0;\n    color: var(--ap-text-soft);\n}\n\n/* The standing mention of a public key. Deliberately NOT the alert colours:\n   this is not a failure and it is on screen for ever -- an alarm that never\n   goes away stops being read. It is a fact about the project, stated in the\n   panel's own tone, and it stays at the top of every draw. */\n/* The public-key notice and the \"a newer client exists\" line are the same\n   object on screen: a standing statement about what one is looking at, above\n   the notes and above the failures. One rule, so they cannot drift apart. */\n.ap-public,\n.ap-upgrade {\n    margin: 0 0 10px;\n    padding: 8px 10px;\n    border: 1px solid var(--ap-border);\n    border-radius: var(--ap-radius);\n    background: var(--ap-bg-soft);\n    color: var(--ap-text-soft);\n    font-size: 12px;\n    line-height: 1.45;\n}\n\n/* ----------------------------------------------------------------------------\n   A note, and its replies.\n   ---------------------------------------------------------------------------- */\n\n.ap-note {\n    margin: 8px 0;\n    padding: 10px 12px;\n    border: 1px solid var(--ap-border);\n    border-radius: var(--ap-radius);\n    background: var(--ap-bg);\n}\n\n.ap-note.ap-orphan {\n    background: var(--ap-bg-soft);\n}\n\n.ap-note.ap-focused {\n    border-color: var(--ap-accent);\n    box-shadow: 0 0 0 3px var(--ap-accent-veil);\n}\n\n.ap-note-header {\n    display: flex;\n    align-items: baseline;\n    gap: 8px;\n    flex-wrap: wrap;\n}\n\n.ap-note-author {\n    font-weight: 600;\n}\n\n.ap-note-date {\n    color: var(--ap-text-soft);\n    font-size: 12px;\n}\n\n.ap-note-target {\n    margin: 4px 0 0;\n    color: var(--ap-text-soft);\n    font-size: 12px;\n    font-style: italic;\n    overflow-wrap: anywhere;\n}\n\n.ap-note-text {\n    margin: 6px 0 0;\n    white-space: pre-wrap;\n    overflow-wrap: anywhere;\n}\n\n.ap-note-actions {\n    margin-top: 8px;\n    display: flex;\n    gap: 8px;\n    flex-wrap: wrap;\n}\n\n.ap-replies {\n    margin: 8px 0 0;\n    padding-left: 10px;\n    border-left: 2px solid var(--ap-border);\n}\n\n.ap-reply {\n    margin: 8px 0 0;\n}\n\n/* ----------------------------------------------------------------------------\n   The form, anchored near the element pointed at.\n   ---------------------------------------------------------------------------- */\n\n.ap-form {\n    position: fixed;\n    width: 340px;\n    max-width: calc(100vw - 24px);\n    display: none;\n    flex-direction: column;\n    gap: 8px;\n    padding: 14px;\n    border: 1px solid var(--ap-border);\n    border-radius: var(--ap-radius);\n    background: var(--ap-bg);\n    box-shadow: var(--ap-shadow);\n    pointer-events: auto;\n}\n\n.ap-form.ap-open {\n    display: flex;\n}\n\n.ap-form-title {\n    font-size: 15px;\n    font-weight: 600;\n}\n\n.ap-form-target {\n    color: var(--ap-text-soft);\n    font-size: 12px;\n    font-style: italic;\n    overflow-wrap: anywhere;\n}\n\n.ap-label {\n    display: block;\n    margin-bottom: 3px;\n    font-size: 12px;\n    font-weight: 600;\n    color: var(--ap-text-soft);\n}\n\n.ap-help {\n    margin: 3px 0 0;\n    font-size: 12px;\n    color: var(--ap-text-soft);\n}\n\n.ap-field,\n.ap-area {\n    width: 100%;\n    padding: 8px 10px;\n    border: 1px solid var(--ap-border);\n    border-radius: 8px;\n    background: var(--ap-bg-soft);\n    color: var(--ap-text);\n}\n\n.ap-field:focus,\n.ap-area:focus {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 1px;\n}\n\n.ap-area {\n    min-height: 92px;\n    resize: vertical;\n}\n\n.ap-actions {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    flex-wrap: wrap;\n}\n\n.ap-counter {\n    margin-left: auto;\n    font-size: 12px;\n    color: var(--ap-text-soft);\n}\n\n/* ----------------------------------------------------------------------------\n   Buttons.\n   ---------------------------------------------------------------------------- */\n\n.ap-primary,\n.ap-secondary,\n.ap-link {\n    border-radius: 8px;\n    cursor: pointer;\n    pointer-events: auto;\n}\n\n.ap-primary {\n    padding: 8px 14px;\n    border: 1px solid var(--ap-accent);\n    background: var(--ap-accent);\n    color: var(--ap-accent-text);\n    font-weight: 600;\n}\n\n.ap-primary:hover {\n    background: var(--ap-accent-dark);\n    border-color: var(--ap-accent-dark);\n}\n\n.ap-secondary {\n    padding: 8px 14px;\n    border: 1px solid var(--ap-border);\n    background: var(--ap-bg);\n    color: var(--ap-text);\n}\n\n.ap-secondary:hover {\n    background: var(--ap-bg-raised);\n}\n\n.ap-link {\n    padding: 2px 4px;\n    border: 0;\n    background: none;\n    color: var(--ap-accent);\n    text-decoration: underline;\n    font-size: 13px;\n}\n\n.ap-primary:disabled,\n.ap-secondary:disabled,\n.ap-link:disabled {\n    opacity: 0.6;\n    cursor: default;\n}\n\n.ap-primary:focus-visible,\n.ap-secondary:focus-visible,\n.ap-link:focus-visible {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 2px;\n}\n\n/* ----------------------------------------------------------------------------\n   The failures.\n\n   They are RED, at the top of the block concerned, and carry the message the\n   server returned as it stands: that is how a non-technical team learns that\n   its remark is not saved, instead of believing it is.\n   ---------------------------------------------------------------------------- */\n\n.ap-error {\n    margin: 8px 0;\n    padding: 10px 12px;\n    border: 1px solid var(--ap-alert-border);\n    border-radius: var(--ap-radius);\n    background: var(--ap-alert-bg);\n    color: var(--ap-alert-text);\n}\n\n.ap-error-title {\n    font-weight: 700;\n    margin-bottom: 4px;\n}\n\n.ap-error-detail {\n    margin: 6px 0 0;\n    white-space: pre-wrap;\n    overflow-wrap: anywhere;\n    font-size: 13px;\n}\n\n.ap-error .ap-link {\n    color: var(--ap-alert-text);\n}\n\n/* ----------------------------------------------------------------------------\n   Narrow: the panel takes the full width, and so does the form.\n   ---------------------------------------------------------------------------- */\n\n/* ----------------------------------------------------------------------------\n   Narrow.\n\n   DEFECT OBSERVED at 375 px wide: a panel taking the full height covers the\n   whole page, and no element can be pointed at any more -- every click lands\n   on the panel. So it becomes a bottom band, which leaves the top half of\n   the viewport free; one scrolls the page there to bring the wanted element\n   into view. The form, for its part, hides the panel while typing (see\n   notes.js): on a screen that size, writing and reading the list at the same\n   time does not hold.\n   ---------------------------------------------------------------------------- */\n\n/* On a narrow screen the panel becomes a bottom band and the form takes the\n   full width.\n\n   THE WIDTH CEILING IS KEPT, and it comes from a measured defect: \"left: 8;\n   right: 8\" sizes the element against its CONTAINING BLOCK, which the host\n   site's horizontal overflow can make wider than the visible window.\n   Measured, in mobile emulation at 390 px: the site overflows to 407 px\n   (with the tool and without it), and the panel came out 391 px wide\n   starting at 8, that is 9 px off screen. \"100vw\" is the window, not the\n   containing block: the ceiling therefore does nothing when the site does\n   not overflow, and pulls the width back when it does. */\n@media (max-width: 560px) {\n    .ap-panel {\n        top: auto;\n        right: 8px;\n        left: 8px;\n        bottom: 66px;\n        height: 52vh;\n        width: auto;\n        max-width: calc(100vw - 16px);\n    }\n\n    .ap-form {\n        left: 8px;\n        right: 8px;\n        width: auto;\n        max-width: calc(100vw - 16px);\n    }\n}\n\n@media (prefers-reduced-motion: reduce) {\n    .ap-button {\n        transition: none;\n    }\n}\n\n/* The failure shows without opening the panel: the button's dot changes\n   colour. A team that does not click must be able to see that something is\n   wrong. */\n.ap-button.ap-failed .ap-button-dot {\n    background: var(--ap-alert-text);\n}\n\n.ap-button.ap-failed {\n    border-color: var(--ap-alert-border);\n}\n\n/* Signature reminder, in the note form.\n   The name was shown at the foot of the panel only: invisible at the moment\n   one writes. A user reported not knowing which name they were writing\n   under. */\n.ap-form-signature {\n    display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;\n    margin: 0 0 .6rem; font-size: .85rem; opacity: .8;\n}\n\n/* Resolution state, said on the card.\n   Two cases NOT to be confused: resolved and online, resolved but not\n   deployed yet. The second keeps the defect on the reviewer's screen; hiding\n   it or announcing it as fixed would cost them their trust in the tool. */\n.ap-state-mark {\n    display: inline-block; margin: 0 0 .5rem;\n    padding: .15rem .55rem; border-radius: 4px;\n    font-size: .75rem; font-weight: 600; letter-spacing: .02em;\n}\n.ap-note.ap-resolved { opacity: .72; }\n.ap-note.ap-resolved .ap-state-mark {\n    color: #0f7a52; background: rgba(16, 185, 129, .14);\n}\n.ap-note.ap-resolved-pending .ap-state-mark {\n    color: #8a5a00; background: rgba(245, 158, 11, .16);\n}\n/* The \"it is fixed\" / \"reopen\" block, opened under the card. Same shape as\n   the reply block: it is the same gesture, one answers a remark. */\n.ap-resolve,\n.ap-reply-form {\n    margin-top: .6rem;\n    padding-top: .6rem;\n    border-top: 1px solid var(--ap-border);\n}\n\n/* The question asked before the key is dropped, at the foot of the list.\n   Framed like the resolution block -- it is the same shape of gesture, one\n   answers before something changes -- and set apart from the notes above it,\n   because it is not about a note. */\n.ap-forget {\n    margin-top: 1rem;\n    padding-top: .6rem;\n    border-top: 1px solid var(--ap-border);\n}\n\n.ap-forget .ap-actions {\n    margin-top: .5rem;\n}\n\n.ap-history-toggle {\n    display: block; width: 100%; margin: 1rem 0 .25rem;\n    padding: .5rem .75rem; border: 1px dashed currentColor; border-radius: 6px;\n    background: none; color: inherit; font: inherit; opacity: .7; cursor: pointer;\n}\n.ap-history-toggle:hover { opacity: 1; }\n\n\n/* ----------------------------------------------------------------------------\n   Setup and pasting the salt.\n\n   These are the only screens where something is copied by hand. Everything\n   there is SELECTABLE and monospaced: a 43-character salt copied wrong\n   cannot be recovered, and nothing helps less than a font that confuses I, l\n   and 1.\n   ---------------------------------------------------------------------------- */\n\n.ap-panel-wide {\n    width: 560px;\n}\n\n.ap-copy {\n    display: flex;\n    align-items: flex-start;\n    gap: 8px;\n    margin: 0 0 12px;\n}\n\n.ap-code {\n    flex: 1 1 auto;\n    width: 100%;\n    padding: 8px 10px;\n    border: 1px solid var(--ap-border);\n    border-radius: 8px;\n    background: var(--ap-bg-soft);\n    color: var(--ap-text);\n    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, \"Liberation Mono\",\n                 monospace;\n    font-size: 12.5px;\n    line-height: 1.5;\n    resize: vertical;\n    white-space: pre;\n    overflow-x: auto;\n}\n\n.ap-code:focus-visible {\n    outline: 2px solid var(--ap-accent);\n    outline-offset: 1px;\n}\n\n@media (max-width: 560px) {\n    .ap-panel-wide {\n        width: auto;\n    }\n\n    .ap-copy {\n        flex-direction: column;\n    }\n}\n";

    /* ==== 00-preamble.js ==== */

    /* -- 0. Where am I, which project, and therefore where is the API --------
       Nothing below is guessed. Everything is DECLARED on the tag, because a
       client served by a CDN can no longer deduce anything from its own
       address: that address says nothing about the site under review. */

    const script = document.currentScript;
    if (!script || !script.src) {
        /* Loaded some other way than <script src>: we do not guess an API
           address, we stay out. Careful, this also covers type="module" --
           document.currentScript is null there. The tag must stay a classic
           tag, and the README says so. */
        return;
    }

    const data = script.dataset || {};
    const read = (name) => String((data[name] === undefined ? '' : data[name])).trim();

    /* The server address.

       Self-hosted, the client is served by the site itself and the old
       "../api.php" deduction is still enough: it worked for the whole life of
       format 1, we are not removing it.

       As soon as the client goes to a CDN it becomes wrong -- the API is not at
       the CDN -- and it has to be declared. We do not try to recover: an API
       address guessed wrong would send the remarks nowhere. */
    const DECLARED_SERVER = read('server');
    let API = '';
    if (DECLARED_SERVER) {
        API = new URL(DECLARED_SERVER, document.baseURI).href;
    } else if (new URL(script.src).origin === location.origin) {
        API = new URL('../api.php', script.src).href;
    }

    /* The project id, generated at setup (see 70-setup). 22 base64url
       characters: the shape is checked here, because an id truncated by a
       copy-paste would otherwise produce an empty project on the server side,
       and a page that never shows a single note. */
    const DECLARED_PROJECT = read('project');
    const PROJECT_WELL_FORMED = /^[A-Za-z0-9_-]{22}$/.test(DECLARED_PROJECT);
    /* NOT a const: with data-key the id is DERIVED rather than declared, and
       90-boot writes it here once derive() has produced it. There is one PROJECT
       in this scope and everything downstream reads it -- two would have
       diverged. */
    let PROJECT = PROJECT_WELL_FORMED ? DECLARED_PROJECT : '';

    /* THE KEY, WRITTEN IN THE TAG -- and that attribute IS the mode.

       data-key    the key itself: the project is PUBLIC. Whoever can load the
                   page can read the notes and write them. Nothing is asked for,
                   nothing is stored, and no id is declared: derive() already
                   produces it from the key (HKDF label "id"), so writing both
                   would be writing the same fact twice in a tag people copy by
                   hand -- where the two can disagree.
       data-project  the id alone: confidential. The key is asked for once per
                   browser, and until it is there nothing is fetched and nothing
                   is decrypted. That is the behaviour of every version so far.
       data-setup  neither, temporarily.

       THE KEY IS NOT DERIVED FROM THE DOMAIN, and it never will be. The browser
       hands the relay an Origin header on every request (FORMAT.md section 6.2),
       so a relay knows the domain of every project writing to it: a key that was
       a function of the domain would be a key the relay can compute, and with it
       the id, and with both every note it stores. That is plain mode sold as
       encrypted. The key is random, it lives in the page, and the page is the
       one thing the server never sees.

       The SHAPE is not checked here: keyFromText() in 20-crypto is the single
       judge of what a key looks like, and it lives in the section that owns the
       format. What is recorded here is whether the attribute was WRITTEN at all
       -- an empty data-key is a tag somebody meant to fill in, and it gets said
       rather than ignored. */
    const DECLARED_KEY = read('key');
    const KEY_DECLARED = Object.prototype.hasOwnProperty.call(data, 'key');

    /* True once the key in the tag has been checked and adopted. It is what the
       interface says out loud, at every draw: see PUBLIC_KEY in 60-ui. */
    let PUBLIC_KEY = false;

    /* The write mode for the notes TO COME. Encrypted by default: it is the only
       default that does not ask the installer to understand the threat model
       before writing a first remark.

       The server stays the authority: on a relay it REFUSES "plain" with a 400,
       and its message is what gets shown. We do not duplicate here a rule we
       cannot check -- the client does not know whether it is talking to a relay. */
    const MODE = read('mode').toLowerCase() === 'plain' ? 'plain' : 'encrypted';

    /* The scope: which pages belong to the project.

       The path prefix is checked HERE, before anything else, and this is the
       only place where it can be: the server does not see paths (blind index,
       FORMAT.md section 4). So it is TIDINESS -- the tag can stay at the foot of
       every page of the site without the online documentation collecting the
       staging notes -- and NOT a security boundary: whoever has the project id
       and the key writes wherever they like. */
    const PATH_PREFIX = read('path');

    /* The project origins. The real lock is the server's (FORMAT.md section
       6.2); this one only avoids talking to a server that is going to say no,
       for instance when the tag was copied onto another site along with the
       rest of a template. It protects nothing: a hand-made client does not read
       it. */
    const DOMAINS = read('domains').split(',').map((d) => d.trim()).filter(Boolean);

    /* Setup screen. It opens ONLY when asked for by an attribute: without it, a
       tag with no project does strictly nothing, like a directory copied there
       by mistake. That is the rule of silence, applied to setup. */
    const SETUP_REQUESTED = Object.prototype.hasOwnProperty.call(data, 'setup');

    /* Note-taking context, DECLARED by the host site, never guessed. A
       standalone tool cannot know how the site names its version; the site
       does. Without these attributes the fields stay empty: an invented version
       would send someone hunting for a defect in a build that never existed.

       The viewport size is read AT SEND TIME and not here: the person may have
       resized, or flipped their phone, between the page load and the remark.
       What counts is the size they had in front of them. */
    const SITE_VERSION = read('version');
    const ENVIRONMENT = read('environment');
    const currentViewport = () =>
        String(window.innerWidth || 0) + 'x' + String(window.innerHeight || 0);

    /* A label file belonging to the site: DECLARED, and resolved against the
       DOCUMENT and not against this file. A translation file belongs to the site
       under review, not to the CDN serving the client. */
    const LOCAL_LABELS_URL = read('labels')
        ? new URL(read('labels'), document.baseURI).href
        : null;

    /* -- Limits ------------------------------------------------------------
       The SERVER is the authority: it applies its own and refuses by naming
       them, and it is ITS message that gets shown then. These only warn before
       sending, and keep an absurd string from going out.

       To be said plainly: in encrypted mode the server no longer sees fields,
       only an envelope (FORMAT.md section 3.6). Those limits then become a
       CLIENT CONVENTION, which nothing enforces on a modified client. That is
       the price of end-to-end encryption, and it is paid gladly: this tool is
       for a review team, not for a hostile audience. */

    const MAX_TEXT = 4000;
    const MAX_AUTHOR = 80;
    const MAX_SELECTOR = 500;
    const MAX_FINGERPRINT = 255;
    const MAX_EXCERPT = 160;

    /* ==== 10-utils.js ==== */

    /* -- 1. Labels ----------------------------------------------------------
       No text meant for the screen is written anywhere but in 15-labels. See
       the header of that file for the two ways of replacing them. */

    const ns = (window.Annotepage = window.Annotepage || {});

    /* The package version, put where a console can read it. It is the only fact
       the tool publishes about itself: when a team says "it stopped working
       this morning", the first question is which one is running. */
    ns.version = TOOL_VERSION;
    ns.format = FORMAT;

    const T = (key, values) => {
        const local = ns.labels || {};
        const defaults = ns.defaultLabels || {};
        // A missing label falls back on the default set; failing that, on the
        // key -- which should never reach the screen, but beats a hole.
        let text = local[key];
        if (typeof text !== 'string') text = defaults[key];
        if (typeof text !== 'string') text = key;
        if (!values) return text;
        return text.replace(/\{([a-z]+)\}/g, (raw, name) =>
            Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : raw
        );
    };

    /** "0 notes", "1 note", "n notes" -- the plural is a label. */
    const readableCount = (n, zero, one, many) =>
        n === 0 ? T(zero) : n === 1 ? T(one) : T(many, { n: n });

    /* -- 2. Small utilities -------------------------------------------------- */

    const create = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        // textContent everywhere, innerHTML nowhere: the text of a note is typed
        // by a human and must never be interpreted as markup, whatever it
        // contains. This rule has no exception in this package, not even for the
        // setup screen.
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    };

    const empty = (e) => {
        while (e.firstChild) e.removeChild(e.firstChild);
    };

    const normalize = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

    const clip = (t, max) => (t.length > max ? t.slice(0, max) : t);

    /* -- 3. Bytes, text, base64url ------------------------------------------
       base64url WITHOUT padding: it is the only form in the format (FORMAT.md
       sections 1.1 and 3.3). It goes through a query string, a urlencoded body
       and an SQL column without escaping, and it can be copied by hand without a
       trailing "=" getting lost in an email. */

    const utf8Encoder = new TextEncoder();
    const utf8Decoder = new TextDecoder();

    const utf8 = (t) => utf8Encoder.encode(String(t));
    const fromUtf8 = (bytes) => utf8Decoder.decode(bytes);

    const b64url = (source) => {
        const u = new Uint8Array(source);
        let raw = '';
        // In chunks: String.fromCharCode.apply on an array of 24000 bytes blows
        // the call stack in some browsers.
        for (let i = 0; i < u.length; i += 4096) {
            raw += String.fromCharCode.apply(null, u.subarray(i, i + 4096));
        }
        return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    /**
     * Returns a Uint8Array, or null if the string is not base64url.
     *
     * Returning null rather than throwing: the caller is always in the middle of
     * reading a line that came off the network, and an unreadable line gets
     * counted, it does not stop the others from being read.
     */
    const fromB64url = (text) => {
        const t = String(text).replace(/-/g, '+').replace(/_/g, '/');
        if (!/^[A-Za-z0-9+/]*$/.test(t)) return null;
        let raw = '';
        try {
            raw = atob(t + '==='.slice((t.length + 3) % 4));
        } catch (e) {
            return null;
        }
        const u = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) u[i] = raw.charCodeAt(i);
        return u;
    };

    /* -- 4. Versions ---------------------------------------------------------
       Is the fix for a note ALREADY ONLINE?
       We compare the three leading numbers of the version (1.0.69-rc.abc1234):
       they grow with every build. A note resolved in a version more recent than
       the one being served is fixed but not deployed yet, and that has to be
       said -- otherwise we hide it while the defect is still there.
       Unreadable or missing version: the fix is taken as NOT deployed, because
       showing one note too many costs less than hiding one that still counts. */

    const versionNumbers = (v) => {
        const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
        return m ? [+m[1], +m[2], +m[3]] : null;
    };

    const alreadyDeployed = (fixVersion) => {
        const a = versionNumbers(fixVersion);
        const b = versionNumbers(SITE_VERSION);
        if (!a || !b) return false;
        for (let i = 0; i < 3; i += 1) {
            if (b[i] !== a[i]) return b[i] > a[i];
        }
        return true;
    };

    /**
     * ISO date from the server -> THE READER'S LOCAL TIME.
     *
     * The server writes in UTC with an explicit offset; the conversion happens
     * here, once, and nobody has to wonder which time zone they are looking at.
     *
     * The language is THE DOCUMENT'S (the lang attribute of <html>), falling
     * back on the browser's: on a French page read from an English browser,
     * "20 aout 2026" is more accurate than "Aug 20, 2026".
     */
    const readableDate = (iso) => {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return T('date.unknown');
        const language = (document.documentElement.getAttribute('lang') || '').trim();
        try {
            return d.toLocaleString(language || undefined,
                { dateStyle: 'medium', timeStyle: 'short' });
        } catch (e) {
            try {
                return d.toLocaleString();
            } catch (e2) {
                return iso;
            }
        }
    };

    /* ==== 15-labels.js ==== */

    /* -- 5. EVERY TEXT THE TOOL PUTS ON SCREEN -------------------------------

       English is the default language, and this is the only place it is
       written: no other file in this package contains a sentence meant for the
       screen. Translating the tool, or simply changing a word that does not suit
       a team, therefore never means touching the code.

       TWO WAYS TO REPLACE A LABEL, in order of priority:

         1. an object defined BEFORE the client is loaded:

                <script>
                  window.Annotepage = { labels: {
                    'button.open': 'Annoter la page'
                  } };
                </script>
                <script src="https://.../annotepage.js" ... defer></script>

         2. a neighbouring file, DECLARED on the tag:

                <script src="https://.../annotepage.js"
                        data-labels="/local-labels.js" defer></script>

            That file writes, like this one, into window.Annotepage: it sets
            "labels" (its own texts) and not "defaultLabels". It is resolved
            against the DOCUMENT, not against the CDN: a translation belongs to
            the site under review.

       A full French set ships in labels/fr.json, as a worked example.

       Why the local file is DECLARED and not looked for: going to see "whether
       it is there" means a request that usually answers 404 -- and the browser
       logs that failure itself, in the console of EVERY page.

       A MISSING LABEL FALLS BACK ON ENGLISH. A partial translation is therefore
       usable as it is.

       SHAPE: a FLAT object. The keys are dotted so they read, not so they nest --
       "button.open" is a string, not a path.

       { ... } in a value is a placeholder replaced at display time ({n}, {max},
       {name}, {excerpt}, {code}). An unknown placeholder is left as it is. */

    ns.defaultLabels = {

        /* -- The button, the tool's only trace when it is at rest ---------- */
        'button.open': 'Annotate this page',
        'button.close': 'Done',
        'button.help': 'Write and read the remarks on this page',
        'button.notes_zero': '',
        'button.notes_one': '1 note',
        'button.notes_n': '{n} notes',

        /* -- The panel ----------------------------------------------------- */
        'panel.title': 'Review notes',
        'panel.close': 'Close',
        'panel.instructions': 'Click an element of the page to write a remark about it.',
        'panel.escape': 'Press Escape to stop.',
        'panel.empty': 'Nobody has written a note on this page yet.',
        'panel.section_page': 'On this page',
        'panel.refresh': 'Refresh',

        /* -- Notes whose element cannot be found any more ------------------- */
        'orphans.title': 'Notes whose element has changed',
        'orphans.help':
            'These remarks were about an element that no longer exists in the same '
            + 'form. They are kept as they are.',

        /* -- A note -------------------------------------------------------- */
        'note.about': 'About: {excerpt}',
        'note.no_element': 'About the whole page',
        'note.element_lost': 'Element not found on the current page',
        'note.show': 'Show on the page',
        'note.reply': 'Reply',
        'note.reply_placeholder': 'Your reply',
        'note.reply_send': 'Send the reply',
        'note.cancel': 'Cancel',
        'note.mark_resolved': 'Mark resolved',
        'note.reopen': 'Reopen this remark',

        /* -- Marking a remark resolved, and taking that mark back ----------- */
        'resolution.help':
            'The remark moves to the history once the fix is online. It is never '
            + 'deleted: it can be reopened.',
        'resolution.confirm': 'It is fixed',
        'reopening.help':
            'The remark comes back into the list, with its replies. Do this if the '
            + 'fix turns out to be incomplete.',
        'reopening.confirm': 'Reopen',

        /* -- The form ------------------------------------------------------ */
        'form.title': 'Your remark',
        'form.about': 'About: {excerpt}',
        'form.about_no_text': 'About the element you have just pointed at',
        'form.name': 'Your name',
        'form.name_help': 'It will appear next to your remarks, and be remembered for next time.',
        'form.name_placeholder': 'First name, or first and last name',
        'form.text_placeholder': 'What you noticed',
        'form.send': 'Send',
        'form.sending': 'Sending...',
        'form.cancel': 'Cancel',
        'form.name_missing': 'Give your name before sending.',
        'form.text_missing': 'Write your remark before sending.',
        'form.too_long': 'Your remark is {n} characters long; the limit is {max}.',
        'form.remaining': '{n} characters left',

        /* -- The reviewer's name ------------------------------------------- */
        'author.known': 'You are writing as {name}.',
        'author.change': 'Change',
        'history.show': 'See the history ({n} resolved)',
        'history.hide': 'Hide the history',
        'history.help': 'Remarks that are resolved, and whose fix is online. '
            + 'They stay here: a correction believed done can turn out to be incomplete.',
        'note.resolved': 'Resolved on {date} by {by}',
        'note.resolved_pending': 'Resolved, waiting to be deployed',
        'note.resolved_version': 'Fix shipped in version {version}',
        'setup.localhost': 'You are on a local machine, so three of the values above '
            + 'need care. The origins line names an origin every developer shares -- '
            + 'never put it in a relay configuration others use. The tag points at '
            + 'this host, which will not exist once the site moves. And a note '
            + 'written here lands on any page with the same path, staging and '
            + 'production included: the index is the path alone.',

        /* -- Failures. They are shown, they are never kept quiet ----------- */
        'error.title': 'Your remark has NOT been saved',
        'error.title_read': 'The notes could not be read back',
        'error.title_resolution': 'The state of the remark has NOT been changed',
        'error.network':
            'The server did not answer. Your text is kept above: try again in a '
            + 'moment.',
        'error.unexpected':
            'The server answered something unexpected. Your text is kept above; '
            + 'tell whoever looks after the site.',

        /* A FLAT refusal: a 4xx code with no readable message, almost always a
           firewall's HTML page. It gets its own sentence because "something
           unexpected" helped nobody: the refusal is plain, it has a code, and
           there is a move that often gets around it -- rephrasing. */
        'error.refused':
            'The server REFUSED the request (code {code}) without saying why. '
            + 'That is almost always a firewall in front of the site, which took '
            + 'the text for an attack. Your text is kept above: rephrase it -- no '
            + '< > tags, no quotes, no fragment of code or web address -- then try '
            + 'again. If the refusal persists, tell whoever looks after the site: '
            + 'it is a firewall rule to adjust, not a broken tool.',
        'error.refused_size':
            'The server refused the request because it is too long (code {code}). '
            + 'Your text is kept above: shorten it, or split it into two remarks.',
        'error.refused_rate':
            'The server refused the request because it received too many in too '
            + 'little time (code {code}). Your text is kept above: wait a minute '
            + 'and try again.',
        'error.server_failure':
            'The server failed (code {code}). It is not your text: it is kept '
            + 'above. Try again in a moment, then tell whoever looks after the '
            + 'site.',
        'error.encryption':
            'Encryption failed in this browser: nothing was sent. Your text is '
            + 'kept above. Reload the page and try again; if it happens again, '
            + 'tell whoever looks after the site.',
        'error.partial_read': 'What is shown may be incomplete.',
        'error.hide': 'Hide',

        /* -- The notes we cannot read, and do not hide --------------------- */
        'read.newer_one':
            '1 note was written by a more recent version of annotepage and could '
            + 'not be read.',
        'read.newer_n':
            '{n} notes were written by a more recent version of annotepage and '
            + 'could not be read.',
        'read.unreadable_one':
            '1 note could not be decrypted. The key in this browser may not be '
            + 'the one it was written with.',
        'read.unreadable_n':
            '{n} notes could not be decrypted. The key in this browser may not be '
            + 'the one they were written with.',
        'read.unknown_one':
            '1 note is written in a mode this tool does not know, and was not '
            + 'read.',
        'read.unknown_n':
            '{n} notes are written in a mode this tool does not know, and were not '
            + 'read.',
        'read.title_partial': 'Some notes could not be read',

        /* -- The markers put on the elements already annotated ------------- */
        'marker.one': '1 note here',
        'marker.n': '{n} notes here',

        /* -- The key: the only secret, and it cannot be recovered ---------- */
        'key.title': 'The key of this project is needed',
        'key.help':
            'The notes of this project are encrypted in your browser. Without the '
            + 'project key, this browser can neither read them nor write any. Ask '
            + 'whoever installed the tool for it, and paste it below. It will be '
            + 'remembered by this browser, for this site.',
        'key.label': 'The project key (43 characters)',
        'key.confirm': 'Use this key',
        'key.empty': 'Paste the key before confirming.',
        'key.shape':
            'This is not a key: 43 characters are expected, from A-Z a-z 0-9 - _, '
            + 'with no space and no decorative dash. Copy it in one block.',
        'key.wrong':
            'This key is not the one for this project. Nothing was sent, nothing '
            + 'was decrypted. Check that you are pasting the key of the right '
            + 'project.',
        'key.origin_changed':
            'This key is remembered per browser AND per domain. The day staging '
            + 'becomes production, it has to be pasted once more on the new domain '
            + '-- the notes themselves do not move.',
        'key.not_kept':
            'This browser refuses to remember the key (private browsing, or '
            + 'storage blocked). The tool works for this page, but the key will '
            + 'have to be pasted again on the next load.',
        'key.replace': 'Paste another key',
        'key.forget': 'Forget the key on this browser',
        /* Asked BEFORE, because the gesture cannot be taken back from here --
           and it says what is really lost, which is the convenience and not the
           notes. Announcing "your notes will be lost" would be a lie that stops
           somebody from cleaning up a shared machine; saying nothing at all
           would strand whoever no longer has the key anywhere else. */
        'key.forget_confirm':
            'This browser will stop keeping the key of this project: the tool '
            + 'will ask for it again here, and on every page of this site. The '
            + 'notes are not touched -- they stay on the server, encrypted, and '
            + 'they come back as soon as the key is pasted again. Make sure you '
            + 'can still get hold of the key before confirming: nobody, not even '
            + 'the server, can hand it back.',

        /* -- A project whose key is IN the page ---------------------------
           Said where the notes are, at every draw, and not once at startup: it
           is a standing property of the project, not an event. The write half
           is the one nobody expects -- the key gives both, and this format has
           no reader-only role. */
        'public.notice':
            'End-to-end encrypted, and the key of this project is public: it is '
            + 'written into this page. Anyone who can open the page can read these '
            + 'notes AND write them -- the key gives both, and this format has no '
            + 'reader-only role.',

        /* -- A newer client exists, and this copy is not going to fetch it -
           Shown ONLY when the file is served by the site itself: a copy served
           by a CDN replaces itself instead of talking about it (80-upgrade).
           So the sentence has to say what was NOT done, and whose call it is. */
        'upgrade.available':
            'A more recent annotepage client exists: {version}. This page is '
            + 'running {current}, served by the site itself -- nothing was fetched '
            + 'to replace it, and when to update the file is the owner\'s call.',

        /* -- A tag that cannot be used as it stands ------------------------
           Somebody put that tag there on purpose, so we speak instead of staying
           silent -- and we refuse exactly as a wrong pasted key is refused
           today: nothing sent, nothing decrypted. */
        'tag.title': 'This annotepage tag cannot be used',
        'tag.key_shape':
            'The data-key attribute of the tag on this page is not a key: 43 '
            + 'characters are expected, from A-Z a-z 0-9 - _, with no space and no '
            + 'decorative dash. Nothing was sent and nothing was decrypted. '
            + 'Whoever installed the tool has to copy the key again, in one block.',
        'tag.key_mismatch':
            'The tag on this page carries a key and a project id that do not go '
            + 'together: the key does not derive that id. Nothing was sent and '
            + 'nothing was decrypted, and the tool does not guess which of the two '
            + 'is right. A public tag needs the key alone -- the id is derived '
            + 'from it -- so remove data-project, or correct whichever of the two '
            + 'is wrong.',

        /* -- Setup --------------------------------------------------------- */
        'setup.title': 'Install annotepage on this site',
        'setup.generate': 'Generate a key and create the project',
        'setup.warning_title': 'Read this before continuing',
        'setup.warning':
            'The key below is the ONLY secret of the project, and nobody else has '
            + 'it: not the server, not the author of the tool, nobody you can ask. '
            + 'KEY LOST = NOTES LOST, for good, with no recovery. Put it away now, '
            + 'where your team keeps its passwords, before continuing.',
        'setup.key': 'The project key -- keep it',
        'setup.project': 'The project id -- public, it goes into the page',
        'setup.tag': 'The tag to paste at the end of <body>, on the pages to annotate',
        'setup.server': 'To declare in the server configuration',
        'setup.copy': 'Copy',
        'setup.copied': 'Copied',
        'setup.copy_failed': 'Select the text and copy it by hand.',
        'setup.continue': 'I have put the key away, continue',
        'setup.done':
            'The key is remembered by this browser. Paste the tag above into the '
            + 'pages, declare the project on the server, then reload this page: the '
            + 'tool takes over.',
        'setup.no_server':
            'No server address is declared on the tag (data-server), and the client '
            + 'does not come from the site: it cannot guess where to write. Add '
            + 'data-server to the tag.',
        'setup.plain_mode':
            'This project is declared in PLAIN mode: the server will read the '
            + 'remarks, the names and the paths. That mode is only acceptable if '
            + 'the server is the site itself, behind the same access restriction. A '
            + 'relay will refuse it.',

        /* -- The secure context, without which nothing is possible --------- */
        'context.title': 'annotepage cannot work on this page',
        'context.help':
            'Encrypting the notes and grouping them by page rest on WebCrypto, '
            + 'which the browser only provides in a secure context: https, or '
            + 'localhost. This page is not one. Nothing can be written or read '
            + 'back here while it is served this way.',

        /* -- Odds and ends ------------------------------------------------- */
        'date.unknown': 'unknown date'
    };

    /* ==== 20-crypto.js ==== */

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

    /* ==== 30-state.js ==== */

    /* -- 7. State, browser memory, scope ------------------------------------- */

    let host = null;            // the single element added to the site
    let root = null;            // its shadow root
    let ui = null;              // the interface elements, once built
    let mode = false;           // is annotation mode on?
    let notes = [];             // the page's notes, as the server states them
    let anchored = [];          // { element, notes[] } : the notes found again
    let orphans = [];           // notes whose element was not found
    let historyOpen = false;    // resolved AND deployed notes are folded away
    let target = null;          // element being annotated
    let hovered = null;         // element under the pointer
    let currentFailure = null;  // { title, detail } shown in the panel
    let author = '';            // read at startup: see 90-boot
    let timer = null;
    let rafPending = false;

    /* What we did NOT manage to read at the last load. We count it so we can say
       it: a note skipped in silence is a remark that disappears. */
    let skipped = { newer: 0, unreadable: 0, unknown: 0 };

    /* The key of this project, and everything derived from it. "keys" stays
       null as long as the key is unknown: no request, no decryption goes out
       before then. */
    let keyText = '';
    let keys = null;            // { id, encryptionKey, indexKey }
    let PAGE_INDEX = '';        // blind index of the current page

    const inTool = (n) => !!(host && n && (n === host || host.contains(n)));

    /* -- The browser's memory ------------------------------------------------
       The try/catch blocks wrap ONLY the storage access, because that is the
       only thing here that is allowed to fail: private browsing, or storage
       refused by a browser policy. Widening them would turn a programming
       mistake into a silent failure, and therefore into one nobody can find. */

    // A per-browser convenience, not an identity: nobody is authenticated, and
    // the name is there to know who to talk to, not to prove who one is.
    const AUTHOR_KEY = 'annotepage/author';

    /* The key is stored UNDER THE PROJECT ID. That naming is not cosmetic: two
       projects reviewed from the same browser must not overwrite each other.

       An unpleasant consequence, to be stated: localStorage is PER ORIGIN. The
       day staging becomes production, every reviewer has to paste the key once
       more on the new domain. The notes themselves do not move -- and that is
       exactly what the rule "the domain is not in the key" buys. */
    const keyKey = (project) => 'annotepage/key/' + project;

    const readSalt = (project) => {
        try {
            return String(window.localStorage.getItem(keyKey(project)) || '').trim();
        } catch (e) {
            // Without storage the key will be asked for on every visit: that is
            // less comfortable, it is not a failure.
            return '';
        }
    };

    const writeSalt = (project, text) => {
        try {
            window.localStorage.setItem(keyKey(project), text);
            return true;
        } catch (e) {
            // We return false so the screen can SAY it: a key that is not kept
            // will have to be pasted again on every page, and it is better to
            // know that straight away than on the third time.
            return false;
        }
    };

    const forgetSalt = (project) => {
        try {
            window.localStorage.removeItem(keyKey(project));
        } catch (e) {
            // Nothing to do: there was no storage in the first place.
        }
    };

    function readAuthor() {
        let raw = '';
        try {
            raw = window.localStorage.getItem(AUTHOR_KEY) || '';
        } catch (e) {
            return '';
        }
        return normalize(raw);
    }

    function writeAuthor(value) {
        author = value;
        try {
            window.localStorage.setItem(AUTHOR_KEY, value);
        } catch (e) {
            // No consequence: only the memory of the name is lost.
        }
    }

    /* -- The scope -----------------------------------------------------------
       Two checks, and neither is a security measure. They keep a tag left in a
       shared template from collecting notes where the project does not go, and
       keep a client from talking to a server that is going to say no. The real
       boundary is the server's domain lock (FORMAT.md section 6.2), which is
       itself only an anti-abuse measure. */

    const inScope = () => {
        if (DOMAINS.length && DOMAINS.indexOf(location.origin) === -1) return false;
        if (PATH_PREFIX && pagePath().indexOf(PATH_PREFIX) !== 0) return false;
        return true;
    };

    /* ==== 40-api.js ==== */

    /* -- 8. The API ---------------------------------------------------------
       The contract, as the server fixed it:

         200 + application/json      normal response
         200 + JSON "active: false"  tool dropped in, not configured -> stand down
         404 + text/plain            nothing at this address -> stand down
         4xx/5xx + text/plain        message written for a human -> SHOW IT
         4xx with no readable text   FLAT REFUSAL, almost always a firewall ->
                                     name it, with its code (see below)
         anything else               PHP not executed -> stand down

       This function never rejects and never writes to the console: it returns a
       cause, and the caller decides whether we keep quiet or speak. */

    const call = (action, body) => {
        if (!API) return Promise.resolve({ ok: false, cause: 'inactive' });

        const options = {
            method: body ? 'POST' : 'GET',
            cache: 'no-store',
            // On a relay this means "no cookie": that is what we want. The
            // project is not a session, it is a bearer token (FORMAT.md section
            // 6.3), and the urlencoded body makes a write a "simple request" in
            // the CORS sense -- so no OPTIONS preflight.
            credentials: 'same-origin'
        };
        if (body) options.body = body;

        let address = API + (API.indexOf('?') === -1 ? '?' : '&')
            + 'action=' + encodeURIComponent(action);
        if (!body) {
            // The real path is NEVER sent, in any mode: only the blind index
            // goes out. Sending the path in plain mode and the index in
            // encrypted mode would make two code paths, and the second would be
            // the less tested one.
            address += '&project=' + encodeURIComponent(PROJECT)
                + '&index=' + encodeURIComponent(PAGE_INDEX);
        }

        return fetch(address, options)
            .then((response) => response.text().then((text) => ({ response: response, text: text })))
            .then((r) => {
                const status = r.response.status;
                const type = (r.response.headers.get('content-type') || '').toLowerCase();
                const isJson = type.indexOf('application/json') !== -1;

                if (r.response.ok && isJson) {
                    let data = null;
                    try {
                        data = JSON.parse(r.text);
                    } catch (e) {
                        return { ok: false, cause: 'nonjson' };
                    }
                    // The tool is dropped in here but not configured: it SAYS so
                    // with a 200, so as not to leave the browser an error to log.
                    // We stand down, as on a 404.
                    if (data && data.active === false) {
                        return { ok: false, cause: 'inactive' };
                    }
                    return { ok: true, data: data };
                }
                if (status === 404) {
                    // The tool is not configured here -- or there is nothing at
                    // this address. Either way: silence.
                    return { ok: false, cause: 'inactive' };
                }
                if (!r.response.ok && type.indexOf('text/plain') !== -1) {
                    return { ok: false, cause: 'server', message: clip(r.text.trim(), 2000) };
                }

                /* THE FLAT REFUSAL. Seen in production: a hosting firewall
                   answers 403 with an HTML page, and the client showed "the
                   server answered something unexpected". That was true and
                   useless -- nobody knew what to do with the sentence.

                   It is not our server speaking: it is an intermediary that
                   decided the request looked like an attack, often because of a
                   word in the text that was typed. So we name the refusal, we
                   give its code, and we suggest the one move that really gets
                   around it: rephrase. The text stays in the form -- that has
                   never changed and will not. */
                if (status === 413) return { ok: false, cause: 'refused-size', code: status };
                if (status === 429) return { ok: false, cause: 'refused-rate', code: status };
                if (status >= 400 && status < 500) return { ok: false, cause: 'refused', code: status };
                if (status >= 500) return { ok: false, cause: 'failure', code: status };

                // A 200 that is not JSON: PHP is not executed, the source is
                // served in the clear, or an intermediary answered.
                return { ok: false, cause: 'nonjson' };
            })
            .catch(() => ({ ok: false, cause: 'network' }));
    };

    /** Turns a cause into a showable failure. Returns null if there is nothing
        to say. */
    const failureFrom = (result, title) => {
        if (result.ok) return null;
        const say = (key) => ({ title: T(title), detail: T(key, { code: result.code }) });
        if (result.cause === 'server') return { title: T(title), detail: result.message };
        if (result.cause === 'network') return say('error.network');
        if (result.cause === 'refused') return say('error.refused');
        if (result.cause === 'refused-size') return say('error.refused_size');
        if (result.cause === 'refused-rate') return say('error.refused_rate');
        if (result.cause === 'failure') return say('error.server_failure');
        return say('error.unexpected');
    };

    /* -- 9. Writing: the mode decides where the fields go --------------------
       One single place builds a request body. In plain mode the fields go out as
       they are -- exactly format 1's columns. In encrypted mode, EVERYTHING typed
       or observed goes into the envelope: encrypting the text alone would hand
       over the site's tree, the wording of its elements and the names of its
       reviewers (FORMAT.md section 2.3). */

    const PAYLOAD_FIELDS = ['page', 'selector', 'fingerprint', 'excerpt',
                            'author', 'text', 'version', 'environment', 'viewport'];

    const noteBody = (fields, replyTo) => {
        const body = new URLSearchParams();
        body.set('project', PROJECT);
        body.set('mode', MODE);
        if (replyTo) {
            // A reply INHERITS the page index of its parent, and in plain mode
            // its page and its element. Asking the client for them again would
            // open the door to a reply attached somewhere other than the note it
            // comments on.
            body.set('reply_to', String(replyTo));
        } else {
            body.set('index', PAGE_INDEX);
        }

        if (MODE === 'plain') {
            PAYLOAD_FIELDS.forEach((key) => {
                if (fields[key] !== undefined) body.set(key, String(fields[key]));
            });
            return Promise.resolve(body);
        }
        // The AAD uses the page index WE computed, never the one the server
        // announces: it is precisely against a server that moves a note from one
        // page to another that the AAD exists.
        return seal(keys.encryptionKey, PROJECT, PAGE_INDEX, 'note', fields)
            .then((envelope) => {
                body.set('payload', envelope);
                return body;
            });
    };

    const resolutionBody = (note, mark, name) => {
        const body = new URLSearchParams();
        body.set('project', PROJECT);
        body.set('id', String(note.id));
        body.set('resolved', mark ? '1' : '0');
        if (!mark) {
            // Reopening writes nothing: the server clears the resolution. We do
            // not ask for the fixer's name in order to cancel the fix.
            return Promise.resolve(body);
        }
        if (MODE === 'plain') {
            body.set('by', name);
            body.set('version', SITE_VERSION);
            return Promise.resolve(body);
        }
        // A second envelope, its own nonce, its own role: it is written by
        // another person, at another moment, often from another machine. Melting
        // it into the note's envelope would mean re-encrypting a remark we have
        // no right to rewrite.
        return seal(keys.encryptionKey, PROJECT, PAGE_INDEX, 'resolution',
                    { by: name, version: SITE_VERSION })
            .then((envelope) => {
                body.set('resolution_payload', envelope);
                return body;
            });
    };

    /* -- 10. Reading: open what we can, count what we cannot ------------------ */

    const fillFrom = (note, object) => {
        // UNKNOWN fields of the object are ignored in silence: that is what
        // makes it possible to add one some day without changing the format
        // number.
        PAYLOAD_FIELDS.forEach((key) => {
            note[key] = object[key] === undefined ? '' : String(object[key]);
        });
        return note;
    };

    /**
     * One row -> one readable note, or null if we cannot read it.
     * What is skipped is COUNTED: a note that disappears in silence is worse
     * than a note we announce we cannot read.
     */
    const openNote = (note) => {
        if (!note || typeof note !== 'object') return Promise.resolve(null);

        // "mode" missing or empty: the row comes from format 1, it is plain.
        const m = String(note.mode || 'plain');

        if (m === 'plain') return Promise.resolve(note);

        if (m !== 'encrypted') {
            // Neither guessed, nor blanked without saying so.
            skipped.unknown += 1;
            return Promise.resolve(null);
        }

        return open(keys.encryptionKey, PROJECT, PAGE_INDEX, 'note', note.payload)
            .then(
                (object) => fillFrom(note, object),
                (e) => {
                    if (e && e.reason === 'newer') skipped.newer += 1;
                    else skipped.unreadable += 1;
                    return null;
                }
            )
            .then((read) => {
                if (!read || !read.resolution_payload) return read;
                return open(keys.encryptionKey, PROJECT, PAGE_INDEX, 'resolution', read.resolution_payload)
                    .then(
                        (object) => {
                            read.resolved_by = object.by === undefined ? '' : String(object.by);
                            read.resolved_version = object.version === undefined ? '' : String(object.version);
                            return read;
                        },
                        () => {
                            /* The note reads, its resolution does not. We keep
                               the note: "resolved by somebody" beats nothing, and
                               the resolution date is in the clear anyway. */
                            read.resolved_by = '';
                            read.resolved_version = '';
                            return read;
                        }
                    );
            });
    };

    /** Opens a note and its replies. A reply is a note: same role. */
    const openThread = (note) =>
        openNote(note).then((parent) => {
            if (!parent) return null;
            const children = Array.isArray(parent.replies) ? parent.replies : [];
            if (!children.length) return parent;
            return Promise.all(children.map(openNote))
                .then((read) => {
                    parent.replies = read.filter(Boolean);
                    return parent;
                });
        });

    const readList = (data) => {
        skipped = { newer: 0, unreadable: 0, unknown: 0 };
        const raw = data && Array.isArray(data.notes) ? data.notes : [];
        return Promise.all(raw.map(openThread)).then((read) => read.filter(Boolean));
    };

    /** What we could not read, said on screen. Returns null if there is nothing
        to say. */
    const readFailure = () => {
        const lines = [];
        if (skipped.newer) {
            lines.push(readableCount(skipped.newer, '', 'read.newer_one', 'read.newer_n'));
        }
        if (skipped.unreadable) {
            lines.push(readableCount(skipped.unreadable, '', 'read.unreadable_one', 'read.unreadable_n'));
        }
        if (skipped.unknown) {
            lines.push(readableCount(skipped.unknown, '', 'read.unknown_one', 'read.unknown_n'));
        }
        if (!lines.length) return null;
        return { title: T('read.title_partial'), detail: lines.join('\n') };
    };

    /* ==== 50-anchors.js ==== */

    /* -- 11. The three anchors of an element ---------------------------------
       None is reliable on its own: a path breaks at the first inserted block, a
       fingerprint of classes breaks when the styling is redone, a text excerpt
       breaks at the editorial pass. Together they make it possible to DEGRADE --
       to flag the note as orphaned -- instead of losing it. */

    const cssPath = (el) => {
        const parts = [];
        let n = el;
        while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement) {
            const tag = n.localName;
            let rank = 1;
            let s = n.previousElementSibling;
            while (s) {
                if (s.localName === tag) rank += 1;
                s = s.previousElementSibling;
            }
            parts.unshift(tag + ':nth-of-type(' + rank + ')');
            n = n.parentElement;
        }
        // Too long for the column: we drop the leading segments. The path becomes
        // relative and may designate several elements -- which is exactly why the
        // fingerprint and the excerpt exist.
        let path = parts.join(' > ');
        while (path.length > MAX_SELECTOR && parts.length > 1) {
            parts.shift();
            path = parts.join(' > ');
        }
        return clip(path, MAX_SELECTOR);
    };

    const fingerprintOf = (el) => {
        if (!el || el.nodeType !== 1) return '';
        let e = el.localName;
        if (el.id) e += '#' + el.id;
        const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        for (let i = 0; i < classes.length && i < 4; i += 1) e += '.' + classes[i];
        return clip(e, MAX_FINGERPRINT);
    };

    /**
     * The text by which a human recognises the element. It is what shows in the
     * panel: "About: Contact us". Never the path, never the fingerprint -- those
     * are anchors for machines.
     */
    const excerptOf = (el) => {
        if (!el || el.nodeType !== 1) return '';
        let t = normalize(el.textContent);
        if (!t) {
            t = normalize(
                el.getAttribute('alt') ||
                el.getAttribute('aria-label') ||
                el.getAttribute('placeholder') ||
                el.getAttribute('title') ||
                (el.localName === 'input' ? el.value : '') ||
                ''
            );
        }
        return clip(t, MAX_EXCERPT);
    };

    /* -- 12. Finding the element of a note ----------------------------------- */

    const score = (el, note) => {
        let s = 0;
        if (note.fingerprint && fingerprintOf(el) === note.fingerprint) s += 2;
        if (note.excerpt) {
            const t = excerptOf(el);
            if (t === note.excerpt) s += 2;
            else if (t && note.excerpt.length >= 12 && t.indexOf(note.excerpt.slice(0, 24)) === 0) s += 1;
        }
        return s;
    };

    /**
     * Three attempts, from the most precise to the widest. If none returns an
     * element that resembles it enough, the note becomes ORPHANED: it stays
     * readable in the panel, with its date and its author, instead of vanishing
     * without anyone knowing.
     */
    const findElement = (note) => {
        if (!note.selector && !note.fingerprint && !note.excerpt) return null;

        // 1. The path, confirmed by at least one of the two other anchors.
        if (note.selector) {
            let el = null;
            try {
                el = document.body.querySelector(note.selector);
            } catch (e) {
                el = null; // path gone invalid: this is not a failure
            }
            if (el && !inTool(el)) {
                if (!note.fingerprint && !note.excerpt) return el;
                if (score(el, note) >= 1) return el;
            }
        }

        // 2. The fingerprint: same tag, same classes, same id.
        if (note.fingerprint) {
            const tag = note.fingerprint.split(/[#.]/)[0];
            let candidates = [];
            try {
                candidates = Array.prototype.slice.call(document.body.querySelectorAll(tag));
            } catch (e) {
                candidates = [];
            }
            let best = null;
            let bestScore = 0;
            for (let i = 0; i < candidates.length; i += 1) {
                const c = candidates[i];
                if (inTool(c)) continue;
                const s = score(c, note);
                if (s > bestScore) {
                    best = c;
                    bestScore = s;
                }
            }
            if (best && bestScore >= 2) return best;
        }

        // 3. The text alone, if it is long enough not to designate just
        //    anything. It is the anchor that best survives a restyling.
        if (note.excerpt && note.excerpt.length >= 12) {
            const all = document.body.querySelectorAll('*');
            for (let i = 0; i < all.length; i += 1) {
                const c = all[i];
                if (inTool(c)) continue;
                if (excerptOf(c) === note.excerpt) return c;
            }
        }

        return null;
    };

    /** Splits the server's notes between elements found again and orphans. */
    const anchor = () => {
        anchored = [];
        orphans = [];
        for (let i = 0; i < notes.length; i += 1) {
            const note = notes[i];
            const el = findElement(note);
            if (!el) {
                orphans.push(note);
                continue;
            }
            let group = null;
            for (let j = 0; j < anchored.length; j += 1) {
                if (anchored[j].element === el) group = anchored[j];
            }
            if (!group) {
                group = { element: el, notes: [] };
                anchored.push(group);
            }
            group.notes.push(note);
        }
    };

    /* ==== 60-ui.js ==== */

    /* -- 13. Building the interface -------------------------------------------
       Everything below lives in the shadow root. The host site sees none of it,
       and is seen by none of it. */

    /**
     * The host element and its shadow root, and NOTHING ELSE.
     *
     * It is created before the labels are loaded -- a shadow root is needed to
     * load them into -- but it shows nothing: the interface itself is only built
     * once the texts are available.
     */
    const buildHost = () => {
        // IDEMPOTENT, and this is not a stylistic precaution: the key-pasting
        // screen built the host BEFORE the normal startup asked for it in turn.
        // Without this guard, the site received TWO elements, one of them empty
        // and orphaned -- the promise "one single element added" fell over at the
        // first pasted key.
        if (host) return;
        host = document.createElement('annotepage-notes');
        // These properties are set INLINE and with !important, on our own
        // element: a site rule aiming at "body > div" must not be able to move
        // the layer. "all: initial" also cuts off any inheritance from the site
        // into the tool.
        host.style.cssText =
            'all: initial !important;' +
            'position: fixed !important;' +
            'top: 0 !important; left: 0 !important;' +
            'right: 0 !important; bottom: 0 !important;' +
            'width: auto !important; height: auto !important;' +
            'margin: 0 !important; padding: 0 !important; border: 0 !important;' +
            'pointer-events: none !important;' +
            'z-index: 2147483000 !important;';
        document.body.appendChild(host);
        root = host.attachShadow({ mode: 'open' });

        /* The stylesheet is PUT HERE, in a <style>, and not loaded by a <link>
           as in the original tool.

           Reason: the client goes to a CDN under SRI. A second request to a
           neighbouring file would mean a second digest to keep up to date, and
           nobody keeps two digests in agreement for long. One file, one digest,
           one thing to check.

           Pleasant side effect: the sheet is there before the first pixel. The
           hiding and then showing of the host element, which existed so as not
           to show the tool unstyled for a fraction of a second, no longer has
           any reason to be and is gone.

           The price, to be stated: the sheet weighs in the served file, and the
           styling can no longer be replaced by changing a neighbouring file -- it
           has to be rebuilt. */
        /* Two routes, and the first is not vanity: a strict content security
           policy (style-src without 'unsafe-inline') BLOCKS a <style> element,
           and the tool would show up unstyled -- which looks like a broken page.
           A CONSTRUCTED sheet, on the other hand, is not an inline sheet in the
           policy's sense, and goes through. We keep <style> for the browsers
           that do not construct sheets. */
        let placed = false;
        try {
            if (root.adoptedStyleSheets && typeof CSSStyleSheet === 'function') {
                const sheet = new CSSStyleSheet();
                sheet.replaceSync(STYLES);
                root.adoptedStyleSheets = [sheet];
                placed = true;
            }
        } catch (e) {
            placed = false;
        }
        if (!placed) {
            const style = document.createElement('style');
            style.textContent = STYLES;
            root.appendChild(style);
        }
    };

    /** The interface. Built AFTER the labels: no fallback text to put in. */
    const buildUi = () => {
        const layer = create('div', 'ap-layer');
        root.appendChild(layer);

        /* -- the button -- */
        const button = create('button', 'ap-button');
        button.type = 'button';
        button.setAttribute('aria-pressed', 'false');
        button.title = T('button.help');
        const dot = create('span', 'ap-button-dot');
        const buttonText = create('span', null, T('button.open'));
        const buttonCount = create('span', 'ap-button-count');
        button.appendChild(dot);
        button.appendChild(buttonText);
        button.appendChild(buttonCount);
        button.addEventListener('click', () => toggleMode());
        layer.appendChild(button);

        /* -- pointing highlight -- */
        const highlight = create('div', 'ap-highlight');
        const label = create('div', 'ap-highlight-label');
        layer.appendChild(highlight);
        layer.appendChild(label);

        /* -- markers -- */
        const markers = create('div', 'ap-markers');
        layer.appendChild(markers);

        /* -- panel -- */
        const panel = create('aside', 'ap-panel');
        panel.setAttribute('role', 'complementary');
        const header = create('div', 'ap-panel-header');
        const title = create('span', 'ap-panel-title', T('panel.title'));
        const close = create('button', 'ap-link', T('panel.close'));
        close.type = 'button';
        close.addEventListener('click', () => leaveMode());
        header.appendChild(title);
        header.appendChild(close);
        const instructions = create('div', 'ap-panel-instructions');
        instructions.appendChild(create('div', null, T('panel.instructions')));
        instructions.appendChild(create('div', null, T('panel.escape')));
        const body = create('div', 'ap-panel-body');
        const footer = create('div', 'ap-panel-footer');
        panel.appendChild(header);
        panel.appendChild(instructions);
        panel.appendChild(body);
        panel.appendChild(footer);
        layer.appendChild(panel);

        /* -- form -- */
        const form = create('div', 'ap-form');
        layer.appendChild(form);

        ui = {
            layer: layer,
            button: button,
            buttonText: buttonText,
            buttonCount: buttonCount,
            highlight: highlight,
            label: label,
            markers: markers,
            panel: panel,
            body: body,
            footer: footer,
            form: form
        };
    };

    /* -- 14. Highlight and markers ------------------------------------------- */

    const place = (el, rect, margin) => {
        const m = margin || 0;
        el.style.left = Math.max(0, rect.left - m) + 'px';
        el.style.top = Math.max(0, rect.top - m) + 'px';
        el.style.width = Math.max(0, rect.width + m * 2) + 'px';
        el.style.height = Math.max(0, rect.height + m * 2) + 'px';
    };

    const showHighlight = (el) => {
        if (!el) return hideHighlight();
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return hideHighlight();
        place(ui.highlight, r, 1);
        ui.highlight.style.display = 'block';

        const text = excerptOf(el);
        ui.label.textContent = text || T('form.about_no_text');
        ui.label.style.display = 'block';
        const top = r.top > 26 ? r.top - 24 : Math.min(window.innerHeight - 24, r.bottom + 4);
        ui.label.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 330)) + 'px';
        ui.label.style.top = top + 'px';
    };

    const hideHighlight = () => {
        if (!ui) return;
        ui.highlight.style.display = 'none';
        ui.label.style.display = 'none';
    };

    /** One badge per annotated element. It only appears in annotation mode:
        outside that mode, the page is exactly the site's. */
    const drawMarkers = () => {
        empty(ui.markers);
        if (!mode) return;
        for (let i = 0; i < anchored.length; i += 1) {
            const group = anchored[i];
            const r = group.element.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.bottom < 0 || r.top > window.innerHeight) continue;
            const n = group.notes.length;
            const badge = create('button', 'ap-marker', String(n));
            badge.type = 'button';
            badge.title = n === 1 ? T('marker.one') : T('marker.n', { n: n });
            badge.style.left = Math.max(2, Math.min(r.left - 8, window.innerWidth - 30)) + 'px';
            badge.style.top = Math.max(2, Math.min(r.top - 8, window.innerHeight - 30)) + 'px';
            badge.addEventListener('click', ((note) => () => focusNote(note))(group.notes[0]));
            ui.markers.appendChild(badge);
        }
    };

    const refreshPositions = () => {
        if (rafPending) return;
        rafPending = true;
        window.requestAnimationFrame(() => {
            rafPending = false;
            if (!mode) return;
            drawMarkers();
            if (hovered && document.contains(hovered)) showHighlight(hovered);
            if (target && document.contains(target)) positionForm(target);
        });
    };

    /* -- 15. The panel ------------------------------------------------------- */

    const failureBlock = (failure, onClose) => {
        const block = create('div', 'ap-error');
        block.setAttribute('role', 'alert');
        block.appendChild(create('div', 'ap-error-title', failure.title));
        // The server's message is shown AS IT WAS WRITTEN: that is how "the
        // database is unreachable" reaches a reviewer's screen.
        block.appendChild(create('p', 'ap-error-detail', failure.detail));
        if (onClose) {
            const hide = create('button', 'ap-link', T('error.hide'));
            hide.type = 'button';
            hide.addEventListener('click', onClose);
            block.appendChild(hide);
        }
        return block;
    };

    const noteCard = (note, orphan) => {
        /* Resolution state, said on the card itself. Two distinct cases:
           resolved and online, or resolved but not deployed yet -- the second has
           to show, otherwise one believes the defect gone while it is still on
           screen. */
        const live = note.resolved_at ? alreadyDeployed(note.resolved_version) : false;
        const card = create('article', 'ap-note'
            + (orphan ? ' ap-orphan' : '')
            + (note.resolved_at ? (live ? ' ap-resolved' : ' ap-resolved-pending') : ''));
        card.setAttribute('data-ap-note', String(note.id));
        if (note.resolved_at) {
            const mark = create('div', 'ap-state-mark',
                live
                    ? T('note.resolved', {
                        date: readableDate(note.resolved_at),
                        by: note.resolved_by || '?',
                      })
                    : T('note.resolved_pending'));
            mark.title = note.resolved_version
                ? T('note.resolved_version', { version: note.resolved_version })
                : '';
            card.appendChild(mark);
        }

        const header = create('div', 'ap-note-header');
        header.appendChild(create('span', 'ap-note-author', note.author));
        header.appendChild(create('span', 'ap-note-date', readableDate(note.created_at)));
        card.appendChild(header);

        // What the reviewer sees of the element: its TEXT, never its path.
        const targetText = orphan
            ? (note.excerpt
                ? T('note.about', { excerpt: note.excerpt }) + ' -- ' + T('note.element_lost')
                : T('note.element_lost'))
            : (note.excerpt ? T('note.about', { excerpt: note.excerpt }) : T('note.no_element'));
        card.appendChild(create('p', 'ap-note-target', targetText));

        card.appendChild(create('p', 'ap-note-text', note.text));

        const actions = create('div', 'ap-note-actions');
        const reply = create('button', 'ap-secondary', T('note.reply'));
        reply.type = 'button';
        actions.appendChild(reply);
        if (!orphan) {
            const show = create('button', 'ap-link', T('note.show'));
            show.type = 'button';
            show.addEventListener('click', () => showElement(note));
            actions.appendChild(show);
        }
        /* Mark resolved, and take that mark back. Without this button, half the
           tool -- the server action, its columns, the history and its labels --
           stayed written and out of reach: nobody could set the state the panel
           already knew how to show. */
        const state = create('button', 'ap-link',
            T(note.resolved_at ? 'note.reopen' : 'note.mark_resolved'));
        state.type = 'button';
        state.addEventListener('click', () => {
            const alreadyOpen = card.querySelector('.ap-resolve');
            if (alreadyOpen) {
                alreadyOpen.remove();
                return;
            }
            card.appendChild(resolutionForm(note, !note.resolved_at));
        });
        actions.appendChild(state);
        card.appendChild(actions);

        const replies = create('div', 'ap-replies');
        const list = note.replies || [];
        for (let i = 0; i < list.length; i += 1) {
            const r = list[i];
            const block = create('div', 'ap-reply');
            const e = create('div', 'ap-note-header');
            e.appendChild(create('span', 'ap-note-author', r.author));
            e.appendChild(create('span', 'ap-note-date', readableDate(r.created_at)));
            block.appendChild(e);
            block.appendChild(create('p', 'ap-note-text', r.text));
            replies.appendChild(block);
        }
        if (list.length) card.appendChild(replies);

        reply.addEventListener('click', () => {
            if (card.querySelector('.ap-reply-form')) return;
            card.appendChild(replyForm(note));
        });

        return card;
    };

    /**
     * Mark a note resolved, or reopen a resolved note.
     *
     * The name is asked for ONLY to mark a fix: it is what signs the gesture. To
     * reopen, the server does not require it and would erase it anyway -- asking
     * for the fixer's name in order to cancel the fix would make no sense.
     *
     * The site version is sent with the mark: it is what then allows "resolved
     * and online" to be told apart from "resolved, not deployed yet". Without
     * it, a note would be filed into the history while the defect is still on
     * screen.
     */
    const resolutionForm = (note, mark) => {
        const block = create('div', 'ap-resolve');
        block.appendChild(create('p', 'ap-help',
            T(mark ? 'resolution.help' : 'reopening.help')));

        const nameParts = mark ? nameField() : null;
        if (nameParts) block.appendChild(nameParts.block);

        const actions = create('div', 'ap-actions');
        const confirm = create('button', 'ap-primary',
            T(mark ? 'resolution.confirm' : 'reopening.confirm'));
        confirm.type = 'button';
        const cancel = create('button', 'ap-secondary', T('note.cancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', () => block.remove());
        actions.appendChild(confirm);
        actions.appendChild(cancel);
        block.appendChild(actions);

        const say = (failure) => {
            const previous = block.querySelector('.ap-error');
            if (previous) previous.remove();
            if (failure) block.insertBefore(failureBlock(failure), block.firstChild);
        };

        confirm.addEventListener('click', () => {
            const name = nameParts ? normalize(nameParts.field.value) : author;
            if (mark && !name) {
                return say({ title: T('error.title_resolution'),
                             detail: T('form.name_missing') });
            }
            say(null);
            confirm.disabled = true;
            cancel.disabled = true;

            // The body is built BEFORE the send and, in encrypted mode, it has
            // to be encrypted to be obtained: that is asynchronous, like the
            // rest.
            resolutionBody(note, mark, name)
                .then((body) => call('resolve', body))
                .then((r) => {
                    confirm.disabled = false;
                    cancel.disabled = false;
                    if (!r.ok) {
                        say(failureFrom(r, 'error.title_resolution'));
                        return;
                    }
                    if (name) writeAuthor(name);
                    block.remove();
                    // As everywhere: we read the server back instead of assuming.
                    reload();
                }, () => {
                    confirm.disabled = false;
                    cancel.disabled = false;
                    say({ title: T('error.title_resolution'), detail: T('error.encryption') });
                });
        });

        return block;
    };

    const replyForm = (note) => {
        const block = create('div', 'ap-reply-form');
        const area = create('textarea', 'ap-area');
        area.setAttribute('placeholder', T('note.reply_placeholder'));
        area.setAttribute('maxlength', String(MAX_TEXT));
        block.appendChild(area);

        const nameParts = nameField();
        if (nameParts) block.appendChild(nameParts.block);

        const actions = create('div', 'ap-actions');
        const send = create('button', 'ap-primary', T('note.reply_send'));
        send.type = 'button';
        const cancel = create('button', 'ap-secondary', T('note.cancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', () => block.remove());
        actions.appendChild(send);
        actions.appendChild(cancel);
        block.appendChild(actions);

        const say = (failure) => {
            const previous = block.querySelector('.ap-error');
            if (previous) previous.remove();
            if (failure) block.insertBefore(failureBlock(failure), block.firstChild);
        };

        send.addEventListener('click', () => {
            const text = area.value.trim();
            const name = nameParts ? normalize(nameParts.field.value) : author;
            if (!name) return say({ title: T('error.title'), detail: T('form.name_missing') });
            if (!text) return say({ title: T('error.title'), detail: T('form.text_missing') });
            if (text.length > MAX_TEXT) {
                return say({
                    title: T('error.title'),
                    detail: T('form.too_long', { n: text.length, max: MAX_TEXT })
                });
            }
            say(null);
            send.disabled = true;
            cancel.disabled = true;
            send.textContent = T('form.sending');

            noteBody({
                author: name,
                text: text,
                version: SITE_VERSION,
                environment: ENVIRONMENT,
                viewport: currentViewport()
            }, note.id).then((body) => call('add', body)).then((r) => {
                send.disabled = false;
                cancel.disabled = false;
                send.textContent = T('note.reply_send');
                if (!r.ok) {
                    // The text stays in the area: nothing is lost.
                    say(failureFrom(r, 'error.title'));
                    return;
                }
                writeAuthor(name);
                block.remove();
                // We ask the server again instead of adding the reply to the
                // screen: what is shown is what the server says, never what the
                // browser assumes.
                reload();
            }, () => {
                send.disabled = false;
                cancel.disabled = false;
                send.textContent = T('note.reply_send');
                // Encryption failed: the reply did NOT go out, and the text
                // stays in the area.
                say({ title: T('error.title'), detail: T('error.encryption') });
            });
        });

        // Convenience: the reply can be written straight away.
        window.setTimeout(() => area.focus(), 0);
        return block;
    };

    /** The "your name" field, only for as long as we do not know it. */
    const nameField = () => {
        if (author) return null;
        const block = create('div');
        const label = create('label', 'ap-label', T('form.name'));
        const field = create('input', 'ap-field');
        field.type = 'text';
        field.setAttribute('maxlength', String(MAX_AUTHOR));
        field.setAttribute('placeholder', T('form.name_placeholder'));
        field.setAttribute('autocomplete', 'off');
        const id = 'ap-name-' + Math.random().toString(36).slice(2, 8);
        field.id = id;
        label.setAttribute('for', id);
        block.appendChild(label);
        block.appendChild(field);
        block.appendChild(create('p', 'ap-help', T('form.name_help')));
        return { block: block, field: field };
    };

    /**
     * The question asked before the key is dropped.
     *
     * It is asked, and not merely announced afterwards, because from this button
     * there is no way back: the tool cannot re-derive a key it has just removed,
     * and neither can the server. It sits at the FOOT of the list, right above
     * the link that opened it, so the answer appears where the question was
     * clicked rather than at the top of a panel that may be scrolled elsewhere.
     *
     * What the sentence must not do is claim the notes are lost. They are not:
     * they stay on the server, and the key brings them back. Overstating it
     * would scare somebody out of a perfectly reasonable clean-up -- and the
     * first time a reviewer forgot the key and found their notes again, they
     * would stop believing the warnings that are true.
     */
    const forgetForm = () => {
        const block = create('div', 'ap-forget');
        block.setAttribute('role', 'group');
        block.appendChild(create('div', 'ap-section-title', T('key.forget')));
        block.appendChild(create('p', 'ap-help', T('key.forget_confirm')));

        const actions = create('div', 'ap-actions');
        const confirm = create('button', 'ap-primary', T('key.forget'));
        confirm.type = 'button';
        confirm.addEventListener('click', () => forgetKey());
        const cancel = create('button', 'ap-secondary', T('note.cancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', () => block.remove());
        actions.appendChild(confirm);
        actions.appendChild(cancel);
        block.appendChild(actions);
        return block;
    };

    const drawPanel = () => {
        empty(ui.body);
        empty(ui.footer);

        /* THE PROJECT RUNS ON A KEY THAT IS IN THE PAGE, AND IT SAYS SO -- here,
           where the notes are, at every draw and not once at startup.

           It sits above everything else, failures included, because it is not an
           event: it describes what the notes underneath ARE. A one-off message
           at load time would be read by whoever happened to be looking, once,
           and by nobody who opens this panel a week later.

           The half that has to survive being skim-read is the WRITE half: the
           key gives read and write, this format has no reader role, so a page
           anybody can open is a page anybody can post to. */
        if (PUBLIC_KEY) {
            const notice = create('div', 'ap-public', T('public.notice'));
            notice.setAttribute('role', 'note');
            ui.body.appendChild(notice);
        }

        /* A NEWER CLIENT EXISTS, AND WE ARE NOT GOING TO FETCH IT. This copy is
           served by the site itself -- somebody took the file off a CDN on
           purpose -- so it says so and stops there (80-upgrade). A copy served
           BY a CDN never gets here: it replaced itself before the panel existed.

           Said at every draw and not once at load, for the same reason as the
           notice above: a message shown at load time is read by whoever happened
           to be looking, and by nobody who opens this panel a week later. */
        if (upgradeAvailable) {
            const notice = create('div', 'ap-upgrade',
                T('upgrade.available', { version: upgradeAvailable, current: TOOL_VERSION }));
            notice.setAttribute('role', 'note');
            ui.body.appendChild(notice);
        }

        if (currentFailure) {
            ui.body.appendChild(failureBlock(currentFailure, () => {
                currentFailure = null;
                drawPanel();
            }));
        }

        /* What we could not read is SAID, with its count. A note skipped in
           silence is a remark that disappears, and the person who wrote it will
           think nobody read it. */
        const partial = readFailure();
        if (partial) ui.body.appendChild(failureBlock(partial));

        /* A note that is resolved AND whose fix is online leaves the main view:
           it has done its job. It is not deleted -- a correction believed done
           can turn out to be incomplete, and the remark must be able to come
           back with its thread of replies.

           A resolved note whose fix is NOT deployed yet stays visible: the
           defect is still on screen, hiding it would suggest it is gone. */
        const current = [];
        const archived = [];
        for (let i = 0; i < notes.length; i += 1) {
            const n = notes[i];
            if (orphans.indexOf(n) !== -1) continue;
            if (n.resolved_at && alreadyDeployed(n.resolved_version)) archived.push(n);
            else current.push(n);
        }

        if (!current.length && !orphans.length && !archived.length) {
            ui.body.appendChild(create('p', 'ap-empty', T('panel.empty')));
        }

        if (current.length) {
            ui.body.appendChild(create('h2', 'ap-section-title', T('panel.section_page')));
            for (let i = 0; i < current.length; i += 1) {
                ui.body.appendChild(noteCard(current[i], false));
            }
        }

        if (orphans.length) {
            ui.body.appendChild(create('h2', 'ap-section-title', T('orphans.title')));
            ui.body.appendChild(create('p', 'ap-section-help', T('orphans.help')));
            for (let i = 0; i < orphans.length; i += 1) {
                ui.body.appendChild(noteCard(orphans[i], true));
            }
        }

        if (archived.length) {
            const toggle = create('button', 'ap-history-toggle',
                T(historyOpen ? 'history.hide' : 'history.show',
                  { n: archived.length }));
            toggle.type = 'button';
            toggle.addEventListener('click', () => {
                historyOpen = !historyOpen;
                drawPanel();
            });
            ui.body.appendChild(toggle);

            if (historyOpen) {
                ui.body.appendChild(create('p', 'ap-section-help', T('history.help')));
                for (let i = 0; i < archived.length; i += 1) {
                    ui.body.appendChild(noteCard(archived[i], false));
                }
            }
        }

        if (author) {
            ui.footer.appendChild(create('span', null, T('author.known', { name: author })));
            const change = create('button', 'ap-link', T('author.change'));
            change.type = 'button';
            change.addEventListener('click', () => {
                writeAuthor('');
                drawPanel();
            });
            ui.footer.appendChild(change);
        }

        /* The key gets pasted again from here. This is not a convenience
           setting: the day staging becomes production, localStorage changes
           origin and the key has to be pasted once more, on every browser.
           Without this button, one would have to clear the storage by hand to
           get there. */
        /* Not offered when the key comes from the tag: there is nothing stored
           to replace, and a key pasted here would be overruled by the tag on the
           next load -- while quietly leaving a copy in localStorage. */
        /* And the same key gets forgotten from here, under the same condition
           and for the same reason: this footer is where the panel already
           answers "and what about MY browser" -- the name it remembers, the key
           it remembers. Somebody handing back a borrowed laptop looks for it
           next to the name, not in a settings screen this tool does not have.

           The pair is deliberate: replacing a key and dropping it are the two
           halves of the same question, and offering only the first is what
           forced people to clear the storage by hand. */
        if (PROJECT && keyText && !PUBLIC_KEY) {
            const changeSalt = create('button', 'ap-link', T('key.replace'));
            changeSalt.type = 'button';
            changeSalt.title = T('key.origin_changed');
            changeSalt.addEventListener('click', () => openSaltScreen());
            ui.footer.appendChild(changeSalt);

            const forget = create('button', 'ap-link', T('key.forget'));
            forget.type = 'button';
            forget.addEventListener('click', () => {
                // One at a time: a second click on the link asks nothing new,
                // it would just stack the same question.
                if (ui.body.querySelector('.ap-forget')) return;
                const block = forgetForm();
                ui.body.appendChild(block);
                block.scrollIntoView({ block: 'nearest' });
            });
            ui.footer.appendChild(forget);
        }

        const total = notes.length;
        ui.buttonCount.textContent = readableCount(
            total, 'button.notes_zero', 'button.notes_one', 'button.notes_n');
        // The button carries the failure: someone who does not open it must be
        // able to see, at a glance, that something is wrong.
        ui.button.classList.toggle('ap-failed', !!currentFailure);
        ui.button.title = currentFailure ? currentFailure.title : T('button.help');
    };

    /** Brings a note forward in the panel, without changing anything on the
        page. */
    const focusNote = (note) => {
        const card = ui.body.querySelector('[data-ap-note="' + note.id + '"]');
        if (!card) return;
        const previous = ui.body.querySelectorAll('.ap-focused');
        for (let i = 0; i < previous.length; i += 1) previous[i].classList.remove('ap-focused');
        card.classList.add('ap-focused');
        card.scrollIntoView({ block: 'nearest' });
    };

    /** Brings the commented element back into view, by showing it on our side. */
    const showElement = (note) => {
        let el = null;
        for (let i = 0; i < anchored.length; i += 1) {
            if (anchored[i].notes.indexOf(note) !== -1) el = anchored[i].element;
        }
        if (!el) return;
        // scrollIntoView moves the viewpoint, never the document: no node, no
        // style of the site is touched.
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        window.setTimeout(() => {
            showHighlight(el);
            window.setTimeout(hideHighlight, 1400);
        }, 350);
    };

    /* -- 16. The form for a new note ------------------------------------------ */

    const positionForm = (el) => {
        const form = ui.form;
        const r = el.getBoundingClientRect();
        if (narrowScreen()) {
            // The stylesheet takes over: the form takes the full width.
            form.style.left = '';
            form.style.top = Math.max(8, Math.min(r.bottom + 8, window.innerHeight - 260)) + 'px';
            return;
        }
        const width = form.offsetWidth || 340;
        const height = form.offsetHeight || 260;
        let left = r.left;
        if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
        let top = r.bottom + 8;
        if (top + height > window.innerHeight - 12) top = Math.max(8, r.top - height - 8);
        form.style.left = Math.max(8, left) + 'px';
        form.style.top = Math.max(8, top) + 'px';
    };

    /** True on the screens where the panel and the form do not fit side by
        side. The threshold is the stylesheet's. */
    const narrowScreen = () => window.innerWidth <= 560;

    const closeForm = () => {
        target = null;
        ui.form.classList.remove('ap-open');
        empty(ui.form);
        // On a narrow screen, the list had given way to the typing.
        if (mode) ui.panel.classList.add('ap-open');
    };

    /**
     * @param existingText remark already typed, when the form is REBUILT without
     *   having been closed (name change). Rebuilding a piece of typing without
     *   carrying it over would make it disappear under the fingers of whoever is
     *   writing: that is the same wrong as losing a note.
     */
    const openForm = (el, existingText) => {
        target = el;
        const form = ui.form;
        empty(form);

        const excerpt = excerptOf(el);
        form.appendChild(create('div', 'ap-form-title', T('form.title')));
        form.appendChild(create('div', 'ap-form-target',
            excerpt ? T('form.about', { excerpt: excerpt }) : T('form.about_no_text')));

        const name = nameField();
        if (name) {
            form.appendChild(name.block);
        } else {
            /* The name is already known: we RECALL it here, with a way to change
               it, instead of leaving it at the foot of the panel where nobody
               sees it while writing. Showing what one is signing at the moment
               one signs it keeps a remark from going out under the name of a
               colleague who used the same machine. */
            const reminder = create('div', 'ap-form-signature');
            reminder.appendChild(create('span', null, T('author.known', { name: author })));
            const change = create('button', 'ap-link', T('author.change'));
            change.type = 'button';
            change.addEventListener('click', () => {
                // The remark in progress is CARRIED OVER into the rebuilt form:
                // changing the name does not cost what has been written.
                const pending = area.value;
                writeAuthor('');
                openForm(el, pending);
            });
            reminder.appendChild(change);
            form.appendChild(reminder);
        }

        const area = create('textarea', 'ap-area');
        area.setAttribute('placeholder', T('form.text_placeholder'));
        area.setAttribute('maxlength', String(MAX_TEXT));
        if (typeof existingText === 'string') area.value = existingText;
        form.appendChild(area);

        const actions = create('div', 'ap-actions');
        const send = create('button', 'ap-primary', T('form.send'));
        send.type = 'button';
        const cancel = create('button', 'ap-secondary', T('form.cancel'));
        cancel.type = 'button';
        const counter = create('span', 'ap-counter',
            T('form.remaining', { n: Math.max(0, MAX_TEXT - area.value.length) }));
        actions.appendChild(send);
        actions.appendChild(cancel);
        actions.appendChild(counter);
        form.appendChild(actions);

        area.addEventListener('input', () => {
            counter.textContent = T('form.remaining',
                { n: Math.max(0, MAX_TEXT - area.value.length) });
        });
        cancel.addEventListener('click', () => closeForm());

        const say = (failure) => {
            const previous = form.querySelector('.ap-error');
            if (previous) previous.remove();
            if (failure) form.insertBefore(failureBlock(failure), form.firstChild);
        };

        send.addEventListener('click', () => {
            const text = area.value.trim();
            const writer = name ? normalize(name.field.value) : author;
            if (!writer) return say({ title: T('error.title'), detail: T('form.name_missing') });
            if (!text) return say({ title: T('error.title'), detail: T('form.text_missing') });
            if (text.length > MAX_TEXT) {
                return say({
                    title: T('error.title'),
                    detail: T('form.too_long', { n: text.length, max: MAX_TEXT })
                });
            }
            say(null);
            send.disabled = true;
            cancel.disabled = true;
            send.textContent = T('form.sending');

            /* The page path goes into the PAYLOAD, never into the query string:
               the server groups by blind index. In plain mode it still files it
               in its "page" column, as in format 1. */
            noteBody({
                page: pagePath(),
                selector: cssPath(el),
                fingerprint: fingerprintOf(el),
                excerpt: excerpt,
                author: writer,
                text: text,
                version: SITE_VERSION,
                environment: ENVIRONMENT,
                viewport: currentViewport()
            }, null).then((body) => call('add', body)).then((r) => {
                send.disabled = false;
                cancel.disabled = false;
                send.textContent = T('form.send');
                if (!r.ok) {
                    // The remark stays on screen. Nothing is lost, and the
                    // person knows nothing is saved.
                    say(failureFrom(r, 'error.title'));
                    return;
                }
                writeAuthor(writer);
                closeForm();
                reload();
            }, () => {
                send.disabled = false;
                cancel.disabled = false;
                send.textContent = T('form.send');
                say({ title: T('error.title'), detail: T('error.encryption') });
            });
        });

        // On a narrow screen, writing and reading the list at the same time is
        // impossible: the typing takes the whole space, the list comes back when
        // the form is closed.
        if (narrowScreen()) ui.panel.classList.remove('ap-open');
        form.classList.add('ap-open');
        positionForm(el);
        window.setTimeout(() => (name ? name.field : area).focus(), 0);
    };

    /* -- 17. Annotation mode ------------------------------------------------- */

    const onHover = (event) => {
        const el = event.target;
        if (!el || el.nodeType !== 1 || inTool(el)) return;
        if (el === document.body || el === document.documentElement) return;
        hovered = el;
        showHighlight(el);
    };

    const onClick = (event) => {
        const el = event.target;
        // A click on the tool itself: we let the event go down into the shadow
        // root, where our own buttons are waiting for it.
        if (inTool(el)) return;
        // Everything else is captured: in annotation mode one points, one does
        // not navigate. That is what keeps a click on a link from carrying the
        // person away at the moment they meant to comment on it.
        event.preventDefault();
        event.stopPropagation();
        if (event.type !== 'click') return;
        if (!el || el.nodeType !== 1) return;
        if (el === document.body || el === document.documentElement) return;
        openForm(el);
    };

    const onKey = (event) => {
        if (event.key !== 'Escape') return;
        if (ui.form.classList.contains('ap-open')) {
            closeForm();
            return;
        }
        leaveMode();
    };

    const enterMode = () => {
        mode = true;
        ui.button.setAttribute('aria-pressed', 'true');
        ui.buttonText.textContent = T('button.close');
        ui.panel.classList.add('ap-open');

        document.addEventListener('pointerover', onHover, true);
        document.addEventListener('pointerdown', onClick, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('auxclick', onClick, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', refreshPositions, true);
        window.addEventListener('resize', refreshPositions);
        // A carousel, a dropdown menu, an image loaded late move the elements
        // without emitting either scroll or resize.
        timer = window.setInterval(refreshPositions, 500);

        // The markers for what we ALREADY know, straight away; the server is
        // asked next and will correct if there is anything new. Waiting for the
        // network to show what is already on screen would suggest an empty page.
        drawMarkers();
        reload();
    };

    const leaveMode = () => {
        mode = false;
        ui.button.setAttribute('aria-pressed', 'false');
        ui.buttonText.textContent = T('button.open');
        ui.panel.classList.remove('ap-open');
        closeForm();
        hideHighlight();
        hovered = null;
        empty(ui.markers);

        document.removeEventListener('pointerover', onHover, true);
        document.removeEventListener('pointerdown', onClick, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('auxclick', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', refreshPositions, true);
        window.removeEventListener('resize', refreshPositions);
        if (timer) {
            window.clearInterval(timer);
            timer = null;
        }
    };

    const toggleMode = () => (mode ? leaveMode() : enterMode());

    /* ==== 70-setup.js ==== */

    /* -- 18. Setup, and the key one pastes ----------------------------------

       These screens are the only places where the key is shown or typed in.
       They are BLOCKING: as long as the key is unknown, the tool shows neither
       an annotation button nor a panel of notes. There is nothing to annotate
       without a key -- not even in plain mode, where the page index is already
       an HMAC.

       None of these screens makes a network request. A consequence to be
       stated: a page carrying a tag with a project, on a site whose server is
       not configured yet, will still show the "paste the key" screen. That is
       accepted: without a key we cannot even ask for the list of notes, so we
       cannot check that the server answers. The tag, on the other hand, was put
       there by somebody. */

    /** Removes the current interface without touching the stylesheet. */
    const clearLayer = () => {
        if (!root) return;
        const previous = root.querySelectorAll('.ap-layer');
        for (let i = 0; i < previous.length; i += 1) previous[i].remove();
        ui = null;
    };

    /**
     * A panel on its own, open, with no annotation button behind it.
     * @return { body, panel }
     */
    const blockingScreen = (title, wide) => {
        if (!host) buildHost();
        clearLayer();

        const layer = create('div', 'ap-layer');
        root.appendChild(layer);

        const panel = create('aside', 'ap-panel ap-open' + (wide ? ' ap-panel-wide' : ''));
        panel.setAttribute('role', 'complementary');
        const header = create('div', 'ap-panel-header');
        header.appendChild(create('span', 'ap-panel-title', title));
        const close = create('button', 'ap-link', T('panel.close'));
        close.type = 'button';
        close.addEventListener('click', () => {
            // We stand down for this page load. Nothing is remembered: on the
            // next reload the screen comes back, because the problem itself has
            // not been dealt with.
            if (host) host.remove();
            host = null;
            root = null;
            ui = null;
        });
        header.appendChild(close);
        const body = create('div', 'ap-panel-body');
        panel.appendChild(header);
        panel.appendChild(body);
        layer.appendChild(panel);
        return { body: body, panel: panel };
    };

    /** A value to copy out: it is SELECTABLE, and copiable from a button. */
    const copyBlock = (parent, label, value) => {
        parent.appendChild(create('div', 'ap-label', label));
        const block = create('div', 'ap-copy');
        const area = create('textarea', 'ap-code');
        area.value = value;
        area.readOnly = true;
        area.rows = value.length > 90 ? 4 : 2;
        area.setAttribute('spellcheck', 'false');
        area.addEventListener('focus', () => area.select());
        block.appendChild(area);

        const copy = create('button', 'ap-secondary', T('setup.copy'));
        copy.type = 'button';
        copy.addEventListener('click', () => {
            const say = (key) => {
                copy.textContent = T(key);
                window.setTimeout(() => { copy.textContent = T('setup.copy'); }, 2000);
            };
            // The clipboard can be refused (insecure context, permission). We
            // say so and let the selection do the work, rather than letting
            // someone believe the copy happened.
            try {
                navigator.clipboard.writeText(value)
                    .then(() => say('setup.copied'), () => {
                        area.select();
                        say('setup.copy_failed');
                    });
            } catch (e) {
                area.select();
                say('setup.copy_failed');
            }
        });
        block.appendChild(copy);
        parent.appendChild(block);
        return area;
    };

    /** The exact tag to paste, with the SRI digest ACTUALLY being served. */
    const tagToPaste = (id) => {
        let t = '<script src="' + script.src + '"';
        // We copy the integrity and the crossorigin of the current tag: they are
        // the ones that work, here, now. A digest copied from a documentation
        // page is a digest of another version.
        const attribute = (name) => (script.getAttribute(name) || '').trim();
        if (attribute('integrity')) t += '\n        integrity="' + attribute('integrity') + '"';
        if (attribute('crossorigin')) t += '\n        crossorigin="' + attribute('crossorigin') + '"';
        if (DECLARED_SERVER) t += '\n        data-server="' + DECLARED_SERVER + '"';
        t += '\n        data-project="' + id + '"';
        if (MODE === 'plain') t += '\n        data-mode="plain"';
        if (PATH_PREFIX) t += '\n        data-path="' + PATH_PREFIX + '"';
        t += '\n        defer></' + 'script>';
        return t;
    };

    /* Is this page served from a local development machine?

       It matters because the setup screen is about to hand over three things that
       are all WRONG when it is: an `origins` line naming an origin every developer
       on earth shares, a tag whose src points at a host that will not exist
       tomorrow, and a project whose notes will land on staging and production too
       -- the page index is the PATH ALONE (FORMAT.md section 4), so nothing about
       where a note was written is recorded anywhere.

       `*.localhost` is included: it resolves to the loopback by RFC 6761 and dev
       servers hand it out for subdomains. */
    const isLocalHost = () => {
        const h = location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1'
            || /\.localhost$/.test(h);
    };

    const serverConfig = (id) =>
        'project ' + id + '\n'
        + '  origins  ' + location.origin + '\n'
        + '  mode     ' + MODE;

    /* -- The "paste the key" screen ---------------------------------------- */

    const openSaltScreen = () => {
        const screen = blockingScreen(T('key.title'), false);
        screen.body.appendChild(create('p', 'ap-help', T('key.help')));
        screen.body.appendChild(create('p', 'ap-help', T('key.origin_changed')));

        screen.body.appendChild(create('div', 'ap-label', T('key.label')));
        const field = create('input', 'ap-field');
        field.type = 'text';
        field.setAttribute('autocomplete', 'off');
        field.setAttribute('spellcheck', 'false');
        field.setAttribute('maxlength', String(KEY_LENGTH + 8));
        screen.body.appendChild(field);

        const actions = create('div', 'ap-actions');
        const confirm = create('button', 'ap-primary', T('key.confirm'));
        confirm.type = 'button';
        actions.appendChild(confirm);
        screen.body.appendChild(actions);

        const say = (detail) => {
            const previous = screen.body.querySelector('.ap-error');
            if (previous) previous.remove();
            if (detail) {
                screen.body.insertBefore(
                    failureBlock({ title: T('key.title'), detail: detail }), screen.body.firstChild);
            }
        };

        confirm.addEventListener('click', () => {
            const raw = normalize(field.value).replace(/\s+/g, '');
            if (!raw) return say(T('key.empty'));
            const bytes = keyFromText(raw);
            if (!bytes) return say(T('key.shape'));
            say(null);
            confirm.disabled = true;

            /* The check happens HERE: we re-derive the project id and compare it
               with the tag's. Equal, the key is the right one. Nothing is sent
               to the network and nothing is decrypted before this test -- which
               is what saves us from carrying a checksum alongside the key: the
               project id already plays that part, and it is public. */
            derive(bytes).then((derived) => {
                confirm.disabled = false;
                if (derived.id !== PROJECT) return say(T('key.wrong'));
                if (!writeSalt(PROJECT, raw)) {
                    // Storage refuses: we carry on for this page anyway, but we
                    // do not let anyone believe it is remembered.
                    say(T('key.not_kept'));
                }
                startWithSalt(raw, derived);
            }, () => {
                confirm.disabled = false;
                say(T('error.encryption'));
            });
        });

        window.setTimeout(() => field.focus(), 0);
    };

    /* -- The setup screen --------------------------------------------------- */

    const openSetupScreen = () => {
        const screen = blockingScreen(T('setup.title'), true);

        if (!API) screen.body.appendChild(create('p', 'ap-help', T('setup.no_server')));
        if (MODE === 'plain') screen.body.appendChild(create('p', 'ap-help', T('setup.plain_mode')));

        const generate = create('button', 'ap-primary', T('setup.generate'));
        generate.type = 'button';
        screen.body.appendChild(generate);

        generate.addEventListener('click', () => {
            generate.disabled = true;
            const fresh = generateSalt();
            const bytes = keyFromText(fresh);
            derive(bytes).then((derived) => {
                empty(screen.body);

                /* The warning comes BEFORE the key, and before the button that
                   continues. It is spelled out in full, not in a footnote: it is
                   the only secret of the project, and there is no recovery. */
                const warning = create('div', 'ap-error');
                warning.setAttribute('role', 'alert');
                warning.appendChild(create('div', 'ap-error-title', T('setup.warning_title')));
                warning.appendChild(create('p', 'ap-error-detail', T('setup.warning')));
                screen.body.appendChild(warning);

                copyBlock(screen.body, T('setup.key'), fresh);
                copyBlock(screen.body, T('setup.project'), derived.id);
                copyBlock(screen.body, T('setup.tag'), tagToPaste(derived.id));
                copyBlock(screen.body, T('setup.server'), serverConfig(derived.id));

                /* Only on a local machine, and only here. Not a runtime badge: a
                   permanent notice on every page load of every developer's app is
                   noise, and localhost is not an error. It is said once, at the
                   moment the three wrong values are handed over. */
                if (isLocalHost()) {
                    screen.body.appendChild(create('p', 'ap-help', T('setup.localhost')));
                }

                const actions = create('div', 'ap-actions');
                const proceed = create('button', 'ap-primary', T('setup.continue'));
                proceed.type = 'button';
                proceed.addEventListener('click', () => {
                    const kept = writeSalt(derived.id, fresh);
                    const done = create('p', 'ap-help',
                        kept ? T('setup.done') : T('key.not_kept'));
                    actions.replaceWith(done);
                });
                actions.appendChild(proceed);
                screen.body.appendChild(actions);
            }, () => {
                generate.disabled = false;
                screen.body.appendChild(failureBlock({
                    title: T('setup.title'), detail: T('error.encryption')
                }));
            });
        });
    };

    /* -- A tag that refuses itself ------------------------------------------

       Same rule as a key pasted wrong: nothing sent, nothing decrypted, and the
       reason said out loud rather than a tool that quietly does not appear.

       There is no field to correct here, and that is the difference with the
       key screen: the mistake is in the page's source, not in this browser. So
       the screen names what has to change in the tag, and stops. */

    const openTagScreen = (detail) => {
        const screen = blockingScreen(T('tag.title'), false);
        const block = create('div', 'ap-error');
        block.setAttribute('role', 'alert');
        block.appendChild(create('p', 'ap-error-detail', detail));
        screen.body.appendChild(block);
    };

    /* -- The "this browser cannot" screen ------------------------------------ */

    const openContextScreen = () => {
        const screen = blockingScreen(T('context.title'), false);
        screen.body.appendChild(create('p', 'ap-help', T('context.help')));
    };

    /* ==== 80-upgrade.js ==== */

    /* -- 19. A stale copy replaces itself ------------------------------------
       The problem, in one line: the distributed tag points at a RANGE on a CDN
       (annotepage-client@2), and jsDelivr serves that range with
       max-age=604800. A fix published today does not reach a visitor who came
       back within seven days. The lifetime is the CDN's to set and no attribute
       of <script> touches it -- integrity, crossorigin, defer, async, none of
       them. Cache-Control is a response header; the requester cannot overrule
       it.

       So we do not fight the cache, we WALK AROUND IT. The stale copy does not
       refresh its own URL: it loads a DIFFERENT one, the pinned
       annotepage-client@X.Y.Z/dist/annotepage.js, which this browser has never
       fetched and which therefore no cache entry can answer.

       WHERE THE CURRENT VERSION COMES FROM: the answer the client already asks
       for. `list` runs before the DOM is touched, and the server names the
       current client version in it. No second request, no extra file to host,
       and the answer lands exactly at the seam where the check belongs.

       IT ANNOUNCES, IT NEVER GATES. The announced version says "there is
       something newer" and nothing else. It must never decide whether a request
       is allowed, and nothing here compares it to authorise anything:
       compatibility belongs to the FORMAT number and only to it (FORMAT.md
       section 7). 2.1.0 and 2.2.0 speak the same format by construction, and a
       client that refused to talk to a server one release ahead would break a
       pair that works.

       WHY EVERY DOUBT IS A SILENCE. The announcement rides on an answer from a
       server that may be anybody's. A self-hosted server announces whatever it
       was installed with, which can be older than what is on this page. So:
       absent, unreadable, malformed, EQUAL or OLDER than ours -- carry on, say
       nothing. We only ever move forward, never back. A server cannot push a
       client downhill. */

    /* THE SHAPE OF A VERSION, and it is the only gate that matters here.

       This string arrives over the network from a server we do not own. It is
       never concatenated into a URL as it stands: it is matched against this
       expression, and the URL is then REBUILT from a base written here, in this
       file. A compromised or hostile server can therefore make us load a version
       of the official package that does not exist -- which fails, and is handled
       -- and nothing else. No host, no path, no scheme, no protocol-relative
       "//evil", no "../", no query, no "@" of its own.

       Strict on purpose: three numbers, nothing around them. No pre-release
       suffix (a pre-release is not what one pushes to every visitor of every
       site), no leading zero, at most four digits per part. */
    const ANNOUNCED_SHAPE = /^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;

    /* The CDNs whose exact-version address we know how to write ourselves, and
       only those. `base` is the whole beginning of the URL: nothing of what the
       server said ever appears before the version number.

       `prefix` is matched against the PATHNAME of the tag's own src, and the host
       is compared whole -- indexOf on the full URL would accept
       "cdn.jsdelivr.net.example.com". Both entries are the npm package, which is
       the only package this file will ever point at. */
    const CDNS = [
        {
            host: 'cdn.jsdelivr.net',
            prefix: '/npm/annotepage-client@',
            base: 'https://cdn.jsdelivr.net/npm/annotepage-client@'
        },
        {
            host: 'unpkg.com',
            prefix: '/annotepage-client@',
            base: 'https://unpkg.com/annotepage-client@'
        }
    ];

    /**
     * Which CDN is serving THIS copy, or null -- and null is the interesting
     * case, because it means the site serves the file itself.
     */
    const cdnServing = (src) => {
        let url;
        try {
            url = new URL(String(src));
        } catch (e) {
            return null;
        }
        if (url.protocol !== 'https:') return null;
        for (let i = 0; i < CDNS.length; i += 1) {
            const cdn = CDNS[i];
            if (url.host === cdn.host && url.pathname.indexOf(cdn.prefix) === 0) return cdn;
        }
        return null;
    };

    /** The address of one exact version, BUILT HERE. Null if anything is off. */
    const officialUrl = (cdn, version) => {
        // Checked again, on the very line that builds the string: the caller
        // already checked, and a second reader of this file should not have to
        // go and verify that it did.
        if (!cdn || !ANNOUNCED_SHAPE.test(String(version))) return null;
        return cdn.base + version + '/dist/annotepage.js';
    };

    /**
     * The version the server announces, IF it is newer than ours. Null in every
     * other case, and that includes every case of doubt: no field, not a string,
     * not three numbers, equal to ours, older than ours.
     */
    const announcedVersion = (data) => {
        if (!data || typeof data !== 'object') return null;
        const announced = data.client_version;
        if (typeof announced !== 'string' || !ANNOUNCED_SHAPE.test(announced)) return null;

        const theirs = versionNumbers(announced);
        const mine = versionNumbers(TOOL_VERSION);
        if (!theirs || !mine) return null;
        for (let i = 0; i < 3; i += 1) {
            if (theirs[i] !== mine[i]) return theirs[i] > mine[i] ? announced : null;
        }
        // Equal: nothing to say, and nothing to load.
        return null;
    };

    /* Set when we are behind and we are NOT going to do anything about it --
       the file is served by the site itself. The panel says so, at every draw,
       the way the public-key notice does: a message shown once at load is read
       by whoever happened to be looking. */
    let upgradeAvailable = '';

    /* True from the moment the replacement tag is in the document. It stops the
       old copy building anything, and it stops a second injection. */
    let handingOver = false;

    /**
     * Injects the pinned version and stands down.
     *
     * The new tag CARRIES THE data- ATTRIBUTES OF THE OLD ONE, and it has to:
     * the client reads everything it knows from its own tag
     * (document.currentScript, 00-preamble), so a bare tag would produce a copy
     * with no server, no project and no key -- which is a copy that does
     * strictly nothing. The integrity attribute is deliberately NOT carried
     * over: it is the digest of the version we are leaving, and it would refuse
     * the version we are fetching.
     *
     * `onFailure` is called if that tag never loads -- a version announced but
     * never published, a CDN that is down. We are then back to being merely old,
     * which is the state we started in, and the tool boots normally. Losing the
     * tool entirely because a number was wrong somewhere would be a worse
     * outcome than being one release behind.
     */
    const handOverTo = (cdn, version, onFailure) => {
        const url = officialUrl(cdn, version);
        if (!url || handingOver) return false;
        handingOver = true;

        // BEFORE the new copy builds anything: its element and its listeners go
        // first, or the page ends up carrying two pills. At the seam there is
        // usually nothing to remove -- which is the whole point of checking
        // before the work rather than after it.
        withdraw();

        const fresh = document.createElement('script');
        const attributes = script.attributes;
        for (let i = 0; i < attributes.length; i += 1) {
            const name = attributes[i].name;
            if (name.indexOf('data-') === 0) fresh.setAttribute(name, attributes[i].value);
        }
        fresh.src = url;
        fresh.addEventListener('error', () => {
            handingOver = false;
            onFailure();
        });
        (document.head || document.documentElement).appendChild(fresh);
        return true;
    };

    /* ==== 90-boot.js ==== */

    /* -- 20. Reading the notes ----------------------------------------------- */

    const redraw = () => {
        if (!ui) return;
        anchor();
        drawPanel();
        drawMarkers();
    };

    const reload = () =>
        call('list').then((r) => {
            if (!r.ok) {
                // The tool is already in place: we no longer keep quiet. The
                // notes already on screen stay, with the warning that they may
                // be incomplete.
                const failure = failureFrom(r, 'error.title_read');
                failure.detail = failure.detail + '\n' + T('error.partial_read');
                currentFailure = failure;
                redraw();
                return null;
            }
            return readList(r.data).then((read) => {
                notes = read;
                currentFailure = null;
                redraw();
                return null;
            });
        });

    /* -- 21. Startup ----------------------------------------------------------
       The order matters: we ask the API BEFORE touching the DOM. If it does not
       answer what it should, the site never saw anything go by.

       One exception, accepted: the setup and key-pasting screens, which CANNOT
       ask the API -- without a key there is no page index to give it. They are
       declared (data-setup) or asked for by a tag that already carries a
       project: either way, somebody put that tag here on purpose. */

    let localLabelsLoaded = false;

    const loadLocalLabels = () => {
        if (!LOCAL_LABELS_URL || localLabelsLoaded || !root) return Promise.resolve();
        localLabelsLoaded = true;
        return new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = LOCAL_LABELS_URL;
            s.addEventListener('load', () => resolve(true));
            s.addEventListener('error', () => resolve(false));
            // INSIDE THE SHADOW ROOT, and not in <head> or <body>: a script
            // inserted into a shadow root runs like any other -- it is connected
            // to the document -- but it appears neither in
            // document.querySelectorAll('script') nor in the page's node count.
            // The only node the site receives stays the host element, and that
            // is checkable: +1 element, not +2.
            root.appendChild(s);
        });
    };

    /**
     * The tool leaves the page, and leaves NOTHING behind.
     *
     * Removing the host element is not enough on its own and never was: in
     * annotation mode the listeners sit on `document` and on `window`, not on the
     * host, and a repeating timer is running. Dropping the element would leave
     * them hovering, clicking and measuring a layer that no longer exists. That
     * did not show while withdrawal only ever happened before anything was built;
     * it does the moment a copy withdraws in favour of a newer one (80-upgrade).
     *
     * leaveMode() is the one place that knows the whole list, and it is called
     * rather than copied: two lists drift, and the one that drifts is the one
     * nobody runs.
     */
    const withdraw = () => {
        if (ui && mode) leaveMode();
        if (host) host.remove();
        host = null;
        root = null;
        ui = null;
    };

    /** A blocking screen: the host exists from now on, the labels come first. */
    const showScreen = (open) => {
        buildHost();
        loadLocalLabels().then(open);
    };

    /**
     * Does the server have something to SAY at startup?
     *
     * "inactive", "nonjson" and "network" are silences: the tool is not
     * configured here, PHP is not running, or the browser is offline. Nobody has
     * written anything yet, there is nothing to announce.
     *
     * A REFUSAL, on the other hand, gets said -- and that is a deliberate change
     * from the original tool. A firewall answering 403 on the very first request
     * made the tool entirely invisible: one looked for the failure in the wrong
     * file for half a day. The tag carries a project, so somebody put it here on
     * purpose: we speak.
     */
    const speaksAtStartup = (r) =>
        r.cause === 'server' || r.cause === 'failure' || String(r.cause).indexOf('refused') === 0;

    /**
     * The key is known and checked: we derive the page index, we ask the
     * server, and the tool takes its normal shape.
     */
    function startWithSalt(text, derived) {
        keyText = text;
        keys = derived;

        return indexOfPath(keys.indexKey, pagePath())
            .then((index) => {
                PAGE_INDEX = index;
                return call('list');
            })
            .then((first) => {
                if (!first.ok && !speaksAtStartup(first)) {
                    // Complete silence: no node, no pixel, no message. If a key
                    // screen was open, it goes away with the rest.
                    withdraw();
                    return null;
                }

                /* THE SEAM. This is the one moment where a copy can discover it
                   is out of date having drawn nothing, listened to nothing and
                   decrypted nothing -- so it withdraws instead of undoing. The
                   answer that carries the announcement is the one we were
                   waiting for anyway: nothing was added in front of the boot,
                   and a page that is up to date pays exactly nothing.

                   WHAT HAPPENS NEXT DEPENDS ON WHERE THIS FILE CAME FROM, and
                   that distinction is the whole design:

                     from a CDN -- the seven-day cache is what put us here, and
                     pulling the pinned version walks around it. We hand over.

                     from anywhere else -- the site serves its own copy, which
                     somebody CHOSE to do, and going to a CDN behind their back
                     would add the dependency they deliberately removed. We say
                     it in the panel and we load nothing. */
                const newer = first.ok ? announcedVersion(first.data) : null;
                const cdn = newer ? cdnServing(script.src) : null;
                if (cdn && handOverTo(cdn, newer, () => { proceed(first); })) return null;
                if (newer) upgradeAvailable = newer;

                return proceed(first);
            });
    }

    /**
     * THE OTHER WAY ROUND: the key leaves this browser.
     *
     * The exact undoing of startWithSalt, and it is written next to it for that
     * reason -- the state a key brings in is the state its removal has to take
     * back out. Anything left behind here is a note decrypted with a key the
     * tool now claims not to have.
     *
     * What actually leaves is ONE entry, `annotepage/key/<project>`: this
     * project, this origin. Another project reviewed from the same browser keeps
     * its own key, and so does this project on another domain -- localStorage is
     * per origin, and forgetting cannot reach further than it (30-state).
     *
     * Nothing is deleted anywhere else. The notes stay on the server, encrypted;
     * pasting the key again brings the whole page back. That is what the
     * confirmation says, and it is the whole reason it can be said calmly.
     */
    const forgetKey = () => {
        forgetSalt(PROJECT);

        // Annotation mode holds listeners on `document` and `window` and a
        // repeating timer, none of which sit on the host: leaving the mode is
        // what takes them down. It has to happen while `ui` still exists.
        if (ui && mode) leaveMode();

        keyText = '';
        keys = null;
        PAGE_INDEX = '';
        notes = [];
        anchored = [];
        orphans = [];
        historyOpen = false;
        currentFailure = null;
        skipped = { newer: 0, unreadable: 0, unknown: 0 };

        // And the tool is back where it was before the key was pasted: the
        // screen that asks for it. openSaltScreen clears the layer it replaces.
        openSaltScreen();
    };

    /** Everything the tool does once it has decided to stay. */
    function proceed(first) {
        // From here on the tool EXISTS, and will no longer keep quiet
        // about its failures.
        buildHost();
        return loadLocalLabels().then(() => {
            clearLayer();
            buildUi();
            if (first.ok) {
                return readList(first.data).then((read) => {
                    notes = read;
                    redraw();
                    return null;
                });
            }
            currentFailure = failureFrom(first, 'error.title_read');
            redraw();
            return null;
        });
    }

    const start = () => {
        author = readAuthor();

        // Outside the project's scope: silence. So the tag can live in a
        // template shared by the whole site.
        if (!inScope()) return;

        if (!CRYPTO) {
            // Without a secure context nothing is possible -- but if somebody
            // declared a project here, they have a right to know why.
            if (PROJECT || KEY_DECLARED || SETUP_REQUESTED) showScreen(openContextScreen);
            return;
        }

        /* THE TAG CARRIES THE KEY: the project is public, and that settles the
           mode before anything else. Nothing is asked, nothing is read from
           localStorage and NOTHING IS WRITTEN TO IT -- the key is in the page,
           and a stored copy would buy nothing except a divergent state on the
           day the tag changes. The interface then says so at every draw
           (PUBLIC_KEY, 60-ui). */
        if (KEY_DECLARED) {
            const keyBytes = keyFromText(DECLARED_KEY);
            if (!keyBytes) {
                /* An attribute somebody wrote on purpose, and it is not a key.
                   Staying silent here would be the behaviour of a tag carrying
                   no project at all, and the difference is exactly what nobody
                   would find. */
                showScreen(() => openTagScreen(T('tag.key_shape')));
                return;
            }

            derive(keyBytes).then((derived) => {
                /* Both attributes on one tag: they have to AGREE, and the id is
                   the one thing the key can check itself against (FORMAT.md
                   1.2). Disagreement is refused exactly as a wrongly pasted key
                   is -- nothing sent, nothing decrypted -- and no winner is
                   picked: one of the two is a typo, and guessing buries it in a
                   project whose notes nobody will ever see. */
                if (DECLARED_PROJECT && derived.id !== DECLARED_PROJECT) {
                    showScreen(() => openTagScreen(T('tag.key_mismatch')));
                    return null;
                }
                // The id is DERIVED, never declared twice: see 00-preamble.
                PROJECT = derived.id;
                PUBLIC_KEY = true;
                return startWithSalt(DECLARED_KEY, derived);
            }, () => {
                // derive() only fails when WebCrypto itself does, which is what
                // that screen is about.
                showScreen(openContextScreen);
            });
            return;
        }

        if (!PROJECT) {
            if (SETUP_REQUESTED) showScreen(openSetupScreen);
            return;
        }

        const text = readSalt(PROJECT);
        const bytes = keyFromText(text);
        if (!bytes) {
            showScreen(openSaltScreen);
            return;
        }

        derive(bytes).then((derived) => {
            if (derived.id !== PROJECT) {
                // The key stored under this key does not derive this id: the
                // tag has changed project, or the storage was tampered with. We
                // ask again, we do not guess.
                showScreen(openSaltScreen);
                return null;
            }
            return startWithSalt(text, derived);
        }, () => {
            showScreen(openSaltScreen);
        });
    };

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
}());
