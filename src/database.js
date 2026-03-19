import { spawn } from "child_process";
import termkit from "terminal-kit";
import { spawnOdoo } from "./server.js";
import { buildOdooCommandArgs, getConfigPath } from "./utils.js";
const term = termkit.terminal;

export const cloneDatabase = (source, target) => {
    return new Promise((resolve, reject) => {
        const proc = spawn("createdb", ["-T", source, target]);
        proc.on("close", (code) => code === 0 ? resolve() : reject(`Failed to clone ${source}`));
    });
};

export const dropDatabase = (dbName) => {
    return new Promise((resolve) => {
        const proc = spawn("dropdb", ["-f", dbName]);
        proc.on("close", () => resolve());
    });
};

export const isAddonInstalled = (dbName, addonName) => {
    return new Promise((resolve) => {
        const query = `SELECT state FROM ir_module_module WHERE name = '${addonName}';`;
        const proc = spawn("psql", ["-d", dbName, "-t", "-c", query]);
        proc.stdout.on("data", (data) => resolve(data.toString().trim() === 'installed'));
        proc.on("close", (code) => { if (code !== 0) resolve(false); });
    });
};

export const installAddon = async (dbName, addonName, options) => {
    const isInstalled = await isAddonInstalled(dbName, addonName);
    if (!isInstalled) {
        term.yellow(`📦 Installation de "${addonName}"...\n`);
        const configPath = getConfigPath(options);
        const command = buildOdooCommandArgs({
            install: options.install,
        });
        await spawnOdoo(command, options.log);
    } else {
        term.green(`Addon ${addonName} is already installed.\n`);
    }
}