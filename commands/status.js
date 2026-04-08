import { runComposeStatus } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runStatus(ctx) {
    await runComposeStatus(ctx);
}
