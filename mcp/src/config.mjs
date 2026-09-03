/* config.mjs — WHERE THE SALT SLEEPS ON THIS MACHINE.
 *
 * The salt is the project's only secret, and FORMAT.md section 1.1 says it
 * without detour: lost salt = lost notes, copied salt = read notes. In the
 * browser it lives in localStorage; here it lives in a file, and a file gets
 * committed by accident.
 *
 * THREE DECISIONS, AND THEIR REASONS:
 *
 *  1. THE FILE IS NEVER COMMITTED. The default name starts with a dot and the
 *     setup writes a line into .gitignore; that is not enough, and the only
 *     measure that holds is to say so, here and in the README. A salt in a
 *     public repository is a project to start over — there is no salt rotation
 *     (FORMAT.md section 8.2).
 *
 *  2. THE FILE PERMISSIONS ARE CHECKED, and a file readable by the other users
 *     of the machine raises a WARNING, never a refusal. Refusing would block a
 *     review for a reason the tool cannot judge in its owner's place — a
 *     container with a single account, for instance. Warning leaves the choice
 *     to whoever knows.
 *
 *  3. THE SALT IS NEVER DISPLAYED. Not in an error message, not in the
 *     diagnostic, not in the list of projects, not truncated "to check". What
 *     we display in order to check that we hold the right salt is the PROJECT
 *     ID it produces: it is already public, it is exactly what tells one salt
 *     from another, and one mechanism less is one mechanism less to implement
 *     wrong (FORMAT.md section 1.2).
 *
 * Plain mode is entitled to a configuration WITH NO salt: the row is readable
 * in the database, "curl ?action=text" is enough, and demanding a secret to
 * read what is not encrypted would make this package a compulsory step. It
 * must not be one. We then ask for the project id directly, since it can no
 * longer be derived.
 *
 * AND THE FILE IS NO LONGER THE ONLY WAY IN. A project whose key is
 * written in its own page (data-key, FORMAT.md section 1.5) is public by
 * construction: the assistant reads the tag and passes the key per call, and
 * this file is neither required nor read. See projectForCall at the bottom.
 * That path exists for keys that are ALREADY public and for no others — a key
 * out of a configuration file, pasted into a conversation, crosses a model
 * provider's logs and cannot be taken back, this format having no rotation.
 */

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve as resolvePath, join } from 'node:path';

import { ID_LENGTH, SALT_LENGTH } from './format.mjs';
import { saltFromText, derive } from './crypto.mjs';

export class ConfigError extends Error {}

/**
 * Where we look, in order. The first one that exists wins, and we merge
 * nothing: two half-filled files produce a configuration nobody can reread.
 */
export const candidatePaths = (explicit) => {
    if (explicit) return [resolvePath(explicit)];
    if (process.env.ANNOTEPAGE_CONFIG) return [resolvePath(process.env.ANNOTEPAGE_CONFIG)];
    const home = homedir() || '.';
    return [
        resolvePath('.annotepage.json'),
        join(home, '.config', 'annotepage', 'annotepage.json'),
        join(home, '.annotepage.json'),
    ];
};

const readFile = (paths) => {
    for (const path of paths) {
        let raw;
        try {
            raw = readFileSync(path, 'utf8');
        } catch (e) {
            continue;
        }
        let object;
        try {
            object = JSON.parse(raw);
        } catch (e) {
            throw new ConfigError(
                'The file ' + path + ' is not valid JSON: ' + e.message
                + '\nNothing was read: a half-understood configuration would write '
                + 'notes into the wrong project.');
        }
        return { path, object };
    }
    return null;
};

/** Returns a warning, or null. See decision 2 in this file's header. */
const permissionsWarning = (path) => {
    if (process.platform === 'win32') return null;
    let state;
    try {
        state = statSync(path);
    } catch (e) {
        return null;
    }
    if ((state.mode & 0o077) === 0) return null;
    return 'The file ' + path + ' is readable by other accounts of this machine '
        + '(permissions ' + (state.mode & 0o777).toString(8) + ').\n'
        + 'It contains the project salt, that is to say every note.\n'
        + 'Fix with: chmod 600 ' + path;
};

