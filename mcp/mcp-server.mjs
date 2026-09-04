#!/usr/bin/env node
/* mcp-server.mjs — THE ENTRY POINT OF THE MCP SERVER.
 *
 * It does three things, in this order, and the order matters:
 *
 *  1. it loads the local configuration — the one that carries the key —
 *     BEFORE opening the conversation. An MCP server that starts and then
 *     fails on every call gives an assistant that keeps retrying;
 *  2. it writes its warnings on STDERR, never on stdout. One byte too many on
 *     stdout breaks the protocol in the middle of a message;
 *  3. it serves.
 *
 * WE READ THE CONFIGURATION ONLY ONCE. Reloading on every call would be more
 * flexible and would mean that a key changed mid-conversation changes, without
 * a word, the project the assistant writes into.
 *
 * A MISSING OR BROKEN CONFIGURATION NO LONGER STOPS THE SERVER, and that is a
 * deliberate change: a call can now carry its own project — "api" and "key"
 * read off the annotepage tag of a public page — and refusing to start would
 * make a configuration file compulsory for a path that was built to need none.
 * The error is not swallowed: it goes to stderr at startup, word for word, and
 * it is raised again by the first call that actually needs the file.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadConfiguration, absentConfiguration, ConfigError } from './src/config.mjs';
import { buildTools } from './src/mcp-tools.mjs';
import { serve, log } from './src/mcp-protocol.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const version = () => {
    try {
        return JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
    } catch (e) {
        return 'unknown';
    }
};

/* The configuration path is given on the command line, because that is how an
   MCP declaration file launches a server:
       "command": "annotepage-mcp", "args": ["--config", "/path/.annotepage.json"]
   The ANNOTEPAGE_CONFIG environment variable works too; the argument wins,
   because it is written next to the command and can be reread. */
const configArgument = () => {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--config' && args[i + 1]) return args[i + 1];
        if (args[i].startsWith('--config=')) return args[i].slice('--config='.length);
    }
    return null;
};

const start = async () => {
    let configuration;
    try {
        configuration = await loadConfiguration(configArgument());
    } catch (e) {
        if (e instanceof ConfigError) {
            /* Kept, not thrown away, and not turned into an exit code either.
               Whoever meant to use a configuration file reads this on stderr
               at once; whoever passes "api" and "key" per call never needed
               it, and the calls that DO need it fail with these same words. */
            process.stderr.write('\n' + e.message + '\n\n');
            configuration = absentConfiguration(e);
        } else {
            throw e;
        }
    }

    for (const word of configuration.warnings) log(word);
    log('configuration', configuration.path || 'none: only calls carrying '
        + 'their own "api" and "key" will work');
    log('projects', [...configuration.projects.keys()].join(', '));

    serve({ name: 'annotepage', version: version() },
          buildTools(configuration));
};

start().catch((e) => {
    process.stderr.write('[annotepage-mcp] ' + ((e && e.stack) || String(e)) + '\n');
    process.exit(1);
});
