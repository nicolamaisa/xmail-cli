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
import { fetchStatusPanelState, renderStatusPanelLines } from './lib/status-panel.js';
import { getCommandSplashSuggestions, getCommandSuggestions } from './lib/suggestions.js';
import { refreshDashInputUI, refreshSplashInputUI } from './lib/refresh.js';

let textboxEnterPatchApplied = false;

function patchBlessedTextboxEnter() {
    if (textboxEnterPatchApplied || !blessed.textbox?.prototype) {
        return;
    }

    const prototype = blessed.textbox.prototype;
    const originalListener = prototype._listener;

    prototype._listener = /** @param {string} ch @param {{ name?: string } | undefined} key */ function patchedTextboxListener(ch, key) {
        if (key?.name === 'enter' && typeof this._done !== 'function') {
            this.emit('submit', this.value);
            this.emit('action', this.value);
            return;
        }

        return originalListener.call(this, ch, key);
    };

    textboxEnterPatchApplied = true;
}

patchBlessedTextboxEnter();

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

/** @returns {AppContext} */
function createCommandContext() {
    return {
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
}

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
let commandInputLocked = false;
const prompts = createPromptStore(logs, {
    onOpen() {
        promptMode = true;
        commandInputLocked = true;
        dashboard.dashInput.clearValue();
        dashboard.logArea.focus();
        dashboard.hintDashText.setContent('Prompt attivo: usa Enter, Esc e frecce');
        dashboard.dashInput.style.fg = '#666666';
        refreshDashInputUI(dashUi, colors);
    },
    onClose() {
        promptMode = false;
        commandInputLocked = false;
        dashboard.dashInput.focus();
        dashboard.hintDashText.setContent('Digita un comando... ');
        dashboard.dashInput.style.fg = 'white';
        refreshDashInputUI(dashUi, colors);
    }
});

let statusRefreshInFlight = false;
let lastStatusPanelContent = '';
let statusPulseFrame = 0;
/** @type {Awaited<ReturnType<typeof fetchStatusPanelState>> | null} */
let latestStatusState = null;

function renderStatusPanel() {
    if (!latestStatusState) {
        return;
    }

    const nextContent = renderStatusPanelLines(latestStatusState, statusPulseFrame).join('\n');
    if (nextContent !== lastStatusPanelContent) {
        lastStatusPanelContent = nextContent;
        dashboard.statusPanel.setContent(nextContent);
        screen.render();
    }
}

async function refreshStatusPanelData() {
    if (statusRefreshInFlight) {
        return;
    }

    statusRefreshInFlight = true;

    try {
        latestStatusState = await fetchStatusPanelState();
        renderStatusPanel();
    } finally {
        statusRefreshInFlight = false;
    }
}

/**
 * @param {{ focusInput?: boolean }} [options]
 */
function switchToDashboard(options = {}) {
    const { focusInput = true } = options;
    splash.splashPage.hide();
    dashboard.dashPage.show();
    screen.render();
    layoutDashboard(dashboard, screen);
    if (focusInput && !commandInputLocked) {
        dashboard.dashInput.focus();
    } else {
        dashboard.logArea.focus();
    }
    refreshDashInputUI(dashUi, colors);
    screen.render();
}

/** @param {string} cmd */
function dispatchCommand(cmd) {
    /** @type {CommandHandler | undefined} */
    const handler = commandRegistry[cmd];

    if (handler) {
        return Promise.resolve(handler(createCommandContext())).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            logs.logText(`${chalk.red('✖')} ${message}`);
        });
    } else if (cmd !== '') {
        logs.logText(`${chalk.red('✖')} Comando non riconosciuto: ${cmd}`);
    }

    return Promise.resolve();
}

/** @param {string} value */
function runDashboardCommand(value) {
    if (promptMode || commandInputLocked) {
        return;
    }

    const cmd = value.trim().toLowerCase();
    void dispatchCommand(cmd).finally(() => {
        if (!promptMode && !commandInputLocked) {
            dashboard.dashInput.focus();
        } else {
            dashboard.logArea.focus();
        }
        refreshDashInputUI(dashUi, colors);
        screen.render();
    });

    dashboard.dashInput.clearValue();
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

    if (cmd === '') {
        if (isInstalled) {
            splash.inputSplashBar.clearValue();
            switchToDashboard();
        }
        return;
    }

    if (cmd === '/init') {
        splash.inputSplashBar.clearValue();
        commandInputLocked = true;
        dashboard.hintDashText.setContent('Bootstrap in avvio...');
        dashboard.dashInput.style.fg = '#666666';
        switchToDashboard({ focusInput: false });
        void dispatchCommand('/init').finally(() => {
            if (!promptMode) {
                commandInputLocked = false;
                dashboard.hintDashText.setContent('Digita un comando... ');
                dashboard.dashInput.style.fg = 'white';
                dashboard.dashInput.focus();
                refreshDashInputUI(dashUi, colors);
                screen.render();
            }
        });
        return;
    }

    if (cmd === '/help') {
        splash.inputSplashBar.clearValue();
        switchToDashboard();
        dispatchCommand('/help');
        return;
    }

    splash.inputSplashBar.clearValue();
    splash.inputSplashBar.focus();
    refreshSplashInputUI(splashUi, colors);
    screen.render();
});

splash.inputSplashBar.key(['tab'], () => {
    const value = splash.inputSplashBar.getValue() || '';
    const suggestions = getCommandSplashSuggestions(value);

    if (suggestions.length > 0) {
        splash.inputSplashBar.setValue(suggestions[0].id);
        refreshSplashInputUI(splashUi, colors);
        screen.render();
    }

    return false;
});

dashboard.dashInput.on('submit', runDashboardCommand);

dashboard.dashInput.on('keypress', () => {
    if (promptMode || commandInputLocked) {
        dashboard.dashInput.clearValue();
        dashboard.logArea.focus();
        refreshDashInputUI(dashUi, colors);
        screen.render();
    }
});

dashboard.dashInput.key(['tab'], () => {
    if (promptMode || commandInputLocked) {
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
    if (!promptMode && !commandInputLocked) {
        clearDashboardLog();
    }
});

screen.key(['C-c'], quit);
screen.key(['C-l'], () => {
    if (!promptMode && !commandInputLocked) {
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
        renderStatusPanel();
    } else {
        refreshSplashInputUI(splashUi, colors);
    }
});

logs.logText(
    `${chalk.hex(colors.logo)('▶')} Terminale pronto. Digita ${chalk.cyan('/frontend')} o ${chalk.cyan('/help')}`
);
logs.logText(`${chalk.hex(colors.logo)('▶')} Sistema pronto. ${chalk.dim('Ctrl+C per uscire')}`);
void refreshStatusPanelData();
setInterval(() => {
    statusPulseFrame = (statusPulseFrame + 1) % 2;
    renderStatusPanel();
}, 700);
setInterval(() => {
    void refreshStatusPanelData();
}, 5000);

splash.inputSplashBar.focus();
screen.render();
