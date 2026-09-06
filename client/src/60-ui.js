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
    /* A REAL BUTTON, in the header, beside Close -- not a draggable title
       bar. A title bar reads as a title and not as a handle; without
       snapping, a dragged panel ends up crooked; and under a finger the drag
       fights the page's own scrolling. Being a button, it is reachable from
       the keyboard for free, which is why there is no shortcut for this:
       onKey is a capturing document listener and would fire while somebody
       is typing their remark in the textarea. */
    const sideToggle = create('button', 'ap-link ap-side-toggle');
    sideToggle.type = 'button';
    sideToggle.addEventListener('click', () => moveSide());
    header.appendChild(title);
    header.appendChild(sideToggle);
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
        sideToggle: sideToggle,
        body: body,
        footer: footer,
        form: form
    };

    applySide();
};

/* -- What the whole project holds ----------------------------------------
   IN THE FOOTER, WHICH IS WHERE THE PANEL ALREADY KEEPS ITS STANDING FACTS:
   who you are, and what to do about the key. Three counts for the site are the
   same kind of thing -- context, not content -- and under the header they sat
   between the panel's title and its instructions, which is the path a reader
   takes to the notes themselves.

   THREE NUMBERS, AND ONLY IF THE SERVER SENT THEM. `totals` is null against a
   server that does not know the field, and the row is then not drawn at all:
   showing three zeros would make an old server look like an empty project, and
   a tool that confuses those two teaches a reviewer to distrust what it says.

   Drawn by drawPanel, with the rest of the footer: the footer is emptied at
   every draw, so anything appended from elsewhere would land after the buttons
   or not at all. */

const statsRow = () => {
    if (totals === null) return null;
    const row = create('div', 'ap-panel-stats');
    row.appendChild(create('span', 'ap-stat-label', T('panel.stats_label')));
    const chiffre = (n, mot) => {
        const box = create('span', 'ap-stat');
        box.appendChild(create('span', 'ap-stat-n', String(n)));
        box.appendChild(create('span', 'ap-stat-w', T(mot)));
        return box;
    };
    row.appendChild(chiffre(totals.notes, 'panel.stats_notes'));
    row.appendChild(chiffre(totals.open, 'panel.stats_open'));
    row.appendChild(chiffre(totals.pages, 'panel.stats_pages'));
    return row;
};

/* -- The side the panel sits on ------------------------------------------
   The class carries ONE name, deliberately: ".ap-left" weighs exactly as
   much as ".ap-panel", so the narrow block further down the stylesheet --
   where the panel is a bottom band and the side means nothing -- wins over
   it by being written later. */

const applySide = () => {
    if (!ui) return;
    if (side === 'left') ui.panel.classList.add('ap-left');
    else ui.panel.classList.remove('ap-left');
    /* AND THE FLOATING BUTTON GOES WITH IT. It is not inside the panel, so
       the side is carried by the layer, which is the ancestor they share.
       Moving only the panel would put the control that opens it on the
       opposite edge from the thing it opens. */
    if (side === 'left') ui.layer.classList.add('ap-left-side');
    else ui.layer.classList.remove('ap-left-side');
    ui.sideToggle.textContent = side === 'left'
        ? T('panel.move_right') : T('panel.move_left');
};

