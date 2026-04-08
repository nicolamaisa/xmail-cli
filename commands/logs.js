import chalk from 'chalk';
import { captureCommand } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runLogs(ctx) {
    const { stdout, stderr } = await captureCommand('docker', ['compose', 'logs', '--tail=100']);

    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold('Recent Compose Logs')}`);
    for (const line of stdout.split('\n').filter(Boolean)) {
        ctx.log(`${chalk.magenta('│')} ${line}`);
    }
    for (const line of stderr.split('\n').filter(Boolean)) {
        ctx.log(`${chalk.magenta('│')} ${chalk.red(line)}`);
    }
    ctx.log(`${chalk.magenta('└──')} ${chalk.dim('End logs')}`);
}
