#!/usr/bin/env node
/* THE NAME, KEPT, AND POINTING AT THE TOOL.
 *
 * Assistants asked to "use annotepage" type `npx annotepage`, which fetches
 * whatever the npm registry holds under that name. Left free, anybody could
 * publish something there and have it run by every assistant that guessed.
 * So the name is taken, and what it does is say where the tool is -- it runs
 * nothing else, installs nothing, and reaches no network.
 */

process.stderr.write(
    'This package only keeps the name "annotepage". The tool is elsewhere:\n\n'
    + '  read and answer review notes, from a terminal or an assistant:\n'
    + '    npx -y -p annotepage-mcp annotepage open\n'
    + '    npx -y -p annotepage-mcp annotepage --help\n\n'
    + '  the script a site loads: annotepage-client\n\n'
    + 'https://annotepage.com\n');
process.exitCode = 1;
