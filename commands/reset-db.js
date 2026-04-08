import { resetDbData } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runResetDb(ctx) {
    await resetDbData(ctx);
}
