#!/usr/bin/env node
/* build-wordpress-languages.mjs -- THE .pot AND THE FRENCH .mo, FROM NODE ALONE.
 *
 * Neither xgettext nor msgfmt is installed here, and this repository has no
 * dependency by rule -- so the two files gettext tooling would produce are
 * produced by this file instead. Both formats are small and documented, and
 * writing them is cheaper than owning a dependency.
 *
 * THE SHAPE IS THE ONE THE CLIENT ALREADY USES. labels/fr.json is the source
 * and labels/fr.js is generated from it, so nobody edits the delivered file by
 * hand and the two cannot drift. Here:
 *
 *     wordpress/annotepage.php   the only source of MSGIDS. What the code says
 *                                is what a translator is offered; there is no
 *                                second list to keep in step.
 *     wordpress/languages/fr_FR.json   the source of TRANSLATIONS, readable and
 *                                editable, one entry per msgid.
 *     wordpress/languages/annotepage.pot        generated, for translators
 *     wordpress/languages/annotepage-fr_FR.mo   generated, what WordPress reads
 *
 * tools/check-wordpress.mjs imports the three functions below and rebuilds both
 * files in memory, so a generated file edited by hand -- or left behind by a
 * build nobody ran -- is a failure and not a surprise on somebody's site.
 *
 * WHY A .mo AND NOT A .l10n.php. WordPress 6.5 reads the PHP form and prefers
 * it, and it would be the faster file. This plugin declares `Requires at
 * least: 5.2`: on everything older the PHP file is not read at all and the
 * screen is silently English. The .mo is understood by every version that can
 * install this plugin.
 *
 *     node tools/build-wordpress-languages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* THE BYTE GETTEXT PUTS BETWEEN A PLURAL'S TWO HALVES, in both of a .mo's
   tables. Built and not typed: a control character written into a source
   file is invisible to whoever reads it next, and turns the file binary to
   git, which then shows no diff at all. */
const NUL = String.fromCharCode(0);

export const PLUGIN_FILE = join(ROOT, 'wordpress/annotepage.php');
export const LANGUAGES = join(ROOT, 'wordpress/languages');
export const DOMAIN = 'annotepage';
export const LOCALE = 'fr_FR';

/* The name a msgid is filed under. A msgid and its plural are one entry, and
   the same sentence written twice in the PHP is one entry with two
   references -- which is what gettext does and what a translator expects. */
const keyOf = (entry) => entry.msgid + NUL + (entry.plural || '');

/* The calls that put a string in front of somebody. _x() and its relatives are
   deliberately absent: this plugin uses no contexts, and a generator that
   silently ignored one would drop a string out of the .pot -- so an unsupported
   call is reported rather than skipped. See extract(). */
const SINGLE = ['__', '_e', 'esc_html__', 'esc_html_e', 'esc_attr__', 'esc_attr_e'];
const PLURAL = ['_n'];
const UNSUPPORTED = ['_x', '_ex', '_nx', 'esc_html_x', 'esc_attr_x', '_n_noop', '_nx_noop'];

const CALL = new RegExp(
    '(?<![\\w$>])(' + [...SINGLE, ...PLURAL, ...UNSUPPORTED].join('|') + ')\\s*\\(',
    'g'
);

/**
 * Reads one PHP single-quoted string starting at `i`, or returns null.
 *
 * Single quotes only, and that is a rule rather than a shortcut: a
 * double-quoted msgid may interpolate a variable, which produces a string no
 * translator can ever be offered -- it differs per request.
 */
function phpString(text, i) {
    if (text[i] !== "'") return null;
    let out = '';
    let j = i + 1;
    while (j < text.length) {
        const c = text[j];
        if (c === '\\') {
            const next = text[j + 1];
            if (next === "'" || next === '\\') {
                out += next;
                j += 2;
                continue;
            }
            out += c;
            j += 1;
            continue;
        }
        if (c === "'") return { value: out, end: j + 1 };
        out += c;
        j += 1;
    }
    return null;
}

/**
 * The same text with every comment blanked out, character for character.
 *
 * WITHOUT THIS THE FILE'S OWN PROSE IS EXTRACTED. The header above
 * annotepage.php explains, in English, that calling __() before `init` is a
 * notice -- and a scanner looking for `__(` finds that sentence and reports a
 * string nobody wrote. Blanking keeps every newline and every offset, so the
 * calls are found here while the translator comments are read from the
 * original and the two still agree on line numbers.
 */
