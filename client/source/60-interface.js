/* -- 13. Construction de l'interface -------------------------------------
   Tout ce qui suit vit dans le shadow root. Le site hote n'en voit rien,
   et n'est vu de rien. */

/**
 * L'element hote et son shadow root, et RIEN D'AUTRE.
 *
 * Il est cree avant que les libelles soient charges — il faut un shadow
 * root pour les y charger — mais il ne montre rien : l'interface, elle,
 * n'est batie qu'une fois les textes disponibles.
 */
const batirHote = () => {
    // IDEMPOTENT, et ce n'est pas une precaution de style : l'ecran de collage
    // du sel bati l'hote AVANT que le demarrage normal ne le demande a son
    // tour. Sans cette garde, le site recevait DEUX elements, dont un vide et
    // orphelin — la promesse « un seul element ajoute » tombait au premier
    // sel colle.
    if (hote) return;
    hote = document.createElement('annotepage-notes');
    // Ces proprietes sont posees EN LIGNE et en !important, sur notre propre
    // element : une regle du site visant « body > div » ne doit pas pouvoir
    // deplacer la couche. « all: initial » coupe en outre tout heritage du
    // site vers l'outil.
    hote.style.cssText =
        'all: initial !important;' +
        'position: fixed !important;' +
        'top: 0 !important; left: 0 !important;' +
        'right: 0 !important; bottom: 0 !important;' +
        'width: auto !important; height: auto !important;' +
        'margin: 0 !important; padding: 0 !important; border: 0 !important;' +
        'pointer-events: none !important;' +
        'z-index: 2147483000 !important;';
    document.body.appendChild(hote);
    racine = hote.attachShadow({ mode: 'open' });

    /* La feuille de style est POSEE ICI, en <style>, et non chargee par un
       <link> comme dans l'outil d'origine.

       Raison : le client part en CDN sous SRI. Une seconde requete vers un
       fichier voisin demanderait une seconde empreinte a tenir a jour, et
       personne ne tient deux empreintes en accord bien longtemps. Un seul
       fichier, une seule empreinte, une seule chose a verifier.

       Effet de bord agreable : la feuille est la avant le premier pixel. Le
       masquage puis l'affichage de l'element hote, qui existaient pour ne pas
       montrer l'outil sans style pendant une fraction de seconde, n'ont plus
       lieu d'etre et ont disparu.

       Prix a dire : la feuille pese dans le fichier servi, et le style ne se
       remplace plus en changeant un fichier voisin — il faut reconstruire. */
    /* Deux voies, et la premiere n'est pas de la coquetterie : une politique
       de securite de contenu stricte (style-src sans 'unsafe-inline') BLOQUE
       un element <style>, et l'outil s'afficherait sans style — ce qui
       ressemble a une page cassee. Une feuille CONSTRUITE, elle, n'est pas
       une feuille en ligne au sens de la politique, et passe. On garde
       <style> pour les navigateurs qui ne construisent pas de feuille. */
    let posee = false;
    try {
        if (racine.adoptedStyleSheets && typeof CSSStyleSheet === 'function') {
            const feuille = new CSSStyleSheet();
            feuille.replaceSync(STYLES);
            racine.adoptedStyleSheets = [feuille];
            posee = true;
        }
    } catch (e) {
        posee = false;
    }
    if (!posee) {
        const style = document.createElement('style');
        style.textContent = STYLES;
        racine.appendChild(style);
    }
};

