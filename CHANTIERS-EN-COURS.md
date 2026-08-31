# Qui ecrit ou — carte de partage

Fichier de travail temporaire. A SUPPRIMER a l'assemblage, avant le premier
commit pousse : il ne fait pas partie du produit.

Quatre chantiers avancent en parallele. Chacun possede des repertoires et
n'ecrit QUE dedans. Tous peuvent LIRE le reste du depot.

| Chantier                | Ecrit dans                        | Contenu |
|-------------------------|-----------------------------------|---------|
| Bundle (principal)      | `client/` `serveur/` `mcp/` `site/` | les trois composants, puis recette adverse |
| CI et bout en bout      | `.github/` `test-bout-en-bout/`   | publication OIDC, test du protocole complet |
| Site en avance          | `docs/`                           | le site publie sur annotepage.com |
| Controles               | `outils/`                         | cinq controles anti-publication-cassee |

## Deux choses a reconcilier a l'assemblage

**Le site existe en double.** Le chantier « site en avance » ecrit dans
`docs/`, et le chantier principal produira sa propre version dans `site/`
quand il atteindra sa derniere phase. C'est volontaire : deux prises
independantes sur le meme brief, on garde la meilleure et on supprime l'autre.
GitHub Pages ne sert que la racine ou `/docs` sans CI, donc la version retenue
doit finir dans `docs/`.

**Le README de la racine n'appartient a personne.** Le chantier principal en
produira un en phase de synthese. Ne pas en ecrire un autre entre-temps.

## Regle en cas de doute

Ne pas ecrire. Signaler dans le compte rendu. Une collision entre deux agents
sur un meme fichier coute plus cher que le tour d'attente.
