#!/usr/bin/env node

/**
 * Le "Shebang" ci-dessus est crucial pour un module npm. 
 * Il indique au système d'exécuter ce fichier avec Node.js.
 */

import { program } from "commander";
import { main } from "../src/core.js"; // On déplace la logique main dans src/core.js

/**
 * Configuration de Commander
 * On définit ici les options pour que le module soit autonome.
 */
program
  .name('odoo-launch')
  .version('1.0.0')
  .description('CLI pour piloter les tours Odoo avec autocomplétion 🚀')
  .option('-t, --tag [tag]', 'Tag du test (laisse vide pour l\'autocomplétion)')
  .option('-n, --ntimes <ntimes>', 'Nombre de répétitions', '1')
  .option('-d, --database <database>', 'Base de données', 'mydb')
  .option('-l, --log <log>', 'Niveau de log (1 ou 2)', '1')
  .option('-a, --assets', 'Régénérer les assets', false)
  .option('-u, --update <update>', 'Module à mettre à jour')
  .option('-i, --install [install]', 'Module à installer')
  .option('-x, --demo', 'Avec données de démo', false)
  .option('-s, --scan', 'Scanner les dossiers pour générer les tags')
  .option('-R, --rerun', 'Relancer le dernier test enregistré')
  .option('-c, --config <path>', 'Chemin vers odoo.conf', './odoo.conf');

program.parse(process.argv);

const options = program.opts();

// On passe les options à notre fonction principale
// On utilise process.cwd() pour que le CLI travaille dans le dossier de l'utilisateur
main(options).catch(err => {
    console.error(`\n💥 Erreur critique : ${err.message}`);
    console.error(err);
    process.exit(1);
});