/** L'interface. Batie APRES les libelles : aucun texte de repli a poser. */
const batirUi = () => {
    const couche = creer('div', 'ap-couche');
    racine.appendChild(couche);

    /* -- le bouton -- */
    const bouton = creer('button', 'ap-bouton');
    bouton.type = 'button';
    bouton.setAttribute('aria-pressed', 'false');
    bouton.title = T('bouton.aide');
    const pastille = creer('span', 'ap-bouton-pastille');
    const boutonTexte = creer('span', null, T('bouton.ouvrir'));
    const boutonCompte = creer('span', 'ap-bouton-compte');
    bouton.appendChild(pastille);
    bouton.appendChild(boutonTexte);
    bouton.appendChild(boutonCompte);
    bouton.addEventListener('click', () => basculerMode());
    couche.appendChild(bouton);

    /* -- surbrillance de designation -- */
    const surbrillance = creer('div', 'ap-surbrillance');
    const etiquette = creer('div', 'ap-surbrillance-etiquette');
    couche.appendChild(surbrillance);
    couche.appendChild(etiquette);

    /* -- marqueurs -- */
    const marqueurs = creer('div', 'ap-marqueurs');
    couche.appendChild(marqueurs);

    /* -- panneau -- */
    const panneau = creer('aside', 'ap-panneau');
    panneau.setAttribute('role', 'complementary');
    const entete = creer('div', 'ap-panneau-entete');
    const titre = creer('span', 'ap-panneau-titre', T('panneau.titre'));
    const fermer = creer('button', 'ap-lien', T('panneau.fermer'));
    fermer.type = 'button';
    fermer.addEventListener('click', () => quitterMode());
    entete.appendChild(titre);
    entete.appendChild(fermer);
    const consigne = creer('div', 'ap-panneau-consigne');
    consigne.appendChild(creer('div', null, T('panneau.consigne')));
    consigne.appendChild(creer('div', null, T('panneau.echap')));
    const corps = creer('div', 'ap-panneau-corps');
    const pied = creer('div', 'ap-panneau-pied');
    panneau.appendChild(entete);
    panneau.appendChild(consigne);
    panneau.appendChild(corps);
    panneau.appendChild(pied);
    couche.appendChild(panneau);

    /* -- formulaire -- */
    const fiche = creer('div', 'ap-fiche');
    couche.appendChild(fiche);

    ui = {
        couche: couche,
        bouton: bouton,
        boutonTexte: boutonTexte,
        boutonCompte: boutonCompte,
        surbrillance: surbrillance,
        etiquette: etiquette,
        marqueurs: marqueurs,
        panneau: panneau,
        corps: corps,
        pied: pied,
        fiche: fiche
    };
};

/* -- 14. Surbrillance et marqueurs --------------------------------------- */

const placer = (el, rect, marge) => {
    const m = marge || 0;
    el.style.left = Math.max(0, rect.left - m) + 'px';
    el.style.top = Math.max(0, rect.top - m) + 'px';
    el.style.width = Math.max(0, rect.width + m * 2) + 'px';
    el.style.height = Math.max(0, rect.height + m * 2) + 'px';
};

const montrerSurbrillance = (el) => {
    if (!el) return cacherSurbrillance();
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return cacherSurbrillance();
    placer(ui.surbrillance, r, 1);
    ui.surbrillance.style.display = 'block';

    const texte = extraitDe(el);
    ui.etiquette.textContent = texte || T('formulaire.sur_sans_texte');
    ui.etiquette.style.display = 'block';
    const haut = r.top > 26 ? r.top - 24 : Math.min(window.innerHeight - 24, r.bottom + 4);
    ui.etiquette.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 330)) + 'px';
    ui.etiquette.style.top = haut + 'px';
};

const cacherSurbrillance = () => {
    if (!ui) return;
    ui.surbrillance.style.display = 'none';
    ui.etiquette.style.display = 'none';
};

/** Un pastillage par element annote. Il n'apparait qu'en mode annotation :
    hors de ce mode, la page est exactement celle du site. */
const dessinerMarqueurs = () => {
    vider(ui.marqueurs);
    if (!mode) return;
    for (let i = 0; i < ancrees.length; i += 1) {
        const groupe = ancrees[i];
        const r = groupe.element.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.bottom < 0 || r.top > window.innerHeight) continue;
        const n = groupe.notes.length;
        const pastille = creer('button', 'ap-marqueur', String(n));
        pastille.type = 'button';
        pastille.title = n === 1 ? T('marqueur.une') : T('marqueur.n', { n: n });
        pastille.style.left = Math.max(2, Math.min(r.left - 8, window.innerWidth - 30)) + 'px';
        pastille.style.top = Math.max(2, Math.min(r.top - 8, window.innerHeight - 30)) + 'px';
        pastille.addEventListener('click', ((note) => () => viser(note))(groupe.notes[0]));
        ui.marqueurs.appendChild(pastille);
    }
};

const rafraichirPositions = () => {
    if (rafDemande) return;
    rafDemande = true;
    window.requestAnimationFrame(() => {
        rafDemande = false;
        if (!mode) return;
        dessinerMarqueurs();
        if (survole && document.contains(survole)) montrerSurbrillance(survole);
        if (cible && document.contains(cible)) positionnerFiche(cible);
    });
};

/* -- 15. Le panneau ------------------------------------------------------ */

