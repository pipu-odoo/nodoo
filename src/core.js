import { existsSync, mkdirSync } from 'fs';
import os from 'os';

import {
    installAddon,
    cloneDatabase,
    cleanDatabase
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

export async function runTests(tagsArg, options) {
    const configPath = await getConfigPath(options);

    if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
    }

    const tags = tagsArg.split(',').map(t => t.trim()).filter(Boolean);
    const addonNames = [...new Set(tags.map(t => t.split(':')[0]))];

    for (const addonName of addonNames) {
        await installAddon(options.database, addonName, options);
    }

    const allTags = tags.join(',');
    term.cyan(`\n🚀 Lancement des tests : ${allTags}\n`);
    const result = await startOdoo(options.database, configPath, { ...options, tag: allTags }, 8069);

    if (result.status === 'success') {
        term.bold.green(`\n✨ Tests réussis.\n`);
    } else {
        term.bold.red(`\n❌ Tests échoués.\n`);
    }

    term.bold.white('\n👋 Fin de session.\n');
    term.grabInput(false);
    setTimeout(() => process.exit(result.status === 'success' ? 0 : 1), 100);
}

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
    const defaultJobs = Math.max(1, Math.floor(os.cpus().length / 2));
    const jobs = Math.min(count, Number.parseInt(options.jobs, 10) || defaultJobs);
    const BASE_PORT = 8069;

    // Pour n=1, on utilise la DB directement sans clone
    const clones = count > 1
        ? Array.from({ length: count }, (_, i) => ({
            db: `${options.database}_test_${i + 1}`,
            port: BASE_PORT + i,
        }))
        : [{ db: options.database, port: BASE_PORT }];

    if (count > 1) {
        term.cyan(`\n⚡ ${count} runs, ${jobs} en parallèle...\n`);
    }

    try {
        if (count > 1) {
            // Prépare tous les clones en parallèle
            await Promise.all(clones.map(async ({ db }) => {
                await cleanDatabase(db);
                await cloneDatabase(options.database, db);
            }));
        }

        // Exécution avec pool de concurrence
        const results = [];
        let runIndex = 0;

        const runNext = async () => {
            while (runIndex < clones.length) {
                const i = runIndex++;
                const { db, port } = clones[i];
                term.cyan(`\n🚀 Run ${i + 1}/${count} → DB: ${db} port: ${port}\n`);
                const result = await startOdoo(db, configPath, { ...options, tag: selectedTag }, port);
                results[i] = { run: i + 1, ...result };
                const status = result.status === 'success' ? '✅' : '❌';
                term.white(`${status} Run ${i + 1}/${count} terminé\n`);
            }
        };

        // Lance `jobs` workers en parallèle
        await Promise.all(Array.from({ length: jobs }, runNext));

        const failed = results.filter(r => r.status !== 'success');
        if (failed.length === 0) {
            term.bold.green(`\n✨ Tous les ${count} runs ont réussi.\n`);
        } else {
            term.bold.red(`\n❌ ${failed.length}/${count} runs ont échoué (runs: ${failed.map(r => r.run).join(', ')}).\n`);
        }

    } catch (error) {
        term.bold.red(`\n❌ Erreur : ${error?.message || error}\n`);
    } finally {
        if (count > 1) {
            await Promise.all(clones.map(async ({ db }) => {
                term.gray(`🧹 Suppression de ${db}\n`);
                await cleanDatabase(db);
            }));
        }

        term.bold.white('\n👋 Fin de session.\n');
        term.grabInput(false);
        setTimeout(() => process.exit(0), 100);
    }
}