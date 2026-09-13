/* -- 0. Where am I, which project, and therefore where is the API --------
   Nothing below is guessed. Everything is DECLARED, because a client served
   by a CDN can no longer deduce anything from its own address: that address
   says nothing about the site under review.

   TWO SOURCES CAN CARRY THAT DECLARATION, and the tag is the standard one:

     the tag    <script src="..." data-server="..." data-key="...">, read
                through document.currentScript. Everything in this repository
                that hands out a configuration hands out a tag.

     the page   window.annotepageConfig = { server: '...', key: '...' },
                declared before the client is loaded.

   WHY THE SECOND ONE EXISTS. document.currentScript is null whenever this
   file was not loaded by a classic <script src>: a "combine JS" option, an
   asset pipeline that concatenates, a bundler, type="module". Until this
   existed the client returned here and did nothing, WITH NOTHING SAID
   ANYWHERE -- which from the outside cannot be told apart from a tool nobody
   installed. That silence is the defect being fixed here.

   The rule of silence itself is kept, because it is a principle and not the
   bug: this client never throws inside a host page, never draws anything it
   was not asked for, and never writes over somebody else's console. What it
   does now is say ONE line, ONCE, when neither source is usable -- the one
   case where saying nothing leaves nobody anything to look at.

   THE NAME. window.annotepage IS ALREADY TAKEN: annotepage.com uses it for
   the console command that switches its own copy on and off. window.Annotepage
   is the label namespace (15-labels). annotepageConfig is neither of those.

   WHICH SOURCE WINS, AND WHY IT IS NEVER A MERGE. One of the two configures
   this copy WHOLE. Merging them setting by setting would produce a
   configuration that exists nowhere in one piece -- nobody reading the page
   could say what the tool is doing -- and it is exactly how a forgotten
   object silently changes the project of a tag somebody has just corrected.
   So:

     a tag, no object    the tag configures. This is every page that works
                         today, unchanged, down to the ../api.php fallback.
     an object, no tag   the object configures, and `server` is then required
                         (see THE SERVER ADDRESS).
     both                the tag configures, and the object MUST SAY THE SAME
                         THING: every setting it writes has to be written on
                         the tag, with the same value. Anything else is
                         refused and named. Two declarations that disagree are
                         two people who each believe they configured the tool,
                         and picking a winner buries one of them in a project
                         whose notes nobody will ever read -- the same reason
                         a tag carrying a key and a mismatched id is refused
                         rather than resolved (FORMAT.md section 1.5).
     neither             we stay out, and we say so once in the console. */

