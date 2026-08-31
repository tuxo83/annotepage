/* -- 5. TOUS LES TEXTES AFFICHES PAR L'OUTIL -----------------------------

   Le francais est la langue par defaut, et c'est le seul endroit ou elle
   s'ecrit : aucun autre fichier de ce paquet ne contient une phrase destinee
   a l'ecran. Traduire l'outil, ou simplement changer un mot qui ne convient
   pas a une equipe, ne demande donc jamais de toucher au code.

   DEUX FACONS DE REMPLACER UN LIBELLE, par ordre de priorite :

     1. un objet defini AVANT le chargement du client :

            <script>
              window.Annotepage = { libelles: {
                'bouton.ouvrir': 'Annotate this page'
              } };
            </script>
            <script src="https://.../annotepage.js" ... defer></script>

     2. un fichier voisin, DECLARE sur la balise :

            <script src="https://.../annotepage.js"
                    data-libelles="/libelles-locaux.js" defer></script>

        Ce fichier ecrit, comme celui-ci, dans window.Annotepage : il pose
        « libelles » (ses propres textes) et non « libellesParDefaut ». Il est
        resolu par rapport au DOCUMENT, pas au CDN : une traduction appartient
        au site relu.

   Pourquoi le fichier local est DECLARE et non cherche : aller voir « s'il
   est present » suppose une requete qui, le plus souvent, repond 404 — et le
   navigateur journalise lui-meme cet echec dans la console de CHAQUE page.

   UN LIBELLE ABSENT RETOMBE SUR LE FRANCAIS. Une traduction partielle est
   donc utilisable telle quelle.

   FORME : un objet PLAT. Les cles sont pointees pour se lire, pas pour etre
   imbriquees — « bouton.ouvrir » est une chaine, pas un chemin.

   { ... } dans une valeur est un emplacement remplace a l'affichage
   ({n}, {max}, {nom}, {extrait}, {code}). Un emplacement inconnu est laisse
   tel quel. */

