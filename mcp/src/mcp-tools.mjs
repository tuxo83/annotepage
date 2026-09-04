/* mcp-tools.mjs — WHAT THE ASSISTANT CAN DO, AND HOW WE TELL IT SO.
 *
 * THIS IS THE POINT OF THE WHOLE PROJECT. The human half — click an element,
 * leave a remark on it — exists elsewhere. What does not exist elsewhere is
 * the AI as a full participant in the review loop: it reads the remarks where
 * they are, it fixes, it replies in the thread, and it stamps the version the
 * fix ships in.
 *
 * THREE RULES OF WRITING, and they are worth as much as the code:
 *
 *  1. EVERYTHING THAT COMES OUT OF HERE IS IN THE GRAMMAR OF THE FOUR MARGINS.
 *     No JSON, no table, no markup. It is the same text that "curl
 *     ?action=text" returns in plain mode, and that is on purpose: an
 *     assistant that can read one can read the other, and the MCP stays an
 *     ADDITION, never a compulsory step. The day those two formats diverge,
 *     the simple path is broken and nobody notices before needing it.
 *
 *  2. A TOOL'S DESCRIPTION STATES ITS CONSEQUENCE, not its mechanics.
 *     "Nothing is ever erased in this tool" counts for more than "calls POST
 *     ?action=add". The assistant reading these descriptions is deciding to
 *     write into somebody's review database.
 *
 *  3. WE DO NOT LIE ABOUT WHAT WE DO NOT KNOW. A count of unreadable notes is
 *     said, an encryption we could not open is said, a missing version is
 *     said. A note that disappears in silence makes you believe the review is
 *     finished.
 */

import {
    retrieve, filledExport, findNote, isOpen,
    reply, markResolved, reopen,
} from './notes.mjs';
import { writeExport } from './text-export.mjs';
import { readDiagnostic } from './api.mjs';
import { projectForCall, saveProject } from './config.mjs';

/* The schema of a "project" argument, added to every tool. When the
   configuration declares only one project it is useless; when it declares
   several, omitting it is an error and not a lottery — writing into the wrong
   project cannot be undone. */
const PROJECT_ARG = {
    type: 'string',
    description: 'The name of the project in the local configuration file. Not '
        + 'needed if there is only one, or if one of them is declared as the '
        + 'default. NEVER pass it together with "key": a key already derives the '
        + 'project id, and a call that names two projects at once is refused '
        + 'rather than arbitrated.',
};

/* THE TWO ARGUMENTS THIS FILE EXISTS FOR, AND THEIR DESCRIPTIONS ARE THE
   FEATURE. The code behind them is twenty lines; what decides whether a review
   works without any setup at all is whether the assistant reading this knows
   where to look, in what order, and what it must never do.
   Read rule 2 at the top of this file: a description states its consequence. */
const API_ARG = {
    type: 'string',
    description: 'The address of the server holding the notes, for example '
        + '"https://api.annotepage.com/api.php". It is the "data-server" '
        + 'attribute of the annotepage tag at the end of the annotated page, '
        + 'copied as it stands.\n'
        + 'It is the one thing a key cannot derive, which is why it is asked for. '
        + 'It goes WITH "key" and does nothing without it: given alone, the call '
        + 'is refused rather than half completed from the configuration file.',
};