/* ONE TOOL PER PAGE, HOWEVER MANY TIMES THIS FILE RUNS.

   A tag inside <body> is executed again by every router that swaps the body
   and re-activates its scripts -- Turbo, htmx's hx-boost, Livewire's
   wire:navigate, Astro's ClientRouter -- and a template can carry the tag
   twice. Each execution used to build a tool of its own: two pills, two sets
   of listeners on one page, one remark sent twice.

   So the copy that boots first takes a slot ON THE DOCUMENT (85-pages), and
   keeps it for the life of the document. Any later copy finds it (below, once
   the tag and the object have been read, and before a single setting is
   judged) and does not start. Which of two things it says depends on what it
   carries:

     THE SAME CONFIGURATION -- same src, same settings on the tag, same
     object. That is a router executing the tag again, at every click, and it
     stands down in silence: a line per navigation would bury the console. It
     asks the running copy to look at the page again instead, since a
     re-executed tag is the plainest sign there is that the body just changed.

     ANOTHER CONFIGURATION -- another project, key, prefix, server or file. It
     stands down too, and says so ONCE for the document, however many
     different configurations follow it. One tool
     runs per page BY RULE: two projects on one site are two tags on two sets
     of pages, never two tags on one. The rule was nearly the other one --
     every configuration boots, each holds its own slot -- and it was set
     aside because two tools on a page share one body, one click, one history
     wrapper, and a reviewer who cannot tell which pill files where. What
     cannot be allowed is the silence: a second tag that quietly never starts
     is a project somebody believes is running.

     AN IDENTITY THIS COPY CANNOT READ -- a running copy that predates
     identities, or one that writes them another way -- is neither. Nothing
     can be said about it that is true, so nothing is said: a false "another
     configuration" is exactly what a CDN serving a newer release in the
     middle of a visit would print, on a page carrying one tag.

   NO TAKEOVER, EVEN WHEN THE OWNER IS OUT OF ITS data-path. Handing the
   document to whichever copy's prefix matches would make "which tool is on
   this page" depend on the order of navigations, and the owner coming back
   into its prefix would have to take it back. The first copy owns the
   document; the only release is the upgrade hand-over (80-upgrade).

   WHY THE DOCUMENT AND A REGISTERED SYMBOL. The document is what "one per
   page" means, and it outlives a body swap. Symbol.for gives two copies of
   this file -- two versions, from two addresses -- the same key without it
   being a name a site's script can overwrite by accident: window.Annotepage
   was the obvious place, and a page is allowed to assign that object whole
   (15-labels).

   THE CONTRACT BETWEEN COPIES IS
     { copy: { version, identity, recheck }, handedOver: [identity],
       refused: [identity] }
   and it is read by versions that do not exist yet. Adding to it is free;
   renaming a member breaks the copy that ships next to an older one.
   `refused` is non-empty once the warning has been said for the document --
   that is the whole of "once" -- and it keeps at most REFUSED_KEPT entries:
   a trace for whoever inspects the slot, not a list that grows at every
   navigation. */
const INSTANCE_SLOT = Symbol.for('annotepage');

/* THE SETTINGS, AND THE WHOLE LIST OF THEM. `data-` plus the name on a tag,
   the name alone in the object. Documented in the client's README, and
   client/tools/check.mjs refuses a list that has drifted from it.

   An unknown name is refused IN THE OBJECT ONLY, and the asymmetry is the
   point: a data- attribute is shared space -- the site's own scripts write
   there, annotepage.com marks its live tag with data-annotepage-on -- while
   window.annotepageConfig is ours alone, so a name we do not know there is a
   typo, and a typo that is ignored is a setting somebody believes they set. */
const SETTINGS = ['server', 'project', 'key', 'setup', 'mode', 'path',
    'domains', 'version', 'environment', 'labels', 'zone'];

/* Not "written": 60-ui already holds a local of that name, and a helper of the
   whole file shadowed inside one function is a reader's trap for nothing. */
const declaredIn = (map, name) => Object.prototype.hasOwnProperty.call(map, name);

/* WHAT THIS COPY STANDS DOWN FOR.

   The sentence goes to the console in English, for whoever has the developer
   tools open; the same fact is said on screen, in the page's language, by the
   screen 90-boot opens -- so the label is NAMED here and resolved there,
   because 15-labels has not been evaluated yet at this point in the file.

   Never an exception, in either half: a client that throws inside somebody
   else's page has broken that page, whatever it was right about. */
let CONFIG_FAILURE = null;

const complain = (sentence) => {
    try {
        if (window.console && window.console.warn) {
            window.console.warn('annotepage: ' + sentence);
        }
    } catch (e) { /* a console that refuses to be called is not our business */ }
};

const refuse = (label, values, sentence) => {
    // The FIRST cause, not the tenth: one broken setting usually makes the
    // next three look broken too, and a screen listing four problems sends
    // somebody fixing the three that were only consequences.
    if (CONFIG_FAILURE) return;
    CONFIG_FAILURE = { label: label, values: values };
    complain(sentence);
};

/* -- The two sources, read separately ----------------------------------- */

/* A tag with no src carries no attributes worth reading either, and it is the
   same non-answer as no tag at all: an inline <script> that happens to be
   running is not where this client's settings live. */
