#!/usr/bin/env node
/* annotepage.mjs — THE COMMAND-LINE UTILITY.
 *
 * IT EXISTS SO THAT THE MCP IS NOT COMPULSORY.
 *
 * In plain mode, reading from a distance already works with nothing installed:
 *
 *     curl 'https://site/notes/api.php?action=text&project=<id>'
 *
 * That is the simple path, and it must never break: it is what makes the tool
 * usable by any assistant, with no integration, no package, no declaration. In
 * ENCRYPTED mode, that same address returns nothing but the structure — the
 * server has neither the paths, nor the names, nor the texts. One step is
 * missing, and only one: decryption.
 *
 * This utility is that step, in one command:
 *
 *     annotepage text
 *
 * It writes on standard output exactly what "curl" would have returned if the
 * project were not encrypted — same grammar, same margins, same keys. You can
 * redirect it into a file, hand it to an assistant, read it. FORMAT.md section
 * 5.3 calls that "the second producer"; here it is.
 *
 * EVERYTHING GOES OUT ON STDOUT, ERRORS ON STDERR, and the exit code is zero
 * or non-zero. That is what a pipe expects.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadConfiguration, chooseProject, ConfigError } from './src/config.mjs';
import {
    retrieve, filledExport, findNote, isOpen,
    reply, markResolved, reopen, UsageError,
} from './src/notes.mjs';
import { writeExport } from './src/text-export.mjs';
import { readDiagnostic, readRawExport, ApiError } from './src/api.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const version = () => {
    try {
        return JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
    } catch (e) {
        return 'unknown';
    }
};

const HELP = `annotepage ` + version() + ` — read and answer review notes.

  annotepage text               the complete export, decrypted, on standard output
  annotepage open               only the notes still to be fixed
  annotepage note <id>          one note and its thread
  annotepage reply <id> <text>
  annotepage resolve <id> <version>      empty version: write ""
  annotepage reopen <id>
  annotepage id                 the project id derived from the salt
  annotepage raw                what the server sends, without decrypting
  annotepage diagnostic         the state of the server
  annotepage projects           what the configuration declares

Options:
  --project <name>  when the configuration declares several
  --page <path>     with "open": keep one page only
  --config <file>   failing that: $ANNOTEPAGE_CONFIG, ./.annotepage.json,
                    ~/.config/annotepage/annotepage.json

The configuration file carries the project SALT. It is never committed:
whoever reads it reads every note, and there is no salt rotation.

In plain mode this utility is not needed:
  curl '<api>?action=text&project=<id>'
already returns the same document. The MCP and this utility are additions.
`;

/* A twenty-line argument parser rather than a dependency. This package holds
   the salt: every dependency is third-party code in the same process, and the
   project's security decision says the real risk is the supply chain. */
const parse = (argv) => {
    const options = {};
    const positional = [];
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const equals = a.indexOf('=');
            if (equals !== -1) {
                options[a.slice(2, equals)] = a.slice(equals + 1);
            } else {
                options[a.slice(2)] = argv[i + 1] !== undefined
                    && !argv[i + 1].startsWith('--') ? argv[++i] : true;
            }
        } else {
            positional.push(a);
        }
    }
    return { options, positional };
};

const integer = (value, what) => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) {
        throw new UsageError('The field "' + what + '" expects a note number. '
            + 'Received: ' + String(value));
    }
    return n;
};

const filter = (state, project, notes) =>
    writeExport({
        format: state.header.format,
        version: state.header.version,
        project: state.header.project || project.id,
        encryption: state.header.encryption,
    }, notes, state.footer);