espace.libellesParDefaut = {

    /* -- Le bouton, seule trace de l'outil quand il est au repos ------- */
    'bouton.ouvrir': 'Annoter la page',
    'bouton.fermer': 'Terminer',
    'bouton.aide': 'Écrire et lire les remarques sur cette page',
    'bouton.notes_zero': '',
    'bouton.notes_une': '1 note',
    'bouton.notes_n': '{n} notes',

    /* -- Le panneau ---------------------------------------------------- */
    'panneau.titre': 'Notes de relecture',
    'panneau.fermer': 'Fermer',
    'panneau.consigne': 'Cliquez sur un élément de la page pour écrire une remarque à son sujet.',
    'panneau.echap': 'Touche Échap pour arrêter.',
    'panneau.vide': 'Personne n’a encore écrit de note sur cette page.',
    'panneau.section_page': 'Sur cette page',
    'panneau.actualiser': 'Actualiser',

    /* -- Les notes dont l'element ne se retrouve plus ------------------- */
    'orphelines.titre': 'Notes dont l’élément a changé',
    'orphelines.aide':
        'Ces remarques portaient sur un élément qui n’existe plus sous la même '
        + 'forme. Elles sont conservées telles quelles.',

    /* -- Une note ------------------------------------------------------ */
    'note.sur': 'À propos de : {extrait}',
    'note.sans_element': 'À propos de la page entière',
    'note.element_perdu': 'Élément non retrouvé sur la page actuelle',
    'note.voir': 'Montrer sur la page',
    'note.repondre': 'Répondre',
    'note.reponse_placeholder': 'Votre réponse',
    'note.reponse_envoyer': 'Envoyer la réponse',
    'note.annuler': 'Annuler',
    'note.marquer_corrigee': 'Marquer corrigée',
    'note.rouvrir': 'Rouvrir cette remarque',

    /* -- Marquer une remarque corrigee, et revenir sur cette marque ----- */
    'resolution.aide':
        'La remarque sera rangée dans l’historique une fois la correction en '
        + 'ligne. Elle n’est jamais supprimée : elle peut être rouverte.',
    'resolution.valider': 'C’est corrigé',
    'reouverture.aide':
        'La remarque revient dans la liste, avec ses réponses. À faire si la '
        + 'correction se révèle incomplète.',
    'reouverture.valider': 'Rouvrir',

    /* -- Le formulaire ------------------------------------------------- */
    'formulaire.titre': 'Votre remarque',
    'formulaire.sur': 'À propos de : {extrait}',
    'formulaire.sur_sans_texte': 'À propos de l’élément que vous venez de désigner',
    'formulaire.nom': 'Votre nom',
    'formulaire.nom_aide': 'Il apparaîtra à côté de vos remarques, et sera retenu pour la prochaine fois.',
    'formulaire.nom_placeholder': 'Prénom, ou prénom et nom',
    'formulaire.texte_placeholder': 'Ce que vous avez remarqué',
    'formulaire.envoyer': 'Envoyer',
    'formulaire.envoi': 'Envoi en cours...',
    'formulaire.annuler': 'Annuler',
    'formulaire.nom_manquant': 'Indiquez votre nom avant d’envoyer.',
    'formulaire.texte_manquant': 'Écrivez votre remarque avant d’envoyer.',
    'formulaire.trop_long': 'Votre remarque fait {n} caractères ; la limite est de {max}.',
    'formulaire.restants': '{n} caractères restants',

    /* -- Le nom du relecteur ------------------------------------------- */
    'auteur.connu': 'Vous écrivez sous le nom de {nom}.',
    'auteur.changer': 'Changer',
    'historique.montrer': 'Voir l’historique ({n} corrigée·s)',
    'historique.masquer': 'Masquer l’historique',
    'historique.aide': 'Remarques corrigées, dont le correctif est en ligne. '
        + 'Elles restent ici : une correction jugée faite peut se révéler incomplète.',
    'note.corrigee': 'Corrigée le {date} par {par}',
    'note.corrigee_attente': 'Corrigée, en attente de déploiement',

    /* -- Les pannes. Elles s'affichent, elles ne se taisent jamais ------ */
    'erreur.titre': 'Votre remarque n’a PAS été enregistrée',
    'erreur.titre_lecture': 'Les notes n’ont pas pu être relues',
    'erreur.titre_resolution': 'L’état de la remarque n’a PAS été changé',
    'erreur.reseau':
        'Le serveur n’a pas répondu. Votre texte est conservé ci-dessus : '
        + 'réessayez dans un instant.',
    'erreur.inattendue':
        'Le serveur a répondu quelque chose d’inattendu. Votre texte est '
        + 'conservé ci-dessus ; prévenez la personne qui suit le site.',

    /* Le refus SEC : un code 4xx sans message lisible, presque toujours une
       page HTML de pare-feu. Il a sa propre phrase parce que « quelque chose
       d’inattendu » n’aidait personne : le refus est net, il a un code, et il
       existe un geste qui le contourne souvent — reformuler. */
    'erreur.refus':
        'Le serveur a REFUSÉ la requête (code {code}) sans expliquer pourquoi. '
        + 'C’est presque toujours un pare-feu placé devant le site, qui a pris '
        + 'le texte pour une attaque. Votre texte est conservé ci-dessus : '
        + 'reformulez-le — sans balises < >, sans guillemets, sans fragment de '
        + 'code ni adresse web — puis réessayez. Si le refus persiste, '
        + 'prévenez la personne qui suit le site : c’est une règle de pare-feu '
        + 'à ajuster, pas une panne de l’outil.',
    'erreur.refus_taille':
        'Le serveur a refusé la requête parce qu’elle est trop longue (code '
        + '{code}). Votre texte est conservé ci-dessus : raccourcissez-le, ou '
        + 'découpez-le en deux remarques.',
    'erreur.refus_frequence':
        'Le serveur a refusé la requête parce qu’il en a reçu trop en peu de '
        + 'temps (code {code}). Votre texte est conservé ci-dessus : attendez '
        + 'une minute et réessayez.',
    'erreur.panne_serveur':
        'Le serveur a échoué (code {code}). Ce n’est pas votre texte : il est '
        + 'conservé ci-dessus. Réessayez dans un instant, puis prévenez la '
        + 'personne qui suit le site.',
    'erreur.chiffrement':
        'Le chiffrement a échoué dans ce navigateur : rien n’a été envoyé. '
        + 'Votre texte est conservé ci-dessus. Rechargez la page et réessayez ; '
        + 'si cela se reproduit, prévenez la personne qui suit le site.',
    'erreur.lecture_incomplete': 'Ce qui s’affiche peut être incomplet.',
    'erreur.masquer': 'Masquer',

    /* -- Les notes qu'on ne sait pas lire, et qu'on ne cache pas -------- */
    'lecture.recentes_une':
        '1 note a été écrite par une version plus récente d’annotepage et n’a '
        + 'pas pu être lue.',
    'lecture.recentes_n':
        '{n} notes ont été écrites par une version plus récente d’annotepage et '
        + 'n’ont pas pu être lues.',
    'lecture.illisibles_une':
        '1 note n’a pas pu être déchiffrée. Le sel de ce navigateur n’est '
        + 'peut-être pas celui avec lequel elle a été écrite.',
    'lecture.illisibles_n':
        '{n} notes n’ont pas pu être déchiffrées. Le sel de ce navigateur n’est '
        + 'peut-être pas celui avec lequel elles ont été écrites.',
    'lecture.inconnues_une':
        '1 note est écrite dans un mode que cet outil ne connaît pas et n’a pas '
        + 'été lue.',
    'lecture.inconnues_n':
        '{n} notes sont écrites dans un mode que cet outil ne connaît pas et '
        + 'n’ont pas été lues.',
    'lecture.titre_partielle': 'Certaines notes n’ont pas pu être lues',

    /* -- Les marqueurs poses sur les elements deja annotes -------------- */
    'marqueur.une': '1 note ici',
    'marqueur.n': '{n} notes ici',

    /* -- Le sel : le seul secret, et il ne se recupere pas -------------- */
    'sel.titre': 'Le sel de ce projet est nécessaire',
    'sel.aide':
        'Les notes de ce projet sont chiffrées dans votre navigateur. Sans le '
        + 'sel du projet, ce navigateur ne peut ni les lire, ni en écrire. '
        + 'Demandez-le à la personne qui a installé l’outil, et collez-le '
        + 'ci-dessous. Il sera retenu par ce navigateur, pour ce site.',
    'sel.etiquette': 'Le sel du projet (43 caractères)',
    'sel.valider': 'Utiliser ce sel',
    'sel.vide': 'Collez le sel avant de valider.',
    'sel.forme':
        'Ce n’est pas un sel : on attend 43 caractères parmi A-Z a-z 0-9 - _, '
        + 'sans espace ni tiret décoratif. Recopiez-le d’un seul bloc.',
    'sel.mauvais':
        'Ce sel n’est pas celui de ce projet. Rien n’a été envoyé, rien n’a été '
        + 'déchiffré. Vérifiez que vous collez le sel du bon projet.',
    'sel.origine_changee':
        'Ce sel est retenu par navigateur ET par domaine. Le jour où la '
        + 'préproduction devient la production, il faut le recoller une fois '
        + 'sur le nouveau domaine — les notes, elles, ne bougent pas.',
    'sel.non_retenu':
        'Ce navigateur refuse de retenir le sel (navigation privée, ou stockage '
        + 'bloqué). L’outil fonctionne pour cette page, mais le sel sera à '
        + 'recoller au prochain chargement.',
    'sel.remplacer': 'Coller un autre sel',
    'sel.oublier': 'Oublier le sel sur ce navigateur',

    /* -- L'installation ------------------------------------------------ */
    'installation.titre': 'Installer annotepage sur ce site',
    'installation.engendrer': 'Engendrer un sel et créer le projet',
    'installation.avertissement_titre': 'À lire avant de continuer',
    'installation.avertissement':
        'Le sel ci-dessous est le SEUL secret du projet, et personne d’autre ne '
        + 'l’a : ni le serveur, ni l’auteur de l’outil, ni personne à qui le '
        + 'demander. SEL PERDU = NOTES PERDUES, définitivement, sans '
        + 'récupération possible. Rangez-le maintenant, là où votre équipe range '
        + 'ses mots de passe, avant de continuer.',
    'installation.sel': 'Le sel du projet — à conserver',
    'installation.projet': 'L’identifiant du projet — public, il va dans la page',
    'installation.balise': 'La balise à coller en fin de <body>, sur les pages à annoter',
    'installation.serveur': 'À déclarer dans la configuration du serveur',
    'installation.copier': 'Copier',
    'installation.copie': 'Copié',
    'installation.copie_echec': 'Sélectionnez le texte et copiez-le à la main.',
    'installation.continuer': 'J’ai rangé le sel, continuer',
    'installation.faite':
        'Le sel est retenu par ce navigateur. Collez la balise ci-dessus dans '
        + 'les pages, déclarez le projet côté serveur, puis rechargez cette '
        + 'page : l’outil prend la suite.',
    'installation.sans_serveur':
        'Aucune adresse de serveur n’est déclarée sur la balise (data-serveur), '
        + 'et le client ne vient pas du site : il ne peut pas deviner où écrire. '
        + 'Ajoutez data-serveur à la balise.',
    'installation.mode_clair':
        'Ce projet est déclaré en mode CLAIR : le serveur lira les remarques, '
        + 'les noms et les chemins. Ce mode n’est acceptable que si le serveur '
        + 'est le site lui-même, derrière la même restriction d’accès. Un relais '
        + 'le refusera.',

    /* -- Le contexte sur, sans lequel rien n'est possible --------------- */
    'contexte.titre': 'annotepage ne peut pas fonctionner sur cette page',
    'contexte.aide':
        'Le chiffrement des notes et le regroupement par page reposent sur '
        + 'WebCrypto, que le navigateur ne fournit que dans un contexte sûr : '
        + 'https, ou localhost. Cette page n’en est pas un. Rien ne peut être '
        + 'écrit ni relu ici tant qu’elle est servie ainsi.',

    /* -- Divers -------------------------------------------------------- */
    'date.inconnue': 'date inconnue'
};