const script = (document.currentScript && document.currentScript.src)
    ? document.currentScript : null;
const SCRIPT_SRC = script ? script.src : '';

const declaredConfig = window.annotepageConfig;

/* -- Is this document already somebody's? ---------------------------------
   Read HERE: after the two sources are in hand, and before anything below can
   write to the console about them. A refused configuration executed again by
   a router must not repeat its warning at every click either.

   WHAT A CONFIGURATION IS, for this comparison: the file, every setting the
   tag carries, and the object. Read before adoption -- the adopted form is
   only known after the judging this has to come before -- but NOT as
   written: two spellings of one declaration are one configuration, or a
   router executing the tag again is told it brought a second tool. So the
   object's keys are ordered, a value is trimmed, a list of origins is
   trimmed and ordered item by item, and `setup: false` is the absence it
   means (see WHICH SOURCE WINS).

   THE FILE IS ITS ADDRESS WITHOUT THE QUERY STRING. A query on a script's
   address is how a CMS defeats caches -- WordPress writes ?ver=, often with
   the time in it -- so it changes at every deploy, or at every request, and
   never names another project. Ignoring it can only ever merge two tags
   whose settings are already identical, and running one tool for those is
   the rule anyway. The path stays: another file is another configuration.

   NOT PART OF IT, EITHER:
     an attribute that is not a setting -- annotepage.com toggles
       data-annotepage-on on its live tag -- or a page flipping its own
       switch would be told it carries two tools;
     data-version, which is a label for the notes and not a project. A body
       swapped after a deploy brings build-2 in the same tag. That tag stands
       down like any re-executed one, and THE RUNNING COPY KEEPS THE VERSION
       IT READ AT BOOT until the page is reloaded: notes written meanwhile
       are filed under the build the document was loaded with.

   AND IT NEVER THROWS. The object is the page's, and it may hold anything: a
   BigInt that JSON.stringify refuses, an object with no prototype that
   String() cannot convert, a getter that throws, a loop. Each of those gets
   a text of its own, so that two such objects are still told apart. */
const data = (script && script.dataset) || {};

/* Identities this copy writes start with this. One that does not was written
   by a copy that predates it or reads configurations another way. */
/* 2 SINCE `zone` JOINED THE SETTINGS. The identity lists every setting in
   order, so one more setting is one more member in every identity -- the same
   configuration written another way. Left at 1, a copy of the release before
   still holding the document would read this one's identity as a different
   configuration and warn about a second tool, on a page carrying one tag. */
const IDENTITY_FORMAT = 'annotepage/identity/2';
const readableIdentity = (value) =>
    typeof value === 'string' && value.indexOf('["' + IDENTITY_FORMAT + '",') === 0;
const REFUSED_KEPT = 8;

const isTextList = (value) => {
    if (!Array.isArray(value)) return false;
    for (let i = 0; i < value.length; i += 1) {
        if (typeof value[i] !== 'string') return false;
    }
    return true;
};

/* Any value, as text. `seen` is the path from the top, so a loop is named
   rather than followed; the depth is bounded for an object nobody writes by
   hand. */
const textOfValue = (value, seen) => {
    const kind = typeof value;
    if (kind === 'string') return JSON.stringify(value);
    if (kind === 'bigint') return String(value) + 'n';
    if (kind === 'number' || kind === 'boolean' || kind === 'undefined' || value === null) {
        return String(value);
    }
    if (kind !== 'object') return '<' + kind + '>';
    if (seen.indexOf(value) !== -1) return '<loop>';
    if (seen.length >= 8) return '<deep>';
    seen.push(value);
    let text;
    try {
        const parts = [];
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i += 1) parts.push(memberText(value, i, seen));
            text = '[' + parts.join(',') + ']';
        } else {
            const names = Object.keys(value).sort();
            for (let i = 0; i < names.length; i += 1) {
                parts.push(JSON.stringify(names[i]) + ':' + memberText(value, names[i], seen));
            }
            text = '{' + parts.join(',') + '}';
        }
    } catch (e) {
        text = '<unreadable>';
    }
    seen.pop();
    return text;
};
function memberText(object, name, seen) {
    try {
        return textOfValue(object[name], seen);
    } catch (e) {
        return '<throws>';
    }
}

