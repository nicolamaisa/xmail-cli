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

/** @param {any} widget */
function stopTextboxInput(widget) {
    if (typeof widget?._done === 'function') {
        widget._done('stop');
    }
}

const prompts = createPromptStore(logs, {
    onOpen() {
        promptMode = true;
        commandInputLocked = true;
        stopTextboxInput(dashboard.dashInput);
        dashboard.dashInput.clearValue();
        dashboard.dashInput.blur();
        dashboard.logArea.focus();
        dashboard.hintDashText.setContent('Prompt attivo: usa Enter, Esc e frecce');
        dashboard.dashInput.style.fg = '#666666';
        refreshDashInputUI(dashUi, colors);
    },
    onClose() {
        promptMode = false;
        commandInputLocked = false;
        dashboard.hintDashText.setContent('Digita un comando... ');
        dashboard.dashInput.style.fg = 'white';
        focusDashboardInput();
        refreshDashInputUI(dashUi, colors);
    }
});

let statusRefreshInFlight = false;
let lastStatusPanelContent = '';
let statusPulseFrame = 0;
/** @type {Awaited<ReturnType<typeof fetchStatusPanelState>> | null} */
let latestStatusState = null;

function focusDashboardInput() {
    if (promptMode || commandInputLocked) {
        return;
    }

    stopTextboxInput(splash.inputSplashBar);
    dashboard.dashInput.focus();
    dashboard.dashInput.cursorVisible = true;
    refreshDashInputUI(dashUi, colors);
    screen.render();
}

function blurDashboardInput() {
    dashboard.dashInput.blur();
    dashboard.dashInput.cursorVisible = false;
    refreshDashInputUI(dashUi, colors);
    screen.render();
}

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
    stopTextboxInput(splash.inputSplashBar);
    splash.splashPage.hide();
    dashboard.dashPage.show();
    screen.render();
    layoutDashboard(dashboard, screen);
    if (focusInput && !commandInputLocked) {
        focusDashboardInput();
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
            focusDashboardInput();
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

/** @param {string} ch @param {{ name?: string, ctrl?: boolean }} [key] */
function handleDashboardInputKeypress(ch, key = {}) {
    if (!dashboard.dashPage.visible || promptMode || commandInputLocked) {
        return false;
    }

    if (!dashboard.dashInput.active) {
        focusDashboardInput();
    }

    if (key.ctrl) {
        return false;
    }

    if (key.name === 'enter' || key.name === 'return') {
        dashboard.dashInput.cursorVisible = true;
        runDashboardCommand(dashboard.dashInput.getValue() || '');
        return true;
    }

    if (key.name === 'tab') {
        const value = dashboard.dashInput.getValue() || '';
        const suggestions = getCommandSuggestions(value);
        if (suggestions.length > 0) {
            dashboard.dashInput.setValue(suggestions[0].id);
            dashboard.dashInput.cursorVisible = true;
            refreshDashInputUI(dashUi, colors);
            screen.render();
        }
        return true;
    }

    if (key.name === 'backspace') {
        dashboard.dashInput.setValue((dashboard.dashInput.getValue() || '').slice(0, -1));
        dashboard.dashInput.cursorVisible = true;
        refreshDashInputUI(dashUi, colors);
        screen.render();
        return true;
    }

    if (key.name === 'escape') {
        dashboard.dashInput.clearValue();
        dashboard.dashInput.cursorVisible = true;
        refreshDashInputUI(dashUi, colors);
        screen.render();
        return true;
    }

    if (ch && ch >= ' ' && !key.name?.startsWith('f')) {
        dashboard.dashInput.setValue(`${dashboard.dashInput.getValue() || ''}${ch}`);
        dashboard.dashInput.cursorVisible = true;
        refreshDashInputUI(dashUi, colors);
        screen.render();
        return true;
    }

    return false;
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
                focusDashboardInput();
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

/** @returns {never} */
const quit = () => process.exit(0);

dashboard.inputContainer.on('click', focusDashboardInput);
dashboard.logArea.on('click', blurDashboardInput);
dashboard.statusPanel.on('click', () => {
    blurDashboardInput();
    dashboard.statusPanel.focus();
});
dashboard.statusPanel.key(['up'], () => {
    dashboard.statusPanel.scroll(-1);
    screen.render();
});
dashboard.statusPanel.key(['down'], () => {
    dashboard.statusPanel.scroll(1);
    screen.render();
});
dashboard.statusPanel.key(['pageup'], () => {
    dashboard.statusPanel.scroll(-10);
    screen.render();
});
dashboard.statusPanel.key(['pagedown'], () => {
    dashboard.statusPanel.scroll(10);
    screen.render();
});
dashboard.statusPanel.key(['home'], () => {
    dashboard.statusPanel.setScroll(0);
    screen.render();
});
dashboard.statusPanel.key(['end'], () => {
    dashboard.statusPanel.setScrollPerc(100);
    screen.render();
});

screen.key(['C-c'], quit);
screen.key(['C-l'], () => {
    if (!promptMode && !commandInputLocked) {
        clearDashboardLog();
    }
});
screen.on('keypress', /** @param {string} ch @param {any} key */ (ch, key) => {
    if (!prompts.isActive()) {
        handleDashboardInputKeypress(ch, key);
        return;
    }

    const handled = prompts.handleKeypress(ch, key);
    if (handled) {
        dashboard.dashInput.clearValue();
        blurDashboardInput();
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
    if (!dashboard.dashPage.visible || !dashboard.dashInput.active || promptMode || commandInputLocked) {
        return;
    }

    dashboard.dashInput.cursorVisible = !dashboard.dashInput.cursorVisible;
    refreshDashInputUI(dashUi, colors);
}, 530);
setInterval(() => {
    void refreshStatusPanelData();
}, 5000);

splash.inputSplashBar.focus();
screen.render();
