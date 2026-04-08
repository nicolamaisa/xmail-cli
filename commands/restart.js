import { runLoggedCommand } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runRestart(ctx) {
    await runLoggedCommand(ctx, 'Restart XMail stack', 'docker', ['compose', 'restart'], {
        successFooter: 'Stack restarted'
    });
}
