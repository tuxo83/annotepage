/* -- 18. L'installation, et le sel qu'on colle ---------------------------

   Ces ecrans sont les seuls endroits ou le sel s'affiche ou se saisit. Ils
   sont BLOQUANTS : tant que le sel n'est pas connu, l'outil ne montre ni
   bouton d'annotation, ni panneau de notes. Il n'y a rien a annoter sans
   sel — pas meme en mode clair, ou l'index de page est deja un HMAC.

   Aucun de ces ecrans ne fait de requete reseau. Consequence a dire : une
   page qui porte une balise avec un projet, sur un site dont le serveur n'est
   pas encore configure, montrera quand meme l'ecran « collez le sel ». C'est
   assume : sans sel on ne peut meme pas demander la liste des notes, donc pas
   verifier que le serveur repond. La balise, elle, a bien ete posee la par
   quelqu'un. */

/** Retire l'interface courante sans toucher a la feuille de style. */
const viderCouche = () => {
    if (!racine) return;
    const anciennes = racine.querySelectorAll('.ap-couche');
    for (let i = 0; i < anciennes.length; i += 1) anciennes[i].remove();
    ui = null;
};

/**
 * Un panneau seul, ouvert, sans bouton d'annotation derriere.
 * @return { corps, panneau }
 */
const ecranBloquant = (titre, large) => {
    if (!hote) batirHote();
    viderCouche();

    const couche = creer('div', 'ap-couche');
    racine.appendChild(couche);

    const panneau = creer('aside', 'ap-panneau ap-ouvert' + (large ? ' ap-panneau-large' : ''));
    panneau.setAttribute('role', 'complementary');
    const entete = creer('div', 'ap-panneau-entete');
    entete.appendChild(creer('span', 'ap-panneau-titre', titre));
    const fermer = creer('button', 'ap-lien', T('panneau.fermer'));
    fermer.type = 'button';
    fermer.addEventListener('click', () => {
        // On se retire pour ce chargement de page. Rien n'est memorise : au
        // rechargement suivant, l'ecran revient, parce que le probleme, lui,
        // n'a pas ete regle.
        if (hote) hote.remove();
        hote = null;
        racine = null;
        ui = null;
    });
    entete.appendChild(fermer);
    const corps = creer('div', 'ap-panneau-corps');
    panneau.appendChild(entete);
    panneau.appendChild(corps);
    couche.appendChild(panneau);
    return { corps: corps, panneau: panneau };
};

/** Une valeur a recopier : elle est SELECTIONNABLE, et copiable d'un bouton. */
const blocCopiable = (parent, etiquette, valeur) => {
    parent.appendChild(creer('div', 'ap-etiquette', etiquette));
    const bloc = creer('div', 'ap-copie');
    const zone = creer('textarea', 'ap-code');
    zone.value = valeur;
    zone.readOnly = true;
    zone.rows = valeur.length > 90 ? 4 : 2;
    zone.setAttribute('spellcheck', 'false');
    zone.addEventListener('focus', () => zone.select());
    bloc.appendChild(zone);

    const copier = creer('button', 'ap-secondaire', T('installation.copier'));
    copier.type = 'button';
    copier.addEventListener('click', () => {
        const dire = (cle) => {
            copier.textContent = T(cle);
            window.setTimeout(() => { copier.textContent = T('installation.copier'); }, 2000);
        };
        // Le presse-papier peut etre refuse (contexte non sur, permission).
        // On le dit et on laisse la selection faire le travail, plutot que de
        // laisser croire que la copie a eu lieu.
        try {
            navigator.clipboard.writeText(valeur)
                .then(() => dire('installation.copie'), () => {
                    zone.select();
                    dire('installation.copie_echec');
                });
        } catch (e) {
            zone.select();
            dire('installation.copie_echec');
        }
    });
    bloc.appendChild(copier);
    parent.appendChild(bloc);
    return zone;
};

/** La balise exacte a coller, avec l'empreinte SRI REELLEMENT servie. */
const baliseAColler = (identifiant) => {
    let t = '<script src="' + script.src + '"';
    // On recopie l'integrite et le crossorigin de la balise en cours : ce sont
    // ceux qui fonctionnent, ici, maintenant. Une empreinte recopiee d'une
    // documentation est une empreinte d'une autre version.
    const attribut = (nom) => (script.getAttribute(nom) || '').trim();
    if (attribut('integrity')) t += '\n        integrity="' + attribut('integrity') + '"';
    if (attribut('crossorigin')) t += '\n        crossorigin="' + attribut('crossorigin') + '"';
    if (ADRESSE_DECLAREE) t += '\n        data-serveur="' + ADRESSE_DECLAREE + '"';
    t += '\n        data-projet="' + identifiant + '"';
    if (MODE === 'clair') t += '\n        data-mode="clair"';
    if (PREFIXE_CHEMIN) t += '\n        data-chemin="' + PREFIXE_CHEMIN + '"';
    t += '\n        defer></' + 'script>';
    return t;
};

const configurationServeur = (identifiant) =>
    'projet ' + identifiant + '\n'
    + '  origines  ' + location.origin + '\n'
    + '  mode      ' + MODE;

/* -- L'ecran « collez le sel » ------------------------------------------ */