const blocPanne = (panne, surFermeture) => {
    const bloc = creer('div', 'ap-erreur');
    bloc.setAttribute('role', 'alert');
    bloc.appendChild(creer('div', 'ap-erreur-titre', panne.titre));
    // Le message du serveur est affiche TEL QU'IL A ETE REDIGE : c'est
    // ainsi que « la base est injoignable » atteint l'ecran d'un relecteur.
    bloc.appendChild(creer('p', 'ap-erreur-detail', panne.detail));
    if (surFermeture) {
        const masquer = creer('button', 'ap-lien', T('erreur.masquer'));
        masquer.type = 'button';
        masquer.addEventListener('click', surFermeture);
        bloc.appendChild(masquer);
    }
    return bloc;
};

const carteNote = (note, orpheline) => {
    /* Etat de correction, dit sur la carte elle-meme. Deux cas distincts :
       corrigee et en ligne, ou corrigee mais pas encore deployee — le
       second doit se voir, sinon on croit le defaut resolu alors qu'il est
       toujours a l'ecran. */
    const enLigne = note.resolue_le ? dejaDeploye(note.resolue_version) : false;
    const carte = creer('article', 'ap-note'
        + (orpheline ? ' ap-orpheline' : '')
        + (note.resolue_le ? (enLigne ? ' ap-corrigee' : ' ap-corrigee-attente') : ''));
    carte.setAttribute('data-ap-note', String(note.id));
    if (note.resolue_le) {
        const marque = creer('div', 'ap-marque-etat',
            enLigne
                ? T('note.corrigee', {
                    date: dateLisible(note.resolue_le),
                    par: note.resolue_par || '?',
                  })
                : T('note.corrigee_attente'));
        marque.title = note.resolue_version
            ? 'Correction partie en version ' + note.resolue_version
            : '';
        carte.appendChild(marque);
    }

    const entete = creer('div', 'ap-note-entete');
    entete.appendChild(creer('span', 'ap-note-auteur', note.auteur));
    entete.appendChild(creer('span', 'ap-note-date', dateLisible(note.cree_le)));
    carte.appendChild(entete);

    // Ce que le relecteur voit de l'element : son TEXTE, jamais son chemin.
    const cibleTexte = orpheline
        ? (note.extrait
            ? T('note.sur', { extrait: note.extrait }) + ' — ' + T('note.element_perdu')
            : T('note.element_perdu'))
        : (note.extrait ? T('note.sur', { extrait: note.extrait }) : T('note.sans_element'));
    carte.appendChild(creer('p', 'ap-note-cible', cibleTexte));

    carte.appendChild(creer('p', 'ap-note-texte', note.texte));

    const actions = creer('div', 'ap-note-actions');
    const repondre = creer('button', 'ap-secondaire', T('note.repondre'));
    repondre.type = 'button';
    actions.appendChild(repondre);
    if (!orpheline) {
        const montrer = creer('button', 'ap-lien', T('note.voir'));
        montrer.type = 'button';
        montrer.addEventListener('click', () => montrerElement(note));
        actions.appendChild(montrer);
    }
    /* Marquer corrigee, et revenir sur cette marque. Sans ce bouton, la
       moitie de l'outil — l'action serveur, ses colonnes, l'historique et
       ses libelles — restait ecrite et injoignable : personne ne pouvait
       poser l'etat que le panneau savait afficher. */
    const etat = creer('button', 'ap-lien',
        T(note.resolue_le ? 'note.rouvrir' : 'note.marquer_corrigee'));
    etat.type = 'button';
    etat.addEventListener('click', () => {
        const ouvert = carte.querySelector('.ap-resoudre');
        if (ouvert) {
            ouvert.remove();
            return;
        }
        carte.appendChild(formulaireResolution(note, !note.resolue_le));
    });
    actions.appendChild(etat);
    carte.appendChild(actions);

    const reponses = creer('div', 'ap-reponses');
    const liste = note.reponses || [];
    for (let i = 0; i < liste.length; i += 1) {
        const r = liste[i];
        const bloc = creer('div', 'ap-reponse');
        const e = creer('div', 'ap-note-entete');
        e.appendChild(creer('span', 'ap-note-auteur', r.auteur));
        e.appendChild(creer('span', 'ap-note-date', dateLisible(r.cree_le)));
        bloc.appendChild(e);
        bloc.appendChild(creer('p', 'ap-note-texte', r.texte));
        reponses.appendChild(bloc);
    }
    if (liste.length) carte.appendChild(reponses);

    repondre.addEventListener('click', () => {
        if (carte.querySelector('.ap-repondre')) return;
        carte.appendChild(formulaireReponse(note));
    });

    return carte;
};

