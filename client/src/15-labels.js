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
        '1 note could not be decrypted. The salt in this browser may not be '
        + 'the one it was written with.',
    'read.unreadable_n':
        '{n} notes could not be decrypted. The salt in this browser may not be '
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

    /* -- The salt: the only secret, and it cannot be recovered ---------- */
    'salt.title': 'The salt of this project is needed',
    'salt.help':
        'The notes of this project are encrypted in your browser. Without the '
        + 'project salt, this browser can neither read them nor write any. Ask '
        + 'whoever installed the tool for it, and paste it below. It will be '
        + 'remembered by this browser, for this site.',
    'salt.label': 'The project salt (43 characters)',
    'salt.confirm': 'Use this salt',
    'salt.empty': 'Paste the salt before confirming.',
    'salt.shape':
        'This is not a salt: 43 characters are expected, from A-Z a-z 0-9 - _, '
        + 'with no space and no decorative dash. Copy it in one block.',
    'salt.wrong':
        'This salt is not the one for this project. Nothing was sent, nothing '
        + 'was decrypted. Check that you are pasting the salt of the right '
        + 'project.',
    'salt.origin_changed':
        'This salt is remembered per browser AND per domain. The day staging '
        + 'becomes production, it has to be pasted once more on the new domain '
        + '-- the notes themselves do not move.',
    'salt.not_kept':
        'This browser refuses to remember the salt (private browsing, or '
        + 'storage blocked). The tool works for this page, but the salt will '
        + 'have to be pasted again on the next load.',
    'salt.replace': 'Paste another salt',
    'salt.forget': 'Forget the salt on this browser',

    /* -- Setup --------------------------------------------------------- */
    'setup.title': 'Install annotepage on this site',
    'setup.generate': 'Generate a salt and create the project',
    'setup.warning_title': 'Read this before continuing',
    'setup.warning':
        'The salt below is the ONLY secret of the project, and nobody else has '
        + 'it: not the server, not the author of the tool, nobody you can ask. '
        + 'SALT LOST = NOTES LOST, for good, with no recovery. Put it away now, '
        + 'where your team keeps its passwords, before continuing.',
    'setup.salt': 'The project salt -- keep it',
    'setup.project': 'The project id -- public, it goes into the page',
    'setup.tag': 'The tag to paste at the end of <body>, on the pages to annotate',
    'setup.server': 'To declare in the server configuration',
    'setup.copy': 'Copy',
    'setup.copied': 'Copied',
    'setup.copy_failed': 'Select the text and copy it by hand.',
    'setup.continue': 'I have put the salt away, continue',
    'setup.done':
        'The salt is remembered by this browser. Paste the tag above into the '
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