const requireText = (value, what, where) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ConfigError(
            'The field "' + what + '" is missing, or is not a string, in ' + where + '.');
    }
    return value.trim();
};

/**
 * Loads the configuration and derives what comes out of it.
 *
 * Returns { path, warnings, defaultProject, projects: Map<name, project> }
 * where each project carries:
 *   name, api, id, mode, author, read_only,
 *   keys (null in plain mode with no salt).
 */
export const loadConfiguration = async (explicit) => {
    const paths = candidatePaths(explicit);
    const found = readFile(paths);

    if (found === null) {
        throw new ConfigError(
            'No configuration found. Looked for, in order:\n'
            + paths.map((c) => '  ' + c).join('\n')
            + '\n\nStart from the annotepage.example.json template shipped with this '
            + 'package.\nThe file contains the project salt: never commit it.');
    }

    const { path, object } = found;
    const warnings = [];
    const permissions = permissionsWarning(path);
    if (permissions) warnings.push(permissions);

    if (!object || typeof object !== 'object' || !object.projects
        || typeof object.projects !== 'object') {
        throw new ConfigError(
            'The file ' + path + ' must contain a "projects" object.\n'
            + 'See annotepage.example.json.');
    }

    const names = Object.keys(object.projects);
    if (names.length === 0) {
        throw new ConfigError(
            'The file ' + path + ' declares no project.');
    }

    const projects = new Map();
    for (const name of names) {
        const raw = object.projects[name];
        const where = 'the project "' + name + '" of ' + path;
        if (!raw || typeof raw !== 'object') {
            throw new ConfigError(where + ' is not an object.');
        }

        const api = requireText(raw.api, 'api', where);
        if (!/^https?:\/\//i.test(api)) {
            throw new ConfigError(
                'The address of ' + where + ' must start with http:// or https:// : ' + api);
        }
        /* http:// is accepted and NOT recommended. We do not refuse it: an
           internal staging site with no certificate exists, and that is
           precisely the kind of site one reviews. But we say it — in encrypted
           mode the content is protected, a payload travelling in the clear is
           still a payload an intermediary can hold or replay. */
        if (/^http:\/\//i.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(api)) {
            warnings.push(
                'The project "' + name + '" queries an unencrypted http:// address: '
                + api + '\nThe envelopes stay unreadable, the traffic does not.');
        }

        const mode = raw.mode === undefined ? 'encrypted' : String(raw.mode);
        if (mode !== 'plain' && mode !== 'encrypted') {
            throw new ConfigError(
                'The "mode" field of ' + where + ' expects "plain" or "encrypted". '
                + 'Received: ' + mode);
        }

        let keys = null;
        let id;

        if (raw.salt !== undefined && raw.salt !== null && String(raw.salt) !== '') {
            const bytes = saltFromText(raw.salt);
            if (bytes === null) {
                throw new ConfigError(
                    'The salt of ' + where + ' does not have the expected shape: 43 '
                    + 'characters taken from A-Z a-z 0-9 - _ , with no space and no '
                    + 'decorative dash.\n'
                    + 'We do not "clean" it: a salt that is almost right gives a wrong '
                    + 'project id, and the error would then read as an unknown project.');
            }
            keys = await derive(bytes);
            id = keys.id;

            /* Checking a pasted salt, FORMAT.md section 1.2: if the
               configuration ALSO declares an id, the two must agree. It is the
               only check possible without the network, and it catches by far
               the most common case — two projects, two salts, copied in the
               wrong order. */
            if (raw.id !== undefined && String(raw.id).trim() !== ''
                && String(raw.id).trim() !== id) {
                throw new ConfigError(
                    'The salt of ' + where + ' does not produce the id declared next '
                    + 'to it.\nDeclared id : ' + String(raw.id).trim()
                    + '\nId of the salt : ' + id
                    + '\nThis salt is not the salt of this project. No request was made.');
            }
        } else if (mode === 'plain') {
            /* Plain mode with no salt: read-only, and by "curl" if you like.
               We can then neither encrypt nor compute a page index — so
               neither write a new note nor reply. The message will say so at
               the moment one tries, not before. */
            id = requireText(raw.id, 'id', where);
            if (id.length !== ID_LENGTH) {
                throw new ConfigError(
                    'The id of ' + where + ' is ' + id.length
                    + ' characters long; it needs ' + ID_LENGTH + '.');
            }
        } else {
            throw new ConfigError(
                'The "salt" field is missing in ' + where + '.\n'
                + 'In encrypted mode it is indispensable: without it there is nothing '
                + 'to read, and there is no recovery (FORMAT.md section 1.1).');
        }

        projects.set(name, {
            name,
            api,
            id,
            mode,
            keys,
            /* The name the assistant signs what it writes with. It is REQUIRED
               as soon as writing is allowed: an unsigned remark in a thread
               where everybody signs casts doubt on the whole thread. */
            author: typeof raw.author === 'string' && raw.author.trim() !== ''
                ? raw.author.trim() : '',
            read_only: raw.read_only === true,
            /* The origin announced to the server. It is NOT optional facing a
               relay: FORMAT.md section 6.2 refuses every write there with no
               Origin header, because a browser always sends one and a write
               with no Origin therefore does not come from a page. We are not a
               page, and we say so by copying the origin of the site under
               review.
               That we can write this header by hand is exactly what makes the
               domain lock an ANTI-ABUSE measure and not an authentication.
               FORMAT.md section 6.2 writes it; this field demonstrates it. */
            origin: typeof raw.origin === 'string' && raw.origin.trim() !== ''
                ? raw.origin.trim().replace(/\/+$/, '') : '',
        });
    }

    let defaultProject = object.default_project;
    if (defaultProject !== undefined && !projects.has(String(defaultProject))) {
        throw new ConfigError(
            'The default project "' + defaultProject + '" is not declared in ' + path + '.');
    }
    if (defaultProject === undefined) defaultProject = names.length === 1 ? names[0] : null;

    return { path, warnings, defaultProject, projects };
};