const KEY_ARG = {
    type: 'string',
    description: 'The 43-character key of the project, when the project is not in '
        + 'a local configuration file. Given together with "api" it IS the whole '
        + 'project: the project id is derived from the key, so never ask for, nor '
        + 'pass, a project id or a project name beside it.\n\n'
        + 'WHERE TO GET IT, IN THIS ORDER:\n'
        + '1. READ IT OFF THE PAGE. Given the address of an annotated page, fetch '
        + 'that page: the annotepage tag at the end of the document carries '
        + 'data-key (this argument) and data-server (the "api" argument). This is '
        + 'the normal case, it needs nobody, and it is what makes a review '
        + 'possible with nothing installed and nothing configured.\n'
        + '2. THE CONFIGURATION FILE, when there is one. That is the way for a '
        + 'PRIVATE project, whose key is deliberately not in the page: then pass '
        + 'neither "api" nor "key" and let the file answer.\n'
        + '3. ASK A HUMAN — LAST RESORT ONLY, when the page cannot be reached and '
        + 'no configuration answers. Not as a first reflex: asking someone for a '
        + 'key they have already published in their own page is useless, and it '
        + 'is the exact gesture that must be discouraged for the keys that are '
        + 'not published.\n\n'
        + 'THE LINE THAT MUST NOT BE CROSSED: this argument is for a project whose '
        + 'key is ALREADY PUBLIC IN THE PAGE. A private key pasted into a '
        + 'conversation travels through a model provider\'s logs and cannot be '
        + 'taken back — this format has no key rotation, so the only repair is a '
        + 'new project, and the notes already written stay behind.',
};

const ORIGIN_ARG = {
    type: 'string',
    description: 'The origin of the site the notes are about: scheme and host, a '
        + 'port only when it is not the default, and nothing else — '
        + '"https://staging.example.com", "http://localhost:8080". No path, no '
        + 'query string.\n'
        + 'YOU ALREADY HAVE IT: it is the origin of the PAGE whose annotepage tag '
        + 'you just read. Take the scheme and the host of that address and drop '
        + 'the rest. It is not the "api" address — those are two different domains '
        + 'by construction, and the server compares this one against the site it '
        + 'expects.\n'
        + 'PASS IT WHENEVER YOU MIGHT WRITE. Without it reading works everywhere, '
        + 'but a shared relay refuses every write that arrives with no Origin '
        + 'header: no reply in a thread, and no note marked resolved.\n'
        + 'It goes with "api" and "key", and alone it is refused: it describes a '
        + 'project, it does not name one.',
};

/* Appended to every tool description. The whole text lives on the two
   arguments above; what a tool has to say for itself is that the arguments
   exist, so that nobody asks a human for what the page already carries. */
const CARRIES_ITS_OWN_PROJECT =
    '\n\nNO CONFIGURATION NEEDED FOR A PUBLIC PROJECT: this tool also takes '
    + '"api" and "key" read off the annotepage tag of the page itself '
    + '(data-server, data-key), plus "origin", which is simply the origin of that '
    + 'page — and then no configuration file is required or read. Read the "key" '
    + 'argument before asking anyone for a key, and pass "origin" whenever you '
    + 'might write: a relay refuses a write that arrives without it.';

const integer = (value, what) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || String(n) !== String(value).trim()) {
        throw new Error('The field "' + what + '" expects a whole note number. '
            + 'Received: ' + JSON.stringify(value));
    }
    return n;
};

/** A subset of notes, returned in the same grammar as the export. */
const renderList = (state, project, notes, footer) =>
    writeExport({
        format: state.header.format,
        version: state.header.version,
        project: state.header.project || project.id,
        encryption: state.header.encryption,
    }, notes, footer === undefined ? state.footer : footer);

