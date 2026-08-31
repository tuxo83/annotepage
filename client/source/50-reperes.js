/* -- 11. Les trois reperes d'un element ----------------------------------
   Aucun n'est fiable seul : un chemin casse au premier bloc insere, une
   empreinte de classes casse a la refonte du style, un extrait de texte casse
   a la relecture editoriale. Ensemble, ils permettent de DEGRADER — signaler
   la note comme orpheline — au lieu de la perdre. */

const cheminCss = (el) => {
    const bouts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body && n !== document.documentElement) {
        const balise = n.localName;
        let rang = 1;
        let f = n.previousElementSibling;
        while (f) {
            if (f.localName === balise) rang += 1;
            f = f.previousElementSibling;
        }
        bouts.unshift(balise + ':nth-of-type(' + rang + ')');
        n = n.parentElement;
    }
    // Trop long pour la colonne : on abandonne les segments de tete. Le chemin
    // devient relatif et peut designer plusieurs elements — c'est exactement
    // pour cela que l'empreinte et l'extrait existent.
    let chemin = bouts.join(' > ');
    while (chemin.length > MAX_SELECTEUR && bouts.length > 1) {
        bouts.shift();
        chemin = bouts.join(' > ');
    }
    return couper(chemin, MAX_SELECTEUR);
};

const empreinteDe = (el) => {
    if (!el || el.nodeType !== 1) return '';
    let e = el.localName;
    if (el.id) e += '#' + el.id;
    const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < classes.length && i < 4; i += 1) e += '.' + classes[i];
    return couper(e, MAX_EMPREINTE);
};

/**
 * Le texte par lequel un humain reconnait l'element. C'est ce qui s'affiche
 * dans le panneau : « A propos de : Contactez-nous ». Jamais le chemin,
 * jamais l'empreinte — ce sont des reperes de machine.
 */
const extraitDe = (el) => {
    if (!el || el.nodeType !== 1) return '';
    let t = normaliser(el.textContent);
    if (!t) {
        t = normaliser(
            el.getAttribute('alt') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('title') ||
            (el.localName === 'input' ? el.value : '') ||
            ''
        );
    }
    return couper(t, MAX_EXTRAIT);
};

/* -- 12. Retrouver l'element d'une note ---------------------------------- */

const score = (el, note) => {
    let s = 0;
    if (note.empreinte && empreinteDe(el) === note.empreinte) s += 2;
    if (note.extrait) {
        const t = extraitDe(el);
        if (t === note.extrait) s += 2;
        else if (t && note.extrait.length >= 12 && t.indexOf(note.extrait.slice(0, 24)) === 0) s += 1;
    }
    return s;
};

/**
 * Trois tentatives, de la plus precise a la plus large. Si aucune ne rend un
 * element assez ressemblant, la note devient ORPHELINE : elle reste lisible
 * dans le panneau, avec sa date et son auteur, au lieu de disparaitre sans
 * que personne le sache.
 */
const retrouver = (note) => {
    if (!note.selecteur && !note.empreinte && !note.extrait) return null;

    // 1. Le chemin, verifie par au moins un des deux autres reperes.
    if (note.selecteur) {
        let el = null;
        try {
            el = document.body.querySelector(note.selecteur);
        } catch (e) {
            el = null; // chemin devenu invalide : ce n'est pas une panne
        }
        if (el && !dansOutil(el)) {
            if (!note.empreinte && !note.extrait) return el;
            if (score(el, note) >= 1) return el;
        }
    }

    // 2. L'empreinte : meme balise, memes classes, meme identifiant.
    if (note.empreinte) {
        const balise = note.empreinte.split(/[#.]/)[0];
        let candidats = [];
        try {
            candidats = Array.prototype.slice.call(document.body.querySelectorAll(balise));
        } catch (e) {
            candidats = [];
        }
        let meilleur = null;
        let meilleurScore = 0;
        for (let i = 0; i < candidats.length; i += 1) {
            const c = candidats[i];
            if (dansOutil(c)) continue;
            const s = score(c, note);
            if (s > meilleurScore) {
                meilleur = c;
                meilleurScore = s;
            }
        }
        if (meilleur && meilleurScore >= 2) return meilleur;
    }

    // 3. Le texte seul, s'il est assez long pour ne pas designer n'importe
    //    quoi. C'est le repere qui survit le mieux a une refonte du style.
    if (note.extrait && note.extrait.length >= 12) {
        const tous = document.body.querySelectorAll('*');
        for (let i = 0; i < tous.length; i += 1) {
            const c = tous[i];
            if (dansOutil(c)) continue;
            if (extraitDe(c) === note.extrait) return c;
        }
    }

    return null;
};

/** Repartit les notes du serveur entre elements retrouves et orphelines. */
const ancrer = () => {
    ancrees = [];
    orphelines = [];
    for (let i = 0; i < notes.length; i += 1) {
        const note = notes[i];
        const el = retrouver(note);
        if (!el) {
            orphelines.push(note);
            continue;
        }
        let groupe = null;
        for (let j = 0; j < ancrees.length; j += 1) {
            if (ancrees[j].element === el) groupe = ancrees[j];
        }
        if (!groupe) {
            groupe = { element: el, notes: [] };
            ancrees.push(groupe);
        }
        groupe.notes.push(note);
    }
};