/**
 * Marquer une note corrigee, ou rouvrir une note corrigee.
 *
 * Le nom n'est demande QUE pour marquer une correction : c'est lui qui
 * signe le geste. Pour rouvrir, le serveur ne l'exige pas et l'effacerait
 * de toute facon — demander le nom du correcteur pour annuler la
 * correction n'aurait aucun sens.
 *
 * La version du site est envoyee avec la marque : c'est elle qui permet
 * ensuite de distinguer « corrigee et en ligne » de « corrigee, pas encore
 * deployee ». Sans elle, une note serait rangee dans l'historique alors
 * que le defaut est toujours a l'ecran.
 */
const formulaireResolution = (note, marquer) => {
    const bloc = creer('div', 'ap-resoudre');
    bloc.appendChild(creer('p', 'ap-aide',
        T(marquer ? 'resolution.aide' : 'reouverture.aide')));

    const champsNom = marquer ? champNom() : null;
    if (champsNom) bloc.appendChild(champsNom.bloc);

    const actions = creer('div', 'ap-actions');
    const valider = creer('button', 'ap-primaire',
        T(marquer ? 'resolution.valider' : 'reouverture.valider'));
    valider.type = 'button';
    const annuler = creer('button', 'ap-secondaire', T('note.annuler'));
    annuler.type = 'button';
    annuler.addEventListener('click', () => bloc.remove());
    actions.appendChild(valider);
    actions.appendChild(annuler);
    bloc.appendChild(actions);

    const dire = (panne) => {
        const ancien = bloc.querySelector('.ap-erreur');
        if (ancien) ancien.remove();
        if (panne) bloc.insertBefore(blocPanne(panne), bloc.firstChild);
    };

    valider.addEventListener('click', () => {
        const nom = champsNom ? normaliser(champsNom.champ.value) : auteur;
        if (marquer && !nom) {
            return dire({ titre: T('erreur.titre_resolution'),
                          detail: T('formulaire.nom_manquant') });
        }
        dire(null);
        valider.disabled = true;
        annuler.disabled = true;

        // Le corps est bati AVANT l'envoi et, en mode chiffre, il faut
        // chiffrer pour l'obtenir : c'est asynchrone, comme le reste.
        corpsDeResolution(note, marquer, nom)
            .then((corps) => appeler('resoudre', corps))
            .then((r) => {
                valider.disabled = false;
                annuler.disabled = false;
                if (!r.ok) {
                    dire(panneDe(r, 'erreur.titre_resolution'));
                    return;
                }
                if (nom) ecrireAuteur(nom);
                bloc.remove();
                // Comme partout : on relit le serveur au lieu de supposer.
                recharger();
            }, () => {
                valider.disabled = false;
                annuler.disabled = false;
                dire({ titre: T('erreur.titre_resolution'), detail: T('erreur.chiffrement') });
            });
    });

    return bloc;
};

const formulaireReponse = (note) => {
    const bloc = creer('div', 'ap-repondre');
    const zone = creer('textarea', 'ap-zone');
    zone.setAttribute('placeholder', T('note.reponse_placeholder'));
    zone.setAttribute('maxlength', String(MAX_TEXTE));
    bloc.appendChild(zone);

    const champsNom = champNom();
    if (champsNom) bloc.appendChild(champsNom.bloc);

    const actions = creer('div', 'ap-actions');
    const envoyer = creer('button', 'ap-primaire', T('note.reponse_envoyer'));
    envoyer.type = 'button';
    const annuler = creer('button', 'ap-secondaire', T('note.annuler'));
    annuler.type = 'button';
    annuler.addEventListener('click', () => bloc.remove());
    actions.appendChild(envoyer);
    actions.appendChild(annuler);
    bloc.appendChild(actions);

    const dire = (panne) => {
        const ancien = bloc.querySelector('.ap-erreur');
        if (ancien) ancien.remove();
        if (panne) bloc.insertBefore(blocPanne(panne), bloc.firstChild);
    };

    envoyer.addEventListener('click', () => {
        const texte = zone.value.trim();
        const nom = champsNom ? normaliser(champsNom.champ.value) : auteur;
        if (!nom) return dire({ titre: T('erreur.titre'), detail: T('formulaire.nom_manquant') });
        if (!texte) return dire({ titre: T('erreur.titre'), detail: T('formulaire.texte_manquant') });
        if (texte.length > MAX_TEXTE) {
            return dire({
                titre: T('erreur.titre'),
                detail: T('formulaire.trop_long', { n: texte.length, max: MAX_TEXTE })
            });
        }
        dire(null);
        envoyer.disabled = true;
        annuler.disabled = true;
        envoyer.textContent = T('formulaire.envoi');

        corpsDeNote({
            auteur: nom,
            texte: texte,
            version: VERSION_SITE,
            environnement: ENVIRONNEMENT,
            fenetre: fenetreCourante()
        }, note.id).then((corps) => appeler('ajout', corps)).then((r) => {
            envoyer.disabled = false;
            annuler.disabled = false;
            envoyer.textContent = T('note.reponse_envoyer');
            if (!r.ok) {
                // Le texte reste dans la zone : rien n'est perdu.
                dire(panneDe(r, 'erreur.titre'));
                return;
            }
            ecrireAuteur(nom);
            bloc.remove();
            // On re-interroge le serveur au lieu d'ajouter la reponse a
            // l'ecran : ce qui s'affiche est ce que le serveur dit, jamais
            // ce que le navigateur suppose.
            recharger();
        }, () => {
            envoyer.disabled = false;
            annuler.disabled = false;
            envoyer.textContent = T('note.reponse_envoyer');
            // Le chiffrement a echoue : la reponse n'est PAS partie, et le
            // texte reste dans la zone.
            dire({ titre: T('erreur.titre'), detail: T('erreur.chiffrement') });
        });
    });

    // Confort : la reponse s'ecrit tout de suite.
    window.setTimeout(() => zone.focus(), 0);
    return bloc;
};