const ouvrirEcranSel = () => {
    const ecran = ecranBloquant(T('sel.titre'), false);
    ecran.corps.appendChild(creer('p', 'ap-aide', T('sel.aide')));
    ecran.corps.appendChild(creer('p', 'ap-aide', T('sel.origine_changee')));

    ecran.corps.appendChild(creer('div', 'ap-etiquette', T('sel.etiquette')));
    const champ = creer('input', 'ap-champ');
    champ.type = 'text';
    champ.setAttribute('autocomplete', 'off');
    champ.setAttribute('spellcheck', 'false');
    champ.setAttribute('maxlength', String(LONGUEUR_SEL + 8));
    ecran.corps.appendChild(champ);

    const actions = creer('div', 'ap-actions');
    const valider = creer('button', 'ap-primaire', T('sel.valider'));
    valider.type = 'button';
    actions.appendChild(valider);
    ecran.corps.appendChild(actions);

    const dire = (detail) => {
        const ancien = ecran.corps.querySelector('.ap-erreur');
        if (ancien) ancien.remove();
        if (detail) {
            ecran.corps.insertBefore(
                blocPanne({ titre: T('sel.titre'), detail: detail }), ecran.corps.firstChild);
        }
    };

    valider.addEventListener('click', () => {
        const brut = normaliser(champ.value).replace(/\s+/g, '');
        if (!brut) return dire(T('sel.vide'));
        const octets = selDepuisTexte(brut);
        if (!octets) return dire(T('sel.forme'));
        dire(null);
        valider.disabled = true;

        /* La verification se fait ICI : on rederive l'identifiant de projet et
           on le compare a celui de la balise. Egaux, le sel est le bon. Rien
           n'est envoye au reseau et rien n'est dechiffre avant ce test — c'est
           ce qui evite d'avoir a transporter une somme de controle a cote du
           sel : l'identifiant de projet joue deja ce role, et il est public. */
        deriver(octets).then((derivees) => {
            valider.disabled = false;
            if (derivees.identifiant !== PROJET) return dire(T('sel.mauvais'));
            if (!ecrireSel(PROJET, brut)) {
                // Le stockage refuse : on continue quand meme pour cette
                // page, mais on ne fait pas croire que c'est retenu.
                dire(T('sel.non_retenu'));
            }
            demarrerAvecSel(brut, derivees);
        }, () => {
            valider.disabled = false;
            dire(T('erreur.chiffrement'));
        });
    });

    window.setTimeout(() => champ.focus(), 0);
};

/* -- L'ecran d'installation --------------------------------------------- */

const ouvrirEcranInstallation = () => {
    const ecran = ecranBloquant(T('installation.titre'), true);

    if (!API) ecran.corps.appendChild(creer('p', 'ap-aide', T('installation.sans_serveur')));
    if (MODE === 'clair') ecran.corps.appendChild(creer('p', 'ap-aide', T('installation.mode_clair')));

    const engendrer = creer('button', 'ap-primaire', T('installation.engendrer'));
    engendrer.type = 'button';
    ecran.corps.appendChild(engendrer);

    engendrer.addEventListener('click', () => {
        engendrer.disabled = true;
        const nouveau = engendrerSel();
        const octets = selDepuisTexte(nouveau);
        deriver(octets).then((derivees) => {
            vider(ecran.corps);

            /* L'avertissement vient AVANT le sel, et avant le bouton qui
               continue. Il est ecrit en toutes lettres, pas en note de bas de
               page : c'est le seul secret du projet, et il n'existe aucune
               recuperation. */
            const avert = creer('div', 'ap-erreur');
            avert.setAttribute('role', 'alert');
            avert.appendChild(creer('div', 'ap-erreur-titre', T('installation.avertissement_titre')));
            avert.appendChild(creer('p', 'ap-erreur-detail', T('installation.avertissement')));
            ecran.corps.appendChild(avert);

            blocCopiable(ecran.corps, T('installation.sel'), nouveau);
            blocCopiable(ecran.corps, T('installation.projet'), derivees.identifiant);
            blocCopiable(ecran.corps, T('installation.balise'), baliseAColler(derivees.identifiant));
            blocCopiable(ecran.corps, T('installation.serveur'), configurationServeur(derivees.identifiant));

            const actions = creer('div', 'ap-actions');
            const continuer = creer('button', 'ap-primaire', T('installation.continuer'));
            continuer.type = 'button';
            continuer.addEventListener('click', () => {
                const retenu = ecrireSel(derivees.identifiant, nouveau);
                const fin = creer('p', 'ap-aide',
                    retenu ? T('installation.faite') : T('sel.non_retenu'));
                actions.replaceWith(fin);
            });
            actions.appendChild(continuer);
            ecran.corps.appendChild(actions);
        }, () => {
            engendrer.disabled = false;
            ecran.corps.appendChild(blocPanne({
                titre: T('installation.titre'), detail: T('erreur.chiffrement')
            }));
        });
    });
};

/* -- L'ecran « ce navigateur ne peut pas » ------------------------------- */

const ouvrirEcranContexte = () => {
    const ecran = ecranBloquant(T('contexte.titre'), false);
    ecran.corps.appendChild(creer('p', 'ap-aide', T('contexte.aide')));
};
