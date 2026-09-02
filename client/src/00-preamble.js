/* -- 0. Where am I, which project, and therefore where is the API --------
   Nothing below is guessed. Everything is DECLARED on the tag, because a
   client served by a CDN can no longer deduce anything from its own
   address: that address says nothing about the site under review. */

const script = document.currentScript;
if (!script || !script.src) {
    /* Loaded some other way than <script src>: we do not guess an API
       address, we stay out. Careful, this also covers type="module" --
       document.currentScript is null there. The tag must stay a classic
       tag, and the README says so. */
    return;
}

const data = script.dataset || {};
const read = (name) => String((data[name] === undefined ? '' : data[name])).trim();

/* The server address.

   Self-hosted, the client is served by the site itself and the old
   "../api.php" deduction is still enough: it worked for the whole life of
   format 1, we are not removing it.

   As soon as the client goes to a CDN it becomes wrong -- the API is not at
   the CDN -- and it has to be declared. We do not try to recover: an API
   address guessed wrong would send the remarks nowhere. */
const DECLARED_SERVER = read('server');
let API = '';
if (DECLARED_SERVER) {
    API = new URL(DECLARED_SERVER, document.baseURI).href;
} else if (new URL(script.src).origin === location.origin) {
    API = new URL('../api.php', script.src).href;
}

/* The project id, generated at setup (see 70-setup). 22 base64url
   characters: the shape is checked here, because an id truncated by a
   copy-paste would otherwise produce an empty project on the server side,
   and a page that never shows a single note. */
const DECLARED_PROJECT = read('project');
const PROJECT_WELL_FORMED = /^[A-Za-z0-9_-]{22}$/.test(DECLARED_PROJECT);
/* NOT a const: with data-key the id is DERIVED rather than declared, and
   90-boot writes it here once derive() has produced it. There is one PROJECT
   in this scope and everything downstream reads it -- two would have
   diverged. */
let PROJECT = PROJECT_WELL_FORMED ? DECLARED_PROJECT : '';

/* THE KEY, WRITTEN IN THE TAG -- and that attribute IS the mode.

   data-key    the key itself: the project is PUBLIC. Whoever can load the
               page can read the notes and write them. Nothing is asked for,
               nothing is stored, and no id is declared: derive() already
               produces it from the key (HKDF label "id"), so writing both
               would be writing the same fact twice in a tag people copy by
               hand -- where the two can disagree.
   data-project  the id alone: confidential. The key is asked for once per
               browser, and until it is there nothing is fetched and nothing
               is decrypted. That is the behaviour of every version so far.
   data-setup  neither, temporarily.

   THE KEY IS NOT DERIVED FROM THE DOMAIN, and it never will be. The browser
   hands the relay an Origin header on every request (FORMAT.md section 6.2),
   so a relay knows the domain of every project writing to it: a key that was
   a function of the domain would be a key the relay can compute, and with it
   the id, and with both every note it stores. That is plain mode sold as
   encrypted. The key is random, it lives in the page, and the page is the
   one thing the server never sees.

   The SHAPE is not checked here: saltFromText() in 20-crypto is the single
   judge of what a key looks like, and it lives in the section that owns the
   format. What is recorded here is whether the attribute was WRITTEN at all
   -- an empty data-key is a tag somebody meant to fill in, and it gets said
   rather than ignored. */
const DECLARED_KEY = read('key');
const KEY_DECLARED = Object.prototype.hasOwnProperty.call(data, 'key');

/* True once the key in the tag has been checked and adopted. It is what the
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
   FORMAT.md section 4). So it is TIDINESS -- the tag can stay at the foot of
   every page of the site without the online documentation collecting the
   staging notes -- and NOT a security boundary: whoever has the project id
   and the salt writes wherever they like. */
const PATH_PREFIX = read('path');

/* The project origins. The real lock is the server's (FORMAT.md section
   6.2); this one only avoids talking to a server that is going to say no,
   for instance when the tag was copied onto another site along with the
   rest of a template. It protects nothing: a hand-made client does not read
   it. */
const DOMAINS = read('domains').split(',').map((d) => d.trim()).filter(Boolean);

/* Setup screen. It opens ONLY when asked for by an attribute: without it, a
   tag with no project does strictly nothing, like a directory copied there
   by mistake. That is the rule of silence, applied to setup. */
const SETUP_REQUESTED = Object.prototype.hasOwnProperty.call(data, 'setup');

/* Note-taking context, DECLARED by the host site, never guessed. A
   standalone tool cannot know how the site names its version; the site
   does. Without these attributes the fields stay empty: an invented version
   would send someone hunting for a defect in a build that never existed.

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