/** Champ « votre nom », seulement tant qu'on ne le connait pas. */
const champNom = () => {
    if (auteur) return null;
    const bloc = creer('div');
    const etiquette = creer('label', 'ap-etiquette', T('formulaire.nom'));
    const champ = creer('input', 'ap-champ');
    champ.type = 'text';
    champ.setAttribute('maxlength', String(MAX_AUTEUR));
    champ.setAttribute('placeholder', T('formulaire.nom_placeholder'));
    champ.setAttribute('autocomplete', 'off');
    const id = 'ap-nom-' + Math.random().toString(36).slice(2, 8);
    champ.id = id;
    etiquette.setAttribute('for', id);
    bloc.appendChild(etiquette);
    bloc.appendChild(champ);
    bloc.appendChild(creer('p', 'ap-aide', T('formulaire.nom_aide')));
    return { bloc: bloc, champ: champ };
};

const dessinerPanneau = () => {
    vider(ui.corps);
    vider(ui.pied);

    if (panneEnCours) {
        ui.corps.appendChild(blocPanne(panneEnCours, () => {
            panneEnCours = null;
            dessinerPanneau();
        }));
    }

    /* Ce qu'on n'a pas su lire est DIT, avec son compte. Une note sautee en
       silence est une remarque qui disparait, et la personne qui l'a ecrite
       croira que personne ne l'a lue. */
    const partielle = panneDeLecture();
    if (partielle) ui.corps.appendChild(blocPanne(partielle));

    /* Une note corrigee ET dont le correctif est en ligne quitte la vue
       principale : elle a fait son travail. Elle n'est pas supprimee — une
       correction jugee faite peut s'averer incomplete, et la remarque doit
       pouvoir revenir avec son fil de reponses.

       Une note corrigee dont le correctif n'est PAS encore deploye reste
       visible : le defaut est toujours a l'ecran, la masquer ferait croire
       qu'il a disparu. */
    const meres = [];
    const archivees = [];
    for (let i = 0; i < notes.length; i += 1) {
        const n = notes[i];
        if (orphelines.indexOf(n) !== -1) continue;
        if (n.resolue_le && dejaDeploye(n.resolue_version)) archivees.push(n);
        else meres.push(n);
    }

    if (!meres.length && !orphelines.length && !archivees.length) {
        ui.corps.appendChild(creer('p', 'ap-vide', T('panneau.vide')));
    }

    if (meres.length) {
        ui.corps.appendChild(creer('h2', 'ap-section-titre', T('panneau.section_page')));
        for (let i = 0; i < meres.length; i += 1) {
            ui.corps.appendChild(carteNote(meres[i], false));
        }
    }

    if (orphelines.length) {
        ui.corps.appendChild(creer('h2', 'ap-section-titre', T('orphelines.titre')));
        ui.corps.appendChild(creer('p', 'ap-section-aide', T('orphelines.aide')));
        for (let i = 0; i < orphelines.length; i += 1) {
            ui.corps.appendChild(carteNote(orphelines[i], true));
        }
    }

    if (archivees.length) {
        const bascule = creer('button', 'ap-historique-bascule',
            T(historiqueOuvert ? 'historique.masquer' : 'historique.montrer',
              { n: archivees.length }));
        bascule.type = 'button';
        bascule.addEventListener('click', () => {
            historiqueOuvert = !historiqueOuvert;
            dessinerPanneau();
        });
        ui.corps.appendChild(bascule);

        if (historiqueOuvert) {
            ui.corps.appendChild(creer('p', 'ap-section-aide', T('historique.aide')));
            for (let i = 0; i < archivees.length; i += 1) {
                ui.corps.appendChild(carteNote(archivees[i], false));
            }
        }
    }

    if (auteur) {
        ui.pied.appendChild(creer('span', null, T('auteur.connu', { nom: auteur })));
        const changer = creer('button', 'ap-lien', T('auteur.changer'));
        changer.type = 'button';
        changer.addEventListener('click', () => {
            ecrireAuteur('');
            dessinerPanneau();
        });
        ui.pied.appendChild(changer);
    }

    /* Le sel se recolle depuis ici. Ce n'est pas un reglage de confort : le
       jour ou la preproduction devient la production, le localStorage change
       d'origine et le sel est a recoller une fois, sur chaque navigateur. Sans
       ce bouton, il faudrait vider le stockage a la main pour y arriver. */
    if (PROJET && selTexte) {
        const changerSel = creer('button', 'ap-lien', T('sel.remplacer'));
        changerSel.type = 'button';
        changerSel.title = T('sel.origine_changee');
        changerSel.addEventListener('click', () => ouvrirEcranSel());
        ui.pied.appendChild(changerSel);
    }

    const total = notes.length;
    ui.boutonCompte.textContent = compteLisible(
        total, 'bouton.notes_zero', 'bouton.notes_une', 'bouton.notes_n');
    // Le bouton porte la panne : quelqu'un qui ne l'ouvre pas doit
    // pouvoir voir, d'un coup d'oeil, que quelque chose ne va pas.
    ui.bouton.classList.toggle('ap-panne', !!panneEnCours);
    ui.bouton.title = panneEnCours ? panneEnCours.titre : T('bouton.aide');
};

