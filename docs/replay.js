/* replay.js -- A SESSION, ON A CLOCK.
 *
 * This file decides WHEN a line of a session appears, how tall the pane
 * holding them has to be, and how the working indicator moves. It never
 * decides what a line says, and it never decides when: every line is in the
 * markup, and so is every moment. The only text written here is the verb in
 * the indicator and the seconds in "Worked for", which are interface chrome
 * and carry no fact.
 *
 * WHY IT IS A FILE AND NOT A BLOCK IN A PAGE. It was a block in a page, for
 * one page, until the install page ended on a session of its own. Copying two
 * hundred and fifty lines of timeline into a second page is exactly the shape
 * of the bug that let this site's menus diverge -- two copies, both correct on
 * the day, one edited later. Its rules moved into base.css at the same time.
 *
 * WHAT IT EXPECTS. One element carrying `.rp` per session, and inside it:
 *
 *   .rp-flow        the pane, holding the lines
 *   .rp-user .band  the line the human typed -- read, then typed out
 *   [data-step]     a line; `data-at` says when it lands
 *   .rp-work        the indicator, with .rp-frame and .rp-verb in it
 *   .rp-worked      what replaces it, with .rp-worked-n for the seconds
 *   .rp-restart     the one line held between two passes
 *   .rp-line        the input box the question is typed into
 *
 * and, on the figure around it, a `.replay` control in the caption.
 *
 * The three moments framing the turn are on the root: `data-sent`, `data-end`,
 * `data-held`. A session with none of them still runs, on this file's own
 * numbers; a line with no `data-at` is simply on screen from the start.
 */
'use strict';