/**
 * A configuration that could NOT be read, kept instead of thrown.
 *
 * Since a call can carry its own project (see projectForCall below), a missing
 * or broken file is no longer a reason to refuse to start: it is a reason to
 * refuse the calls that need the file. The error is kept whole and raised at
 * that moment, with the same words it would have had at startup.
 */
export const absentConfiguration = (error) => ({
    path: null,
    warnings: [],
    defaultProject: null,
    projects: new Map(),
    error,
});

/* The name an inline project answers to, and the name it signs with. Both are
   fixed: nothing on this path comes from a file, so there is nobody to ask.
   The signature is honest rather than flattering — a human reading the thread
   sees that an assistant wrote it, and no assistant is claiming a name it was
   never given. */
export const INLINE_PROJECT_NAME = '(this call)';
export const INLINE_AUTHOR = 'assistant';

/**
 * The text of an origin -> its canonical form, or null.
 *
 * THE RULE IS THE SERVER'S, ap_normalise_origin() in origins.php, and it is
 * restated here rather than invented: scheme and host, an explicit port only
 * when it is not the default, http or https, and NO path, query, fragment or
 * credentials. The server refuses rather than trims, because
 * "https://example.com/prod" and "https://example.com/staging" would otherwise
 * declare the same thing — so we refuse too, and say the shape.
 */