function blankComments(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (c === "'" || c === '"') {
            const quote = c;
            out += c;
            i += 1;
            while (i < text.length) {
                if (text[i] === '\\') {
                    out += text.slice(i, i + 2);
                    i += 2;
                    continue;
                }
                out += text[i];
                i += 1;
                if (text[i - 1] === quote) break;
            }
            continue;
        }
        if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? text.length : end + 2;
            out += text.slice(i, stop).replace(/[^\n]/g, ' ');
            i = stop;
            continue;
        }
        if ((c === '/' && text[i + 1] === '/') || c === '#') {
            const end = text.indexOf('\n', i);
            const stop = end === -1 ? text.length : end;
            out += ' '.repeat(stop - i);
            i = stop;
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

/**
 * The arguments of a call, as raw source, split on the commas that belong to
 * it -- never on the ones inside count( $s['roles'] ) or inside a string.
 */
function callArguments(text, open) {
    const args = [];
    let depth = 0;
    let start = open + 1;
    let i = open;
    for (; i < text.length; i += 1) {
        const c = text[i];
        if (c === "'" || c === '"') {
            const quote = c;
            i += 1;
            while (i < text.length && text[i] !== quote) {
                if (text[i] === '\\') i += 1;
                i += 1;
            }
            continue;
        }
        if (c === '(' || c === '[') {
            depth += 1;
            continue;
        }
        if (c === ')' || c === ']') {
            depth -= 1;
            if (0 === depth) {
                args.push(text.slice(start, i));
                return args;
            }
            continue;
        }
        if (c === ',' && 1 === depth) {
            args.push(text.slice(start, i));
            start = i + 1;
        }
    }
    return args;
}

/* One whole argument, and only if it is one single-quoted literal. */
function literal(source) {
    const trimmed = (source || '').trim();
    if (trimmed[0] !== "'") return null;
    const read = phpString(trimmed, 0);
    return read && read.end === trimmed.length ? read.value : null;
}

/* Every "translators:" comment, with the line it ends on. gettext attaches one
   to the call that follows it, and wordpress.org asks for one wherever a string
   carries a placeholder: without it a translator is handed "%1$s and %2$s" and
   no way at all to know what either of them is. */
function translatorComments(text) {
    const out = [];
    const re = /\/\*\s*translators:\s*([\s\S]*?)\*\//g;
    let m;
    while ((m = re.exec(text)) !== null) {
        out.push({
            text: m[1].replace(/\s*\n\s*/g, ' ').trim(),
            endLine: text.slice(0, m.index + m[0].length).split('\n').length,
        });
    }
    return out;
}

/**
 * THE MSGIDS, READ OUT OF THE PHP. Source order, duplicates merged.
 *
 * @param {string} text     the plugin's PHP
 * @param {string} filename what the .pot should name in its references
 * @return {{entries: object[], problems: string[]}}
 */
export function extract(text, filename = 'annotepage.php') {
    const entries = new Map();
    const problems = [];
    const comments = translatorComments(text);
    const code = blankComments(text);

    CALL.lastIndex = 0;
    let m;
    while ((m = CALL.exec(code)) !== null) {
        const fn = m[1];
        const line = code.slice(0, m.index).split('\n').length;
        const where = `${filename}:${line}`;

        if (UNSUPPORTED.includes(fn)) {
            problems.push(`${where}: ${fn}() is not supported by this generator, so its `
                + 'string would never reach the .pot. Use __() or _n(), or teach the '
                + 'generator contexts.');
            continue;
        }

        /* The arguments, as literals. Anything else -- a variable, a
           concatenation, a constant -- cannot be extracted by any tool, so it
           is named here rather than quietly dropped. */
        const args = callArguments(code, m.index + m[0].length - 1);
        const isPlural = PLURAL.includes(fn);

        const msgid = literal(args[0]);
        const plural = isPlural ? literal(args[1]) : null;
        if (null === msgid || (isPlural && null === plural)) {
            problems.push(`${where}: ${fn}() is called with something other than a `
                + 'literal single-quoted string, so no tool can extract it');
            continue;
        }

        /* THE DOMAIN, BY POSITION. Second argument, or fourth for _n() where
           the count sits in between. A call with no domain at all lands in the
           "default" domain, which is core's: the string then quietly picks up
           whatever WordPress itself happens to translate it to, or nothing. */
        const domain = isPlural ? literal(args[3]) : literal(args[1]);

        const entry = {
            fn,
            msgid,
            plural,
            domain,
            references: [where],
            comment: null,
            line,
        };

        /* The nearest comment above, within three lines, as gettext does with
           --add-comments. Three because a string inside a printf() sits a line
           or two below its own comment. */
        for (const c of comments) {
            if (c.endLine < line && line - c.endLine <= 3) entry.comment = c.text;
        }

        const key = keyOf(entry);
        if (entries.has(key)) {
            const seen = entries.get(key);
            seen.references.push(where);
            if (!seen.comment) seen.comment = entry.comment;
            if (seen.domain !== entry.domain) {
                problems.push(`${where}: "${entry.msgid}" is in domain `
                    + `"${entry.domain}" here and "${seen.domain}" elsewhere`);
            }
        } else {
            entries.set(key, entry);
        }
    }

    return { entries: [...entries.values()], problems };
}

const potQuote = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';

/**
 * The .pot a translator is handed.
 *
 * NO CREATION DATE. Every generator of this format writes one, and it makes the
 * file differ from itself on every run -- which would turn the check that
 * compares the shipped file with a fresh one into a check that fails every
 * time, and then into one that gets deleted. Nothing here depends on the clock.
 */
export function pot(entries, version) {
    const out = [
        '# annotepage -- translation template for the WordPress plugin.',
        '#',
        '# GENERATED by tools/build-wordpress-languages.mjs from wordpress/annotepage.php.',
        '# Do not edit: edit the strings in the PHP and build again.',
        '#',
        '# The French set is wordpress/languages/fr_FR.json, which is the file to',
        '# copy for another language. It has to cover every msgid below: a partial',
        '# translation ships a screen that is half one language and half the other.',
        '#',
        '# This file is distributed under the same licence as the plugin.',
        'msgid ""',
        'msgstr ""',
        '"Project-Id-Version: annotepage ' + version + '\\n"',
        '"Report-Msgid-Bugs-To: https://github.com/tuxo83/annotepage/issues\\n"',
        '"MIME-Version: 1.0\\n"',
        '"Content-Type: text/plain; charset=UTF-8\\n"',
        '"Content-Transfer-Encoding: 8bit\\n"',
        '"Plural-Forms: nplurals=2; plural=n != 1;\\n"',
        '"X-Domain: ' + DOMAIN + '\\n"',
        '',
    ];

    for (const entry of entries) {
        if (entry.comment) out.push('#. translators: ' + entry.comment);
        out.push('#: ' + entry.references.join(' '));
        out.push('msgid ' + potQuote(entry.msgid));
        if (entry.plural === null) {
            out.push('msgstr ""');
        } else {
            out.push('msgid_plural ' + potQuote(entry.plural));
            out.push('msgstr[0] ""');
            out.push('msgstr[1] ""');
        }
        out.push('');
    }

    return out.join('\n');
}

/* WHAT A LOCALE PROMISES ABOUT PLURALS. French puts 0 with the singular --
   "0 role", not "0 roles" -- which is the one thing a nplurals=2 locale is
   free to disagree with English about, and the reason this line is not
   copied from the .pot's English rule. */
export const PLURAL_FORMS = 'nplurals=2; plural=n > 1;';

export function moHeader(version) {
    return [
        'Project-Id-Version: annotepage ' + version,
        'Report-Msgid-Bugs-To: https://github.com/tuxo83/annotepage/issues',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'Language: ' + LOCALE,
        'Plural-Forms: ' + PLURAL_FORMS,
        'X-Generator: tools/build-wordpress-languages.mjs',
        '',
    ].join('\n');
}

/**
 * THE BINARY FILE WORDPRESS READS.
 *
 * The format: a magic number, a count, two tables of (length, offset) pairs --
 * originals then translations -- and the bytes they point at. A plural entry is
 * one original holding "singular\0plural" and one translation holding the forms
 * in the same order, separated the same way. The hash table is optional and is
 * written as empty: every reader falls back to the tables.
 *
 * The entries are sorted by the original's BYTES, which the format requires of
 * a writer: readers are entitled to binary-search them.
 *
 * @param {object[]} entries      from extract()
 * @param {object} translations   msgid -> string, or msgid -> [singular, plural]
 * @param {string} version
 * @return {Buffer}
 */
export function mo(entries, translations, version) {
    const pairs = [[Buffer.from('', 'utf8'), Buffer.from(moHeader(version), 'utf8')]];

    for (const entry of entries) {
        const value = translations[entry.msgid];
        if (value === undefined) continue;
        const original = entry.plural === null
            ? entry.msgid
            : entry.msgid + NUL + entry.plural;
        const translated = Array.isArray(value) ? value.join(NUL) : String(value);
        pairs.push([Buffer.from(original, 'utf8'), Buffer.from(translated, 'utf8')]);
    }

    pairs.sort((a, b) => Buffer.compare(a[0], b[0]));

    const n = pairs.length;
    const originalsTable = 28;
    const translationsTable = originalsTable + n * 8;
    let offset = translationsTable + n * 8;

    const head = Buffer.alloc(offset);
    head.writeUInt32LE(0x950412de, 0);  /* the magic number, little-endian */
    head.writeUInt32LE(0, 4);           /* revision */
    head.writeUInt32LE(n, 8);
    head.writeUInt32LE(originalsTable, 12);
    head.writeUInt32LE(translationsTable, 16);
    head.writeUInt32LE(0, 20);          /* hash table size: none */
    head.writeUInt32LE(offset, 24);     /* where it would have been */

    const blob = [];
    /* Both tables point into the same run of bytes, originals first, and every
       string is stored with a trailing NUL that its length does not count. */
    pairs.forEach(([original], k) => {
        head.writeUInt32LE(original.length, originalsTable + k * 8);
        head.writeUInt32LE(offset, originalsTable + k * 8 + 4);
        blob.push(original, Buffer.from([0]));
        offset += original.length + 1;
    });
    pairs.forEach(([, translated], k) => {
        head.writeUInt32LE(translated.length, translationsTable + k * 8);
        head.writeUInt32LE(offset, translationsTable + k * 8 + 4);
        blob.push(translated, Buffer.from([0]));
        offset += translated.length + 1;
    });

    return Buffer.concat([head, ...blob]);
}

/**
 * The same file read back. Used by the check, because a writer that agrees with
 * itself proves nothing: what matters is that a reader finds every string.
 *
 * @return {object} original -> translation, both as written in the file
 */
export function readMo(buffer) {
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x950412de) throw new Error('not a .mo file: magic ' + magic.toString(16));
    const n = buffer.readUInt32LE(8);
    const originals = buffer.readUInt32LE(12);
    const translations = buffer.readUInt32LE(16);
    const out = {};
    for (let k = 0; k < n; k += 1) {
        const oLen = buffer.readUInt32LE(originals + k * 8);
        const oAt = buffer.readUInt32LE(originals + k * 8 + 4);
        const tLen = buffer.readUInt32LE(translations + k * 8);
        const tAt = buffer.readUInt32LE(translations + k * 8 + 4);
        out[buffer.toString('utf8', oAt, oAt + oLen)] = buffer.toString('utf8', tAt, tAt + tLen);
    }
    return out;
}

