#!/usr/bin/env node
/* check-store-pair.mjs -- TWO CLASSES CALLED ApStore, AND NOTHING COMPARED THEM.
 *
 * server/webroot/internal/store.php and store-sqlite.php are the same class
 * written twice, for MySQL and for SQLite. ap_require_store() loads whichever
 * the configuration names, so ONE of them runs and the other is dead text on
 * that install. A method added to one and forgotten in the other is invisible
 * everywhere until somebody runs the half that lacks it.
 *
 * That is not hypothetical. countThreads() was added to store.php, `php -l`
 * said "No syntax errors", check:store passed -- it exercises the SQLite half
 * only -- and every export on a SQLite install answered HTTP 500:
 *
 *     Call to undefined method ApStore::countThreads() (api.php:1237)
 *
 * A green suite over a server that cannot produce a single export. The lesson
 * is not "run more tests by hand": it is that two implementations of one
 * interface need a rule that says so.
 *
 * WHAT IS COMPARED IS THE PUBLIC SURFACE, not the bodies. The two differ on
 * purpose -- backticks against double quotes, driver options, schema
 * migrations -- and comparing text would be noise. What callers depend on is
 * the set of public methods and how many arguments each takes: api.php holds
 * one variable named $store and does not know which class filled it.
 */

import { readFileSync } from 'node:fs';

const FILES = {
    mysql: 'server/webroot/internal/store.php',
    sqlite: 'server/webroot/internal/store-sqlite.php',
};

/* The signature as a caller sees it: name, and how many arguments may be
   passed. A method that gained an optional argument on one side only is the
   same failure one step later -- the call compiles and drops a value. */
const publicMethods = (php) => {
    const found = new Map();
    const re = /^\s*public function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm;
    let m;
    while ((m = re.exec(php)) !== null) {
        const name = m[1];
        const args = m[2].trim();
        const count = args === '' ? 0 : args.split(',').length;
        found.set(name, count);
    }
    return found;
};

/* WHAT ONE HALF MAY HAVE ALONE, named one by one with the reason.
 *
 * A list like this is how a rule rots, so it is kept to what cannot exist on
 * the other side rather than to what somebody has not written yet. Measured
 * before adding the first entry: of twenty-four public methods, twenty-three
 * agree on name AND argument count. This is the only one, and it is not an
 * omission -- there is no file to name when the notes live in MySQL.
 *
 * The test for admission is not "MySQL does not need it": it is "MySQL cannot
 * answer it at all". Anything else belongs in both. */
const ONLY_ON = {
    sqlite: {
        file: 'the path of the database file, for the diagnostic and install.php. '
            + 'A MySQL store has a host and a schema, not a file, so the method '
            + 'would have nothing to return. Nothing in the repository calls it '
            + 'through a $store whose class is unknown.',
    },
    mysql: {},
};

const failures = [];
const surfaces = {};
for (const [flavour, path] of Object.entries(FILES)) {
    surfaces[flavour] = publicMethods(readFileSync(path, 'utf8'));
    if (surfaces[flavour].size === 0) {
        failures.push(`${path} declares no public method at all -- this check `
            + 'is reading the wrong thing, which is worse than the drift it looks for.');
    }
}

const [a, b] = Object.keys(FILES);
for (const [flavour, other] of [[a, b], [b, a]]) {
    for (const [name, count] of surfaces[flavour]) {
        if (!surfaces[other].has(name)) {
            if (Object.prototype.hasOwnProperty.call(ONLY_ON[flavour], name)) continue;
            failures.push(`${FILES[flavour]} has public ${name}() and `
                + `${FILES[other]} does not. ap_require_store() loads one class or `
                + 'the other from the configuration, so an install on the missing '
                + 'side answers "Call to undefined method" at the moment it is '
                + 'used -- a 500 on a server whose whole suite was green.');
            continue;
        }
        const there = surfaces[other].get(name);
        if (there !== count) {
            failures.push(`${name}() takes ${count} argument(s) in `
                + `${FILES[flavour]} and ${there} in ${FILES[other]}. A caller `
                + 'passes what one of them ignores, in silence.');
        }
    }
}

/* AND AN EXEMPTION THAT STOPPED BEING ONE IS A HOLE. A method listed here
   which the other side has since grown, or which has disappeared altogether,
   would sit in this list forever, exempting nothing and hiding the next
   drift behind a name nobody rereads. */
for (const [flavour, entries] of Object.entries(ONLY_ON)) {
    const other = flavour === a ? b : a;
    for (const name of Object.keys(entries)) {
        if (!surfaces[flavour].has(name)) {
            failures.push(`${name}() is listed as belonging to ${flavour} alone, `
                + `and ${FILES[flavour]} no longer has it. Remove the entry: an `
                + 'exemption for a method that does not exist exempts nothing and '
                + 'outlives the reason it was written for.');
        } else if (surfaces[other].has(name)) {
            failures.push(`${name}() is listed as belonging to ${flavour} alone, `
                + `and ${FILES[other]} has it too now. Remove the entry so that the `
                + 'two are compared like every other method.');
        }
    }
}

if (failures.length) {
    console.error('store-pair:\n' + failures.map((f) => '  ' + f).join('\n'));
    process.exit(1);
}
const exempt = Object.values(ONLY_ON).reduce((n, e) => n + Object.keys(e).length, 0);
console.log(`store-pair: the two ApStore classes expose the same public methods, `
    + `each taking the same arguments, with ${exempt} named exception(s) that the `
    + 'other side cannot answer at all');
