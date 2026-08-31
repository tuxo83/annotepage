#!/usr/bin/env node
/* serveur-mcp.mjs — LE POINT D'ENTREE DU SERVEUR MCP.
 *
 * Il fait trois choses, dans cet ordre, et l'ordre compte :
 *
 *  1. il charge la configuration locale — celle qui porte le sel — AVANT
 *     d'ouvrir la conversation. Un serveur MCP qui demarre puis echoue a
 *     chaque appel donne un assistant qui reessaie ; un serveur qui refuse de
 *     demarrer donne un message d'erreur qu'un humain lit ;
 *  2. il ecrit ses avertissements sur STDERR, jamais sur stdout. Un octet de
 *     trop sur stdout casse le protocole au milieu d'un message ;
 *  3. il sert.
 *
 * ON NE LIT LA CONFIGURATION QU'UNE FOIS. Recharger a chaque appel serait
 * plus souple et ferait qu'un sel modifie en cours de conversation change,
 * sans un mot, le projet dans lequel l'assistant ecrit.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { chargerConfiguration, ErreurConfiguration } from './source/configuration.mjs';
import { construireOutils } from './source/outils-mcp.mjs';
import { servir, journal } from './source/protocole-mcp.mjs';

const ici = dirname(fileURLToPath(import.meta.url));

const version = () => {
    try {
        return JSON.parse(readFileSync(join(ici, 'package.json'), 'utf8')).version;
    } catch (e) {
        return 'inconnue';
    }
};

/* Le chemin de configuration se donne sur la ligne de commande, parce que
   c'est ainsi qu'un fichier de declaration MCP lance un serveur :
       "command": "annotepage-mcp", "args": ["--config", "/chemin/.annotepage.json"]
   La variable d'environnement ANNOTEPAGE_CONFIG marche aussi ; l'argument
   gagne, parce qu'il est ecrit a cote de la commande et se relit. */
const argumentConfig = () => {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--config' && args[i + 1]) return args[i + 1];
        if (args[i].startsWith('--config=')) return args[i].slice('--config='.length);
    }
    return null;
};

const demarrer = async () => {
    let configuration;
    try {
        configuration = await chargerConfiguration(argumentConfig());
    } catch (e) {
        if (e instanceof ErreurConfiguration) {
            process.stderr.write('\n' + e.message + '\n\n');
            process.exit(2);
        }
        throw e;
    }

    for (const mot of configuration.avertissements) journal(mot);
    journal('configuration', configuration.chemin);
    journal('projets', [...configuration.projets.keys()].join(', '));

    servir({ name: 'annotepage', version: version() },
           construireOutils(configuration));
};

demarrer().catch((e) => {
    process.stderr.write('[annotepage-mcp] ' + ((e && e.stack) || String(e)) + '\n');
    process.exit(1);
});