/* One setting, as the comparison sees it. null is "not declared". */
const settingText = (name, value) => {
    if (name === 'setup') return value ? 'yes' : null;
    if (name === 'domains' && (typeof value === 'string' || isTextList(value))) {
        const items = typeof value === 'string' ? value.split(',') : value;
        return JSON.stringify(items.map((d) => d.trim()).filter(Boolean).sort());
    }
    if (typeof value === 'string') return JSON.stringify(value.trim());
    return textOfValue(value, []);
};

const objectText = (object) => {
    if (object === undefined) return null;
    if (object === null || typeof object !== 'object' || Array.isArray(object)) {
        return textOfValue(object, []);
    }
    try {
        const parts = [];
        const names = Object.keys(object).sort();
        for (let i = 0; i < names.length; i += 1) {
            const name = names[i];
            if (name === 'version') continue;
            let text;
            try {
                text = SETTINGS.indexOf(name) === -1
                    ? textOfValue(object[name], [object]) : settingText(name, object[name]);
            } catch (e) {
                text = '<throws>';
            }
            if (text !== null) parts.push(JSON.stringify(name) + ':' + text);
        }
        return '{' + parts.join(',') + '}';
    } catch (e) {
        return '<unreadable>';
    }
};

const COPY_IDENTITY = JSON.stringify([IDENTITY_FORMAT,
    SCRIPT_SRC.replace(/[?#].*$/, ''),
    SETTINGS.filter((name) => name !== 'version').map((name) => (declaredIn(data, name)
        ? settingText(name, name === 'setup' ? true : String(data[name])) : null)),
    objectText(declaredConfig)]);

const slotFound = document[INSTANCE_SLOT];
const handedOverHere = (slotFound && Array.isArray(slotFound.handedOver)) ? slotFound.handedOver : [];
if (slotFound && (slotFound.copy || handedOverHere.indexOf(COPY_IDENTITY) !== -1)) {
    const holder = slotFound.copy;
    /* A COPY THAT HANDED OVER is still this configuration: the newer version
       carries its settings under another address (80-upgrade). The old tag
       executed again by a router is the same declaration, and neither a
       warning nor a second hand-over is owed for it. */
    const same = handedOverHere.indexOf(COPY_IDENTITY) !== -1
        || !!(holder && holder.identity === COPY_IDENTITY);
    /* UNKNOWN IS NOT DIFFERENT: a holder with no identity this copy can read,
       or a hand-over recorded in another format -- this tag may be the very
       one that copy was loaded by. */
    const unknown = !same && (!holder || !readableIdentity(holder.identity)
        || handedOverHere.some((identity) => !readableIdentity(identity)));
    if (!same && !unknown) {
        if (!Array.isArray(slotFound.refused)) slotFound.refused = [];
        const refused = slotFound.refused;
        // ONCE FOR THE DOCUMENT, not once per configuration: a template
        // cycling through several would otherwise print a line per kind.
        if (!refused.length) {
            complain('this page already runs annotepage with another configuration, '
                + 'and one tool runs per page: this one ('
                + (SCRIPT_SRC || 'window.annotepageConfig') + ') was not started, '
                + 'and any further one on this page stands down without another line. '
                + 'Several projects on one site means each page loads only its own '
                + 'tag. See https://annotepage.com/questions.html#one-per-page');
        }
        if (refused.indexOf(COPY_IDENTITY) === -1 && refused.length < REFUSED_KEPT) {
            refused.push(COPY_IDENTITY);
        }
    }
    /* IN A try, because this runs inside whatever executed the tag -- a
       router, in the middle of its navigation -- and a fault of the running
       copy thrown from here would surface there, uncaught, at every click.
       The next sign of navigation asks again. */
    try {
        if (holder) holder.recheck();
    } catch (e) { /* the running copy's fault, not the page's */ }
    return;
}

const HAS_CONFIG = declaredConfig !== undefined && declaredConfig !== null;
if (HAS_CONFIG && (typeof declaredConfig !== 'object' || Array.isArray(declaredConfig))) {
    refuse('tag.config_shape', null,
        'window.annotepageConfig is not an object, so nothing could be read from '
        + 'it. It is written { server: "...", project: "..." }.');
}

/* What each source declares, as text, and whether it declares it AT ALL -- an
   empty data-key is not the same fact as no data-key (see THE KEY below). */
const fromTag = {};
for (let i = 0; i < SETTINGS.length; i += 1) {
    const name = SETTINGS[i];
    if (declaredIn(data, name)) fromTag[name] = String(data[name]).trim();
}
/* An attribute is PRESENCE and never a value: <script data-setup> has none to
   read. A property is a value, and `setup: false` reads as "no" to anybody
   who writes JavaScript. Both end up as the same two words so that the two
   sources can be compared at all. */
if (declaredIn(data, 'setup')) fromTag.setup = 'yes';

const fromPage = {};
if (HAS_CONFIG && !CONFIG_FAILURE) {
    const names = Object.keys(declaredConfig);
    for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        const value = declaredConfig[name];
        if (SETTINGS.indexOf(name) === -1) {
            refuse('tag.config_setting', { name: name },
                'window.annotepageConfig carries "' + name + '", which is not a '
                + 'setting of this client. Nothing was read from it.');
        } else if (name === 'setup') {
            fromPage.setup = value ? 'yes' : 'no';
        } else if (typeof value === 'string') {
            fromPage[name] = value.trim();
        } else if (name === 'domains' && isTextList(value)) {
            /* The tag has one string and commas, because an attribute cannot
               hold a list. An object can, and an array is what anybody writing
               one writes. Both are read; nothing else is. */
            fromPage.domains = value.join(',');
        } else {
            refuse('tag.config_value', { name: name },
                '"' + name + '" in window.annotepageConfig has to be text between '
                + 'quotes. Nothing was read from it.');
        }
    }
}

/* -- And the one that configures this copy ------------------------------- */

let config = {};
if (script) {
    config = fromTag;
    const names = Object.keys(fromPage);
    for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        /* `setup: false` beside a tag with no data-setup states the same fact
           -- no setup screen -- so it is not a disagreement. It is the only
           case where silence on one side equals a value on the other. */
        if (name === 'setup' && fromPage.setup === 'no' && !declaredIn(fromTag, 'setup')) continue;
        if (declaredIn(fromTag, name) && fromTag[name] === fromPage[name]) continue;
        refuse('tag.two_sources', { name: name },
            'the tag on this page and window.annotepageConfig disagree about "'
            + name + '". Nothing was adopted from either: correct one of the two.');
    }
} else if (HAS_CONFIG) {
    config = fromPage;
    /* WITHOUT A TAG THE ADDRESS IS NOT DEDUCED, IT IS REQUIRED -- and this is
       where that has to be said, before anything is adopted. The old
       "../api.php" deduction is relative to THE FILE, and the tag's src is
       what made it possible; the document's own address says nothing, since
       this file may have been concatenated into a bundle that lives anywhere
       on the site. A remark that leaves for an address nobody chose is worse
       than a remark that was never written: the reviewer watched it go. */
    if (!fromPage.server) {
        refuse('tag.config_no_server', null,
            'window.annotepageConfig declares no "server", and without a tag there '
            + 'is no file address to deduce one from. Nothing was sent. Add '
            + 'server: "https://.../api.php" to it.');
    }
} else {
    /* NEITHER SOURCE. The one case where this file used to return in complete
       silence, and the one nobody could diagnose: a page where the tool was
       never installed and a page where a concatenation ate the tag look
       identical from the outside. One line, once -- this file is evaluated
       once per copy loaded -- and no exception. */
    complain('this page carries no <script> tag this client can read its settings '
        + 'from, and no window.annotepageConfig. document.currentScript is null '
        + 'when the file is concatenated with others, inlined, or loaded as a '
        + 'module. Nothing was drawn and nothing was sent. See '
        + 'https://annotepage.com/questions.html#config');
    return;
}

