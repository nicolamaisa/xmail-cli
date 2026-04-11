import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runHelp(ctx) {
    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold('Comandi Disponibili')}`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/init')} - Onboarding e bootstrap completo di XMail`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/start')} - Avvia la stack XMail`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/stop')} - Ferma i container attivi`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/down')} - Esegue docker compose down`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/restart')} - Riavvia i container`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/migrate')} - Esegue le migrazioni DB`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/status')} - Mostra docker compose ps`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/logs')} - Mostra gli ultimi log compose`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/logs x-license')} - Mostra gli ultimi log di un container specifico`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/reset-db')} - Reset dei dati PostgreSQL locali`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/frontend')} - Avvia il task di compilazione frontend`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/wizard')} - Avvia la configurazione iniziale guidata`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/login api')} - Esegue il login verso l'API XMail e salva il token in memoria`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/logout api')} - Esegue il logout dall'API XMail e rimuove il token dalla memoria`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/export-log')} - Salva il log per supporto/debug`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/clear')} - Pulisce la console`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/exit')} o ${chalk.cyan('/quit')} - Esci dall'applicazione`);
    ctx.log(`${chalk.magenta('└──')} ${chalk.dim('E altri comandi in arrivo...')}`);
}
