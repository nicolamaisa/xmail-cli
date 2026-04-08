import { bootstrapXmailStack } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runStart(ctx) {
    await bootstrapXmailStack(ctx, {
        resetDb: false,
        runMigrations: true,
        devMode: false,
        showStatusAfter: true
    });
}
