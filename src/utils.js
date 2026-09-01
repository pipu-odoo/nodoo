import path from "path";
import net from "net";
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

export const PORT_RANGE_START = 8069;
export const PORT_RANGE_END = 8169;

const isPortFree = (port) => new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, "127.0.0.1");
});

/**
 * Trouve le premier port libre à partir de `preferredPort`, dans la plage
 * [PORT_RANGE_START, PORT_RANGE_END], pour éviter de tenter de lancer Odoo
 * sur un port déjà occupé par une autre instance.
 * @param {number} preferredPort
 * @returns {Promise<number>}
 */
export const findFreePort = async (preferredPort = PORT_RANGE_START) => {
    const start = Math.max(preferredPort, PORT_RANGE_START);
    for (let port = start; port <= PORT_RANGE_END; port++) {
        if (await isPortFree(port)) {
            return port;
        }
    }
    throw new Error(`Aucun port libre trouvé entre ${PORT_RANGE_START} et ${PORT_RANGE_END}`);
};

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

        const methods = new Map(); // key = Class.method
        let currentClass = "";
        let currentMethod = "";
        let currentIndent = 0;
        let classIndent = 0;
        let buffer = "";

        const getIndent = (line) => line.match(/^(\s*)/)[1].length;

        eachLine(testPathFile, (line, last) => {
            const trimmed = line.trim();
            const indent = getIndent(line);

            // ========================
            // Detect class
            // ========================
            if (/^class\s+/.test(trimmed)) {
                // ✅ flush méthode précédente
                if (currentMethod) {
                    const key = `${currentClass}.${currentMethod}`;
                    methods.set(key, {
                        className: currentClass,
                        methodName: currentMethod,
                        content: buffer
                    });
                    currentMethod = "";
                    buffer = "";
                }

                currentClass = trimmed.match(/class\s+(\w+)/)?.[1] || "";
                classIndent = indent;
            }

            // ========================
            // Detect class methods
            // ========================
            else if (
                currentClass &&
                /^def\s+/.test(trimmed) &&
                indent === classIndent + 4 // ✅ fiable
            ) {
                // save previous method
                if (currentMethod) {
                    const key = `${currentClass}.${currentMethod}`;
                    methods.set(key, {
                        className: currentClass,
                        methodName: currentMethod,
                        content: buffer
                    });
                }

                currentMethod = trimmed.match(/def\s+(\w+)\s*\(/)?.[1] || "";
                currentIndent = indent;
                buffer = "";
            }

            // ========================
            // Accumulate method content
            // ========================
            if (currentMethod) {
                buffer += line + "\n";
            }

            // ========================
            // End of file
            // ========================
            if (last && currentMethod) {
                const key = `${currentClass}.${currentMethod}`;
                methods.set(key, {
                    className: currentClass,
                    methodName: currentMethod,
                    content: buffer
                });
            }

            // ========================
            // Final processing
            // ========================
            if (last) {
                const result = new Set();

                const callsTour = (methodKey, visited = new Set()) => {
                    if (visited.has(methodKey)) return false;
                    visited.add(methodKey);

                    const methodData = methods.get(methodKey);
                    if (!methodData) return false;

                    const content = methodData.content;

                    // ✅ detect direct tour call
                    if (/(self\.)?start_(pos_)?tour\s*\(/i.test(content)) {
                        return true;
                    }

                    // 🔁 detect internal calls
                    const calledMethods = [...content.matchAll(/self\.(\w+)\s*\(/g)]
                        .map(m => `${methodData.className}.${m[1]}`);

                    return calledMethods.some(m => callsTour(m, visited));
                };

                for (const key of methods.keys()) {
                    if (callsTour(key)) {
                        result.add(key);
                    }
                }

                resolve(result);
            }
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
        const exactMatch = tagsWithHistory.find(t =>
            t.toLowerCase() === options.tag.toLowerCase()
        );
        const matches = tagsWithHistory.filter(t =>
            t.toLowerCase().includes(options.tag.toLowerCase())
        );

        if (exactMatch) {
            selectedTag = exactMatch;
        } else if (matches.length === 1) {
            selectedTag = matches[0];
        } else if (matches.length > 1) {
            term.cyan(`\n🤔 Plusieurs tours correspondent, choisissez-en un :\n`);
            selectedTag = await promptAutocomplete(matches);
        } else {
            selectedTag = options.tag;
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
    if (options.tag) {
        term.blue(`Launch ${options.tag}\n`);
        command.push("--test-enable", `--test-tags=${options.tag}`, "--stop-after-init");
    }
    return command;
}