const main = async () => {
    const { options, positional } = parse(process.argv.slice(2));
    const command = positional[0];

    if (!command || options.help || command === 'help') {
        process.stdout.write(HELP);
        return 0;
    }

    const configuration = await loadConfiguration(
        typeof options.config === 'string' ? options.config : null);

    /* Warnings go on STDERR: "annotepage text > notes.txt" must produce a file
       containing nothing but the export. A warning mixed into the export would
       make it one more note, with a margin nobody expects. */
    for (const word of configuration.warnings) {
        process.stderr.write('warning: ' + word + '\n');
    }

    if (command === 'projects') {
        process.stdout.write('configuration ' + configuration.path + '\n');
        for (const [name, p] of configuration.projects) {
            process.stdout.write('\nproject ' + name + '\n');
            process.stdout.write('  id ' + p.id + '\n');
            process.stdout.write('  api ' + p.api + '\n');
            process.stdout.write('  mode ' + p.mode + '\n');
            process.stdout.write('  salt ' + (p.keys ? 'present' : 'absent') + '\n');
            process.stdout.write('  author ' + (p.author || '(none)') + '\n');
            process.stdout.write('  writing ' + (p.read_only ? 'read only'
                : (p.author ? 'allowed' : 'refused, for want of a name')) + '\n');
            if (p.origin) process.stdout.write('  origin ' + p.origin + '\n');
            if (configuration.defaultProject === name) process.stdout.write('  default yes\n');
        }
        return 0;
    }

    const project = chooseProject(configuration,
        typeof options.project === 'string' ? options.project : null);

    if (command === 'id') {
        /* What you need in order to build a "curl" URL by hand. It is the id,
           never the salt: one is a public bearer token, the other is every
           note there is. */
        process.stdout.write(project.id + '\n');
        return 0;
    }

    if (command === 'diagnostic') {
        process.stdout.write(await readDiagnostic(project));
        return 0;
    }

    if (command === 'raw') {
        // What the server sends, without decrypting: useful to compare with
        // what "curl" returns, and to check that we are talking to the same
        // server as the browser.
        process.stdout.write(await readRawExport(project));
        return 0;
    }

    /* Refused BEFORE the first network call. Reopening records no author and no
       reason -- that is deliberate -- so a reason handed on the command line
       would be accepted and thrown away. Losing silently what somebody took the
       trouble to write is worse than refusing it, and refusing it after a round
       trip would make the user wait to be told no. */
    if (command === 'reopen' && positional[2] !== undefined) {
        throw new UsageError(
            'Reopening records no reason, so this one would be dropped.\n'
            + 'Write it in the thread first, where it is kept and signed:\n'
            + '  annotepage reply ' + positional[1] + ' "' + String(positional[2]).slice(0, 50) + '"\n'
            + '  annotepage reopen ' + positional[1]);
    }

    const state = await retrieve(project);

    switch (command) {
        case 'text':
            process.stdout.write(filledExport(state, project));
            return 0;

        case 'open': {
            let notes = state.notes.filter(isOpen);
            if (typeof options.page === 'string') {
                notes = notes.filter((n) => n.page === options.page);
            }
            process.stdout.write(filter(state, project, notes));
            return 0;
        }

        case 'note': {
            const id = integer(positional[1], 'id');
            const found = findNote(state, id);
            if (!found) {
                process.stderr.write('No note ' + id + ' in this project.\n');
                return 1;
            }
            process.stdout.write(filter(state, project, [found.parent || found.note]));
            return 0;
        }

        case 'reply': {
            const id = integer(positional[1], 'id');
            const text = positional.slice(2).join(' ');
            await reply(project, state, id, text);
            process.stdout.write('Reply written in the thread of note ' + id
                + ', signed "' + project.author + '".\n');
            return 0;
        }

        case 'resolve': {
            const id = integer(positional[1], 'id');
            if (positional[2] === undefined) {
                throw new UsageError(
                    'The version is missing. Write it, or "" if it is not known:\n'
                    + '  annotepage resolve ' + id + ' 1.4.13\n'
                    + '  annotepage resolve ' + id + ' ""\n'
                    + 'With no version, the fix is taken as not deployed and the note '
                    + 'stays visible on the page. That is a choice, not an oversight.');
            }
            await markResolved(project, state, id, positional[2]);
            process.stdout.write('Note ' + id + ' marked resolved by "'
                + project.author + '"'
                + (positional[2] ? ', in version ' + positional[2]
                                 : ', with no version declared') + '.\n');
            return 0;
        }

        case 'reopen': {
            const id = integer(positional[1], 'id');
            await reopen(project, state, id);
            process.stdout.write('Note ' + id + ' reopened. Its thread is intact.\n');
            return 0;
        }

        default:
            process.stderr.write('Unknown command: ' + command + '\n\n' + HELP);
            return 2;
    }
};

main()
    .then((code) => { process.exitCode = code; })
    .catch((e) => {
        if (e instanceof ConfigError || e instanceof UsageError
            || e instanceof ApiError) {
            process.stderr.write('\n' + e.message + '\n\n');
            process.exitCode = 1;
            return;
        }
        process.stderr.write('\n' + ((e && e.stack) || String(e)) + '\n\n');
        process.exitCode = 1;
    });
