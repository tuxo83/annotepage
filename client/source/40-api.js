/* -- 8. L'API -----------------------------------------------------------
   Le contrat, tel que le serveur l'a fixe :

     200 + application/json      reponse normale
     200 + JSON « actif: false » outil depose, pas configure -> se retirer
     404 + text/plain            rien a cette adresse -> se retirer
     4xx/5xx + text/plain        message redige pour un humain -> AFFICHER
     4xx sans texte lisible      REFUS SEC, presque toujours un pare-feu ->
                                 le nommer, avec son code (voir plus bas)
     tout le reste               PHP non execute -> se retirer

   Cette fonction ne rejette jamais et n'ecrit jamais dans la console : elle
   rend une cause, et c'est l'appelant qui decide si l'on se tait ou si l'on
   parle. */

const appeler = (action, corps) => {
    if (!API) return Promise.resolve({ ok: false, cause: 'inactif' });

    const options = {
        method: corps ? 'POST' : 'GET',
        cache: 'no-store',
        // Sur un relais, cela vaut « aucun cookie » : c'est ce qu'on veut. Le
        // projet n'est pas une session, il est un jeton porteur (FORMAT.md
        // §6.3), et le corps urlencode fait de l'ecriture une « requete
        // simple » au sens CORS — donc sans requete preliminaire OPTIONS.
        credentials: 'same-origin'
    };
    if (corps) options.body = corps;

    let adresse = API + (API.indexOf('?') === -1 ? '?' : '&')
        + 'action=' + encodeURIComponent(action);
    if (!corps) {
        // Le chemin reel n'est JAMAIS envoye, dans aucun mode : seul l'index
        // aveugle part. Envoyer le chemin en clair et l'index en chiffre
        // ferait deux chemins de code, et le second serait le moins teste.
        adresse += '&projet=' + encodeURIComponent(PROJET)
            + '&index=' + encodeURIComponent(INDEX_PAGE);
    }

    return fetch(adresse, options)
        .then((reponse) => reponse.text().then((texte) => ({ reponse: reponse, texte: texte })))
        .then((r) => {
            const etat = r.reponse.status;
            const type = (r.reponse.headers.get('content-type') || '').toLowerCase();
            const estJson = type.indexOf('application/json') !== -1;

            if (r.reponse.ok && estJson) {
                let donnees = null;
                try {
                    donnees = JSON.parse(r.texte);
                } catch (e) {
                    return { ok: false, cause: 'nonjson' };
                }
                // L'outil est depose ici mais pas configure : il le DIT en
                // 200, pour ne pas laisser au navigateur une erreur a
                // journaliser. On se retire, comme sur un 404.
                if (donnees && donnees.actif === false) {
                    return { ok: false, cause: 'inactif' };
                }
                return { ok: true, donnees: donnees };
            }
            if (etat === 404) {
                // L'outil n'est pas configure ici — ou il n'y a rien a cette
                // adresse. Dans les deux cas : silence.
                return { ok: false, cause: 'inactif' };
            }
            if (!r.reponse.ok && type.indexOf('text/plain') !== -1) {
                return { ok: false, cause: 'serveur', message: couper(r.texte.trim(), 2000) };
            }

            /* LE REFUS SEC. Constate en production : un pare-feu d'hebergeur
               repond 403 avec une page HTML, et le client affichait « le
               serveur a repondu quelque chose d'inattendu ». C'etait vrai et
               inutile — personne ne savait quoi faire de cette phrase.

               Ce n'est pas notre serveur qui parle : c'est un intermediaire
               qui a decide que la requete ressemblait a une attaque, souvent
               a cause d'un mot du texte saisi. On nomme donc le refus, on
               donne son code, et on suggere le seul geste qui le contourne
               vraiment : reformuler. Le texte reste dans le formulaire — cela
               n'a jamais change et ne changera pas. */
            if (etat === 413) return { ok: false, cause: 'refus-taille', code: etat };
            if (etat === 429) return { ok: false, cause: 'refus-frequence', code: etat };
            if (etat >= 400 && etat < 500) return { ok: false, cause: 'refus', code: etat };
            if (etat >= 500) return { ok: false, cause: 'panne', code: etat };

            // 200 qui n'est pas du JSON : PHP n'est pas execute, le source est
            // servi en clair, ou un intermediaire a repondu.
            return { ok: false, cause: 'nonjson' };
        })
        .catch(() => ({ ok: false, cause: 'reseau' }));
};

