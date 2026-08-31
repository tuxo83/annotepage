<?php
/**
 * sortie-texte.php — LE FORMAT DE LA LECTURE A DISTANCE.
 *
 * Ce fichier merite d'exister seul parce que ce format est un CONTRAT : il
 * est lu par des humains, et par des assistants qui recuperent la page par
 * une simple requete HTTP, sans acces au serveur.
 *
 * Cinq exigences le dictent, dans cet ordre :
 *
 *  1. text/plain, jamais JSON ni HTML. Un outil de recuperation degrade la
 *     mise en forme ; du JSON en ressort casse, du texte en ressort lisible.
 *  2. Aucune ponctuation decorative — ni cadre, ni ligne de tirets, ni puce.
 *     Tout ce qui « fait joli » est ce qui disparait le premier.
 *  3. Une information par ligne, sous la forme « cle valeur ». La cle n'est
 *     PAS le premier mot : c'est le plus long prefixe de la ligne qui figure
 *     dans la liste fermee des cles, et la valeur est le reste. La nuance
 *     n'est pas theorique — « a la note » compte trois mots.
 *  4. Un bloc par note, separe par une ligne vide. Les reponses suivent leur
 *     note mere, indentees de DEUX espaces.
 *  5. Les dates en ISO 8601 avec decalage explicite. Une date sans fuseau
 *     n'est pas une date.
 *
 * L'INDENTATION SEULE DIT CE QU'ON LIT, et c'est ce qui rend le format
 * analysable sans ambiguite :
 *
 *      0 espace   ligne de structure d'une note
 *      2 espaces  ligne de structure d'une reponse
 *      4 espaces  texte d'une note
 *      6 espaces  texte d'une reponse
 *
 * D'ou l'ecart de QUATRE espaces entre une cle et son texte, la ou deux
 * auraient suffi a l'oeil : sans lui, une remarque commencant par le mot
 * « reponse » serait indiscernable d'un debut de reponse.
 *
 * Une ligne absente signifie une valeur vide : on n'ecrit pas une cle pour
 * dire qu'il n'y a rien.
 *
 * DEUX PRODUCTEURS, UNE SEULE GRAMMAIRE
 *
 * Ce fichier est le premier des deux. En mode clair il produit l'export
 * COMPLET, octet pour octet comme le format 1 aux lignes d'en-tete pres.
 *
 * En mode chiffre il ne le peut pas : il n'a ni les chemins, ni les noms, ni
 * les textes. Il produit alors un export STRUCTUREL — la meme grammaire, avec
 * les seules cles qu'il connait. Les cles qu'il ne peut pas remplir sont
 * ABSENTES, ce qui, par le contrat, veut exactement dire « valeur vide ».
 * Aucune ligne « texte » n'est emise : une ligne « texte » suivie de rien
 * annoncerait une remarque vide, ce qui serait faux. Un lecteur qui recupere
 * cet export sait donc, sans ambiguite et sans code special, qu'il lui manque
 * le sel.
 *
 * L'export complet en mode chiffre est produit par @annotepage/mcp, qui a le
 * sel. Il n'a qu'une seule source pour cela : cette adresse. C'est pourquoi
 * l'export structurel emet AUSSI les enveloppes, sous les cles « charge » et
 * « charge-resolution ». Sans elles, le second producteur n'aurait rien a
 * dechiffrer et la promesse du §5.3 serait vide. Ce sont des cles ajoutees,
 * ce qui ne change pas le numero de format (FORMAT.md §7) : un lecteur qui ne
 * les connait pas les ignore, et il lui reste exactement l'export structurel.
 * Elles ne rendent rien de lisible — c'est tout leur interet.
 *
 * LE FORMAT SE DEFEND LUI-MEME, ET NE FAIT PAS CONFIANCE AU STOCKAGE.
 *
 * entrees.php ramene deja a \n tout ce qu'un lecteur compte pour une fin de
 * ligne, et retire les caracteres de controle. Ce serait suffisant s'il n'y
 * avait qu'une facon d'ecrire dans le stockage et qu'une seule version du
 * code dans le temps. Ni l'un ni l'autre n'est vrai :
 *
 *  - la table survit aux mises a jour de l'outil. Une note enregistree AVANT
 *    que la frontiere de confiance ne connaisse U+2028 y est encore, et elle
 *    fabriquerait ici une note entiere qui n'a jamais ete ecrite ;
 *  - qui remplace depot.php (c'est prevu : voir son en-tete) remplace la
 *    facon d'ecrire, pas ce fichier-ci ;
 *  - en mode chiffre, la frontiere de confiance n'a RIEN vu du texte : il
 *    dort dans l'enveloppe. Le nettoyage a lieu chez le producteur qui
 *    dechiffre, apres dechiffrement. Ici, il n'y a rien a nettoyer, et c'est
 *    exactement pour cela qu'il faut le nommer.
 *
 * Toute valeur ecrite passe donc par ap_valeur_sure() ou ap_indenter(), qui
 * ramenent les fins de ligne et retirent les caracteres de controle une
 * seconde fois. C'est une redondance assumee : le contrat d'indentation est
 * ce que lit un assistant sans acces au serveur, et une garantie de format ne
 * doit dependre de rien d'autre que du code qui l'ecrit.
 */

