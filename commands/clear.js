import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runClear(ctx) {
    ctx.logArea.setContent('');
    ctx.logArea.log(chalk.dim('Console pulita.'));
}