/* A refusal adopts NOTHING. Half a configuration would start the tool on
   whichever half happened to be readable, which is the guess this whole file
   exists to avoid. 90-boot shows the reason instead. */
if (CONFIG_FAILURE) config = {};

const read = (name) => (declaredIn(config, name) ? config[name] : '');

/* THE SERVER ADDRESS.

   Self-hosted WITH A TAG, the old "../api.php" deduction is still enough: it
   worked for the whole life of format 1, we are not removing it. As soon as
   the client goes to a CDN it becomes wrong -- the API is not at the CDN --
   and it has to be declared. Without a tag it is required outright, which is
   settled above, where the object is adopted.

   A REFUSED CONFIGURATION BUILDS NO ADDRESS AT ALL, and the fallback is
   inside the guard for that reason: a tag served by the site would otherwise
   still produce ../api.php while the rest of the settings were being thrown
   away, which is the half-configured start this file exists to prevent. */
const DECLARED_SERVER = read('server');
let API = '';
if (!CONFIG_FAILURE) {
    if (DECLARED_SERVER) {
        API = new URL(DECLARED_SERVER, document.baseURI).href;
    } else if (script && new URL(SCRIPT_SRC).origin === location.origin) {
        API = new URL('../api.php', SCRIPT_SRC).href;
    }
}

