import chalk from 'chalk';
import { writeFileSync } from 'fs';

/** @param {AppContext} ctx */
export function runExportLog(ctx) {
    const filePath = '/tmp/mia-tui-support.log';
    writeFileSync(filePath, ctx.logs.getPlainText(), 'utf8');
    ctx.log(`${chalk.green('✔')} Log esportato in ${chalk.cyan(filePath)}`);
}
