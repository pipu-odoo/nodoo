import { createLogHandler } from "./logs.js";

import { spawn } from "child_process";

export const spawnOdooDocker = (dbName, port, options) => {
    return new Promise((resolve, reject) => {
        
        console.log("Spawn docker");
        const network = `odoo_net_${Date.now()}`;
        const pgContainer = `pg_${dbName}`;
        const odooContainer = `odoo_${dbName}`;

        const handleData = createLogHandler(options.log);

        // 1️⃣ créer réseau
        const net = spawn("docker", ["network", "create", network]);

        net.on("close", () => {

            // 2️⃣ lancer postgres
            const pg = spawn("docker", [
                "run", "-d",
                "--rm",
                "--name", pgContainer,
                "--network", network,
                "-e", "POSTGRES_DB=postgres",
                "-e", "POSTGRES_USER=odoo",
                "-e", "POSTGRES_PASSWORD=odoo",
                "postgres:15"
            ]);

            pg.on("close", () => {

                // 3️⃣ lancer odoo
                const odoo = spawn("docker", [
                    "run", "--rm",
                    "--name", odooContainer,
                    "--network", network,
                    "-p", `${port}:8069`,
                    "-e", "HOST=" + pgContainer,
                    "-e", "USER=odoo",
                    "-e", "PASSWORD=odoo",
                    "odoo"
                ]);

                odoo.stdout.on("data", handleData);
                odoo.stderr.on("data", handleData);

                odoo.on("close", (code) => {
                    // cleanup réseau (pg déjà rm grâce à --rm)
                    spawn("docker", ["network", "rm", network]);

                    resolve({
                        status: code === 0 ? "success" : "failed",
                        exitCode: code
                    });
                });

                odoo.on("error", reject);
            });
        });
    });
};