import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runTest(ctx) {
    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold('Test Task')}`);
    ctx.log(`${chalk.magenta('│')} ${chalk.yellow('↻')} Esecuzione in corso...`);

    setTimeout(() => {
        ctx.log(`${chalk.magenta('└──')} ${chalk.green('✔')} Test completato!`);
        ctx.screen.render();
    }, 1500);
}
