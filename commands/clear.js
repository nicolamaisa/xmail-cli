import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runClear(ctx) {
    ctx.logs.clear(chalk.dim('Console pulita.'));
}