/** Traduit une cause en panne affichable. Rend null s'il n'y a rien a dire. */
const panneDe = (resultat, titre) => {
    if (resultat.ok) return null;
    const dit = (cle) => ({ titre: T(titre), detail: T(cle, { code: resultat.code }) });
    if (resultat.cause === 'serveur') return { titre: T(titre), detail: resultat.message };
    if (resultat.cause === 'reseau') return dit('erreur.reseau');
    if (resultat.cause === 'refus') return dit('erreur.refus');
    if (resultat.cause === 'refus-taille') return dit('erreur.refus_taille');
    if (resultat.cause === 'refus-frequence') return dit('erreur.refus_frequence');
    if (resultat.cause === 'panne') return dit('erreur.panne_serveur');
    return dit('erreur.inattendue');
};

/* -- 9. Ecrire : le mode decide ou vont les champs -----------------------
   Un seul endroit construit un corps de requete. En clair, les champs partent
   tels quels — exactement les colonnes du format 1. En chiffre, TOUT ce qui
   est saisi ou observe passe dans l'enveloppe : chiffrer le seul texte
   livrerait l'arborescence du site, les intitules de ses elements et le nom
   de ses relecteurs (FORMAT.md §2.3). */

const CHAMPS_DE_CHARGE = ['page', 'selecteur', 'empreinte', 'extrait',
                          'auteur', 'texte', 'version', 'environnement', 'fenetre'];

const corpsDeNote = (champs, reponseA) => {
    const corps = new URLSearchParams();
    corps.set('projet', PROJET);
    corps.set('mode', MODE);
    if (reponseA) {
        // Une reponse HERITE de l'index de page de sa mere, et en mode clair
        // de sa page et de son element. Les redemander au client ouvrirait la
        // porte a une reponse rattachee ailleurs que la note qu'elle commente.
        corps.set('reponse_a', String(reponseA));
    } else {
        corps.set('index', INDEX_PAGE);
    }

    if (MODE === 'clair') {
        CHAMPS_DE_CHARGE.forEach((cle) => {
            if (champs[cle] !== undefined) corps.set(cle, String(champs[cle]));
        });
        return Promise.resolve(corps);
    }
    // L'AAD emploie l'index de page que NOUS avons calcule, jamais celui que
    // le serveur annonce : c'est precisement contre un serveur qui deplace une
    // note d'une page a l'autre que l'AAD existe.
    return sceller(cles.cleChiffre, PROJET, INDEX_PAGE, 'note', champs)
        .then((enveloppe) => {
            corps.set('charge', enveloppe);
            return corps;
        });
};

const corpsDeResolution = (note, marquer, nom) => {
    const corps = new URLSearchParams();
    corps.set('projet', PROJET);
    corps.set('id', String(note.id));
    corps.set('resolue', marquer ? '1' : '0');
    if (!marquer) {
        // Rouvrir n'ecrit rien : le serveur vide la resolution. On ne demande
        // pas le nom du correcteur pour annuler la correction.
        return Promise.resolve(corps);
    }
    if (MODE === 'clair') {
        corps.set('par', nom);
        corps.set('version', VERSION_SITE);
        return Promise.resolve(corps);
    }
    // Seconde enveloppe, son propre nonce, son propre role : elle est ecrite
    // par une autre personne, a un autre moment, souvent depuis une autre
    // machine. La fondre dans l'enveloppe de la note obligerait a rechiffrer
    // une remarque qu'on n'a pas le droit de reecrire.
    return sceller(cles.cleChiffre, PROJET, INDEX_PAGE, 'resolution',
                   { par: nom, version: VERSION_SITE })
        .then((enveloppe) => {
            corps.set('charge_resolution', enveloppe);
            return corps;
        });
};

