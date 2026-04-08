import { runLoggedCommand } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runStop(ctx) {
    await runLoggedCommand(ctx, 'Stop XMail containers', 'docker', ['compose', 'stop'], {
        successFooter: 'Containers stopped'
    });
}
