
import termkit from "terminal-kit";
const term = termkit.terminal;

const logLevels = {
    error: 1,
    warn: 2,
    tour: 3,
    werkzeug: 4,
    info: 5,
}

export const createLogHandler = (logLevel = 3) => {
    term.cyan(`Loglevel is ${logLevel}.\n`);
    let buffer = "";

    return (data) => {
        buffer += data.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop(); // garde la ligne incomplète

        for (const line of lines) {
            const message = line.trim();
            if (!message) continue;
            const tourMatch = message.match(/(\[\d+\/\d+\] Tour .*)/);

            let type = 'info';
            if (/ERROR|Traceback/.test(message)) type = 'error';
            else if (/WARNING/.test(message)) type = 'warn';
            else if (tourMatch) type = 'tour';
            else if (/INFO\s+.*werkzeug/.test(message)) {
                type = 'werkzeug';
            }

            if (logLevels[type] <= logLevel) {
                if (type === 'error') term.red(`❌ ${message}\n`);
                else if (type === 'warn') term.yellow(`⚠️ ${message}\n`);
                else if (type === 'tour') {
                    // 👇 on affiche seulement la partie utile
                    term.cyan(`${tourMatch[1]}\n`);
                }
                else if (type === "werkzeug") {
                    term.magenta(`${message}\n`);
                }
                else term.white(`${message}\n`);
            }
        }
    };
};