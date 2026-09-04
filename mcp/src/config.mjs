/* config.mjs — WHERE THE KEY SLEEPS ON THIS MACHINE.
 *
 * The key is the project's only secret, and FORMAT.md section 1.1 says it
 * without detour: lost key = lost notes, copied key = read notes. In the
 * browser it lives in localStorage; here it lives in a file, and a file gets
 * committed by accident.
 *
 * THREE DECISIONS, AND THEIR REASONS:
 *
 *  1. THE FILE IS NEVER COMMITTED. The default name starts with a dot and the
 *     setup writes a line into .gitignore; that is not enough, and the only
 *     measure that holds is to say so, here and in the README. A key in a
 *     public repository is a project to start over — there is no key rotation
 *     (FORMAT.md section 8.2).
 *
 *  2. THE FILE PERMISSIONS ARE CHECKED, and a file readable by the other users
 *     of the machine raises a WARNING, never a refusal. Refusing would block a
 *     review for a reason the tool cannot judge in its owner's place — a
 *     container with a single account, for instance. Warning leaves the choice
 *     to whoever knows.
 *
 *  3. THE KEY IS NEVER DISPLAYED. Not in an error message, not in the
 *     diagnostic, not in the list of projects, not truncated "to check". What
 *     we display in order to check that we hold the right key is the PROJECT
 *     ID it produces: it is already public, it is exactly what tells one key
 *     from another, and one mechanism less is one mechanism less to implement
 *     wrong (FORMAT.md section 1.2).
 *
 * Plain mode is entitled to a configuration WITH NO key: the row is readable
 * in the database, "curl ?action=text" is enough, and demanding a secret to
 * read what is not encrypted would make this package a compulsory step. It
 * must not be one. We then ask for the project id directly, since it can no
 * longer be derived.
 *
 *  4. THE FILE IS NOT THE ONLY WAY TO GIVE THE KEY, and it must not be the
 *     one we ask for first. Plugging an MCP server in is already a command run
 *     once -- `claude mcp add ... -- npx annotepage-mcp` -- so the key rides in
 *     THAT command, as an environment variable, and there is no second step and
 *     nothing to quit. See projectFromEnvironment below. It stays on the
 *     operator's machine, exactly like the file, and it never enters the
 *     conversation. The file remains, for several projects and for whoever
 *     prefers not to have a key in a shell history.
 *
 * AND THE FILE IS NO LONGER THE ONLY WAY IN. A project whose key is
 * written in its own page (data-key, FORMAT.md section 1.5) is public by
 * construction: the assistant reads the tag and passes the key per call, and
 * this file is neither required nor read. See projectForCall at the bottom.
 * That path exists for keys that are ALREADY public and for no others — a key
 * out of a configuration file, pasted into a conversation, crosses a model
 * provider's logs and cannot be taken back, this format having no rotation.
 */

import { readFileSync, statSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve as resolvePath, join, dirname } from 'node:path';

import { ID_LENGTH, KEY_LENGTH } from './format.mjs';
import { keyFromText, derive } from './crypto.mjs';

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

/**
 * The project declared by the environment, or null.
 *
 * ANNOTEPAGE_API is what arms it: without an address there is no project, and
 * a lone key would silently borrow the address of a file meant for another
 * one. The rest is named exactly like the file's fields, so that a reader of
 * one understands the other.
 *
 * We build the same shape the file produces and hand it to the same checks.
 * Nothing is validated twice, and a variable that is wrong is refused with the
 * message a wrong field would have got.
 */
