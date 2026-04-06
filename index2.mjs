import blessed from '@pm2/blessed';
import chalk from 'chalk';

// Definizione Colori Principali per riprodurre l'estetica delle foto
const COLORI = {
    testo: '#C0C0C0',     // Grigio chiaro per testo normale
    header: '#A9A9A9',    // Grigio medio per header box
    arancio: '#FF7F50',   // Arancio corallo per titolo e loghi (come in image_0)
    cian: '#00CED1',      // Ciano per l'input e successi
    bordo: '#444444',    // Grigio scuro per le linee dei bordi
    sfondo: '#1C1C1C',    // Grigio molto scuro per lo sfondo
};

// Configurazione dello Schermo (Full Screen)
const screen = blessed.screen({
    smartCSR: true,
    title: 'DASHBOARD XMAIL-dev v2.0',
    fullUnicode: true,
    style: { bg: COLORI.sfondo }
});

// --- AREA SUPERIORE (Logo e Benvenuto) ---

// Il tuo Logo ASCII (ripulito per evitare errori di escape)
const logoAscii = `
    ${chalk.hex(COLORI.arancio)('█████████████████████')}
    ${chalk.hex(COLORI.arancio)('██ ◥ ◣         ◢ ◤ ██')}
    ${chalk.hex(COLORI.arancio)('██   ◥ ◣     ◢ ◤   ██')}
    ${chalk.hex(COLORI.arancio)('██     ◥ ◣ ◢ ◤     ██')}
    ${chalk.hex(COLORI.arancio)('██       ◥ ◤       ██')}
    ${chalk.hex(COLORI.arancio)('█████████████████████')}
`;

// Box di Benvenuto (Header Sinistro) - Alto 8 righe
const welcomeBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '50%',
    height: 8,
    label: ` {hex(COLORI.header)-fg}DASHBOARD CONTROL{/hex(COLORI.header)-fg} `,
    content: `${logoAscii}\n {hex(COLORI.testo)-fg}Welcome back! Connected to xmail-dev{/hex(COLORI.testo)-fg}`,
    tags: true,
    border: { type: 'line' },
    style: {
        border: { fg: COLORI.bordo },
        bg: COLORI.sfondo
    }
});

// Box delle Info (Header Destro) - Alto 8 righe
const infoBox = blessed.box({
    parent: screen,
    top: 0,
    left: '50%',
    width: '50%',
    height: 8,

    content: `\n ${chalk.hex(COLORI.cian)('► /frontend')} - Gestione Web\n ${chalk.hex(COLORI.cian)('► /status')}   - Stato Server\n ${chalk.hex(COLORI.cian)('► /exit')}     - Chiudi`,
    tags: true,
    border: { type: 'line' },
    style: {
        border: { fg: COLORI.bordo },
        bg: COLORI.sfondo
    }
});

// --- AREA CENTRALE (Due Colonne: Stato e Log) ---

// Colonna di Stato (Sinistra) - Inizia a top: 8
const statusBox = blessed.box({
    parent: screen,
    top: 8,
    left: 0,
    width: '30%', // Più stretta
    height: '100%-11', // Spazio per header(8) e input(3)
    label: ` {hex(COLORI.arancio)-fg}Server Status{/hex(COLORI.arancio)-fg} `,
    content: `\n ${chalk.green('●')} API:      ${chalk.bold('ON')}\n ${chalk.green('●')} Database: ${chalk.bold('ON')}\n ${chalk.red('○')} Redis:    ${chalk.bold('OFF')}`,
    tags: true,
    border: { type: 'line' },
    style: {
        border: { fg: COLORI.bordo },
        bg: COLORI.sfondo
    }
});

// Colonna dei Log (Destra) - Inizia a top: 8
const logArea = blessed.log({
    parent: screen,
    top: 8,
    left: '30%', // Inizia dopo lo status box
    width: '70%',
    height: '100%-11',
    label: ` {hex(COLORI.cian)-fg}Activity Log{/hex(COLORI.cian)-fg} `,
    tags: true,
    keys: true,
    mouse: true,
    scrollable: true,
    border: { type: 'line' },
    style: {
        border: { fg: COLORI.bordo },
        bg: COLORI.sfondo
    },
    scrollbar: { ch: ' ', track: { bg: COLORI.bordo }, style: { inverse: true } }
});

// --- AREA INFERIORE (Input del Comando) ---

const inputContainer = blessed.box({
    parent: screen,
    bottom: 0,
    width: '100%',
    height: 3,
    border: { type: 'line' },
    style: {
        border: { fg: COLORI.arancio }, // Bordo dell'input colorato
        bg: COLORI.sfondo
    }
});

const inputBar = blessed.textbox({
    parent: inputContainer,
    top: 0,
    left: 1,
    width: '98%',
    height: 1,
    name: 'input',
    inputOnFocus: true,
    value: '> ',
    style: {
        fg: COLORI.cian,
        bg: COLORI.sfondo
    }
});

// --- LOGICA E COMANDI ---

// Mappa dei comandi per pulire il codice
const comandi = {
    '/exit': () => process.exit(0),
    '/clear': () => logArea.setContent(''),
    '/status': () => {
        logArea.log(chalk.gray('>> Richiesta stato server in corso...'));
        setTimeout(() => logArea.log(chalk.green('>> Stato aggiornato correttamente.')), 800);
    },
    '/frontend': () => {
        logArea.log(`${chalk.hex(COLORI.arancio)('>>')} Avvio task frontend...`);
        setTimeout(() => {
            logArea.log(`${chalk.green('>> ✔')} Compilazione completata.`);
            screen.render();
        }, 1500);
    },
};

inputBar.on('submit', (value) => {
    const fullInput = value.trim();
    const cmd = fullInput.toLowerCase().replace('> ', ''); // Rimuove il prompt iniziale

    if (comandi[cmd]) {
        comandi[cmd]();
    } else if (cmd !== '' && cmd !== '>') {
        logArea.log(`${chalk.red('>> ERROR:')} Comando ignoto: ${cmd}`);
    }

    inputBar.clearValue();
    inputBar.setValue('> '); // Mantiene il prompt visivo
    inputBar.focus();
    screen.render();
});

// Scorciatoie Tastiera
screen.key(['escape', 'C-c', 'C-x'], comandi['/exit']);
screen.key(['C-l'], comandi['/clear']);

// Inizializzazione
inputBar.focus();
logArea.log(`${chalk.hex(COLORI.arancio)('SYSTEM READY.')} Digita ${chalk.cyan('/help')} o ${chalk.cyan('Ctrl+X')} per uscire.`);
screen.render();