/** Met en avant une note dans le panneau, sans rien changer a la page. */
const viser = (note) => {
    const carte = ui.corps.querySelector('[data-ap-note="' + note.id + '"]');
    if (!carte) return;
    const anciennes = ui.corps.querySelectorAll('.ap-visee');
    for (let i = 0; i < anciennes.length; i += 1) anciennes[i].classList.remove('ap-visee');
    carte.classList.add('ap-visee');
    carte.scrollIntoView({ block: 'nearest' });
};

/** Ramene l'element commente sous les yeux, en le montrant chez nous. */
const montrerElement = (note) => {
    let el = null;
    for (let i = 0; i < ancrees.length; i += 1) {
        if (ancrees[i].notes.indexOf(note) !== -1) el = ancrees[i].element;
    }
    if (!el) return;
    // scrollIntoView deplace le point de vue, jamais le document : aucun
    // noeud, aucun style du site n'est touche.
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => {
        montrerSurbrillance(el);
        window.setTimeout(cacherSurbrillance, 1400);
    }, 350);
};

/* -- 16. Le formulaire d'une nouvelle note -------------------------------- */

const positionnerFiche = (el) => {
    const fiche = ui.fiche;
    const r = el.getBoundingClientRect();
    if (ecranEtroit()) {
        // La feuille de style prend la main : la fiche occupe la largeur.
        fiche.style.left = '';
        fiche.style.top = Math.max(8, Math.min(r.bottom + 8, window.innerHeight - 260)) + 'px';
        return;
    }
    const largeur = fiche.offsetWidth || 340;
    const hauteur = fiche.offsetHeight || 260;
    let gauche = r.left;
    if (gauche + largeur > window.innerWidth - 12) gauche = window.innerWidth - largeur - 12;
    let haut = r.bottom + 8;
    if (haut + hauteur > window.innerHeight - 12) haut = Math.max(8, r.top - hauteur - 8);
    fiche.style.left = Math.max(8, gauche) + 'px';
    fiche.style.top = Math.max(8, haut) + 'px';
};

/** Vrai sur les ecrans ou le panneau et le formulaire ne tiennent pas
    cote a cote. Le seuil est celui de la feuille de style. */
const ecranEtroit = () => window.innerWidth <= 560;

