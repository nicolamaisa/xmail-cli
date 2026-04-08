import { runLoggedCommand } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runDown(ctx) {
    await runLoggedCommand(ctx, 'Compose down', 'docker', ['compose', 'down'], {
        successFooter: 'Stack removed'
    });
}
