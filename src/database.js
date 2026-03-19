import path from "path";
import { spawn } from "child_process";
import termkit from "terminal-kit";
import { spawnOdoo } from "./server.js";
import { buildOdooCommandArgs, getConfigPath } from "./utils.js";
import { existsSync, mkdirSync, rmSync } from "fs";
const term = termkit.terminal;

/**
 * Clone une base Odoo et son filestore
 * @param {string} sourceDb - Nom de la DB source
 * @param {string} targetDb - Nom de la DB cible
 * @param {string} filestoreBaseDir - Chemin du répertoire filestore (ex: ~/.local/share/Odoo/filestore)
 */
export const cloneDatabase = async (sourceDb, targetDb, filestoreBaseDir = "/home/odoo/.local/share/Odoo/filestore" ) => {
    if (!sourceDb || !targetDb || !filestoreBaseDir) {
        throw new Error("sourceDb, targetDb et filestoreBaseDir sont requis");
    }

    // 1️⃣ Cloner la base
    await new Promise((resolve, reject) => {
        console.log(`🔄 Clonage de la DB ${sourceDb} vers ${targetDb}...`);
        const proc = spawn("createdb", ["-T", sourceDb, targetDb]);

        let stderr = "";
        proc.stderr.on("data", (data) => { stderr += data.toString(); });

        proc.on("close", (code) => {
            if (code === 0) {
                console.log(`✅ DB ${targetDb} clonée avec succès`);
                resolve();
            } else {
                console.error(`❌ Échec du clonage de ${targetDb}: ${stderr}`);
                reject(new Error(`Failed to clone database ${sourceDb} to ${targetDb}`));
            }
        });

        proc.on("error", (err) => reject(err));
    });

    // 2️⃣ Copier le filestore
    const sourceFilestore = path.join(filestoreBaseDir, sourceDb);
    const targetFilestore = path.join(filestoreBaseDir, targetDb);

    if (!existsSync(sourceFilestore)) {
        console.warn(`⚠️ Filestore source introuvable: ${sourceFilestore}, le clone ne contiendra pas de fichiers`);
        return;
    }

    // Crée le répertoire cible s’il n’existe pas
    mkdirSync(targetFilestore, { recursive: true });

    await new Promise((resolve, reject) => {
        const proc = spawn("rsync", ["-a", "--info=progress2", sourceFilestore + "/", targetFilestore]);

        proc.stdout.on("data", data => console.log(data.toString()));
        proc.stderr.on("data", data => console.error(data.toString()));

        proc.on("close", code => code === 0 ? resolve() : reject(new Error("rsync failed")));
    });
};

export const dropDatabase = (dbName) => {
    return new Promise((resolve) => {
        const proc = spawn("dropdb", ["-f", dbName]);
        proc.on("close", () => resolve());
    });
};

// Fonction pour supprimer le filestore
export const removeFilestore = (dbName, filestoreBaseDir = "/home/odoo/.local/share/Odoo/filestore" ) => {
    const targetFilestore = path.join(filestoreBaseDir, dbName);
    if (existsSync(targetFilestore)) {
        console.log(`🔄 Suppression du filestore ${targetFilestore}...`);
        rmSync(targetFilestore, { recursive: true, force: true });
        console.log(`✅ Filestore supprimé`);
    } else {
        console.log(`⚠️ Filestore introuvable : ${targetFilestore}`);
    }
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
        const configPath = await getConfigPath(options);
        const args = buildOdooCommandArgs({
            install: addonName,
        });
        args.push(`--config=${configPath}`);
        const command = ["odoo-bin", "-d", dbName, ...args, "--stop-after-init"];
        await spawnOdoo(command, options.log);
    } else {
        term.green(`Addon ${addonName} is already installed.\n`);
    }
}