const fermerFiche = () => {
    cible = null;
    ui.fiche.classList.remove('ap-ouvert');
    vider(ui.fiche);
    // Sur ecran etroit, la liste avait cede la place a la saisie.
    if (mode) ui.panneau.classList.add('ap-ouvert');
};

/**
 * @param texteDeja remarque deja saisie, quand le formulaire est
 *   RECONSTRUIT sans avoir ete ferme (changement de nom). Reconstruire
 *   une saisie en cours sans la reporter la ferait disparaitre sous les
 *   doigts de qui ecrit : c'est le meme tort que de perdre une note.
 */
const ouvrirFiche = (el, texteDeja) => {
    cible = el;
    const fiche = ui.fiche;
    vider(fiche);

    const extrait = extraitDe(el);
    fiche.appendChild(creer('div', 'ap-fiche-titre', T('formulaire.titre')));
    fiche.appendChild(creer('div', 'ap-fiche-cible',
        extrait ? T('formulaire.sur', { extrait: extrait }) : T('formulaire.sur_sans_texte')));

    const nom = champNom();
    if (nom) {
        fiche.appendChild(nom.bloc);
    } else {
        /* Le nom est deja connu : on le RAPPELLE ici, avec de quoi en
           changer, au lieu de le laisser en pied de panneau ou personne ne
           le voit en ecrivant. Signaler qui l'on signe au moment ou l'on
           signe evite qu'une remarque parte sous le nom d'un collegue qui
           a utilise le meme poste. */
        const rappel = creer('div', 'ap-fiche-signature');
        rappel.appendChild(creer('span', null, T('auteur.connu', { nom: auteur })));
        const changer = creer('button', 'ap-lien', T('auteur.changer'));
        changer.type = 'button';
        changer.addEventListener('click', () => {
            // La remarque en cours est REPORTEE dans le formulaire
            // reconstruit : changer de nom ne coute pas ce qu'on a ecrit.
            const enCours = zone.value;
            ecrireAuteur('');
            ouvrirFiche(el, enCours);
        });
        rappel.appendChild(changer);
        fiche.appendChild(rappel);
    }

    const zone = creer('textarea', 'ap-zone');
    zone.setAttribute('placeholder', T('formulaire.texte_placeholder'));
    zone.setAttribute('maxlength', String(MAX_TEXTE));
    if (typeof texteDeja === 'string') zone.value = texteDeja;
    fiche.appendChild(zone);

    const actions = creer('div', 'ap-actions');
    const envoyer = creer('button', 'ap-primaire', T('formulaire.envoyer'));
    envoyer.type = 'button';
    const annuler = creer('button', 'ap-secondaire', T('formulaire.annuler'));
    annuler.type = 'button';
    const compteur = creer('span', 'ap-compteur',
        T('formulaire.restants', { n: Math.max(0, MAX_TEXTE - zone.value.length) }));
    actions.appendChild(envoyer);
    actions.appendChild(annuler);
    actions.appendChild(compteur);
    fiche.appendChild(actions);

    zone.addEventListener('input', () => {
        compteur.textContent = T('formulaire.restants',
            { n: Math.max(0, MAX_TEXTE - zone.value.length) });
    });
    annuler.addEventListener('click', () => fermerFiche());

    const dire = (panne) => {
        const ancien = fiche.querySelector('.ap-erreur');
        if (ancien) ancien.remove();
        if (panne) fiche.insertBefore(blocPanne(panne), fiche.firstChild);
    };

    envoyer.addEventListener('click', () => {
        const texte = zone.value.trim();
        const quiEcrit = nom ? normaliser(nom.champ.value) : auteur;
        if (!quiEcrit) return dire({ titre: T('erreur.titre'), detail: T('formulaire.nom_manquant') });
        if (!texte) return dire({ titre: T('erreur.titre'), detail: T('formulaire.texte_manquant') });
        if (texte.length > MAX_TEXTE) {
            return dire({
                titre: T('erreur.titre'),
                detail: T('formulaire.trop_long', { n: texte.length, max: MAX_TEXTE })
            });
        }
        dire(null);
        envoyer.disabled = true;
        annuler.disabled = true;
        envoyer.textContent = T('formulaire.envoi');

        /* Le chemin de page part dans la CHARGE, jamais dans la chaine de
           requete : le serveur regroupe par index aveugle. En mode clair il
           le range quand meme dans sa colonne « page », comme au format 1. */
        corpsDeNote({
            page: cheminDePage(),
            selecteur: cheminCss(el),
            empreinte: empreinteDe(el),
            extrait: extrait,
            auteur: quiEcrit,
            texte: texte,
            version: VERSION_SITE,
            environnement: ENVIRONNEMENT,
            fenetre: fenetreCourante()
        }, null).then((corps) => appeler('ajout', corps)).then((r) => {
            envoyer.disabled = false;
            annuler.disabled = false;
            envoyer.textContent = T('formulaire.envoyer');
            if (!r.ok) {
                // La remarque reste a l'ecran. Rien n'est perdu, et la
                // personne sait que rien n'est enregistre.
                dire(panneDe(r, 'erreur.titre'));
                return;
            }
            ecrireAuteur(quiEcrit);
            fermerFiche();
            recharger();
        }, () => {
            envoyer.disabled = false;
            annuler.disabled = false;
            envoyer.textContent = T('formulaire.envoyer');
            dire({ titre: T('erreur.titre'), detail: T('erreur.chiffrement') });
        });
    });

    // Sur ecran etroit, ecrire et lire la liste en meme temps est
    // impossible : la saisie prend toute la place, la liste revient a la
    // fermeture du formulaire.
    if (ecranEtroit()) ui.panneau.classList.remove('ap-ouvert');
    fiche.classList.add('ap-ouvert');
    positionnerFiche(el);
    window.setTimeout(() => (nom ? nom.champ : zone).focus(), 0);
};

