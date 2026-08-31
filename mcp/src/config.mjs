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
 */

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve as resolvePath, join } from 'node:path';

import { ID_LENGTH } from './format.mjs';
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
 * Chooses the project aimed at. One single project declared: no need to name
 * it. Several: we demand the name, rather than take one "at random but always
 * the same" — writing a note into the wrong project cannot be undone, nothing
 * is ever erased in this tool.
 */
export const chooseProject = (configuration, name) => {
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
