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
    if (PROJECT && keyText && !PUBLIC_KEY) {
        const changeSalt = create('button', 'ap-link', T('key.replace'));
        changeSalt.type = 'button';
        changeSalt.title = T('key.origin_changed');
        changeSalt.addEventListener('click', () => openSaltScreen());
        ui.footer.appendChild(changeSalt);
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
