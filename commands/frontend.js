import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runFrontend(ctx) {
    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold('Task Frontend')}`);
    ctx.log(`${chalk.magenta('│')} ${chalk.yellow('↻')} Compilazione in corso...`);

    setTimeout(() => {
        ctx.log(`${chalk.magenta('└──')} ${chalk.green('✔')} Completato!`);
        ctx.screen.render();
    }, 1500);
}
