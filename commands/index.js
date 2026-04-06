import { runHelp } from './help.js';
import { runClear } from './clear.js';
import { runTest } from './test.js';
import { runFrontend } from './frontend.js';
import { runExit } from './exit.js';

/** @type {Record<string, CommandHandler>} */
export const commandRegistry = {
    '/help': runHelp,
    '/clear': runClear,
    '/test': runTest,
    '/frontend': runFrontend,
    '/exit': runExit,
    '/quit': runExit,
};
