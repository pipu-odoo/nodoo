import { spawn } from "child_process";

/**
 * Crée et lance un container Odoo avec DB intégrée
 * @param {Object} options
 * @param {string} options.containerName - Nom du container
 * @param {number} [options.port=8069] - Port HTTP à exposer
 * @param {string} [options.dbName="mydb"] - Nom de la DB Odoo à créer dans le container
 * @param {string} [options.filestoreVolume] - Nom du volume Docker pour le filestore (si non fourni, généré à partir du nom du container)
 * @returns {Promise<void>}
 */
export const createOdooContainer = ({
    containerName,
    port = 8069,
    dbName = "mydb",
    filestoreVolume,
}) => {
    return new Promise((resolve, reject) => {
        if (!containerName) return reject(new Error("containerName est requis"));

        const volumeName = filestoreVolume || `${containerName}_filestore`;

        const args = [
            "run", "-d",
            "--name", containerName,
            "-p", `${port}:8069`,
            "-e", `ODOO_DB=${dbName}`,           // DB Odoo à créer
            "-e", "POSTGRES_USER=odoo",         // utilisateur interne PostgreSQL dans l'image
            "-e", "POSTGRES_PASSWORD=odoo",     // mot de passe pour PostgreSQL interne
            "-v", `${volumeName}:/var/lib/odoo/filestore`,
            "ghcr.io/odoo/odoo:16.0",           // image officielle Odoo avec PostgreSQL intégré
        ];

        console.log(`🔄 Création du container ${containerName} sur le port ${port}...`);

        const proc = spawn("docker", args);

        let stderr = "";
        proc.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        proc.on("close", (code) => {
            if (code === 0) {
                console.log(`✅ Container ${containerName} lancé avec succès`);
                console.log(`📁 Filestore Docker volume : ${volumeName}`);
                resolve();
            } else {
                console.error(`❌ Erreur lors de la création du container : ${stderr}`);
                reject(new Error(`Failed to create container ${containerName}`));
            }
        });

        proc.on("error", (err) => reject(err));
    });
};