/* -- 17. Le mode annotation ---------------------------------------------- */

const surviser = (evenement) => {
    const el = evenement.target;
    if (!el || el.nodeType !== 1 || dansOutil(el)) return;
    if (el === document.body || el === document.documentElement) return;
    survole = el;
    montrerSurbrillance(el);
};

const surClic = (evenement) => {
    const el = evenement.target;
    // Un clic sur l'outil lui-meme : on laisse l'evenement descendre dans
    // le shadow root, ou nos propres boutons l'attendent.
    if (dansOutil(el)) return;
    // Tout le reste est capte : en mode annotation, on designe, on ne
    // navigue pas. C'est ce qui evite qu'un clic sur un lien emporte la
    // personne ailleurs au moment ou elle voulait le commenter.
    evenement.preventDefault();
    evenement.stopPropagation();
    if (evenement.type !== 'click') return;
    if (!el || el.nodeType !== 1) return;
    if (el === document.body || el === document.documentElement) return;
    ouvrirFiche(el);
};

const surTouche = (evenement) => {
    if (evenement.key !== 'Escape') return;
    if (ui.fiche.classList.contains('ap-ouvert')) {
        fermerFiche();
        return;
    }
    quitterMode();
};

const entrerMode = () => {
    mode = true;
    ui.bouton.setAttribute('aria-pressed', 'true');
    ui.boutonTexte.textContent = T('bouton.fermer');
    ui.panneau.classList.add('ap-ouvert');

    document.addEventListener('pointerover', surviser, true);
    document.addEventListener('pointerdown', surClic, true);
    document.addEventListener('click', surClic, true);
    document.addEventListener('auxclick', surClic, true);
    document.addEventListener('keydown', surTouche, true);
    window.addEventListener('scroll', rafraichirPositions, true);
    window.addEventListener('resize', rafraichirPositions);
    // Un carrousel, un menu deroulant, une image chargee en retard
    // deplacent les elements sans emettre ni scroll ni resize.
    minuterie = window.setInterval(rafraichirPositions, 500);

    // Les marqueurs de ce qu'on sait DEJA, tout de suite ; le serveur est
    // interroge ensuite et corrigera s'il y a du nouveau. Attendre le
    // reseau pour montrer ce qui est deja a l'ecran ferait croire a une
    // page vide.
    dessinerMarqueurs();
    recharger();
};

const quitterMode = () => {
    mode = false;
    ui.bouton.setAttribute('aria-pressed', 'false');
    ui.boutonTexte.textContent = T('bouton.ouvrir');
    ui.panneau.classList.remove('ap-ouvert');
    fermerFiche();
    cacherSurbrillance();
    survole = null;
    vider(ui.marqueurs);

    document.removeEventListener('pointerover', surviser, true);
    document.removeEventListener('pointerdown', surClic, true);
    document.removeEventListener('click', surClic, true);
    document.removeEventListener('auxclick', surClic, true);
    document.removeEventListener('keydown', surTouche, true);
    window.removeEventListener('scroll', rafraichirPositions, true);
    window.removeEventListener('resize', rafraichirPositions);
    if (minuterie) {
        window.clearInterval(minuterie);
        minuterie = null;
    }
};

const basculerMode = () => (mode ? quitterMode() : entrerMode());

