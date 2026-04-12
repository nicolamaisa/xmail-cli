import { runHelp } from './help.js';
import { runClear } from './clear.js';
import { runTest } from './test.js';
import { runFrontend } from './frontend.js';
import { runExit } from './exit.js';
import { runWizard } from './wizard.js';
import { runExportLog } from './export-log.js';
import { runLogin } from './login.js';
import { runInit } from './init.js';
import { runStart } from './start.js';
import { runStop } from './stop.js';
import { runDown } from './down.js';
import { runRestart } from './restart.js';
import { runMigrate } from './migrate.js';
import { runStatus } from './status.js';
import { runLogs } from './logs.js';
import { runResetDb } from './reset-db.js';
import { runLogout } from './logout.js';
import { runDownload } from './download.js';
import { runUpdate } from './update.js';

/** @type {Record<string, CommandHandler>} */
export const commandRegistry = {
    '/init': runInit,
    '/help': runHelp,
    '/clear': runClear,
    '/test': runTest,
    '/frontend': runFrontend,
    '/start': runStart,
    '/stop': runStop,
    '/down': runDown,
    '/restart': runRestart,
    '/migrate': runMigrate,
    '/status': runStatus,
    '/logs': runLogs,
    '/download': runDownload,
    '/update': runUpdate,
    '/reset-db': runResetDb,
    '/wizard': runWizard,
    '/export-log': runExportLog,
    '/login': runLogin,
    '/exit': runExit,
    '/quit': runExit,
    '/logout': runLogout
};
