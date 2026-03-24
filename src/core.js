import { existsSync, mkdirSync } from 'fs';

import {
    dropDatabase,
    installAddon,
    removeFilestore,
    cloneDatabase
} from './database.js';

import { startOdoo } from './server.js';

import termkit from 'terminal-kit';
import {
    cacheDir,
    getConfigPath,
    getSelectedTag,
    runScan
} from './utils.js';

const term = termkit.terminal;

export async function main(options) {
    const configPath = await getConfigPath(options);

    if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
    }

    // Mode scan
    if (options.scan === true) {
        await runScan(configPath);
        return;
    }

    const selectedTag = await getSelectedTag(options);

    if (selectedTag) {
        const addonName = selectedTag.split(':')[0];
        await installAddon(options.database, addonName, options);
    }

    const count = Number.parseInt(options.ntimes, 10) || 1;

    // Détermine la DB à utiliser : clone uniquement si ntimes > 1
    const dbToUse = count > 1
        ? `${options.database}_test`
        : options.database;

    try {
        if (count > 1) {
            // Supprime la DB clone si elle existe déjà
            await dropDatabase(dbToUse).catch(() => {});
            removeFilestore(dbToUse);

            term.gray(`\n🧬 Clonage ${options.database} → ${dbToUse}\n`);
            await cloneDatabase(options.database, dbToUse);
        }

        // Exécution en série
        for (let i = 0; i < count; i ++) {
            term.cyan(`\n🚀 Run ${i + 1}/${count}\n`);
            await startOdoo(dbToUse, configPath, {
                ...options,
                tag: selectedTag
            });
        }

        term.bold.green('\n✨ Tous les runs ont terminé.\n');

    } catch (error) {
        term.bold.red(`\n❌ Erreur : ${error?.message || error}\n`);
    } finally {
        // Cleanup uniquement si clone utilisée
        if (count > 1) {
            term.gray(`\n🧹 Suppression de ${dbToUse}\n`);
            await dropDatabase(dbToUse).catch(() => {});
            removeFilestore(dbToUse);
        }

        term.bold.white('\n👋 Fin de session.\n');
        term.grabInput(false);
        setTimeout(() => process.exit(0), 100);
    }
}

export async function clean(dbName) {
    term.blue(`Clean ${dbName}\n`);
    await dropDatabase(dbName);
    await removeFilestore(dbName);
    process.exit(0);
}