/* The project id, generated at setup (see 70-setup). 22 base64url
   characters: the shape is checked here, because an id truncated by a
   copy-paste would otherwise produce an empty project on the server side,
   and a page that never shows a single note. */
const DECLARED_PROJECT = read('project');
const PROJECT_WELL_FORMED = /^[A-Za-z0-9_-]{22}$/.test(DECLARED_PROJECT);
/* NOT a const: with a declared key the id is DERIVED rather than declared, and
   90-boot writes it here once derive() has produced it. There is one PROJECT
   in this scope and everything downstream reads it -- two would have
   diverged. */
let PROJECT = PROJECT_WELL_FORMED ? DECLARED_PROJECT : '';

/* THE KEY, WRITTEN IN THE PAGE -- and that setting IS the mode. It reads the
   same in both sources, because it is the same fact: `data-key` on the tag,
   `key` in the object.

   key         the key itself: the project is PUBLIC. Whoever can load the
               page can read the notes and write them. Nothing is asked for,
               nothing is stored, and no id is declared: derive() already
               produces it from the key (HKDF label "id"), so writing both
               would be writing the same fact twice in something people copy
               by hand -- where the two can disagree.
   project     the id alone: confidential. The key is asked for once per
               browser, and until it is there nothing is fetched and nothing
               is decrypted. That is the behaviour of every version so far.
   setup       neither, temporarily.

   THE KEY IS NOT DERIVED FROM THE DOMAIN, and it never will be. The browser
   hands the relay an Origin header on every request (FORMAT.md section 6.2),
   so a relay knows the domain of every project writing to it: a key that was
   a function of the domain would be a key the relay can compute, and with it
   the id, and with both every note it stores. That is plain mode sold as
   encrypted. The key is random, it lives in the page, and the page is the
   one thing the server never sees.

   The SHAPE is not checked here: keyFromText() in 20-crypto is the single
   judge of what a key looks like, and it lives in the section that owns the
   format. What is recorded here is whether the key was WRITTEN at all -- an
   empty one is something somebody meant to fill in, and it gets said rather
   than ignored. */
const DECLARED_KEY = read('key');
const KEY_DECLARED = declaredIn(config, 'key');

