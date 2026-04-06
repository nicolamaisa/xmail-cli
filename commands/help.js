import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runHelp(ctx) {
    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold('Comandi Disponibili')}`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/frontend')} - Avvia il task di compilazione frontend`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/clear')} - Pulisce la console`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/exit')} o ${chalk.cyan('/quit')} - Esci dall'applicazione`);
    ctx.log(`${chalk.magenta('└──')} ${chalk.dim('E altri comandi in arrivo...')}`);
}
