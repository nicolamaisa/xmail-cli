import { runLoggedCommand } from '../lib/xmail-control.js';

/** @param {AppContext} ctx */
export async function runMigrate(ctx) {
    await runLoggedCommand(ctx, 'Run database migrations', 'docker', ['compose', 'run', '--rm', 'x-db-migrate'], {
        successFooter: 'Migrations completed'
    });
}