/* True once the key in the page has been checked and adopted. It is what the
   interface says out loud, at every draw: see PUBLIC_KEY in 60-ui. */
let PUBLIC_KEY = false;

/* The write mode for the notes TO COME. Encrypted by default: it is the only
   default that does not ask the installer to understand the threat model
   before writing a first remark.

   The server stays the authority: on a relay it REFUSES "plain" with a 400,
   and its message is what gets shown. We do not duplicate here a rule we
   cannot check -- the client does not know whether it is talking to a relay. */
const MODE = read('mode').toLowerCase() === 'plain' ? 'plain' : 'encrypted';

/* The scope: which pages belong to the project.

   The path prefix is checked HERE, before anything else, and this is the
   only place where it can be: the server does not see paths (blind index,
   FORMAT.md section 4). So it is TIDINESS -- the declaration can stay at the
   foot of every page of the site without the online documentation collecting
   the staging notes -- and NOT a security boundary: whoever has the project id
   and the key writes wherever they like. */
const PATH_PREFIX = read('path');

/* The project origins. The real lock is the server's (FORMAT.md section
   6.2); this one only avoids talking to a server that is going to say no,
   for instance when the declaration was copied onto another site along with
   the rest of a template. It protects nothing: a hand-made client does not
   read it. */
const DOMAINS = read('domains').split(',').map((d) => d.trim()).filter(Boolean);

/* The zone: which PARTS of a page a remark can be written on, as a CSS
   selector list. The scope above says which pages; this says where on them.

   Only READ here, the way the key is: whether the selector is one, and what it
   matches, is judged by 30-state and 60-ui -- the second at every pick, since
   a framework can render the zone after the boot, or swap it at a navigation.
   DECLARED is kept apart from the text for the same reason as the key's: an
   empty data-zone is somebody who meant to write one, and it restricts to
   nothing rather than to everything.

   Guidance for reviewers, NOT a boundary: the server never sees an element,
   and a hand-made client writes wherever it likes. */
const ZONE_DECLARED = declaredIn(config, 'zone');
const ZONE_SELECTOR = read('zone');

/* Setup screen. It opens ONLY when asked for: without it, a page with no
   project does strictly nothing, like a directory copied there by mistake.
   That is the rule of silence, applied to setup. */
const SETUP_REQUESTED = read('setup') === 'yes';

/* Note-taking context, DECLARED by the host site, never guessed. A
   standalone tool cannot know how the site names its version; the site
   does. Without these the fields stay empty: an invented version would send
   someone hunting for a defect in a build that never existed.

   The viewport size is read AT SEND TIME and not here: the person may have
   resized, or flipped their phone, between the page load and the remark.
   What counts is the size they had in front of them. */
const SITE_VERSION = read('version');
const ENVIRONMENT = read('environment');
const currentViewport = () =>
    String(window.innerWidth || 0) + 'x' + String(window.innerHeight || 0);

/* A label file belonging to the site: DECLARED, and resolved against the
   DOCUMENT and not against this file. A translation file belongs to the site
   under review, not to the CDN serving the client. */
const LOCAL_LABELS_URL = read('labels')
    ? new URL(read('labels'), document.baseURI).href
    : null;

/* -- Limits ------------------------------------------------------------
   The SERVER is the authority: it applies its own and refuses by naming
   them, and it is ITS message that gets shown then. These only warn before
   sending, and keep an absurd string from going out.

   To be said plainly: in encrypted mode the server no longer sees fields,
   only an envelope (FORMAT.md section 3.6). Those limits then become a
   CLIENT CONVENTION, which nothing enforces on a modified client. That is
   the price of end-to-end encryption, and it is paid gladly: this tool is
   for a review team, not for a hostile audience. */

const MAX_TEXT = 4000;
const MAX_AUTHOR = 80;
const MAX_SELECTOR = 500;
const MAX_FINGERPRINT = 255;
const MAX_EXCERPT = 160;
