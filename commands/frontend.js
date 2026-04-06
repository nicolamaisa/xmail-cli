import chalk from 'chalk';

/** @param {AppContext} ctx */
export function runFrontend(ctx) {
    const processId = ctx.logs.startProcessLog('Frontend build', {
        footer: 'running...'
    });

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, 'npm install');
    }, 200);

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, 'vite build started');
    }, 500);

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, 'transforming modules...');
    }, 900);

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, 'writing output...');
    }, 1300);

    setTimeout(() => {
        ctx.logs.appendProcessLog(processId, chalk.green('build completed'));
        ctx.logs.finishProcessLog(processId, chalk.green('Completed in 1.6s'));
    }, 1600);
}