if (!defined('AP_INTERNE')) {
    http_response_code(404);
    exit;
}

/**
 * Ecrit l'export complet sur la sortie standard, EN FLUX.
 *
 * Rien n'est accumule : ni ici, ni dans le pilote de base (voir
 * ApDepot::toutes()). La memoire ne depend donc pas du nombre de notes, dont
 * rien ne borne la croissance.
 *
 * Ce fichier ne connait PAS le stockage : il recoit un nombre et un iterateur
 * de notes deja normalisees. C'est ce qui fait de lui un format, et non une
 * seconde facon de lire la base.
 *
 * @param string      $version     version de l'outil, pour savoir a distance
 *                                 ce qui est en ligne
 * @param string      $projet      identifiant du projet exporte
 * @param array       $repartition array('clair' => int, 'chiffre' => int)
 * @param int         $total       nombre total de notes, reponses comprises
 * @param Traversable $notes       notes ordonnees : chaque mere suivie des siennes
 */
function ap_ecrire_export_texte($version, $projet, array $repartition, $total, $notes)
{
    echo "outil annotepage\n";
    echo "format " . AP_FORMAT . "\n";
    echo "version " . ap_valeur_sure($version) . "\n";
    // L'identifiant de projet est ecrit EN ENTIER, contrairement au
    // diagnostic. Ce n'est pas une incoherence : il faut avoir l'identifiant
    // pour obtenir cet export, il n'apprend donc rien a son lecteur, et il
    // permet de savoir de quel projet vient un fichier qu'on retrouve six
    // mois plus tard.
    echo "projet " . ap_valeur_sure($projet) . "\n";
    echo "chiffrement " . ap_mot_chiffrement($repartition) . "\n";
    echo "export " . gmdate('Y-m-d\TH:i:sP') . "\n";
    echo "notes " . $total . "\n";
    echo "\n";

    if ($total === 0) {
        echo "aucune note enregistree\n";
        return;
    }

    $ecrites = 0;
    $sautees = 0;

    foreach ($notes as $ligne) {
        // Mode inconnu : la ligne est SAUTEE, et comptee. Ni devinee, ni
        // rendue vide sans le dire — une note affichee sans son texte
        // ressemble a une note vide, et personne ne va verifier en base.
        if ($ligne['mode'] !== 'clair' && $ligne['mode'] !== 'chiffre') {
            $sautees++;
            continue;
        }

        $chiffre = ($ligne['mode'] === 'chiffre');
        $estReponse = $ligne['reponse_a'] !== null;
        $marge = $estReponse ? '  ' : '';

        if (!$estReponse) {
            // Une ligne vide SEPARE les notes ; elle ne les precede pas
            // toutes, faute de quoi le premier bloc commencerait par du vide.
            if ($ecrites > 0) {
                echo "\n";
            }
            echo "note " . (int) $ligne['id'] . "\n";
            if (!$chiffre && $ligne['page'] !== '') {
                echo "page " . ap_valeur_sure($ligne['page']) . "\n";
            }
            if ($ligne['index_page'] !== '') {
                echo "index-page " . ap_valeur_sure($ligne['index_page']) . "\n";
            }
            if (!$chiffre && $ligne['selecteur'] !== '') {
                echo "element " . ap_valeur_sure($ligne['selecteur']) . "\n";
            }
            if (!$chiffre && $ligne['extrait'] !== '') {
                echo "extrait " . ap_valeur_sure($ligne['extrait']) . "\n";
            }
        } else {
            echo "\n";
            echo $marge . "reponse " . (int) $ligne['id'] . "\n";
            echo $marge . "a la note " . (int) $ligne['reponse_a'] . "\n";
        }

        // « mode chiffre » n'est emis que pour une note chiffree. Une note
        // claire n'a pas de ligne « mode », et une note du format 1 non plus :
        // la meme absence, la meme signification. Les exports du format 1
        // restent donc valides tels quels.
        if ($chiffre) {
            echo $marge . "mode chiffre\n";
        }

        if (!$chiffre) {
            echo $marge . "auteur " . ap_valeur_sure($ligne['auteur']) . "\n";
        }
        echo $marge . "date " . ap_valeur_sure($ligne['cree_le']) . "\n";
        // Contexte de prise de note. N'est ecrit que s'il existe : une ligne
        // « version » vide ferait croire a une version inconnue alors que le
        // site ne la declarait simplement pas.
        if (!$chiffre) {
            if ($ligne['version'] !== '') {
                echo $marge . "version " . ap_valeur_sure($ligne['version']) . "\n";
            }
            if ($ligne['environnement'] !== '') {
                echo $marge . "environnement " . ap_valeur_sure($ligne['environnement']) . "\n";
            }
            if ($ligne['fenetre'] !== '') {
                echo $marge . "fenetre " . ap_valeur_sure($ligne['fenetre']) . "\n";
            }
        }
        // Etat de resolution. Une note corrigee reste dans l'export : c'est
        // par la qu'on verifie qu'une correction annoncee a bien eu lieu.
        //
        // En mode chiffre, la DATE de correction est connue du serveur (elle
        // lui sert a trier ouvert/corrige sans rien dechiffrer) mais pas le
        // nom du correcteur : la ligne s'arrete donc a la date. La cle reste
        // « corrigee » et la valeur est le reste de la ligne — le contrat ne
        // dit nulle part que ce reste doive contenir un nom.
        if ($ligne['resolue_le'] !== null) {
            echo $marge . "corrigee " . ap_valeur_sure($ligne['resolue_le'])
                . (!$chiffre && $ligne['resolue_par'] !== ''
                    ? ' par ' . ap_valeur_sure($ligne['resolue_par']) : '')
                . (!$chiffre && $ligne['resolue_version'] !== ''
                    ? ' en ' . ap_valeur_sure($ligne['resolue_version']) : '')
                . "\n";
        } else {
            echo $marge . "etat ouverte\n";
        }

        if ($chiffre) {
            // Les enveloppes, pour le second producteur. Elles sont en
            // base64url : rien a y nettoyer, mais elles passent quand meme par
            // ap_valeur_sure(), parce qu'une garantie de format qui s'applique
            // « sauf ici » n'en est pas une.
            if ($ligne['charge'] !== '') {
                echo $marge . "charge " . ap_valeur_sure($ligne['charge']) . "\n";
            }
            if ($ligne['charge_resolution'] !== '') {
                echo $marge . "charge-resolution "
                    . ap_valeur_sure($ligne['charge_resolution']) . "\n";
            }
        } else {
            echo $marge . "texte\n";
            // Quatre espaces de plus que la structure : voir l'en-tete.
            echo ap_indenter($ligne['texte'], $marge . '    ');
        }

        $ecrites++;

        // Au fil de l'eau : un export long ne doit pas attendre sa fin pour
        // commencer a arriver.
        if (($ecrites % 25) === 0) {
            flush();
        }
    }

    echo "\n";

    if ($sautees > 0) {
        // Deux lignes, deux cles : « ignorees » est un prefixe de
        // « ignorees-raison », et la regle de lecture prend le PLUS LONG
        // prefixe present dans la liste des cles. Une phrase nue a la marge
        // zero serait, elle, une ligne de structure sans cle — c'est-a-dire
        // du bruit dans un format ou chaque ligne se lit « cle valeur ».
        echo "ignorees " . $sautees . "\n";
        echo "ignorees-raison ces notes portent un mode que cette version "
            . "d'annotepage ne connait pas ; elles n'ont pas ete affichees, et elles "
            . "n'ont pas ete perdues.\n";
    }
}