export const canonicalOrigin = (text) => {
    const raw = String(text == null ? '' : text).trim();
    if (raw === '' || raw.length > 255) return null;
    let url;
    try {
        url = new URL(raw);
    } catch (e) {
        return null;
    }
    const scheme = url.protocol.toLowerCase();
    if (scheme !== 'http:' && scheme !== 'https:') return null;
    if (url.username !== '' || url.password !== '') return null;
    if (url.search !== '' || url.hash !== '') return null;
    if (url.pathname !== '' && url.pathname !== '/') return null;
    if (url.hostname === '') return null;
    /* url.origin lowercases and drops the default port: the same canonical
       form the server computes before comparing. */
    return url.origin;
};

/**
 * A project built from ONE call's arguments, living exactly as long as that
 * call. Nothing is written to disk, no file is read, and the next call starts
 * from nothing again.
 *
 * THE ID IS DERIVED, NEVER DECLARED (FORMAT.md section 1.5). The key already
 * produces it, and accepting both would be accepting the same fact twice from
 * a place where the two can disagree.
 */
export const inlineProject = async (api, key, origin) => {
    if (!/^https?:\/\//i.test(api)) {
        throw new ConfigError(
            'The "api" of this call must start with http:// or https:// : ' + api
            + '\nIt is the "data-server" attribute of the annotepage tag, copied '
            + 'as it stands.');
    }

    /* Same judge as the configuration file and as the browser: saltFromText.
       We do not "clean" a key that is almost right — it would derive a wrong
       project id, and the server would answer "unknown project" for what
       looks like the right key. */
    const bytes = saltFromText(key);
    if (bytes === null) {
        throw new ConfigError(
            'The "key" of this call does not have the expected shape: 43 characters '
            + 'taken from A-Z a-z 0-9 - _ , with no space and no decorative dash.\n'
            + 'Received: ' + String(key).length + ' characters'
            + (String(key).length === SALT_LENGTH
                ? ', the right count, but not all of them from that alphabet' : '')
            + '.\n'
            + 'Copy the "data-key" attribute of the annotepage tag as it stands. '
            + 'Nothing was sent: a key that is almost right derives a wrong project '
            + 'id, and the error would come back as an unknown project.');
    }

    /* The Origin header, and it is not decoration: FORMAT.md section 6.2 has a
       relay refuse EVERY write that arrives without one. Reading works with no
       origin anywhere; replying and resolving do not. */
    let announced = '';
    if (origin !== undefined && origin !== null && String(origin).trim() !== '') {
        announced = canonicalOrigin(origin);
        if (announced === null) {
            throw new ConfigError(
                'The "origin" of this call is not an origin: ' + String(origin).trim()
                + '\nExpected scheme://host, with a port only when it is not the '
                + 'default, and NOTHING else — no path, no query string, no fragment, '
                + 'no credentials. For example "https://staging.example.com" or '
                + '"http://localhost:8080".\n'
                + 'It is the origin of the PAGE whose tag you read: take the scheme '
                + 'and the host of that address and drop the rest. We do not trim it '
                + 'for you — "https://example.com/prod" and "https://example.com/'
                + 'staging" are the same origin, and cutting one into the other in '
                + 'silence would announce a site nobody named.');
        }
    }

    const keys = await derive(bytes);
    return {
        name: INLINE_PROJECT_NAME,
        api,
        id: keys.id,
        mode: 'encrypted',
        keys,
        author: INLINE_AUTHOR,
        read_only: false,
        /* Announced only if the call said which site this is. We never invent
           one from the api address: they are two different domains by
           construction (FORMAT.md section 6.2), and a wrong origin is a 403
           the caller cannot explain. Same field as the configuration file's,
           read by the same two lines of api.mjs — there is one way to write
           this header, not two. */
        origin: announced,
        inline: true,
    };
};

/**
 * The project ONE call aims at: the one it carries, or the one the
 * configuration file declares.
 *
 * Three refusals here, and none of them is a fallback. A call that half
 * describes a project, or that describes two different ones, is a caller
 * error: we say which, and we read nothing and write nothing.
 */
