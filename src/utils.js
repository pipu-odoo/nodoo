import path from "path";
import { writeFileSync, readFileSync, existsSync, statSync, accessSync, mkdirSync, copyFileSync } from 'fs';
import { globSync } from "glob";
import ini from 'ini';
import { eachLine } from 'line-reader';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import termkit from "terminal-kit";
const term = termkit.terminal;

export const cacheDir = path.join(__dirname, '.odoo_launch_cache');
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
export const searchPythonTest = async (options) => {
    const test = options.tag;
    if (!test) {
        return;
    }
    if (!existsSync(tourListPath)) {
        const configPath = await getConfigPath({ config: options.config });
        await runScan(configPath);
    }

    const data = JSON.parse(readFileSync(tourListPath, 'utf-8'));
    const matches = [];
    const searchTerm = test.toLowerCase();

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

export const getConfigPath = async ({ config = "odoo.conf" } = {}) => {
    const workingDir = process.cwd();
    const configPath = path.resolve(workingDir, config);

    try {
        accessSync(configPath);
    } catch {
        term.red(`Le fichier ${configPath} n'existe pas.\n`);

        const create = await new Promise((resolve) => {
            term.green("Voulez-vous le créer ? (y/n) ");
            term.yesOrNo({ yes: ["y", "ENTER"], no: ["n"] }, (error, result) => {
                resolve(result);
            });
        });

        if (create) {
            const templatePath = path.resolve(__dirname, "assets", "odoo.conf.template");
            await mkdirSync(path.dirname(configPath), { recursive: true });
            await copyFileSync(templatePath, configPath);
            term.green(`\nFichier ${config} créé !\n`);
        } else {
            throw new Error("Fichier de configuration requis.");
        }
    }

    return configPath;
};

const getToursFromFile = async (testPathFile) => {
    return new Promise((resolve) => {
        if (!existsSync(testPathFile) || statSync(testPathFile).size === 0) {
            return resolve(new Set());
        }

        const tests = new Set();
        let currentClass = "";
        let currentMethod = "";
        let methodIndent = 0;
        let buffer = "";

        eachLine(testPathFile, (line, last) => {
            const trimmed = line.trim();
            const indent = line.match(/^(\s*)/)?.[1].length || 0;

            // Detect class
            if (/^class\s+/.test(trimmed)) {
                currentClass = trimmed.match(/class\s+(\w+)/)?.[1] || "";
                currentMethod = "";
                buffer = "";
            }

            // Detect ONLY top-level methods inside class
            else if (currentClass && /^def\s+/.test(trimmed)) {
                // 👉 IMPORTANT: only accept if not nested
                if (!currentMethod || indent <= methodIndent) {
                    currentMethod = trimmed.match(/def\s+(\w+)\s*\(/)?.[1] || "";
                    methodIndent = indent;
                    buffer = "";
                }
            }

            // Accumulate only if we're inside a real method
            if (currentClass && currentMethod) {
                buffer += line + "\n";

                if (/start_(pos_)?tour\s*\(/.test(buffer)) {
                    tests.add(`${currentClass}.${currentMethod}`);
                    buffer = "";
                }

                if (buffer.length > 3000) buffer = "";
            }

            if (last) resolve(tests);
        });
    });
};

export const getSelectedTag = async (options) => {
    let selectedTag = null;

    // Lecture de tous les tags
    if (!existsSync(tourListPath)) {
        term.red("❌ Aucun tour indexé, lancez d'abord un scan.\n");
        return null;
    }

    const data = JSON.parse(readFileSync(tourListPath, "utf-8"));
    const allTags = Object.values(data.addons).flat().sort();

    if (allTags.length === 0) {
        term.red("❌ Aucun tour disponible.\n");
        return null;
    }

    // On récupère le dernier test utilisé
    const lastTag = getStoredTag(lastTourFile);
    const tagsWithHistory = lastTag ? [lastTag, ...allTags.filter(t => t !== lastTag)] : allTags;

    // Cas où un tag précis est fourni
    if (typeof options.tag === "string" && options.tag.length > 0) {
        const matches = tagsWithHistory.filter(t =>
            t.toLowerCase().includes(options.tag.toLowerCase())
        );

        if (matches.length === 0) {
            term.red(`\n❌ Aucun tour ne correspond à "${options.tag}"\n`);
            return null;
        } else if (matches.length === 1) {
            selectedTag = matches[0];
        } else {
            term.cyan(`\n🤔 Plusieurs tours correspondent, choisissez-en un :\n`);
            selectedTag = await promptAutocomplete(matches);
        }
    }
    // Cas autocomplete interactif
    else if (options.tag === true || process.argv.includes("-t")) {
        term.cyan("🔍 Rechercher un tour :\n");
        selectedTag = await promptAutocomplete(tagsWithHistory);
    }
    // Cas rerun du dernier tour
    else if (options.rerun) {
        selectedTag = lastTag;
    }

    // Stockage et affichage
    if (selectedTag) {
        term.green("🔄 SelectedTag is ").cyan(`${selectedTag}\n`);
        storeTag(lastTourFile, selectedTag);
    }

    term.grabInput(false);
    return selectedTag;
};

// --- Fonction utilitaire pour l'autocomplete fuzzy ---
const promptAutocomplete = (tags) => {
    return new Promise((resolve) => {
        term.on('key', (name, matches, data) => {
            if (name === 'CTRL_C') {
                term.red("\n❌ Interrompu par l'utilisateur\n");
                process.exit();
            }
        });
        term.inputField(
            {
                autoComplete: (input) => {
                    const matches = tags.filter(tag =>
                        tag.toLowerCase().includes(input.toLowerCase())
                    );
                    return matches.length > 0 ? matches : ["(aucune correspondance)"];
                },
                autoCompleteMenu: true,
                autoCompleteHint: true,
                minLength: 1,
            },
            (error, input) => {
                if (error) {
                    term.red("\n❌ Erreur de saisie\n");
                    return resolve(null);
                }
                if (input === "(aucune correspondance)") return resolve(null);
                resolve(input);
            }
        );
    });
};

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