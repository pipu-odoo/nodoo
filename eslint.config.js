// eslint.config.js
import { fileURLToPath } from "url";
import path from "path";

export default {
    root: true,
    env: {
        node: true,       // ✅ active les variables globales Node : process, __dirname, etc.
        es2021: true,     // ✅ ES12
    },
    parserOptions: {
        ecmaVersion: 12,    // ES2021
        sourceType: "module", // support import/export
    },
    extends: ["eslint:recommended"], // règles de base recommandées
    rules: {
        "no-undef": "error",  // variables non définies
        "no-use-before-define": ["error", { 
            functions: true, 
            classes: true, 
            variables: true 
        }],
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], // variables inutilisées
        "no-console": "off", // autorise console.log
        "eqeqeq": ["error", "always"], // toujours utiliser ===
        "curly": ["error", "all"],     // toujours utiliser les accolades
    },
    globals: {
        __dirname: "readonly",
        __filename: "readonly",
    }
};