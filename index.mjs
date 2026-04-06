import blessed from '@pm2/blessed';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { commandRegistry } from './commands/index.js';
import { colors } from './constants/colors.js';
import { createSplash } from './ui/splash.js';
import { createDashboard } from './ui/dashboard.js';
import { layoutDashboard } from './lib/layout.js';
import { createLogStore } from './lib/log-store.js';
import { createPromptStore } from './lib/prompt-store.js';
import { buildStatusPanelLines } from './lib/status-panel.js';
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

const logs = createLogStore(dashboard.logArea, screen);
let promptMode = false;
const prompts = createPromptStore(logs, {
    onOpen() {
        promptMode = true;
        dashboard.dashInput.clearValue();
        dashboard.logArea.focus();
        dashboard.hintDashText.setContent('Prompt attivo: usa Enter, Esc e frecce');
        dashboard.dashInput.style.fg = '#666666';
        refreshDashInputUI(dashUi, colors);
    },
    onClose() {
        promptMode = false;
        dashboard.dashInput.focus();
        dashboard.hintDashText.setContent('Digita un comando... ');
        dashboard.dashInput.style.fg = 'white';
        refreshDashInputUI(dashUi, colors);
    }
});

let statusRefreshInFlight = false;
let lastStatusPanelContent = '';

async function refreshStatusPanel() {
    if (statusRefreshInFlight) {
        return;
    }

    statusRefreshInFlight = true;

    try {
        const nextContent = (await buildStatusPanelLines()).join('\n');
        if (nextContent !== lastStatusPanelContent) {
            lastStatusPanelContent = nextContent;
            dashboard.statusPanel.setContent(nextContent);
            screen.render();
        }
    } finally {
        statusRefreshInFlight = false;
    }
}

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
    if (promptMode) {
        return;
    }

    const cmd = value.trim().toLowerCase();

    /** @type {AppContext} */
    const ctx = {
        screen,
        logArea: dashboard.logArea,
        dashInput: dashboard.dashInput,
        logs,
        prompts,
        state: {},
        /** @param {string} message */
        log: (message) => logs.logText(message),
        quit: () => process.exit(0)
    };

    /** @type {CommandHandler | undefined} */
    const handler = commandRegistry[cmd];

    if (handler) {
        Promise.resolve(handler(ctx)).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            logs.logText(`${chalk.red('✖')} ${message}`);
        });
    } else if (cmd !== '') {
        logs.logText(`${chalk.red('✖')} Comando non riconosciuto: ${cmd}`);
    }

    dashboard.dashInput.clearValue();
    if (!promptMode) {
        dashboard.dashInput.focus();
    }
    refreshDashInputUI(dashUi, colors);
    screen.render();
}

/** @returns {void} */
function clearDashboardLog() {
    logs.clear(chalk.hex(colors.logo)('▶') + ' Console pulita.');
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

dashboard.dashInput.on('keypress', () => {
    if (promptMode) {
        dashboard.dashInput.clearValue();
        dashboard.logArea.focus();
        screen.render();
    }
});

dashboard.dashInput.key(['tab'], () => {
    if (promptMode) {
        return false;
    }

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
dashboard.dashInput.key(['C-l'], () => {
    if (!promptMode) {
        clearDashboardLog();
    }
});

screen.key(['C-c'], quit);
screen.key(['C-l'], () => {
    if (!promptMode) {
        clearDashboardLog();
    }
});
screen.on('keypress', /** @param {string} ch @param {any} key */ (ch, key) => {
    if (!prompts.isActive()) {
        return;
    }

    const handled = prompts.handleKeypress(ch, key);
    if (handled) {
        dashboard.dashInput.clearValue();
        refreshDashInputUI(dashUi, colors);
        screen.render();
    }
});

screen.on('resize', () => {
    if (dashboard.dashPage.visible) {
        layoutDashboard(dashboard, screen);
        refreshDashInputUI(dashUi, colors);
        void refreshStatusPanel();
    } else {
        refreshSplashInputUI(splashUi, colors);
    }
});

logs.logText(
    `${chalk.hex(colors.logo)('▶')} Terminale pronto. Digita ${chalk.cyan('/frontend')} o ${chalk.cyan('/help')}`
);
logs.logText(`${chalk.hex(colors.logo)('▶')} Sistema pronto. ${chalk.dim('Ctrl+C per uscire')}`);
void refreshStatusPanel();
setInterval(() => {
    void refreshStatusPanel();
}, 5000);

splash.inputSplashBar.focus();
screen.render();
