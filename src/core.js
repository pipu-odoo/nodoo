import path from "path";
import { existsSync, mkdirSync } from 'fs';


// Imports des modules de logique pure
import { dropDatabase, installAddon } from './database.js';
import { startOdoo } from './server.js';

import termkit from "terminal-kit";
import { cacheDir, getConfigPath, getSelectedTag, runScan } from "./utils.js";
const term = termkit.terminal;

/**
 * Fonction principale exportée pour le CLI
 */
export const main = async (options) => {
    const configPath = getConfigPath(options);

    if (!existsSync(cacheDir)) mkdirSync(cacheDir);

    if (options.scan) {
        await runScan(configPath);
        return;
    }

    const selectedTag = await getSelectedTag(options);

    if (selectedTag) {
        const addonName = selectedTag.split(':')[0];
        await installAddon(options.database, addonName, options);
    }

    // 4. Lancement Parallèle
    const count = parseInt(options.ntimes) || 1;
    const instances = Array.from({ length: count }).map((_, i) => 
        startOdoo(i, options.database, configPath, {
            ...options,
            tag: selectedTag,
        })
    );

    try {
        await Promise.all(instances);
        term.bold.green("\n✨ Toutes les instances ont terminé.\n");
    } catch (err) {
        term.bold.red(`\n❌ Échec détecté. ${err}\n`);
    } finally {
        if (count > 1 && !options.keepDb) {
            term.gray("\n🧹 Nettoyage des bases temporaires...\n");
            for (let i = 0; i < count; i++) await dropDatabase(`${options.database}_test_${i}`);
        }
        term.bold.white("\n👋 Fin de session. Au revoir !\n");

        // Libère le terminal et coupe les listeners
        term.grabInput(false);
        // Laisse un petit délai pour que les derniers logs s'affichent
        setTimeout(() => { process.exit(0); }, 100);
    }
};