var arm = function (rp) {
    'use strict';

    /* EVERY PART IS FOUND BY CLASS, NEVER BY ID. Two pages carry a session
       now; an id can only be in one of them, and the day a third arrives the
       ids would have to be numbered -- which is how the menus of this site
       diverged. The root is the only thing passed in. */
    var flow  = rp.querySelector('.rp-flow');
    var ask   = rp.querySelector('.rp-user .band');
    var box   = rp.querySelector('.rp-line');
    var work  = rp.querySelector('.rp-work');
    var glyph = rp.querySelector('.rp-frame');
    var verb  = rp.querySelector('.rp-verb');
    var wkd   = rp.querySelector('.rp-worked-n');
    var rest  = rp.querySelector('.rp-restart');
    /* The control is in the caption, outside the frame, because the frame is
       aria-hidden. So it is looked for on the figure, not on the root. */
    var fig   = rp.closest('.fig');
    var again = fig && fig.querySelector('.replay');
    if (!flow || !ask || !box || !work || !glyph || !verb || !again || !wkd || !rest) return;

    var all = flow.querySelectorAll('[data-step]');
    if (!all.length) return;

    /* The interface's own vocabulary. Twelve frames, a palindrome, in a cell
       that is always two columns wide; the verbs are the ones the tool
       actually draws, one drawn per turn and unchanged while that turn runs. */
    var FRAMES = ['·', '✢', '*', '✶', '✻', '✽',
                  '✽', '✻', '✶', '*', '✢', '·'];
    /* The interface draws one of these per turn. THIS figure draws the same
       one every time, and that is the point: it is captioned as a capture, and
       a capture does not say Churning to one reader and Percolating to the
       next. The list is kept because it is the real vocabulary and the index
       is what makes the choice a decision instead of a throw. */
    var VERBS = ['Accomplishing', 'Actioning', 'Baking', 'Brewing', 'Cerebrating',
                 'Churning', 'Cogitating', 'Contemplating', 'Deliberating',
                 'Herding', 'Marinating', 'Musing', 'Noodling', 'Percolating',
                 'Pondering', 'Puzzling'];
    /* Which one this figure draws is written on the root, and it is checked
       against the list: a typo would put a word in the indicator that the
       interface never draws, which is the one thing this figure must not do.
       Nothing written, and it is Pondering -- nine cells, the shimmer has
       room. */
    var VERB = VERBS[14];
    var asked = rp.getAttribute('data-verb');
    for (var v = 0; asked && v < VERBS.length; v++) if (VERBS[v] === asked) VERB = asked;

    /* The line the human typed. Read from the markup, split into cells, and
       revealed one cell at a time. */
    var FULL = ask.textContent;
    var cells = [];
    var buildCells = function () {
        while (box.childNodes.length > 2) box.removeChild(box.lastChild);
        cells = [];
        for (var k = 0; k <= FULL.length; k++) {
            var s = document.createElement('span');
            s.className = 'ch';
            /* One cell past the end, so the block cursor has somewhere to
               stand once the line is finished. */
            s.textContent = k < FULL.length ? FULL.charAt(k) : ' ';
            box.appendChild(s);
            cells.push(s);
        }
    };

    /* Uniform typing is the loudest tell. Base 45 ms a character with 25 ms of
       jitter either way, two and a half times that after a comma, four times
       after a full stop, and one real hesitation somewhere in the middle --
       then the whole shape scaled to the budget the timeline gives it. Scaling
       keeps the unevenness, which is the part that reads as a person, and
       drops the absolute rate, which nobody can judge. */
    var TYPE_AT = 120, TYPE_MS = 1500;
    var marks = [];
    var plan = function () {
        var d = [], k, prev, ms, sum = 0;
        for (k = 0; k < FULL.length; k++) {
            ms = 45 + (Math.random() * 50 - 25);
            prev = k > 0 ? FULL.charAt(k - 1) : '';
            if (prev === ',' || prev === ';') ms *= 2.5;
            else if (prev === '.' || prev === '?' || prev === '!') ms *= 4;
            d.push(ms);
        }
        k = Math.floor(FULL.length / 3) + Math.floor(Math.random() * FULL.length / 3);
        d[k] += 300 + Math.random() * 300;
        for (k = 0; k < d.length; k++) sum += d[k];
        marks = [];
        var run = 0;
        for (k = 0; k < d.length; k++) { run += d[k] * TYPE_MS / sum; marks.push(TYPE_AT + run); }
    };

    /* The whole session fits the pane, so this never has anything to do. It
       stays as insurance: if a fallback font ever wraps a line the measurement
       did not expect, the newest line is the one that survives. */
    var toBottom = function () { flow.scrollTop = flow.scrollHeight; };
    /* THE TURN, AND WHAT LANDS WHEN, AND NONE OF IT IS HERE. One user line,
       one turn. Every moment is written on the markup it belongs to -- the
       three that frame the turn on the root, and one per line on the line
       itself -- because a timing is a fact about a session, and this file
       knows no session. Reading them here means a page can be re-cut without
       opening a script, and two pages cannot drift into two timelines.

         data-sent   the line goes in, the pane is cleared, the turn opens
         data-end    the turn closes and is replaced by the time it took
         data-held   the finished session has been held long enough to read
         data-at     on a line: when that line lands

       `data-held` and not `data-done`: `data-done` is a STATE this file sets
       on the same element when a figure has stopped for good, and the
       stylesheet reveals the replay control off it. A moment and a state
       cannot share a name -- written that way, the first reset wiped the
       timing and the control appeared under a session still playing.

       No time in either page is round: 2.0 / 5.0 / 7.5 land like slides. */
    var ms = function (el, name, fallback) {
        var raw = el.getAttribute(name);
        var n = raw === null ? NaN : Number(raw);
        return isFinite(n) ? n : fallback;
    };
    var SENT = ms(rp, 'data-sent', 1740);
    var TURN_END = ms(rp, 'data-end', 10740);
    var DONE = ms(rp, 'data-held', TURN_END + 4000);

    var CUES = [
        [SENT,  function () {
            rp.removeAttribute('data-idle');
            /* Emptied, not merely hidden: a hidden cell still holds its row,
               and the box would stay as tall as the line that just left it. */
            typed = marks.length;
            while (box.childNodes.length > 2) box.removeChild(box.lastChild);
            cells = [];
            /* The line the human typed is the first thing the turn shows, and
               it carries no `data-at`: it lands with the send, by definition,
               and a moment written for it could disagree with the send. */
            var user = flow.querySelector('.rp-user');
            if (user) { user.classList.add('on'); toBottom(); }
            rp.setAttribute('data-working', '');
        }]
    ];
    (function () {
        var k, at;
        for (k = 0; k < all.length; k++) {
            if (all[k].classList.contains('rp-user')) continue;
            at = ms(all[k], 'data-at', NaN);
            /* A line with no moment never appears. Dropping it silently would
               hide a session line; showing it at once would put it before the
               line it answers. It stays where the markup put it, on screen
               from the start, which is what the page looks like with no
               script at all. */
            if (!isFinite(at)) { all[k].classList.add('on'); continue; }
            CUES.push([at, (function (el) {
                return function () { el.classList.add('on'); toBottom(); };
            }(all[k]))]);
        }
        CUES.sort(function (a, b) { return a[0] - b[0]; });
    }());
    CUES.push(
        /* The turn ends here. What it leaves is not nothing: the indicator is
           replaced in place by the time it took. Whole seconds, floored, from
           this timeline's own numbers -- change a moment in the markup and the
           line follows. */
        [TURN_END, function () {
            rp.removeAttribute('data-working');
            wkd.textContent = Math.floor((TURN_END - SENT) / 1000) + 's';
            rp.setAttribute('data-worked', '');
            toBottom();
        }],
        [DONE,  function () { if (cycle + 1 >= CYCLES) rp.setAttribute('data-done', ''); toBottom(); }]);

    var verbCells = [], lastGlyph = '', lastLit = -99;
    var setVerb = function (word) {
        verb.textContent = '';
        verbCells = [];
        var text = ' ' + word + '…';
        for (var k = 0; k < text.length; k++) {
            var s = document.createElement('span');
            s.textContent = text.charAt(k);
            verb.appendChild(s);
            verbCells.push(s);
        }
        lastLit = -99;
    };
    var paint = function (e) {
        /* The frame ticks every 100 ms on a two-second cosine: the glyph swells
           and shrinks, it does not rotate. A spinner turning at a constant rate
           is the third tell on the list. */
        var q = Math.floor(e / 100) * 100;
        var gl = FRAMES[Math.round(((1 - Math.cos(2 * Math.PI * q / 2000)) / 2) * 11)];
        if (gl !== lastGlyph) { glyph.textContent = gl; lastGlyph = gl; }

        /* Three cells of brighter ink crossing the verb right to left, one
           whole cell every 200 ms, restarting ten cells past each end. */
        var len = verbCells.length;
        var lit = (len + 9) - (Math.floor(e / 200) % (len + 20));
        if (lit !== lastLit) {
            for (var k = 0; k < len; k++) {
                verbCells[k].className = Math.abs(k - lit) <= 1 ? 'lit' : '';
            }
            lastLit = lit;
        }
    };

    /* One loop over one clock. Nested timers drift; a timeline against the
       wall clock does not, and pause and replay come for free. */
    var t0 = 0, cue = 0, typed = 0, raf = 0;
    var FADE = 520;
    var CYCLES = Infinity, GAP = 2600, cycle = 0, armed = false;

    /* THE PANE IS AS TALL AS THE SESSION, AND NOT A LINE TALLER. Every line is
       laid out at this width, once, and the pane is fixed to what that
       measured. Nothing then scrolls, at any width, in any font fallback, and
       the figure never changes height while it plays. A number written into
       the stylesheet would have to be a guess at how a fallback monospace
       wraps a 91-character command, and it would go stale the day a line above
       is edited. This cannot. */
    var sizeFlow = function () {
        var k, was = [];
        /* What is already on screen goes back on screen. Measuring is not an
           event in the session: a reader who turns the phone sideways halfway
           through must find the same session, laid out again. */
        for (k = 0; k < all.length; k++) {
            was[k] = all[k].classList.contains('on');
            all[k].classList.add('on');
        }
        flow.style.height = 'auto';
        var h = Math.ceil(flow.scrollHeight);
        flow.style.height = h + 'px';
        for (k = 0; k < all.length; k++) if (!was[k]) all[k].classList.remove('on');
    };

    var reset = function () {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; cue = 0; typed = 0;
        lastGlyph = ''; lastLit = -99;
        for (var k = 0; k < all.length; k++) all[k].classList.remove('on');
        rp.removeAttribute('data-done');
        rp.removeAttribute('data-working');
        rp.removeAttribute('data-worked');
        rp.removeAttribute('data-restart');
        rp.setAttribute('data-play', '');
        rp.setAttribute('data-idle', '');
        sizeFlow();
        flow.scrollTop = 0;
        buildCells();
        /* AND THE INPUT BOX KEEPS THE HEIGHT OF THE LINE IT IS ABOUT TO HOLD.
           On a phone the question wraps to two rows, and sending it dropped the
           box back to one -- sixteen pixels taken out of the middle of the
           figure at the exact moment the reader's eye arrived. */
        box.style.minHeight = '';
        box.style.minHeight = box.offsetHeight + 'px';
        cells[0].className = 'ch cur';
        setVerb(VERB);
        plan();
    };

    var tick = function (now) {
        var t = now - t0;

        while (typed < marks.length && typed < cells.length && t >= marks[typed]) {
            rp.removeAttribute('data-idle');
            cells[typed].className = 'ch on';
            typed++;
            if (typed < cells.length) cells[typed].className = 'ch cur';
        }
        while (cue < CUES.length && t >= CUES[cue][0]) { CUES[cue][1](); cue++; }
        if (t >= SENT && t < TURN_END) paint(t - SENT);

        if (t < DONE) { raf = requestAnimationFrame(tick); return; }
        if (cycle + 1 >= CYCLES) { raf = 0; return; }

        /* The reset, held. Everything the session put on screen comes off and
           the one line left says what is happening. A full second and a half,
           so it reads as deliberate rather than as a glitch. */
        if (!armed) {
            armed = true;
            for (var k = 0; k < all.length; k++) all[k].classList.remove('on');
            rp.removeAttribute('data-working');
            rp.removeAttribute('data-worked');
            rp.setAttribute('data-restart', '');
            rp.setAttribute('data-rewind', '');
            flow.scrollTop = 0;
        }
        // The fade lifts before the replay starts, for the same reason as in
        // the gesture above: one must see it come back, not see it jump.
        if (t >= DONE + GAP - FADE) rp.removeAttribute('data-rewind');
        if (t < DONE + GAP) { raf = requestAnimationFrame(tick); return; }
        cycle++;
        play();
    };

    var play = function () {
        reset();
        armed = false;
        t0 = (window.performance && performance.now) ? performance.now() : Date.now();
        raf = requestAnimationFrame(tick);
    };

    again.addEventListener('click', function () { cycle = 0; play(); });

    /* A resize rewraps every line, so the pane is measured again. Only the
       height moves; the session keeps its place on the clock. */
    var settle = 0;
    window.addEventListener('resize', function () {
        if (!rp.hasAttribute('data-play')) return;
        if (settle) clearTimeout(settle);
        settle = setTimeout(function () {
            sizeFlow();
            if (cells.length) {
                box.style.minHeight = '';
                box.style.minHeight = box.offsetHeight + 'px';
            }
            toBottom();
        }, 200);
    });

    /* What moves in this replay is a timeline revealing lines, and
       `animation: none` cannot reach a timeline -- this page carried the usual
       prefers-reduced-motion block and the session still typed, scrolled and
       counted for its whole length. So when the reader has asked for no motion
       the script does not arm. Nothing is hidden, nothing types, nothing
       counts: what is left is the markup, which is the whole session standing
       still. The control stays, and pressing it is the reader asking for the
       motion themselves. */
    var quiet = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (quiet && quiet.matches) {
        rp.setAttribute('data-quiet', '');
        again.textContent = 'Play the session';
        return;
    }

    /* Armed at once, played later. Arming is what collapses the session to a
       terminal-sized pane, and it has to happen before the first paint --
       otherwise the reader sees the whole thing, then watches it disappear.
       Only the clock waits.

       AND WHAT IT WAITS AS IS A FINISHED SESSION, NOT AN EMPTY PANE: every
       line on screen, the turn closed with the time it took. Nothing is
       invented here -- the seconds come from the same two constants, so the
       resting frame cannot say a different number from the one the reader
       watches. The first cue of the first pass clears it. */
    reset();
    (function () {
        for (var k = 0; k < all.length; k++) all[k].classList.add('on');
        while (box.childNodes.length > 2) box.removeChild(box.lastChild);
        cells = [];
        rp.removeAttribute('data-idle');
        wkd.textContent = Math.floor((TURN_END - SENT) / 1000) + 's';
        rp.setAttribute('data-worked', '');
        toBottom();
    }());

    /* And the clock waits until the frame is actually on screen: a session
       that played out while the reader was still in the hero never happened. A
       margin rather than a ratio, because the frame is taller than a short
       window and a ratio can then never be reached. */
    var started = false;
    /* The same beat as the gesture above, for the same reason and with the
       same value: the reader gets to see the terminal before it types. */
    var LEAD_IN = 2200;
    var begin = function () {
        if (started) return;
        started = true;
        setTimeout(play, LEAD_IN);
    };

    if (window.IntersectionObserver) {
        var watch = new IntersectionObserver(function (entries) {
            for (var k = 0; k < entries.length; k++) {
                if (entries[k].isIntersecting) { watch.disconnect(); begin(); }
            }
        }, { rootMargin: '-15% 0px -15% 0px', threshold: 0 });
        watch.observe(rp);
    } else {
        begin();
    }
};

/* One page, as many sessions as it carries. Each is armed on its own clock and
   knows nothing of the others: the install page's ends where the usage page's
   begins, and neither waits for the other. */
(function () {
    var rps = document.querySelectorAll('.rp');
    for (var i = 0; i < rps.length; i++) arm(rps[i]);
}());
