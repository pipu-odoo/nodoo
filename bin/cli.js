#!/usr/bin/env node

import { program } from "commander";
import { main, clean } from "../src/core.js";

program
  .name('odoo-launch')
  .version('1.0.0')
  .description('CLI pour piloter les tours Odoo avec autocomplétion 🚀');

// Commande CLEAN
program
  .command('clean <database>')
  .description('Supprime la DB et son filestore')
  .action(async (database) => {
      try {
          await clean(database);
          console.log(`🎉 Base et filestore ${database} nettoyés !`);
          process.exit(0); // on s’assure que rien d’autre ne se lance
      } catch (err) {
          console.error(`❌ Erreur lors du nettoyage : ${err.message}`);
          process.exit(1);
      }
  });

// Commande RUN (workflow principal)
program
  .command('run')
  .description('Lance Odoo avec les options')
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
  .option('-c, --config <path>', 'Chemin vers odoo.conf', './odoo.conf')
  .action(async (options) => {
      try {
          await main(options);
      } catch (err) {
          console.error(`\n💥 Erreur critique : ${err.message}`);
          console.error(err);
          process.exit(1);
      }
  });

// Si l’utilisateur ne fournit aucune commande, afficher l’aide
if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(0);
}

program.parse(process.argv);