/**
 * « oui », « non » ou « mixte ».
 *
 * « mixte » est le cas normal d'une installation qui a change d'avis : elle a
 * tourne en clair, puis on a active le chiffrement. Il se dit, il ne se cache
 * pas — un lecteur qui ne recupere que la moitie des textes doit savoir
 * pourquoi avant de conclure que l'outil perd des notes.
 */
function ap_mot_chiffrement(array $repartition)
{
    $clair   = (int) $repartition['clair'];
    $chiffre = (int) $repartition['chiffre'];
    if ($chiffre > 0 && $clair > 0) {
        return 'mixte';
    }
    return $chiffre > 0 ? 'oui' : 'non';
}

/**
 * Ramene a \n toutes les fins de ligne, quelles qu'elles soient, et retire
 * les caracteres de controle qui ne sont ni \n ni \t.
 *
 * La liste est celle d'entrees.php, et pour la meme raison : un caractere
 * qu'un lecteur compte pour une fin de ligne et que nous laissons passer
 * fabrique une ligne de structure la ou il n'y a que du texte.
 */
function ap_lignes_normalisees($texte)
{
    $texte = str_replace(
        array("\r\n", "\r", "\xC2\x85", "\xE2\x80\xA8", "\xE2\x80\xA9"),
        "\n", (string) $texte);
    $propre = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $texte);
    // preg_replace rend null sur une chaine qui n'est pas de l'UTF-8 valide :
    // on retombe alors sur une version octet a octet plutot que d'effacer la
    // note. Perdre un accent vaut mieux que perdre une remarque.
    if ($propre === null) {
        $propre = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $texte);
    }
    return (string) $propre;
}

/**
 * Valeur ecrite sur une ligne « cle valeur » : elle ne peut pas contenir de
 * fin de ligne, sous peine d'en fabriquer une seconde, non indentee.
 */
function ap_valeur_sure($valeur)
{
    return trim(str_replace("\n", ' ', ap_lignes_normalisees($valeur)));
}

/**
 * Indente chaque ligne d'un bloc de texte.
 *
 * Une ligne vide reste VIDE, sans espaces : des espaces en fin de ligne sont
 * exactement ce qu'un outil de recuperation supprime, et le bloc paraitrait
 * alors incoherent.
 */
function ap_indenter($texte, $marge)
{
    $sortie = '';
    $lignes = explode("\n", ap_lignes_normalisees($texte));
    foreach ($lignes as $ligne) {
        $sortie .= ($ligne === '' ? '' : $marge . $ligne) . "\n";
    }
    return $sortie;
}
