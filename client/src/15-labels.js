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
    /* TWO NUMBERS, BECAUSE ONE OF THEM WAS THE WRONG ONE. The count said how
       many notes the page carries, which on a page reviewed for a month is a
       number nobody acts on -- and it kept growing as remarks were fixed. What
       somebody opening the panel wants to know is how much is still in front
       of them. The total stays beside it: it is the difference between "two
       left" and "two, and nobody has looked yet". */
    'button.notes_of': '{open} of {total}',
    'button.help_counts': '{open} still to fix, {total} in all on this page',

    /* -- The panel ----------------------------------------------------- */
    'panel.title': 'Review notes',
    'panel.close': 'Close',
    /* The panel has two positions and the button says where it is GOING, not
       where it is: a label that named the current side would read as a
       statement and be pressed by nobody. */
    'panel.move_left': 'Move left',
    'panel.move_right': 'Move right',
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

    /* -- WHICH OF THE TWO MODES THIS PROJECT RUNS IN ------------------
       One word, drawn in BOTH modes, where the notes are and at every draw.
       It replaces a paragraph that only the public mode ever showed: a
       reviewer in secure mode had no way of telling which of the two they
       were in, and a mention that appears in one case only is read as an
       alarm rather than as a state.

       The two words are the site's own: "Public" and "Secure", not a third
       vocabulary invented here.

       ENCRYPTION IS NOT ON THE BADGE. It holds in both modes, always, so
       repeating it on screen at every draw says nothing that distinguishes
       anything -- it belongs to the sentence one asks for, below.

       Those sentences are the whole explanation, and they are reachable by
       pointer AND by keyboard: the badge is not a button, it is focusable
       so that the description can be asked for without a mouse. */
    'mode.public': 'Public',
    'mode.secure': 'Secure',
    /* The write half is the one nobody expects -- the key gives both, and
       this format has no reader-only role. Shortened from the paragraph it
       replaces, and not one claim lighter. */
    'mode.public_detail':
        'End-to-end encrypted, and the key is in this page: anyone who can '
        + 'open the page can read these notes AND write them. The key gives '
        + 'both -- this format has no reader-only role.',
    /* The mirror answer, which had never been written down anywhere: what
       the other mode actually costs the server. */
    'mode.secure_detail':
        'End-to-end encrypted, and the key is not in this page: each browser '
        + 'pastes it once, and the server never receives it.',

    /* -- A newer client exists, and this copy is not going to fetch it -
       Shown ONLY when the file is served by the site itself: a copy served
       by a CDN replaces itself instead of talking about it (80-upgrade).
       So the sentence has to say what was NOT done, and whose call it is. */
    'upgrade.available':
        'A more recent annotepage client exists: {version}. This page is '
        + 'running {current}, served by the site itself -- nothing was fetched '
        + 'to replace it, and when to update the file is the owner\'s call.',

    /* -- The server and this client do not speak the same protocol -----
       Two numbers in every sentence, never the word "incompatible" on its
       own: "incompatible" sends somebody hunting through three components,
       two numbers say in one line which end is behind and therefore what to
       update. The two directions do not say the same thing because they do
       not cost the same thing -- ahead of us, writing is refused; behind us,
       everything still works. */
    'format.server_newer':
        'This server speaks annotepage format {server}; this client speaks '
        + 'format {ours}. Writing is refused from this page while that is '
        + 'true: a remark sealed at format {ours} would be stored in an '
        + 'envelope this server cannot read back, and nothing is ever deleted '
        + 'in this tool. The notes are still shown, and what cannot be read is '
        + 'counted below. To fix it, update the annotepage client file this '
        + 'page loads to a version that speaks format {server} -- that is the '
        + 'call of whoever looks after the site.',
    'format.server_older':
        'This server speaks annotepage format {server}; this client speaks '
        + 'format {ours}. Nothing is blocked: notes of format {server} are '
        + 'read here, and remarks can still be written. It is the SERVER that '
        + 'is behind -- tell whoever looks after it to update it to format '
        + '{ours}.',
    'format.write_refused':
        'Nothing was sent, and nothing was lost: your text is kept above. '
        + 'This server speaks annotepage format {server}, this client speaks '
        + 'format {ours}, so a remark written from here would be stored in an '
        + 'envelope the server cannot read back -- and nothing is ever deleted '
        + 'in this tool. The annotepage client file loaded by this page has to '
        + 'be updated to format {server} first. Until then, write the remark '
        + 'somewhere else: it will not arrive from this page.',

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
