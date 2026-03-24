import { spawn } from "child_process";
import { createLogHandler } from "./logs.js";
import { buildOdooCommandArgs } from "./utils.js";
import termkit from "terminal-kit";
const term = termkit.terminal;

const children = new Set(); // Tous les process Odoo actifs

export const spawnOdoo = async (command, logLevel) => {
    return new Promise((resolve, reject) => {
        const proc = spawn("python3", command, { 
            cwd: "/home/odoo/src/odoo",
            detached: true,
            stdio: ['pipe', 'pipe', 'pipe'] // on capte stdout/stderr
        });
        children.add(proc);

        const handleData = createLogHandler(logLevel);
        proc.stdout.on("data", handleData);
        proc.stderr.on("data", handleData);

        proc.on("close", (code) => {
            children.delete(proc);
            resolve({ status: code === 0 ? "success" : "failed", exitCode: code });
        });
        proc.on("error", (err) => {
            children.delete(proc);
            reject(err);
        });
    });
};

// SIGINT global → kill tous les process group
process.once("SIGINT", () => {
    term.red("\nInterruption reçue, fermeture des instances Odoo...\n");
    for (const child of children) {
        try {
            process.kill(-child.pid, "SIGINT"); // <- note le '-'
        } catch (e) {
            // ignore si déjà mort
        }
    }
    // fallback bourrin si ça résiste
    setTimeout(() => {
        for (const child of children) {
        try {
            process.kill(-child.pid, "SIGKILL");
        } catch {}
        }
        process.exit(1);
    }, 1000);
});

// Fonction principale pour lancer Odoo
export const startOdoo = async (dbName, configPath, options) => {
    const port = 8069
    const args = buildOdooCommandArgs(options);
    args.push(`--config=${configPath}`);
    const command = ["odoo-bin", "-d", dbName, "--http-port", String(port), ...args];

    term.white(`Lancement sur port ${port}...\n`);
    return spawnOdoo(command, options.log);
};