/* -- 10. Lire : ouvrir ce qu'on peut, compter ce qu'on ne peut pas -------- */

const remplirDepuis = (note, objet) => {
    // Les champs INCONNUS de l'objet sont ignores en silence : c'est ce qui
    // rend possible d'en ajouter un jour sans changer le numero de format.
    CHAMPS_DE_CHARGE.forEach((cle) => {
        note[cle] = objet[cle] === undefined ? '' : String(objet[cle]);
    });
    return note;
};

/**
 * Une ligne -> une note lisible, ou null si on ne sait pas la lire.
 * Ce qui est saute est COMPTE : une note qui disparait en silence est pire
 * qu'une note qu'on annonce ne pas savoir lire.
 */
const ouvrirNote = (note) => {
    if (!note || typeof note !== 'object') return Promise.resolve(null);

    // « mode » absent ou vide : la ligne vient du format 1, elle vaut clair.
    const m = String(note.mode || 'clair');

    if (m === 'clair') return Promise.resolve(note);

    if (m !== 'chiffre') {
        // Ni devinee, ni rendue vide sans le dire.
        sautees.inconnues += 1;
        return Promise.resolve(null);
    }

    return ouvrir(cles.cleChiffre, PROJET, INDEX_PAGE, 'note', note.charge)
        .then(
            (objet) => remplirDepuis(note, objet),
            (e) => {
                if (e && e.raison === 'recente') sautees.recentes += 1;
                else sautees.illisibles += 1;
                return null;
            }
        )
        .then((lue) => {
            if (!lue || !lue.charge_resolution) return lue;
            return ouvrir(cles.cleChiffre, PROJET, INDEX_PAGE, 'resolution', lue.charge_resolution)
                .then(
                    (objet) => {
                        lue.resolue_par = objet.par === undefined ? '' : String(objet.par);
                        lue.resolue_version = objet.version === undefined ? '' : String(objet.version);
                        return lue;
                    },
                    () => {
                        /* La note se lit, sa resolution non. On garde la note :
                           « corrigee par quelqu'un » vaut mieux que rien, et la
                           date de correction, elle, est en clair. */
                        lue.resolue_par = '';
                        lue.resolue_version = '';
                        return lue;
                    }
                );
        });
};

/** Ouvre une note et ses reponses. Une reponse est une note : meme role. */
const ouvrirFil = (note) =>
    ouvrirNote(note).then((mere) => {
        if (!mere) return null;
        const filles = Array.isArray(mere.reponses) ? mere.reponses : [];
        if (!filles.length) return mere;
        return Promise.all(filles.map(ouvrirNote))
            .then((lues) => {
                mere.reponses = lues.filter(Boolean);
                return mere;
            });
    });

const lireListe = (donnees) => {
    sautees = { recentes: 0, illisibles: 0, inconnues: 0 };
    const brutes = donnees && Array.isArray(donnees.notes) ? donnees.notes : [];
    return Promise.all(brutes.map(ouvrirFil)).then((lues) => lues.filter(Boolean));
};

/** Ce qu'on n'a pas su lire, dit a l'ecran. Rend null s'il n'y a rien a dire. */
const panneDeLecture = () => {
    const lignes = [];
    if (sautees.recentes) {
        lignes.push(compteLisible(sautees.recentes, '', 'lecture.recentes_une', 'lecture.recentes_n'));
    }
    if (sautees.illisibles) {
        lignes.push(compteLisible(sautees.illisibles, '', 'lecture.illisibles_une', 'lecture.illisibles_n'));
    }
    if (sautees.inconnues) {
        lignes.push(compteLisible(sautees.inconnues, '', 'lecture.inconnues_une', 'lecture.inconnues_n'));
    }
    if (!lignes.length) return null;
    return { titre: T('lecture.titre_partielle'), detail: lignes.join('\n') };
};