const projectFromEnvironment = () => {
    const value = (name) => {
        const raw = process.env[name];
        return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
    };
    const api = value('ANNOTEPAGE_API');
    if (api === undefined) return null;

    const name = value('ANNOTEPAGE_PROJECT') || 'project';
    const project = { api };
    const key = value('ANNOTEPAGE_KEY');
    if (key !== undefined) project.key = key;
    for (const [field, variable] of [
        ['id', 'ANNOTEPAGE_ID'],
        ['mode', 'ANNOTEPAGE_MODE'],
        ['author', 'ANNOTEPAGE_AUTHOR'],
        ['origin', 'ANNOTEPAGE_ORIGIN'],
    ]) {
        const found = value(variable);
        if (found !== undefined) project[field] = found;
    }
    /* Only the exact string turns writing off. Anything else -- "false", "0",
       "no", a typo -- leaves the tool able to write, which is the state the
       operator asked for by not asking for the other one. A read_only that
       switches itself on for a misspelling would be discovered as a mute
       assistant, and blamed on the server. */
    if (value('ANNOTEPAGE_READ_ONLY') === 'true') project.read_only = true;

    return {
        path: 'the ANNOTEPAGE_ environment variables',
        fromEnvironment: true,
        object: { default_project: name, projects: { [name]: project } },
    };
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
        + 'It contains the project key, that is to say every note.\n'
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
 *   keys (null in plain mode with no key).
 */
export const loadConfiguration = async (explicit) => {
    const paths = candidatePaths(explicit);
    /* THE ENVIRONMENT WINS OVER THE FILE, and it is the only order that does
       not surprise: a variable was typed by whoever is running this, now, in
       the command that started the server. A file was written some other day
       and forgotten. The other order would let a stale file quietly answer a
       question the operator has just answered themselves -- and the notes it
       reads would be another project's. We say when both exist. */
    const fromEnvironment = projectFromEnvironment();
    const found = fromEnvironment || readFile(paths);

    if (found === null) {
        throw new ConfigError(
            'No configuration found.\n\n'
            + 'Either declare the project in the command that plugs this server in:\n'
            + '  ANNOTEPAGE_API   the address of api.php, the one the browser uses\n'
            + '  ANNOTEPAGE_KEY   the 43 characters of the project key\n'
            + '  ANNOTEPAGE_AUTHOR  the name replies are signed with\n'
            + '  ANNOTEPAGE_ORIGIN  the site the notes are about, facing a relay\n\n'
            + 'Or write a file. Looked for, in order:\n'
            + paths.map((c) => '  ' + c).join('\n')
            + '\n\nStart from the annotepage.example.json template shipped with this '
            + 'package.\nThe file contains the project key: never commit it.');
    }

    const { path, object } = found;
    const warnings = [];
    if (!found.fromEnvironment) {
        const permissions = permissionsWarning(path);
        if (permissions) warnings.push(permissions);
    } else {
        const file = readFile(paths);
        if (file) {
            warnings.push(
                'ANNOTEPAGE_API is set, so the environment describes the project and '
                + 'the file ' + file.path + ' was NOT read.\n'
                + 'Unset the variable to go back to the file.');
        }
    }

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

        if (raw.key !== undefined && raw.key !== null && String(raw.key) !== '') {
            const bytes = keyFromText(raw.key);
            if (bytes === null) {
                throw new ConfigError(
                    'The key of ' + where + ' does not have the expected shape: 43 '
                    + 'characters taken from A-Z a-z 0-9 - _ , with no space and no '
                    + 'decorative dash.\n'
                    + 'We do not "clean" it: a key that is almost right gives a wrong '
                    + 'project id, and the error would then read as an unknown project.');
            }
            keys = await derive(bytes);
            id = keys.id;

            /* Checking a pasted key, FORMAT.md section 1.2: if the
               configuration ALSO declares an id, the two must agree. It is the
               only check possible without the network, and it catches by far
               the most common case — two projects, two keys, copied in the
               wrong order. */
            if (raw.id !== undefined && String(raw.id).trim() !== ''
                && String(raw.id).trim() !== id) {
                throw new ConfigError(
                    'The key of ' + where + ' does not produce the id declared next '
                    + 'to it.\nDeclared id : ' + String(raw.id).trim()
                    + '\nId of the key : ' + id
                    + '\nThis key is not the key of this project. No request was made.');
            }
        } else if (mode === 'plain') {
            /* Plain mode with no key: read-only, and by "curl" if you like.
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
                'The "key" field is missing in ' + where + '.\n'
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

    /* Same judge as the configuration file and as the browser: keyFromText.
       We do not "clean" a key that is almost right — it would derive a wrong
       project id, and the server would answer "unknown project" for what
       looks like the right key. */
    const bytes = keyFromText(key);
    if (bytes === null) {
        throw new ConfigError(
            'The "key" of this call does not have the expected shape: 43 characters '
            + 'taken from A-Z a-z 0-9 - _ , with no space and no decorative dash.\n'
            + 'Received: ' + String(key).length + ' characters'
            + (String(key).length === KEY_LENGTH
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


/* -- WRITING A PROJECT DOWN --------------------------------------------- */

/**
 * What a human calls a site, turned into an origin.
 *
 * canonicalOrigin below is deliberately strict: it is what we announce to a
 * server, and a path silently cut off would announce a site nobody named.
 * Here we are reading what a person typed -- "staging.example.com",
 * "https://staging.example.com/guide" -- so a missing scheme and a path are
 * expected, and dropping them is the point rather than a risk.
 */
export const siteToOrigin = (text) => {
    const raw = String(text == null ? '' : text).trim();
    if (raw === '' || raw.length > 255) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
    let url;
    try {
        url = new URL(withScheme);
    } catch (e) {
        return null;
    }
    return canonicalOrigin(url.origin);
};

/**
 * Writes a project into the configuration file on this machine, and returns
 * what happened. It does NOT decide whether it should have been called: see
 * the tool description in mcp-tools.mjs.
 *
 * THE PROJECT IS NAMED AFTER ITS SITE, and that is the whole ergonomics of
 * several projects: an operator says "staging.example.com" because that is
 * what they are looking at, and nobody has to remember that it was called
 * "review-2". chooseProject reads a host as a name for the same reason.
 *
 * AN EXISTING PROJECT IS NOT OVERWRITTEN unless asked twice. Replacing a key
 * hides every note written under the old one -- they are still there, still
 * encrypted, and nothing points at them any more.
 */
export const saveProject = async (configuration, wanted) => {
    const origin = siteToOrigin(wanted.site);
    if (origin === null) {
        throw new ConfigError(
            'The site is not readable as an address: ' + String(wanted.site) + '\n'
            + 'Expected something like "staging.example.com" or '
            + '"https://staging.example.com".');
    }
    const name = new URL(origin).host;

    const api = String(wanted.api == null ? '' : wanted.api).trim();
    if (!/^https?:\/\//i.test(api)) {
        throw new ConfigError(
            'The address of the server must start with http:// or https:// : ' + api
            + '\nIt is the "data-server" attribute of the annotepage tag, copied as '
            + 'it stands.');
    }

    const mode = wanted.mode === undefined ? 'encrypted' : String(wanted.mode);
    if (mode !== 'plain' && mode !== 'encrypted') {
        throw new ConfigError('The mode expects "plain" or "encrypted". Received: ' + mode);
    }

    const project = { api, mode, origin };
    let id;
    if (mode === 'encrypted' || (wanted.key !== undefined && String(wanted.key) !== '')) {
        const bytes = keyFromText(wanted.key);
        if (bytes === null) {
            throw new ConfigError(
                'The key does not have the expected shape: 43 characters taken from '
                + 'A-Z a-z 0-9 - _ , with no space and no decorative dash.\n'
                + 'Nothing was written. We do not "clean" it: a key that is almost '
                + 'right gives a wrong project id, and the error would then read as '
                + 'an unknown project.');
        }
        id = (await derive(bytes)).id;
        project.key = String(wanted.key).trim();
    } else {
        id = requireText(wanted.id, 'id', 'this call');
        if (id.length !== ID_LENGTH) {
            throw new ConfigError(
                'The id is ' + id.length + ' characters long; it needs ' + ID_LENGTH + '.');
        }
        project.id = id;
    }

    project.author = typeof wanted.author === 'string' && wanted.author.trim() !== ''
        ? wanted.author.trim() : 'Assistant';
    if (wanted.read_only === true) project.read_only = true;

    /* Where it goes: the file already in use if there is one, so a second
       project joins the first instead of starting a rival file somewhere else.
       Otherwise the place a configuration is looked for that is not the
       working directory -- a file in a repository gets committed. */
    const paths = candidatePaths(wanted.path);
    const existing = readFile(paths);
    const target = existing ? existing.path
        : (wanted.path ? resolvePath(wanted.path)
           : join(homedir() || '.', '.config', 'annotepage', 'annotepage.json'));

    const object = existing && existing.object && typeof existing.object === 'object'
        ? existing.object : {};
    if (!object.projects || typeof object.projects !== 'object') object.projects = {};

    const before = object.projects[name];
    if (before !== undefined && wanted.replace !== true) {
        const same = before.key !== undefined
            && String(before.key).trim() === project.key;
        if (!same) {
            throw new ConfigError(
                'The project "' + name + '" is already declared in ' + target
                + ', with another key.\n'
                + 'Nothing was written. Replacing it hides every note written under '
                + 'the old key: they stay there, still encrypted, and nothing points '
                + 'at them any more.\n'
                + 'Call again with "replace" set to true if that is what you mean.');
        }
    }

    object.projects[name] = project;
    if (Object.keys(object.projects).length === 1) object.default_project = name;

    /* Written beside the target and moved onto it: a file half rewritten is a
       configuration nobody can reread, and this one holds every key. */
    const temporary = target + '.' + process.pid + '.new';
    try {
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        writeFileSync(temporary, JSON.stringify(object, null, 2) + '\n', { mode: 0o600 });
        renameSync(temporary, target);
    } catch (e) {
        try { unlinkSync(temporary); } catch (ignored) { /* nothing to clean */ }
        throw new ConfigError(
            'Could not write ' + target + ': ' + e.message + '\nNothing was changed.');
    }

    /* THE SERVER READ ITS CONFIGURATION ONCE, AT STARTUP. Without this the
       project just written would answer nothing until somebody restarted the
       assistant -- which is exactly the second step this tool exists to
       remove. We reload in place, into the same object every tool holds. */
    const reloaded = await loadConfiguration(wanted.path || target);
    configuration.path = reloaded.path;
    configuration.warnings = reloaded.warnings;
    configuration.defaultProject = reloaded.defaultProject;
    configuration.projects = reloaded.projects;
    configuration.error = null;

    /* AND THE FILE MAY NOT BE WHAT ANSWERS. When ANNOTEPAGE_API is set the
       environment describes the project and this file is not read -- see
       loadConfiguration. The write is real, the file is correct, and it does
       nothing until that variable goes away. Saying "saved" and stopping there
       would send somebody looking for a bug in their key. */
    const inUse = reloaded.projects.has(name);

    return { path: target, name, id, inUse, replaced: before !== undefined };
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
        const asked = String(name);
        const project = configuration.projects.get(asked);
        if (project) return project;

        /* A NAME AND A SITE ARE THE SAME THING HERE. The operator says
           "staging.example.com" or pastes the address of the page they are
           looking at, because that is what is in front of them; asking them to
           remember that it was declared as "review-2" is a chore we invented.
           saveProject names a project after its host for this reason, and an
           older file that used its own names still answers, through the origin
           it declares. */
        const host = siteToOrigin(asked);
        if (host !== null) {
            const wanted = new URL(host).host;
            const byName = configuration.projects.get(wanted);
            if (byName) return byName;
            const matching = [...configuration.projects.values()].filter(
                (p) => p.origin !== '' && new URL(p.origin).host === wanted);
            if (matching.length === 1) return matching[0];
            if (matching.length > 1) {
                throw new ConfigError(
                    'Several projects announce the site ' + wanted + ': '
                    + matching.map((p) => p.name).join(', ')
                    + '\nName the one you mean. Writing a note into the wrong project '
                    + 'cannot be undone.');
            }
        }

        throw new ConfigError(
            'Project unknown to the configuration: ' + name + '\n'
            + 'Declared: ' + [...configuration.projects.keys()].join(', '));
    }
    if (configuration.defaultProject) {
        return configuration.projects.get(configuration.defaultProject);
    }
    throw new ConfigError(
        'Several projects are declared and none is the default: name the one you '
        + 'are aiming at.\nDeclared: ' + [...configuration.projects.keys()].join(', '));
};