export const buildTools = (configuration) => {

    /* Each tool fetches the fresh state of the project it aims at. api.mjs
       keeps the export for a few seconds and every write empties it: listing
       then reading three notes therefore makes one single export, and a note
       just written reappears at once. */
    const stateOf = async (args) => {
        const project = await projectForCall(configuration, args);
        const state = await retrieve(project);
        return { project, state };
    };

    return [
        {
            name: 'annotepage_open_notes',
            title: 'Open notes',
            description:
                'The review remarks THAT ARE STILL TO BE FIXED, with their reply '
                + 'threads. This is the starting point: an open note points at a '
                + 'precise element of a precise page and says what is wrong.\n\n'
                + 'The result is plain text, one piece of information per line, the '
                + 'indentation alone saying what you are reading: 0 spaces for the '
                + 'structure of a note, 2 for that of a reply, 4 for the text of a '
                + 'note, 6 for that of a reply. The key of a line is the longest '
                + 'known prefix, the value is the rest; a missing line means an '
                + 'empty value.\n\n'
                + 'A "skipped" line at the end reports the notes that could NOT be '
                + 'read. If it is there, the list is incomplete, and that has to be '
                + 'said before concluding that the review is finished.'
                + CARRIES_ITS_OWN_PROJECT,
            schema: {
                type: 'object',
                properties: {
                    project: PROJECT_ARG,
                    api: API_ARG,
                    key: KEY_ARG,
                    origin: ORIGIN_ARG,
                    page: {
                        type: 'string',
                        description: 'Keep only the notes of this page path, for '
                            + 'example "/en/contact.html". Exact comparison: "/a" and '
                            + '"/a/" are two pages.',
                    },
                    limit: {
                        type: 'integer',
                        description: 'Maximum number of notes returned, oldest first. '
                            + 'No limit by default.',
                        minimum: 1,
                    },
                },
                additionalProperties: false,
            },
            call: async (args) => {
                const { project, state } = await stateOf(args);
                let notes = state.notes.filter(isOpen);

                if (args.page) {
                    const wanted = String(args.page);
                    const before = notes.length;
                    notes = notes.filter((n) => n.page === wanted);
                    if (notes.length === 0 && before > 0 && !project.keys
                        && state.header.encryption !== 'no') {
                        return 'No open note on "' + wanted + '".\n'
                            + 'Careful: this project is encrypted and the configuration '
                            + 'carries no key, so the page paths are not readable. The '
                            + 'filter had nothing to compare.\n';
                    }
                }

                if (args.limit) notes = notes.slice(0, integer(args.limit, 'limit'));
                return renderList(state, project, notes);
            },
        },

        {
            name: 'annotepage_read_note',
            title: 'Read a note',
            description:
                'One note and its complete thread, resolved or not. It carries the '
                + 'path of the page, the CSS selector of the element aimed at (key '
                + '"element") and the visible text of that element at the time of the '
                + 'remark (key "excerpt"): that is enough to find the element again '
                + 'in the sources, even if the page has moved since.\n\n'
                + 'Same grammar as the list of open notes.'
                + CARRIES_ITS_OWN_PROJECT,
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'The number of the note, as '
                        + 'the "note" line shows it.' },
                    project: PROJECT_ARG,
                    api: API_ARG,
                    key: KEY_ARG,
                    origin: ORIGIN_ARG,
                },
                required: ['id'],
                additionalProperties: false,
            },
            call: async (args) => {
                const { project, state } = await stateOf(args);
                const id = integer(args.id, 'id');
                const found = findNote(state, id);
                if (!found) {
                    return 'No note ' + id + ' in this project.\n'
                        + (state.footer.skipped
                            ? 'Careful: ' + state.footer.skipped + ' note(s) of this '
                              + 'project could not be read. It may be one of them.\n'
                            : '');
                }
                // A reply is read inside its parent's thread: pulling it out
                // alone would give a text without what it comments on.
                return renderList(state, project, [found.parent || found.note], {});
            },
        },

        {
            name: 'annotepage_reply',
            title: 'Reply to a note',
            description:
                'Writes a reply into the thread of a note. This is how an assistant '
                + 'says what it understood, what it changed, or why it is changing '
                + 'nothing.\n\n'
                + 'The reply is SIGNED with the name declared in the local '
                + 'configuration: the human reviewer sees who is speaking. On the '
                + '"api" + "key" path there is no file to declare one, and the '
                + 'reply is signed "assistant".\n\n'
                + 'NOTHING IS EVER ERASED IN THIS TOOL. A reply once written stays, '
                + 'it cannot be edited and it cannot be deleted. The thread has one '
                + 'depth only: you reply to a note, never to a reply.'
                + CARRIES_ITS_OWN_PROJECT,
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'The number of the note being '
                        + 'replied to. Not the number of a reply.' },
                    text: { type: 'string', description: 'The text of the reply. It '
                        + 'will be read by a human on the annotated page.' },
                    project: PROJECT_ARG,
                    api: API_ARG,
                    key: KEY_ARG,
                    origin: ORIGIN_ARG,
                },
                required: ['id', 'text'],
                additionalProperties: false,
            },
            call: async (args) => {
                const { project, state } = await stateOf(args);
                const id = integer(args.id, 'id');
                await reply(project, state, id, args.text);
                return 'Reply written in the thread of note ' + id + ', signed "'
                    + project.author + '".\nIt can no longer be edited or deleted.\n';
            },
        },

        {
            name: 'annotepage_mark_resolved',
            title: 'Mark a note resolved',
            description:
                'Marks a note resolved and STAMPS THE VERSION the fix ships in. This '
                + 'is the gesture that closes the review loop.\n\n'
                + 'The version matters, and it has a visible consequence on the page: '
                + 'the client compares the version of the fix with the one the site '
                + 'declares it is serving. Fix newer than the site: the note STAYS '
                + 'under the reviewer\'s eyes, because the defect is still on screen. '
                + 'Fix already online: the note moves into folded history. Empty '
                + 'version: the fix is taken as not deployed, and the note stays '
                + 'visible.\n\n'
                + 'Only mark resolved a note whose fix you have REALLY applied. A '
                + 'note closed by mistake leaves the list of what is left to do, and '
                + 'nobody reads it again. It can be reopened, but somebody has to '
                + 'notice the mistake first.'
                + CARRIES_ITS_OWN_PROJECT,
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'The number of the note that '
                        + 'was fixed.' },
                    version: {
                        type: 'string',
                        description: 'The version the fix ships in, as the site names '
                            + 'it (for example "1.4.13"). Empty string if it is not '
                            + 'known: the note will then stay visible on the page, '
                            + 'which is the intended behaviour as long as the fix is '
                            + 'not deployed.',
                    },
                    project: PROJECT_ARG,
                    api: API_ARG,
                    key: KEY_ARG,
                    origin: ORIGIN_ARG,
                },
                required: ['id', 'version'],
                additionalProperties: false,
            },
            call: async (args) => {
                const { project, state } = await stateOf(args);
                const id = integer(args.id, 'id');
                const version = String(args.version == null ? '' : args.version).trim();
                await markResolved(project, state, id, version);
                return 'Note ' + id + ' marked resolved by "' + project.author + '"'
                    + (version ? ', in version ' + version : ', with no version declared')
                    + '.\n'
                    + (version
                        ? 'It will move into folded history as soon as the site serves '
                          + 'this version or a newer one.\n'
                        : 'With no version, the fix is taken as not deployed: the note '
                          + 'stays visible on the page.\n');
            },
        },

        {
            name: 'annotepage_reopen',
            title: 'Reopen a note',
            description:
                'Cancels the "resolved" mark of a note, on the day the fix turns out '
                + 'to be incomplete. The remark comes back under the reviewer\'s eyes '
                + 'WITH its reply thread: the note is not recreated, and what has been '
                + 'said is not lost.\n\n'
                + 'Reopening writes no name: we do not ask who signs in order to '
                + 'cancel a fix.'
                + CARRIES_ITS_OWN_PROJECT,
            schema: {
                type: 'object',
                properties: {
                    id: { type: 'integer', description: 'The number of the note to '
                        + 'reopen.' },
                    project: PROJECT_ARG,
                    api: API_ARG,
                    key: KEY_ARG,
                    origin: ORIGIN_ARG,
                },
                required: ['id'],
                additionalProperties: false,
            },
            call: async (args) => {
                const { project, state } = await stateOf(args);
                const id = integer(args.id, 'id');
                await reopen(project, state, id);
                return 'Note ' + id + ' reopened. Its reply thread is intact.\n';
            },
        },

        {
            name: 'annotepage_export',
            title: 'Complete export',
            description:
                'ALL the notes of the project, resolved ones included, in the grammar '
                + 'of the four margins. This is the document you read from end to end '
                + 'to take stock of a review, and it is exactly what "curl '
                + '?action=text" would return if the project were not encrypted.\n\n'
                + 'The header says how many notes there are, and whether the project '
                + 'is encrypted, plain, or "mixed" — an installation that changed its '
                + 'mind along the way.'
                + CARRIES_ITS_OWN_PROJECT,
            schema: {
                type: 'object',
                properties: {
                    project: PROJECT_ARG,
                    api: API_ARG,
                    key: KEY_ARG,
                    origin: ORIGIN_ARG,
                    status: {
                        type: 'string',
                        enum: ['all', 'open', 'resolved'],
                        description: 'Filter by status. "all" by default.',
                    },
                },
                additionalProperties: false,
            },
            call: async (args) => {
                const { project, state } = await stateOf(args);
                const what = args.status || 'all';
                if (what === 'all') return filledExport(state, project);
                const keep = what === 'open' ? isOpen : (n) => !isOpen(n);
                return renderList(state, project, state.notes.filter(keep));
            },
        },

        {
            name: 'annotepage_save_project',
            title: 'Remember a private project on this machine',
            description:
                'Writes a project into the configuration file of THIS machine, so '
                + 'that every later call finds it by the name of its site. Use it '
                + 'when somebody reviews several sites: one call per site, once, '
                + 'and afterwards they name the site they are looking at and nothing '
                + 'else.\n\n'
                + 'SAY THIS BEFORE CALLING IT, once, and then do as they ask. '
                + 'Writing the file themselves is better, and so is passing the key '
                + 'in the command that starts this server (ANNOTEPAGE_KEY): a key '
                + 'given here has travelled through the conversation, which means '
                + 'through a model provider\'s logs, and this format has no key '
                + 'rotation -- the only repair is a fresh project, abandoning the '
                + 'notes already written. Whoever accepts that has weighed it; do '
                + 'not weigh it a second time for them.\n\n'
                + 'It writes a file to disk, at 600, holding the key in clear. '
                + 'Nothing is sent anywhere: no request is made by this call.\n\n'
                + 'An existing project is not replaced unless "replace" is passed: '
                + 'a new key on an old name hides every note written under the old '
                + 'one. They stay there, still encrypted, and nothing points at them '
                + 'any more.',
            schema: {
                type: 'object',
                properties: {
                    site: {
                        type: 'string',
                        description: 'The site the notes are about, as somebody says '
                            + 'it: "staging.example.com", or the address of a page on '
                            + 'it. It becomes the NAME of the project and the origin '
                            + 'announced to the server, which a relay requires in '
                            + 'order to accept a write.',
                    },
                    api: API_ARG,
                    key: KEY_ARG,
                    author: {
                        type: 'string',
                        description: 'The name replies and fixes are signed with, '
                            + 'under the reviewers\' eyes. "Assistant" if not given.',
                    },
                    mode: {
                        type: 'string',
                        enum: ['encrypted', 'plain'],
                        description: 'The project\'s mode, decided when it was set '
                            + 'up. Encrypted unless said otherwise.',
                    },
                    id: {
                        type: 'string',
                        description: 'The project id, in plain mode only, where '
                            + 'there is no key to derive it from.',
                    },
                    read_only: {
                        type: 'boolean',
                        description: 'True cuts every write for this project: no '
                            + 'reply, no resolve, no reopening.',
                    },
                    replace: {
                        type: 'boolean',
                        description: 'Replace a project of the same name that is '
                            + 'already declared with another key. Read the last '
                            + 'paragraph above before passing it.',
                    },
                    path: {
                        type: 'string',
                        description: 'Where to write, when it must not be the file '
                            + 'already in use nor the default one.',
                    },
                },
                required: ['site', 'api'],
                additionalProperties: false,
            },
            call: async (args) => {
                const written = await saveProject(configuration, args);
                let out = 'project ' + written.name + '\n';
                out += '  id ' + written.id + '\n';
                out += '  written to ' + written.path + '\n';
                out += '  permissions 600, this machine only\n';
                out += '  ' + (written.replaced ? 'replaced an earlier declaration'
                    : 'new declaration') + '\n';
                out += '  ' + (written.inUse
                    ? 'in use now, with no restart'
                    : 'NOT in use: ANNOTEPAGE_API is set, so the environment '
                      + 'describes the project and this file is not read. Unset '
                      + 'that variable to use what was just written') + '\n';
                out += '\ndeclared ' + [...configuration.projects.keys()].join(', ') + '\n';
                /* The id, never the key: it is what tells one project from
                   another, it is already public, and one mechanism fewer is one
                   mechanism fewer to get wrong (config.mjs, decision 3). */
                out += '\nTell them the id above so they can check it against the '
                    + 'one their setup screen shows. The key itself is not repeated '
                    + 'here and must not be repeated anywhere.\n';
                return out;
            },
        },

        {
            name: 'annotepage_projects',
            title: 'Projects and server state',
            description:
                'What the local configuration declares, and the state of the server '
                + 'hosting the notes: PHP version, extensions, database reachable, '
                + 'table present. Call it when another command fails without anyone '
                + 'understanding why.\n\n'
                + 'The key never appears there, in any form, not even truncated. '
                + 'What identifies a project is its id, which is already public — '
                + 'so calling this with "api" and "key" reports the id THEY derive, '
                + 'which is how a key is checked before anything is written.'
                + CARRIES_ITS_OWN_PROJECT,
            schema: {
                type: 'object',
                properties: {
                    project: PROJECT_ARG,
                    api: API_ARG,
                    key: KEY_ARG,
                    origin: ORIGIN_ARG,
                    server: {
                        type: 'boolean',
                        description: 'Question the server as well '
                            + '(?action=diagnostic). False by default: it makes a '
                            + 'network request.',
                    },
                },
                additionalProperties: false,
            },
            call: async (args) => {
                /* The file may be absent, and that is no longer fatal: a call
                   carrying its own api and key needs nothing from it. We say
                   what happened to it rather than printing an empty list. */
                let out = configuration.path
                    ? 'configuration ' + configuration.path + '\n'
                    : 'configuration none\n'
                      + (configuration.error
                          ? '  ' + configuration.error.message.replace(/\n/g, '\n  ') + '\n'
                          : '');
                for (const [name, p] of configuration.projects) {
                    out += '\nproject ' + name + '\n';
                    out += '  id ' + p.id + '\n';
                    out += '  api ' + p.api + '\n';
                    out += '  mode ' + p.mode + '\n';
                    out += '  key ' + (p.keys ? 'present' : 'absent') + '\n';
                    out += '  author ' + (p.author || '(none: writing refused)') + '\n';
                    out += '  writing ' + (p.read_only ? 'read only'
                        : (p.author ? 'allowed' : 'refused, for want of a name')) + '\n';
                    if (p.origin) out += '  origin ' + p.origin + '\n';
                    if (configuration.defaultProject === name) out += '  default yes\n';
                }
                for (const word of configuration.warnings) {
                    out += '\nwarning ' + word.replace(/\n/g, '\n  ') + '\n';
                }
                /* An "api" + "key" call is also how one CHECKS a key: the id
                   it derives is what tells one key from another, and it is
                   already public (see decision 3 of config.mjs). The key
                   itself is not echoed back, in any form. */
                if (args.api !== undefined || args.key !== undefined
                    || args.origin !== undefined) {
                    const project = await projectForCall(configuration, args);
                    out += '\nproject ' + project.name + '\n';
                    out += '  id ' + project.id + '\n';
                    out += '  api ' + project.api + '\n';
                    out += '  mode ' + project.mode + '\n';
                    out += '  key given with this call, derived, and forgotten '
                        + 'when it returns\n';
                    out += '  author ' + project.author + '\n';
                    out += '  origin ' + (project.origin
                        ? project.origin
                        : 'none announced: a relay will refuse a write') + '\n';
                    out += '  written to disk no\n';
                }
                if (args.server) {
                    const project = await projectForCall(configuration, args);
                    out += '\ndiagnostic ' + project.api + '\n\n';
                    out += await readDiagnostic(project);
                }
                return out;
            },
        },
    ];
};
