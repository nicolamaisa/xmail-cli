import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runTest(ctx) {
    const processId = ctx.logs.startProcessLog('Test suite', {
        footer: 'running...'
    });

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, 'collecting tests...');
    }, 150);

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, 'running mail sync tests...');
    }, 500);

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, 'running command tests...');
    }, 900);

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, chalk.green('12 tests passed'));
        ctx.logs.finishProcessLog(processId, chalk.green('Completed with success'));
    }, 1400);
}
