/* -- 18. Setup, and the salt one pastes ----------------------------------

   These screens are the only places where the salt is shown or typed in.
   They are BLOCKING: as long as the salt is unknown, the tool shows neither
   an annotation button nor a panel of notes. There is nothing to annotate
   without a salt -- not even in plain mode, where the page index is already
   an HMAC.

   None of these screens makes a network request. A consequence to be
   stated: a page carrying a tag with a project, on a site whose server is
   not configured yet, will still show the "paste the salt" screen. That is
   accepted: without a salt we cannot even ask for the list of notes, so we
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

/* -- The "paste the salt" screen ---------------------------------------- */

const openSaltScreen = () => {
    const screen = blockingScreen(T('salt.title'), false);
    screen.body.appendChild(create('p', 'ap-help', T('salt.help')));
    screen.body.appendChild(create('p', 'ap-help', T('salt.origin_changed')));

    screen.body.appendChild(create('div', 'ap-label', T('salt.label')));
    const field = create('input', 'ap-field');
    field.type = 'text';
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('maxlength', String(SALT_LENGTH + 8));
    screen.body.appendChild(field);

    const actions = create('div', 'ap-actions');
    const confirm = create('button', 'ap-primary', T('salt.confirm'));
    confirm.type = 'button';
    actions.appendChild(confirm);
    screen.body.appendChild(actions);

    const say = (detail) => {
        const previous = screen.body.querySelector('.ap-error');
        if (previous) previous.remove();
        if (detail) {
            screen.body.insertBefore(
                failureBlock({ title: T('salt.title'), detail: detail }), screen.body.firstChild);
        }
    };

    confirm.addEventListener('click', () => {
        const raw = normalize(field.value).replace(/\s+/g, '');
        if (!raw) return say(T('salt.empty'));
        const bytes = saltFromText(raw);
        if (!bytes) return say(T('salt.shape'));
        say(null);
        confirm.disabled = true;

        /* The check happens HERE: we re-derive the project id and compare it
           with the tag's. Equal, the salt is the right one. Nothing is sent
           to the network and nothing is decrypted before this test -- which
           is what saves us from carrying a checksum alongside the salt: the
           project id already plays that part, and it is public. */
        derive(bytes).then((derived) => {
            confirm.disabled = false;
            if (derived.id !== PROJECT) return say(T('salt.wrong'));
            if (!writeSalt(PROJECT, raw)) {
                // Storage refuses: we carry on for this page anyway, but we
                // do not let anyone believe it is remembered.
                say(T('salt.not_kept'));
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
        const bytes = saltFromText(fresh);
        derive(bytes).then((derived) => {
            empty(screen.body);

            /* The warning comes BEFORE the salt, and before the button that
               continues. It is spelled out in full, not in a footnote: it is
               the only secret of the project, and there is no recovery. */
            const warning = create('div', 'ap-error');
            warning.setAttribute('role', 'alert');
            warning.appendChild(create('div', 'ap-error-title', T('setup.warning_title')));
            warning.appendChild(create('p', 'ap-error-detail', T('setup.warning')));
            screen.body.appendChild(warning);

            copyBlock(screen.body, T('setup.salt'), fresh);
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
                    kept ? T('setup.done') : T('salt.not_kept'));
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
   salt screen: the mistake is in the page's source, not in this browser. So
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
