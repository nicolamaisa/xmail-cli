import blessed from '@pm2/blessed';
import chalk from 'chalk';
import { execSync } from 'child_process';

const screen = blessed.screen({ smartCSR: true, fullUnicode: true });

// --- LOGICA DI CONTROLLO STATO ---
function checkProjectStatus() {
    try {
        // Controlla se i container x-api o x-db sono attivi
        const stdout = execSync('docker ps --filter "name=x-" --format "{{.Names}}"').toString();
        return stdout.trim().length > 0; // true se ci sono container x-mail attivi
    } catch (e) {
        return false; // Docker non gira o errore
    }
}

const isInstalled = checkProjectStatus();

// --- UI: SCHERMATA SPLASH (HOME) ---
const splashContainer = blessed.box({
    parent: screen,
    top: 'center', left: 'center',
    width: '80%', height: '60%',
    align: 'center', valign: 'middle',
    content: `
    ${chalk.hex('#FF7F50')('█████████████████████')}
    ${chalk.hex('#FF7F50')('██ ◥ ◣         ◢ ◤ ██')}
    ${chalk.hex('#FF7F50')('█████████████████████')}
    \n${isInstalled ? chalk.green('● SYSTEM READY') : chalk.red('○ SYSTEM NOT INSTALLED')}
    \n${isInstalled
            ? chalk.dim('Premi INVIO per entrare nella dashboard')
            : 'Digita ' + chalk.cyan('/init') + ' per installare il progetto'}`,
    tags: true,
    hidden: false
});

// --- UI: DASHBOARD (COLONNE) ---
const dashContainer = blessed.box({
    parent: screen,
    top: 0, left: 0, width: '100%', height: '100%-3',
    hidden: true
});

const statusCol = blessed.box({
    parent: dashContainer,
    width: '30%', height: '100%',
    border: { type: 'line', fg: '#444' },
    label: ' Info ',
    tags: true
});

const logArea = blessed.log({
    parent: dashContainer,
    left: '30%', width: '70%', height: '100%',
    border: { type: 'line', fg: '#444' },
    label: ' Terminal Output ',
    scrollbar: { ch: ' ', track: { bg: '#222' } }
});

// --- UI: INPUT BAR ---
const inputContainer = blessed.box({
    parent: screen,
    bottom: 0, width: '100%', height: 3,
    border: { type: 'line', fg: '#FF7F50' }
});

const inputBar = blessed.textbox({
    parent: inputContainer,
    left: 2, height: 1,
    inputOnFocus: true
});

// --- GESTORE TRANSIZIONE ---
function showDashboard() {
    splashContainer.hide();
    dashContainer.show();
    inputBar.focus();
    screen.render();
}

// --- LOGICA COMANDI ---
inputBar.on('submit', (value) => {
    const cmd = value.trim().toLowerCase();

    // Se siamo nello splash e l'utente preme invio (senza comando) e il progetto è pronto
    if (splashContainer.visible && cmd === '' && isInstalled) {
        showDashboard();
        logArea.log(chalk.green('✔ Sessione avviata. Progetto pronto.'));
    }
    // Se l'utente digita /init
    else if (cmd === '/init') {
        showDashboard();
        logArea.log(chalk.yellow('▶ Avvio procedura /init...'));
        logArea.log(chalk.dim('Esecuzione: docker compose up -d...'));
        // Qui chiameresti una funzione che esegue lo script bash
    }
    // Comandi Dashboard
    else if (!splashContainer.visible) {
        if (cmd === '/status') {
            logArea.log(chalk.cyan('>> Controllo container...'));
            // Esempio: logArea.log(execSync('docker ps').toString());
        }
        if (cmd === '/exit') process.exit(0);
    }

    inputBar.clearValue();
    inputBar.focus();
    screen.render();
});

// --- AUTO-AVVIO ---
// Se il progetto è già avviato, saltiamo lo splash dopo 1.5 secondi
if (isInstalled) {
    setTimeout(() => {
        if (splashContainer.visible) { // Se l'utente non ha già interagito
            showDashboard();
        }
    }, 1500);
}

screen.key(['C-c', 'C-x'], () => process.exit(0));
inputBar.focus();
screen.render();