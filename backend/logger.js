const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logFile = path.join(__dirname, 'server.log');
    }

    log(message, type = 'INFO') {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${type}] ${message}\n`;

        console.log(formattedMessage.trim());

        fs.appendFile(this.logFile, formattedMessage, (err) => {
            if (err) console.error('Failed to write to log file:', err);
        });
    }

    info(msg) { this.log(msg, 'INFO'); }
    error(msg) { this.log(msg, 'ERROR'); }
    warn(msg) { this.log(msg, 'WARN'); }
}

module.exports = new Logger();
