import path from "path";
import { writeFileSync, readFileSync, existsSync, statSync } from 'fs';
import { globSync } from "glob";
import ini from 'ini';
import { eachLine } from 'line-reader';

import termkit from "terminal-kit";
const term = termkit.terminal;

export const cacheDir = path.join(process.cwd(), '.odoo_launch_cache');
const lastTourFile = path.join(cacheDir, '.last_tour');
const tourListPath = path.join(cacheDir, 'tours_list.json');

export const getStoredTag = (filePath) => existsSync(filePath) ? readFileSync(filePath, 'utf-8').trim() : null;
export const storeTag = (filePath, tag) => writeFileSync(filePath, tag);

const resolveAddonsPaths = (iniConfig, configPath) => {
    const configDir = path.dirname(configPath);
    const rawPaths = iniConfig.options?.addons_path || iniConfig.addons_path || "";
    return rawPaths.split(',').map(p => {
        const trimmed = p.trim();
        return path.isAbsolute(trimmed) ? trimmed : path.resolve(configDir, trimmed);
    });
};

/**
 * Recherche un ou plusieurs tours dans le fichier de cache
 * @param {string} query - Le morceau de nom de tour ou d'addon à chercher
 * @returns {Array} - Liste des tags correspondants (ex: ["addon:test_nom"])
 */
export const searchTour = (query) => {
    if (!existsSync(tourListPath)) {
        term.red(`\n❌ Cache introuvable. Lancez d'abord un scan.\n`);
        return [];
    }

    const data = JSON.parse(readFileSync(tourListPath, 'utf-8'));
    const matches = [];
    const searchTerm = query.toLowerCase();

    // On parcourt chaque addon dans les résultats
    Object.values(data.addons).forEach(tourList => {
        tourList.forEach(tag => {
            if (tag.toLowerCase().includes(searchTerm)) {
                matches.push(tag);
            }
        });
    });

    return matches;
};

/**
 * Logique interne de scan adaptée au format module
 */
export const runScan = async (configPath) => {
    if (!existsSync(configPath)) {
        term.red(`❌ Configuration introuvable : ${configPath}\n`);
        process.exit(1);
    }

    term.cyan('🔎 Scan des addons...\n');
    const ini_config = ini.parse(readFileSync(configPath, 'utf-8'));
    const addonsPaths = resolveAddonsPaths(ini_config, configPath);

    const results = { scan_date: new Date().toISOString(), total_tours: 0, addons: {} };

    for (const basePath of addonsPaths) {
        if (!existsSync(basePath)) continue;
        const files = globSync(path.join(basePath, "**/tests/test_*.py"));

        for (const file of files) {
            const addonName = file.split(path.sep).slice(-3, -2)[0];
            const foundTests = await getToursFromFile(file);

            if (foundTests.size > 0) {
                if (!results.addons[addonName]) results.addons[addonName] = [];
                foundTests.forEach(test => {
                    const tag = `${addonName}:${test}`;
                    if (!results.addons[addonName].includes(tag)) {
                        results.addons[addonName].push(tag);
                        results.total_tours++;
                    }
                });
            }
        }
    }

    writeFileSync(tourListPath, JSON.stringify(results, null, 2));
    term.green(`✅ ${results.total_tours} tours indexés dans le cache.\n`);
}

export const getConfigPath = (options) => {
    const workingDir = process.cwd();
    return path.resolve(workingDir, options.config);
}


const getToursFromFile = async (testPathFile) => {
    return new Promise((resolve) => {
        if (!existsSync(testPathFile) || statSync(testPathFile).size === 0) return resolve(new Set());
        const tests = new Set();
        let currentClass = "", currentMethod = "";

        eachLine(testPathFile, (line, last) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('class ')) currentClass = line.match(/class\s+(?<name>\w+)/)?.groups?.name || "";
            else if (currentClass && trimmed.startsWith('def ')) currentMethod = line.match(/def\s+(?<name>\w+)\s*\(self/)?.groups?.name || "";
            else if (currentClass && currentMethod && (trimmed.includes("start_tour(") || trimmed.includes("start_pos_tour("))) {
                tests.add(`${currentClass}.${currentMethod}`);
            }
            if (last) resolve(tests);
        });
    });
};

export const getSelectedTag = async (options) => {
    let selectedTag = null;

    if (options.tag.length > 0) {
        const matches = searchTour(options.tag);
    
        if (matches.length === 0) {
            term.red(`\n❌ Aucun tour ne correspond à "${options.tag}"\n`);
            return null;
        }
    
        if (matches.length === 1) {
            // Un seul match, on le prend direct
            selectedTag = matches[0];
        } else {
            // Plusieurs matchs, on demande à l'utilisateur de choisir
            term.cyan(`\n🤔 Plusieurs tours correspondent, choisissez-en un :\n`);
            
            selectedTag = await new Promise((resolve) => {
                term.singleColumnMenu(matches, (error, response) => {
                    // response.selectedText contient le tag choisi
                    resolve(response.selectedText);
                });
            });
        }
    }
    else if (options.tag === true || (!options.tag && process.argv.includes('-t'))) {
        if (!existsSync(tourListPath)) await runScan(configPath, tourListPath);
        const data = JSON.parse(readFileSync(tourListPath, 'utf-8'));
        const allTags = Object.values(data.addons).flat().sort();

        term.cyan('🔍 Choisissez un tour (Tab pour compléter) :\n');
        selectedTag = await new Promise((resolve) => {
            term.singleColumnMenu(matches, (error, response) => {
                // response.selectedText contient le tag choisi
                resolve(response.selectedText);
            });
        });
    } 
    else if (options.rerun) {
        selectedTag = getStoredTag(lastTourFile);
    }
    else {
        return null;
    }

    if (selectedTag) {
        term.green("🔄 SelectedTag is ").cyan(`${selectedTag}\n`);
        storeTag(lastTourFile, selectedTag);
    }

    term.grabInput(false);
    return selectedTag;
}

export const buildOdooCommandArgs = (options) => {
    const command = [];
    if (options.install) command.push("-i", options.install);
    if (options.update) command.push("-u", options.update);
    if (options.demo) command.push("--with-demo");
    if (options.assets) command.push("--assets");
    if (options.tag) {
        term.blue(`Launch ${options.tag}\n`);
        command.push("--test-enable", `--test-tags=${options.tag}`, "--stop-after-init");
    }
    return command;
}