export const projectForCall = async (configuration, args) => {
    const given = args || {};
    const api = given.api == null ? '' : String(given.api).trim();
    const key = given.key == null ? '' : String(given.key).trim();
    const origin = given.origin == null ? '' : String(given.origin).trim();
    const named = given.project == null ? '' : String(given.project).trim();

    if (api === '' && key === '' && origin === '') {
        return chooseProject(configuration, named);
    }

    const carried = ['api', 'key', 'origin']
        .filter((w) => ({ api, key, origin })[w] !== '')
        .map((w) => '"' + w + '"');
    const listed = carried.length === 1 ? carried[0]
        : carried.slice(0, -1).join(', ') + ' and ' + carried[carried.length - 1];

    /* Two answers to the same question. We do not pick a winner: writing a
       note into the wrong project cannot be undone, and nothing is ever
       erased in this tool. */
    if (named !== '') {
        throw new ConfigError(
            'This call names the project "' + named + '" of the configuration file '
            + 'AND carries its own ' + listed + '.\n'
            + 'Those are two different projects and we do not pick a winner. '
            + 'Nothing was read, nothing was written.\n'
            + 'Call again with "project" alone, or with "api" and "key" alone — '
            + 'the key already derives the project id, so it never needs a project '
            + 'name beside it.');
    }

    if (api === '' && key === '') {
        throw new ConfigError(
            'This call carries "origin" without "api" and "key".\n'
            + '"origin" describes a project, it does not name one: it is the site '
            + 'the notes are about, announced to the server so that a relay accepts '
            + 'a write (FORMAT.md section 6.2). Alone it points at nothing.\n'
            + 'Either add "api" and "key", both on the annotepage tag of the page '
            + '(data-server, data-key), or drop "origin" and let the configuration '
            + 'file answer.');
    }

    if (key === '') {
        throw new ConfigError(
            'This call carries "api" without "key".\n'
            + 'The two travel together: "api" says where the notes are stored, '
            + '"key" is what makes them readable and what the project id is derived '
            + 'from. There is no falling back to the configuration file for the '
            + 'missing half — an address paired with somebody else\'s key reads '
            + 'another project than the one you meant.\n'
            + 'Both are on the annotepage tag at the end of the annotated page: '
            + 'data-server and data-key.');
    }
    if (api === '') {
        throw new ConfigError(
            'This call carries "key" without "api".\n'
            + 'The two travel together: "key" makes the notes readable and derives '
            + 'the project id, "api" says which server holds them — and that one is '
            + 'derived from nothing. There is no falling back to the configuration '
            + 'file for the missing half.\n'
            + 'Both are on the annotepage tag at the end of the annotated page: '
            + 'data-server and data-key.');
    }

    return inlineProject(api, key, origin);
};

/**
 * Chooses the project aimed at. One single project declared: no need to name
 * it. Several: we demand the name, rather than take one "at random but always
 * the same" — writing a note into the wrong project cannot be undone, nothing
 * is ever erased in this tool.
 */
export const chooseProject = (configuration, name) => {
    /* The file could not be read, and this call needs it. The error waited
       here rather than stopping the server, because a call carrying its own
       api and key needs nothing from the file. */
    if (configuration.error && configuration.projects.size === 0) {
        throw configuration.error;
    }
    if (name) {
        const project = configuration.projects.get(String(name));
        if (!project) {
            throw new ConfigError(
                'Project unknown to the configuration: ' + name + '\n'
                + 'Declared: ' + [...configuration.projects.keys()].join(', '));
        }
        return project;
    }
    if (configuration.defaultProject) {
        return configuration.projects.get(configuration.defaultProject);
    }
    throw new ConfigError(
        'Several projects are declared and none is the default: name the one you '
        + 'are aiming at.\nDeclared: ' + [...configuration.projects.keys()].join(', '));
};
