import blessed from '@pm2/blessed';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { commandRegistry } from './commands/index.js';
import { colors } from './constants/colors.js';
import { createSplash } from './ui/splash.js';
import { createDashboard } from './ui/dashboard.js';
import { layoutDashboard } from './lib/layout.js';
import { getCommandSuggestions } from './lib/suggestions.js';
import { refreshDashInputUI, refreshSplashInputUI } from './lib/refresh.js';

/** @returns {boolean} */
function checkProjectStatus() {
    try {
        const stdout = execSync('docker ps --filter "name=x-" --format "{{.Names}}"').toString();
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

const isInstalled = checkProjectStatus();

const screen = blessed.screen({
    smartCSR: true,
    title: 'X-MAIL CONTROL CLI',
    fullUnicode: true,
    ignoreLocked: ['C-x', 'C-l', 'C-c', 'escape'],
    cursor: {
        artificial: true,
        shape: 'block',
        blink: true,
        color: 'cyan'
    }
});

const splash = createSplash(screen, colors, isInstalled);
const dashboard = createDashboard(screen, colors);

const splashUi = {
    ...splash,
    screen
};

const dashUi = {
    ...dashboard,
    screen
};

function switchToDashboard() {
    splash.splashPage.hide();
    dashboard.dashPage.show();
    screen.render();
    layoutDashboard(dashboard, screen);
    dashboard.dashInput.focus();
    refreshDashInputUI(dashUi, colors);
    screen.render();
}

/** @param {string} value */
function runDashboardCommand(value) {
    const cmd = value.trim().toLowerCase();

    /** @type {AppContext} */
    const ctx = {
        screen,
        logArea: dashboard.logArea,
        dashInput: dashboard.dashInput,
        state: {},
        /** @param {string} message */
        log: (message) => dashboard.logArea.log(message),
        quit: () => process.exit(0)
    };

    /** @type {CommandHandler | undefined} */
    const handler = commandRegistry[cmd];

    if (handler) {
        handler(ctx);
    } else if (cmd !== '') {
        dashboard.logArea.log(`${chalk.red('✖')} Comando non riconosciuto: ${cmd}`);
    }

    dashboard.dashInput.clearValue();
    dashboard.dashInput.focus();
    refreshDashInputUI(dashUi, colors);
    screen.render();
}

/** @returns {void} */
function clearDashboardLog() {
    dashboard.logArea.setContent(`${chalk.hex(colors.logo)('▶')} Console pulita.`);
    screen.render();
}

/** @param {any} widget @param {() => void} refresh */
function bindRefreshOnInput(widget, refresh) {
    widget.on('focus', refresh);
    widget.on('blur', refresh);
    widget.on('keypress', () => {
        setImmediate(refresh);
    });
}

refreshSplashInputUI(splashUi, colors);
refreshDashInputUI(dashUi, colors);

bindRefreshOnInput(splash.inputSplashBar, () => refreshSplashInputUI(splashUi, colors));
bindRefreshOnInput(dashboard.dashInput, () => refreshDashInputUI(dashUi, colors));

splash.inputSplashBar.on('submit', /** @param {string} value */ (value) => {
    const cmd = value.trim().toLowerCase();

    if (cmd === '/exit') {
        process.exit(0);
    }

    if (cmd === '/init' || (cmd === '' && isInstalled)) {
        splash.inputSplashBar.clearValue();
        switchToDashboard();
        return;
    }

    splash.inputSplashBar.clearValue();
    splash.inputSplashBar.focus();
    refreshSplashInputUI(splashUi, colors);
    screen.render();
});

dashboard.dashInput.on('submit', runDashboardCommand);

dashboard.dashInput.key(['tab'], () => {
    const value = dashboard.dashInput.getValue() || '';
    const suggestions = getCommandSuggestions(value);

    if (suggestions.length > 0) {
        dashboard.dashInput.setValue(suggestions[0].id);
        refreshDashInputUI(dashUi, colors);
        screen.render();
    }

    return false;
});

/** @returns {never} */
const quit = () => process.exit(0);

dashboard.dashInput.key(['C-c'], quit);
dashboard.dashInput.key(['C-l'], clearDashboardLog);

screen.key(['C-c'], quit);
screen.key(['C-l'], clearDashboardLog);

screen.on('resize', () => {
    if (dashboard.dashPage.visible) {
        layoutDashboard(dashboard, screen);
        refreshDashInputUI(dashUi, colors);
    } else {
        refreshSplashInputUI(splashUi, colors);
    }
});

dashboard.logArea.log(
    `${chalk.hex(colors.logo)('▶')} Terminale pronto. Digita ${chalk.cyan('/frontend')} o ${chalk.cyan('/help')}`
);
dashboard.logArea.log(`${chalk.hex(colors.logo)('▶')} Sistema pronto. ${chalk.dim('Ctrl+C per uscire')}`);

splash.inputSplashBar.focus();
screen.render();