const moveSide = () => {
    writeSide(side === 'left' ? 'right' : 'left');
    applySide();
    /* The form is placed against the band the panel occupies, so the band
       having moved, it has to be measured again -- otherwise the form stays
       clamped away from an edge that is now free, and towards the one that
       is not. */
    if (target && document.contains(target)) positionForm(target);
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

/* WHAT STATE A REMARK IS IN, IN ONE PLACE. The same three lines were written
   in the row, in the card and, the day the markers gained a colour, they would
   have been written a third time. The middle state is the one that must not be
   folded into the others: resolved but not deployed is a defect still on the
   reader's screen, and anything drawing it as done lies at a glance. */
const noteState = (note) => {
    if (!note.resolved_at) return 'open';
    return alreadyDeployed(note.resolved_version) ? 'done' : 'pending';
};

/* AND WHAT STATE A GROUP OF THEM IS IN: the most urgent one present. A badge
   that averaged its remarks would go quiet on an element still carrying an
   open one. */
const groupState = (notes) => {
    let seen = 'done';
    for (let i = 0; i < notes.length; i += 1) {
        const one = noteState(notes[i]);
        if (one === 'open') return 'open';
        if (one === 'pending') seen = 'pending';
    }
    return seen;
};

/** One badge per annotated element. It only appears in annotation mode:
    outside that mode, the page is exactly the site's.

    IT CARRIES A COUNT AND A COLOUR, and both are read at a glance without
    opening anything: how many remarks sit on this element, and whether any of
    them is still waiting. Blue is work to do, amber is fixed but not yet
    deployed -- the defect is still on screen -- and a hollow badge is history.
    The colour is never the only carrier: the count is written in it and the
    state is spelled out in the badge's accessible name.

    AND CLICKING IT OPENS THE WINDOW. It used to bring the matching row forward
    in the panel, which answers "where is it in the list" -- a question nobody
    asks while pointing at the element itself. What they want is the remark,
    and the window is where a remark is read. */
const drawMarkers = () => {
    empty(ui.markers);
    if (!mode) return;
    for (let i = 0; i < anchored.length; i += 1) {
        const group = anchored[i];
        const r = group.element.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        const n = group.notes.length;
        const state = groupState(group.notes);
        const badge = create('button', 'ap-marker ap-marker-' + state, String(n));
        badge.type = 'button';
        const what = n === 1 ? T('marker.one') : T('marker.n', { n: n });
        const how = T(state === 'open' ? 'list.state_open'
            : (state === 'pending' ? 'list.state_pending' : 'list.state_done'));
        badge.title = what + ' \u2014 ' + how;
        badge.setAttribute('aria-label', T('marker.open') + ' \u2014 ' + what
            + ' \u2014 ' + how);
        badge.style.left = Math.max(2, Math.min(r.left - 8, window.innerWidth - 30)) + 'px';
        badge.style.top = Math.max(2, Math.min(r.top - 8, window.innerHeight - 30)) + 'px';
        badge.addEventListener('click', ((g) => () => showGroup(g))(group));
        ui.markers.appendChild(badge);
    }
};

/**
 * Redoes the anchoring when -- and only when -- the page has moved under us.
 *
 * Two triggers, on purpose. `domDirty` is raised by the MutationObserver,
 * which sees everything including a swap that leaves the badge in exactly the
 * same place; `anchorsStale()` sees a detached node even when no observer is
 * running. Either one alone would have a blind spot.
 *
 * THE PANEL IS ONLY REDRAWN IF THE RESULT CHANGED. drawPanel() rebuilds the
 * list from nothing: called at every tick it would wipe the reader's scroll
 * position, the focus, and any reply being typed. The signature says whether
 * a note actually changed side; the markers, cheap and stateless, are redrawn
 * by the caller in any case.
 */
const reanchor = () => {
    if (!domDirty && !anchorsStale()) return;
    domDirty = false;
    const before = anchorSignature();
    anchor();
    /* A note can also come BACK from the orphan list here: the page had not
       finished rendering when we first looked, and now it has. That is a real
       change, and it is worth the redraw. */
    if (anchorSignature() !== before) drawPanel();
};

const refreshPositions = () => {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(() => {
        rafPending = false;
        if (!mode) return;
        // BEFORE drawing: the markers must be measured on the elements that
        // are in the document now, not on the ones that were.
        reanchor();
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

/* -- A REMARK, AS ONE LINE IN A LIST -------------------------------------
 *
 * WHAT THE COLUMN IS FOR. Full cards down a 350px band meant three of them
 * filled it and the fourth was below the fold, so the panel answered "what
 * does this one say" for the first three and "what is here at all" for none.
 * The list answers the second question, which is the one somebody has when
 * they open the panel; the window answers the first, one remark at a time.
 *
 * IT SAYS WHAT THE REMARK IS ABOUT, not who wrote it or when. That is how
 * somebody finds the one they mean: they remember the button, the heading, the
 * sentence it was about -- never the timestamp.
 *
 * AND ITS STATE, AS A MARK RATHER THAN A SENTENCE. Three states, and the
 * middle one has to be visible from the list: resolved but not deployed is a
 * defect still on screen, and a list that showed it as done would be lying at
 * a glance.
 */

const noteRow = (note, orphan) => {
    const live = note.resolved_at ? alreadyDeployed(note.resolved_version) : false;
    const state = note.resolved_at ? (live ? 'done' : 'pending') : 'open';
    const row = create('button', 'ap-row ap-row-' + state);
    row.type = 'button';
    row.setAttribute('data-ap-note', String(note.id));

    const dot = create('span', 'ap-row-dot');
    dot.setAttribute('aria-hidden', 'true');
    row.appendChild(dot);

    const about = note.excerpt || (orphan ? T('note.element_lost') : T('list.untitled'));
    const text = create('span', 'ap-row-about', about);
    row.appendChild(text);
    row.appendChild(create('span', 'ap-row-who', note.author));

    /* The state is a colour, and a colour is not a fact for everybody: it is
       spelled out in the accessible name, with what the remark is about. */
    row.setAttribute('aria-label', T('list.open') + ' -- ' + about + ' -- '
        + T(state === 'open' ? 'list.state_open'
            : (state === 'pending' ? 'list.state_pending' : 'list.state_done')));
    row.title = T('list.open');

    row.addEventListener('click', () => showNote(note, orphan));
    return row;
};

/* THE WINDOW REMEMBERS WHICH REMARKS IT HOLDS. Replying or resolving redraws
   the panel from the server's answer, and a window left showing the cards as
   they were would be the one place on screen still telling the old story.

   A LIST AND NOT ONE ID, since a badge opens the window on everything written
   about one element. Opened from the list it holds exactly one; opened from a
   badge that says 3, it holds three. */
let popNotes = null;

const showNotes = (notes, orphan, title) => {
    const ids = [];
    for (let i = 0; i < notes.length; i += 1) ids.push(notes[i].id);
    popNotes = { ids: ids, orphan: orphan };
    openPop(title, (into) => {
        for (let i = 0; i < notes.length; i += 1) {
            into.appendChild(noteCard(notes[i], orphan));
        }
    });
};

/* `showNote` and not `openNote`: 40-api.js already has an openNote, and it
   DECRYPTS a note. Two functions with one name in one bundle is a bug waiting
   for whoever reads the second one first.

   AND IT TAKES THE READER TO THE ELEMENT. Opening a remark from the list left
   them reading about a button they could not see: the list is sorted by the
   page's own order, not by what is on screen, so the thing being discussed is
   usually somewhere else entirely. The window says what was written; the page
   has to show what it was written about. `showElement` scrolls the viewpoint
   and outlines the element for a moment -- it touches no node and no style of
   the site.

   Not done from a badge: a badge is only drawn for an element inside the
   viewport, so the reader is already looking at it, and scrolling the page
   under a hand that just clicked would be the tool moving for no reason. */
const showNote = (note, orphan) => {
    showNotes([note], orphan, note.excerpt || T('list.untitled'));
    if (!orphan) showElement(note);
};

/* THE BADGE'S OWN WINDOW. Its title is what the ELEMENT says, not what the
   first remark says: the window holds all of them, and naming it after one
   would be wrong as soon as there are two. */
const showGroup = (group) => {
    showNotes(group.notes, false,
        excerptOf(group.element) || T('list.untitled'));
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
/**
 * THE FILE THE ASSISTANT NEEDS, BUILT FROM WHAT THE TOOL ALREADY HOLDS.
 *
 * Both values are here: the address this panel talks to, and the key it reads
 * with. Writing that file by hand meant copying them out of a page and a tag
 * into a text editor -- and the site had to draw the file in a figure to
 * explain how. The tool hands it over instead: the text to copy, and the file
 * to save.
 *
 * THE PROJECT IS KEYED BY THE SITE, which is what lets the assistant be told
 * "the notes on staging.example.com" and find the right key on its own. The
 * origin is there because a relay demands it on every write.
 *
 * AND THE NAME THE ASSISTANT SIGNS WITH. Without it the MCP refuses to write,
 * which would leave a reviewer with a file that reads their notes and cannot
 * answer one.
 *
 * IT SAYS WHAT IT CARRIES. This file is the key: whoever holds it reads these
 * notes and writes them. That is one line, under the block, and not a dialog
 * to dismiss -- the reviewer asked for the file, they are not being warned off
 * it.
 */
const assistantConfig = () => JSON.stringify({
    projects: {
        [location.host]: {
            api: API,
            key: keyText,
            origin: location.origin,
            /* Without a name the MCP refuses to write -- it says so itself, and
               a file that cannot answer a note is half a file. It is the
               ASSISTANT's name and not the reviewer's: both voices carrying one
               name is a thread nobody can read. */
            author: T('config.author')
        }
    }
}, null, 2);

const configBlock = () => {
    /* NO TITLE OF ITS OWN. This block only ever appears inside a window, and
       the window's bar carries the same words: written twice, the second one
       reads as a section inside a section. */
    const block = create('div', 'ap-config');

    /* THE PATH IS AN ELEMENT, NOT MARKUP IN A LABEL. Writing `<code>` into the
       string and letting a node parse it would make one label on this panel a
       fragment of HTML -- and labels are replaceable by the host site, so that
       is a shipped file parsing markup, which this repository refuses
       everywhere else. Two labels and two nodes.

       (Said without naming the property: check-no-html-injection.mjs strips
       line comments and one-line block comments, but not the continuation
       lines of a block written in this file's own style, with no gutter. It
       flagged an earlier version of this comment, and it was right to -- a
       check that reads code cannot be asked to guess which occurrences are
       prose.) */
    block.appendChild(create('p', 'ap-help', T('config.where')));
    const path = create('p', 'ap-help');
    path.appendChild(create('code', null, T('config.path')));
    block.appendChild(path);

    const text = assistantConfig();
    copyBlock(block, T('config.file'), text);

    const actions = create('div', 'ap-actions');
    /* A Blob and an <a download>: no request leaves, and the file is built
       from the two values already on this page. revokeObjectURL after the
       click, because a URL kept alive keeps the blob alive with it. */
    const save = create('button', 'ap-primary', T('config.download'));
    save.type = 'button';
    save.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'annotepage.json';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    });
    const close = create('button', 'ap-secondary', T('note.cancel'));
    close.type = 'button';
    /* It closes the window it is in, not itself: removing the block would
       leave an empty window with a title bar and nothing under it. */
    close.addEventListener('click', () => closePop());
    actions.appendChild(save);
    actions.appendChild(close);
    block.appendChild(actions);

    block.appendChild(create('p', 'ap-help ap-warn', T('config.warn')));
    return block;
};

/* -- A WINDOW THAT IS NOT THE PANEL ---------------------------------------
 *
 * WHY THIS EXISTS. Everything the tool had to say was said inside the panel,
 * and the panel is a 350px band down one edge of somebody else's page. The
 * notes belong there -- they point at the page beside them. Nothing else does:
 * a configuration file, three counts, what to do about a key. Each of them
 * arrived as another block pushed into the same column, and the column stopped
 * being readable.
 *
 * SO THEY LEAVE. One window, opened by the footer's links, floating over the
 * page rather than inside the band. It has room, and what is in it is one
 * subject at a time.
 *
 * IT MOVES, BY ITS TITLE BAR. A window that covers the very thing being
 * discussed is worse than no window, and this one sits over somebody else's
 * page: wherever it opens, it is in the way of something. Dragging it is the
 * whole answer, and a title bar is where every window on earth is dragged
 * from.
 *
 * ONE AT A TIME. A second would need a stacking order, a focus order and a
 * rule about which Escape closes -- three questions for a tool that has one
 * thing to say at a time.
 */

let pop = null;
/* The window listens to the viewport for as long as it is on screen, and not
   one moment longer. Kept here so closePop can take it back off: a listener
   left behind would move a window that no longer exists at the next turn of a
   phone. */
let popWatch = null;

const closePop = () => {
    if (!pop) return;
    if (popWatch) {
        window.removeEventListener('resize', popWatch);
        popWatch = null;
    }
    pop.remove();
    pop = null;
    popNotes = null;
};

const openPop = (title, fill) => {
    closePop();
    const box = create('div', 'ap-pop');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-label', title);

    const bar = create('div', 'ap-pop-bar');
    bar.appendChild(create('span', 'ap-pop-title', title));
    const shut = create('button', 'ap-link', T('panel.close'));
    shut.type = 'button';
    shut.addEventListener('click', () => closePop());
    bar.appendChild(shut);
    box.appendChild(bar);

    const body = create('div', 'ap-pop-body');
    box.appendChild(body);
    ui.layer.appendChild(box);
    /* WITHOUT THIS THE WINDOW IS A PICTURE. `pop` is what closePop, Escape and
       leaveMode all test; it was never assigned, so the window could be opened
       and never closed by anything but another open -- Escape fell through to
       leaving annotation mode, taking the page's highlighting away and leaving
       the window floating over it. */
    pop = box;

    /* FILLED FIRST, THEN PLACED. This is the whole of the bug the reader hit:
       the window was measured BEFORE its content went in, so `h` was the
       height of an empty box -- about forty pixels -- and a window opened a
       third of the way down the viewport then grew a card underneath itself
       and ran off the bottom of the screen. What is written at the end of a
       remark could only be reached by dragging the window up first.

       So nothing is placed until there is something to measure. */
    fill(body);

    /* AND IT OPENS AT A SHAPE, NOT AT ITS FULL LENGTH. A long remark filled
       the window to the ceiling -- a column the height of the screen, which is
       the shape the panel already has and the one this window exists not to
       be. It opens at the smaller of what its content needs and 62% of the
       viewport, never under 220px, and the body scrolls inside. Growing it is
       the reader's to do, from the corner. */
    const ROOM = 12;
    const fits = (v) => Math.max(220, Math.min(v, window.innerHeight - ROOM * 2));
    box.style.height =
        fits(Math.min(box.offsetHeight, Math.round(window.innerHeight * 0.62))) + 'px';

    /* WHERE IT OPENS: in the space the panel leaves, never over it. The panel
       is a 360px band down one edge; on a narrow screen it is a bottom band
       instead and the whole width is free. Centred in what is left, a third of
       the way down -- and then clamped, which is what actually guarantees no
       edge is crossed. */
    let x = 0, y = 0;
    const clamp = () => {
        const w = box.offsetWidth;
        const h = box.offsetHeight;
        x = Math.max(ROOM, Math.min(x, window.innerWidth - w - ROOM));
        y = Math.max(ROOM, Math.min(y, window.innerHeight - h - ROOM));
        box.style.left = x + 'px';
        box.style.top = y + 'px';
    };
    (function () {
        const band = narrowScreen() ? 0 : 372;
        const free = Math.max(0, window.innerWidth - band);
        const from = (side === 'left' && !narrowScreen()) ? band : 0;
        x = Math.round(from + (free - box.offsetWidth) / 2);
        y = Math.round((window.innerHeight - box.offsetHeight) / 3);
        clamp();
    }());

    /* A WINDOW ON A VIEWPORT THAT CHANGED IS A WINDOW TO PLACE AGAIN. Turning
       a phone, or opening a laptop's keyboard drawer, can leave it entirely
       outside the screen with nothing to grab. The size is brought back inside
       first, then the position. */
    popWatch = () => {
        if (box.offsetHeight > window.innerHeight - ROOM * 2) {
            box.style.height = fits(box.offsetHeight) + 'px';
        }
        clamp();
    };
    window.addEventListener('resize', popWatch);

    /* THE DRAG. Pointer events and not mouse events: one code path for a
       mouse, a finger and a pen. setPointerCapture keeps the moves coming even
       when the pointer leaves the bar, which it does the moment the window
       starts following it.

       CLAMPED SO A TITLE BAR IS ALWAYS REACHABLE. A window dragged off the top
       or fully past an edge cannot be dragged back, and there is no menu here
       to bring it home. Dragging is allowed to put an edge past the screen --
       that is the reader's own doing, and how one reads the far side of a wide
       card -- where OPENING is not. */
    let from = null;
    bar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        from = { px: e.clientX, py: e.clientY, x: x, y: y };
        bar.setPointerCapture(e.pointerId);
        box.classList.add('ap-pop-moving');
        e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
        if (!from) return;
        const wide = box.offsetWidth;
        x = Math.min(Math.max(8 - wide + 60, from.x + (e.clientX - from.px)),
            window.innerWidth - 60);
        y = Math.min(Math.max(0, from.y + (e.clientY - from.py)),
            window.innerHeight - 32);
        box.style.left = x + 'px';
        box.style.top = y + 'px';
    });
    const release = (e) => {
        if (!from) return;
        from = null;
        box.classList.remove('ap-pop-moving');
        try { bar.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    };
    bar.addEventListener('pointerup', release);
    bar.addEventListener('pointercancel', release);

    /* THE CORNER. `resize: both` in the stylesheet would have been three
       lines, and it is not used: it does nothing under a finger on iOS, and
       the drag two paragraphs up is written on pointer events precisely so
       that a finger, a pen and a mouse take one code path. A window one can
       move but not resize with the same gesture is a window that works twice
       as well for whoever has a mouse.

       BOTH DIMENSIONS, FREELY -- the ratio is the reader's. A wide card wants
       width, a long thread wants height, and the tool has no opinion on which.
       The floors are what keeps the title bar and its close button usable; the
       ceilings are the viewport, because a window bigger than the screen
       cannot be brought back. */
    const grip = create('div', 'ap-pop-grip');
    grip.setAttribute('aria-hidden', 'true');
    box.appendChild(grip);
    let size = null;
    grip.addEventListener('pointerdown', (e) => {
        size = { px: e.clientX, py: e.clientY,
                 w: box.offsetWidth, h: box.offsetHeight };
        grip.setPointerCapture(e.pointerId);
        box.classList.add('ap-pop-sizing');
        e.preventDefault();
        e.stopPropagation();
    });
    grip.addEventListener('pointermove', (e) => {
        if (!size) return;
        const w = Math.max(240, Math.min(size.w + (e.clientX - size.px),
            window.innerWidth - x - ROOM));
        const h = Math.max(140, Math.min(size.h + (e.clientY - size.py),
            window.innerHeight - y - ROOM));
        box.style.width = w + 'px';
        box.style.height = h + 'px';
    });
    const dropped = (e) => {
        if (!size) return;
        size = null;
        box.classList.remove('ap-pop-sizing');
        try { grip.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    };
    grip.addEventListener('pointerup', dropped);
    grip.addEventListener('pointercancel', dropped);

    /* The close button rather than the body: whatever is inside may be a block
       of text with nothing to focus, and a dialog that opens with focus
       nowhere leaves a keyboard where it was. */
    shut.focus();
    return box;
};

const forgetForm = () => {
    const block = create('div', 'ap-forget');
    block.appendChild(create('p', 'ap-help', T('key.forget_confirm')));

    const actions = create('div', 'ap-actions');
    const confirm = create('button', 'ap-primary', T('key.forget'));
    confirm.type = 'button';
    confirm.addEventListener('click', () => forgetKey());
    const cancel = create('button', 'ap-secondary', T('note.cancel'));
    cancel.type = 'button';
    /* Closes the window, not the block: see the same button in configBlock. */
    cancel.addEventListener('click', () => closePop());
    actions.appendChild(confirm);
    actions.appendChild(cancel);
    block.appendChild(actions);
    return block;
};

/**
 * WHICH MODE THIS PROJECT RUNS IN, SAID IN BOTH OF THEM.
 *
 * What was here before was a paragraph, drawn only when the key was in the
 * page. It had the right content and the wrong shape, twice over:
 *
 *   - a reviewer in SECURE mode saw nothing at all, so the panel never told
 *     them which of the two modes they were in. The one case that says
 *     something is the case that is already the more alarming: silence was
 *     doing the reassuring, and silence is also what a broken build looks
 *     like;
 *   - a paragraph that is on screen for ever gets skipped after the second
 *     read. A word is read every time, because there is nothing to skip.
 *
 * So: one badge, same place, both modes, one word -- "Public" or "Secure",
 * the site's own two words and not a third vocabulary. The sentence that
 * explains it is asked for, and it is asked for BY POINTER OR BY KEYBOARD:
 * the badge takes focus (tabindex) although it is not a button and does
 * nothing when pressed, because a description reachable only by hovering is
 * a description half the people who need it cannot reach. The text is tied
 * to the badge with aria-describedby, so it is the badge's accessible
 * description whether or not it is on screen -- a native title= would be
 * neither of those things reliably.
 *
 * ENCRYPTION IS NOT ON THE BADGE. It is true in both modes, at all times, so
 * a word that appears in both says nothing about either. It belongs to the
 * sentence, which is where somebody asking "and what does that mean" is.
 */
const modeBadge = () => {
    const isPublic = PUBLIC_KEY;
    const block = create('div', 'ap-mode ' + (isPublic ? 'ap-mode-public' : 'ap-mode-secure'));

    /* The id is drawn, because the panel is redrawn: two badges alive at the
       same instant during a redraw must not both answer to one id, or the
       description would resolve to the older one. Same trick, same reason as
       the name field above. */
    const id = 'ap-mode-' + Math.random().toString(36).slice(2, 8);

    const chip = create('span', 'ap-mode-chip', T(isPublic ? 'mode.public' : 'mode.secure'));
    chip.setAttribute('role', 'note');
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('aria-describedby', id);

    const tip = create('span', 'ap-mode-tip',
        T(isPublic ? 'mode.public_detail' : 'mode.secure_detail'));
    tip.id = id;
    tip.setAttribute('role', 'tooltip');

    block.appendChild(chip);
    block.appendChild(tip);
    return block;
};

const drawPanel = () => {
    empty(ui.body);
    empty(ui.footer);


    ui.body.appendChild(modeBadge());

    /* A NEWER CLIENT EXISTS, AND WE ARE NOT GOING TO FETCH IT. This copy is
       served by the site itself -- somebody took the file off a CDN on
       purpose -- so it says so and stops there (80-upgrade). A copy served
       BY a CDN never gets here: it replaced itself before the panel existed.

       Said at every draw and not once at load, for the same reason as the
       badge above: a message shown at load time is read by whoever happened
       to be looking, and by nobody who opens this panel a week later. */
    if (upgradeAvailable) {
        const notice = create('div', 'ap-upgrade',
            T('upgrade.available', { version: upgradeAvailable, current: TOOL_VERSION }));
        notice.setAttribute('role', 'note');
        ui.body.appendChild(notice);
    }

    /* THE SERVER AND THIS CLIENT DO NOT SPEAK THE SAME PROTOCOL NUMBER, and
       that is a standing property of what is on screen, not an event: same
       register as the badge and the notice above, same place, at every draw
       (40-api, section 8bis).

       Which of the two sentences is drawn is the whole asymmetry. A server
       AHEAD of us also refuses our writes, and the sentence says so, here,
       before anybody types four hundred words into the form -- the refusal at
       send time (failureFrom) is the guarantee, not the announcement. A
       server BEHIND us is read normally and written to normally, so its
       sentence names what to update and stops there. */
    if (serverIsNewer() || serverIsOlder()) {
        const notice = create('div', 'ap-format',
            T(serverIsNewer() ? 'format.server_newer' : 'format.server_older',
              { server: serverFormat, ours: FORMAT }));
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
            ui.body.appendChild(noteRow(current[i], false));
        }
    }

    if (orphans.length) {
        ui.body.appendChild(create('h2', 'ap-section-title', T('orphans.title')));
        ui.body.appendChild(create('p', 'ap-section-help', T('orphans.help')));
        for (let i = 0; i < orphans.length; i += 1) {
            ui.body.appendChild(noteRow(orphans[i], true));
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
                ui.body.appendChild(noteRow(archived[i], false));
            }
        }
    }

    /* WHO YOU ARE, AND NOTHING ELSE IN PLAIN SIGHT. It is the one thing in
       this footer somebody reads without being asked to: a name they will be
       signing with. Everything else is behind a link now. */
    if (author) {
        /* ON ITS OWN LINE, and the rest under it. The footer is one wrapping
           flex row, so the name, the button that changes it and three links
           that open windows were strung together and broke wherever the width
           happened to run out -- "as Dominique." then "Change" then "Across
           the site" reading as one sentence of four unrelated things. This
           takes the whole width; everything after it starts a line. */
        const who = create('div', 'ap-foot-who');
        who.appendChild(create('span', null, T('author.known', { name: author })));
        const change = create('button', 'ap-link', T('author.change'));
        change.type = 'button';
        change.addEventListener('click', () => {
            writeAuthor('');
            drawPanel();
        });
        who.appendChild(change);
        ui.footer.appendChild(who);
    }

    /* AND THREE LINKS THAT OPEN A WINDOW, NEVER A BLOCK IN THIS COLUMN. Each
       used to push its own panel into the body, above the notes: the counts as
       a row, the file as a block, the key as a form. Three subjects competing
       with the one thing this band is for. */
    if (totals !== null) {
        const fig = create('button', 'ap-link', T('panel.stats_label'));
        fig.type = 'button';
        fig.addEventListener('click', () => openPop(T('panel.stats_label'), (into) => {
            const row = statsRow();
            if (row) into.appendChild(row);
        }));
        ui.footer.appendChild(fig);
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
    /* OFFERED WHEREVER THERE IS A KEY TO PUT IN IT, which includes the tag's:
       the reviewer who never pasted anything still has an assistant to hand the
       file to, and the values are the same values. */
    if (keyText) {
        const conf = create('button', 'ap-link', T('config.show'));
        conf.type = 'button';
        conf.addEventListener('click', () => openPop(T('config.title'), (into) => {
            into.appendChild(configBlock());
        }));
        ui.footer.appendChild(conf);
    }

    if (PROJECT && keyText && !PUBLIC_KEY) {
        const changeSalt = create('button', 'ap-link', T('key.replace'));
        changeSalt.type = 'button';
        changeSalt.title = T('key.origin_changed');
        changeSalt.addEventListener('click', () => openSaltScreen());
        ui.footer.appendChild(changeSalt);

        const forget = create('button', 'ap-link', T('key.forget'));
        forget.type = 'button';
        forget.addEventListener('click', () => openPop(T('key.forget'), (into) => {
            into.appendChild(forgetForm());
        }));
        ui.footer.appendChild(forget);
    }

    /* WHAT IS STILL IN FRONT OF THE READER, AND HOW MANY THERE HAVE BEEN.
       The same test the panel uses to fold a note away, applied to the whole
       list: resolved AND online has done its job, anything else is still
       there. Orphans are counted with the rest -- they are shown, so they are
       in front of somebody.

       The single number is kept while nothing has been fixed yet: "3 notes"
       says it better than "3 of 3", and that is the state a page spends its
       first day in. */
    const total = notes.length;
    let open = 0;
    for (let i = 0; i < notes.length; i += 1) {
        const n = notes[i];
        if (!(n.resolved_at && alreadyDeployed(n.resolved_version))) open += 1;
    }
    /* AND THE WINDOW FOLLOWS. Replying or resolving redraws this panel from
       what the server answered; a window still showing the card as it was
       would be the one place on screen telling the old story. The remark is
       looked up again by id -- it may have gained a reply, changed state, or
       gone. */
    if (popNotes) {
        const again = [];
        for (let i = 0; i < notes.length; i += 1) {
            if (popNotes.ids.indexOf(notes[i].id) !== -1) again.push(notes[i]);
        }
        /* Every one of them gone -- deleted, or moved to another page -- and
           the window has nothing left to say. One of several gone: the window
           stays, holding the rest, because the reader is still looking at the
           element they all belong to. */
        if (!again.length) closePop();
        else {
            const body = pop && pop.querySelector('.ap-pop-body');
            if (body) {
                empty(body);
                for (let i = 0; i < again.length; i += 1) {
                    body.appendChild(noteCard(again[i], popNotes.orphan));
                }
            }
        }
    }

    ui.buttonCount.textContent = (total && open !== total)
        ? T('button.notes_of', { open: open, total: total })
        : readableCount(total, 'button.notes_zero', 'button.notes_one', 'button.notes_n');
    // The button carries the failure: someone who does not open it must be
    // able to see, at a glance, that something is wrong.
    ui.button.classList.toggle('ap-failed', !!currentFailure);
    ui.button.title = currentFailure ? currentFailure.title
        : (total ? T('button.help_counts', { open: open, total: total })
                 : T('button.help'));
};

/* focusNote STOOD HERE, AND IT HAD ALREADY STOPPED WORKING. It put .ap-focused
   on whatever in the panel carried the note's id and scrolled it into view.
   The panel stopped drawing cards and started drawing rows: the class landed
   on a .ap-row, the only rule for it was written .ap-note.ap-focused, and
   nothing was ever outlined again -- no error, no trace, a gesture that simply
   did nothing. Its one caller was the badge, which now opens the window
   instead. The rule went with it. */

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

    /* THE PANEL IS AN OBSTACLE, not a neighbour. In annotation mode the
       layer takes every click, so a form drawn under the panel is a form
       whose Send button cannot be pressed.

       This is a defect that PREDATES the left/right choice, and it was
       already there on the right: the only clamp was "window.innerWidth -
       width - 12", which is a point INSIDE a panel sitting at right: 12.
       Point at anything near the right edge and the form landed under the
       panel. Moving the panel to the left would simply have mirrored it. So
       the form is now clamped against the free strip beside the panel, on
       whichever side that is. */
    const band = panelBand();
    let low = 8;
    let high = window.innerWidth - width - 12;
    if (band) {
        if (side === 'left') low = Math.max(low, band.right + 8);
        else high = Math.min(high, band.left - 8 - width);
    }
    let left = Math.min(Math.max(r.left, low), high);
    /* Between 560 px -- where the panel becomes a band and this whole branch
       stops running -- and roughly 720, no strip is wide enough for the
       form. It then starts at the free edge, which keeps its beginning
       reachable; there is no placement that does better on that width. */
    if (high < low) left = low;
    let top = r.bottom + 8;
    if (top + height > window.innerHeight - 12) top = Math.max(8, r.top - height - 8);
    form.style.left = Math.max(8, left) + 'px';
    form.style.top = Math.max(8, top) + 'px';
};

/** The horizontal strip the panel takes, or null when it is not showing.
    Measured rather than computed from the stylesheet: the width is capped by
    max-width on a narrow window, and a value read from the CSS would be the
    width the panel would have had. */
const panelBand = () => {
    if (!ui || !ui.panel.classList.contains('ap-open')) return null;
    const r = ui.panel.getBoundingClientRect();
    if (r.width === 0) return null;
    return { left: r.left, right: r.right };
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
    /* The window first: it is the thing on top, and Escape closes what is on
       top. Leaving annotation mode from under an open window would take the
       page away and leave the window floating over it. */
    if (pop) {
        closePop();
        return;
    }
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

    /* THE PAGE REDRAWS ITSELF, AND THE BADGES MUST NOT DIE OF IT. A click on
       the site's own button can replace a whole block: the node we remembered
       is then detached, it measures 0x0, and the badge simply stops being
       drawn.

       The callback raises a flag AND NOTHING ELSE. All the work -- redoing
       the anchoring, deciding whether the panel changed -- happens in the
       animation frame of refreshPositions, at most once per frame. A page
       that mutates in a loop would otherwise pay for a full re-anchoring on
       every mutation record, which is how an annotation layer turns a lively
       page into a slow one.

       Observed on document.body, childList and subtree: an element swapped
       anywhere is what breaks us. It never crosses into the shadow root, so
       the tool cannot see -- or answer -- its own drawing. */
    if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(() => {
            domDirty = true;
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
    domDirty = false;

    // The markers for what we ALREADY know, straight away; the server is
    // asked next and will correct if there is anything new. Waiting for the
    // network to show what is already on screen would suggest an empty page.
    drawMarkers();
    reload();
};

const leaveMode = () => {
    mode = false;
    closePop();
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
    // Outside annotation mode the tool watches nothing: the site is the
    // site's again, and it pays nothing for us.
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    domDirty = false;
    if (timer) {
        window.clearInterval(timer);
        timer = null;
    }
};

const toggleMode = () => (mode ? leaveMode() : enterMode());