export const pluginVersion = (php) =>
    (php.match(/^\s*\*\s*Version:\s*(.+?)\s*$/m) || ['', ''])[1];

/* -- Run by hand, after changing a string or a translation ----------------- */

if (process.argv[1] && process.argv[1].endsWith('build-wordpress-languages.mjs')) {
    const php = readFileSync(PLUGIN_FILE, 'utf8');
    const version = pluginVersion(php);
    const { entries, problems } = extract(php);
    if (problems.length) {
        console.error('wordpress languages:\n  ' + problems.join('\n  '));
        process.exit(1);
    }

    const french = JSON.parse(readFileSync(join(LANGUAGES, LOCALE + '.json'), 'utf8'));
    const missing = entries.filter((e) => !(e.msgid in french)).map((e) => e.msgid);
    if (missing.length) {
        console.error('wordpress languages: ' + missing.length + ' string(s) have no French:\n  '
            + missing.map((s) => JSON.stringify(s)).join('\n  '));
        process.exit(1);
    }

    mkdirSync(LANGUAGES, { recursive: true });
    writeFileSync(join(LANGUAGES, DOMAIN + '.pot'), pot(entries, version), 'utf8');
    writeFileSync(join(LANGUAGES, `${DOMAIN}-${LOCALE}.mo`), mo(entries, french, version));

    console.log(`wordpress languages: ${entries.length} strings`
        + ` -> languages/${DOMAIN}.pot and languages/${DOMAIN}-${LOCALE}.mo`);
}
