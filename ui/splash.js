
import blessed from '@pm2/blessed';
import chalk from 'chalk';

/**
 * @param {any} screen
 * @param {ColorPalette} colors
 * @param {{ phase: 'installed' | 'package-ready' | 'package-missing' }} state
 */
export function createSplash(screen, colors, state) {
    // 1. Box principale del splash
    const splashPage = blessed.box({
        parent: screen,
        top: 0, left: 0, width: '100%', height: '100%',
        style: { bg: '#1a1a1a' }
    });
    // 2. Logo e informazioni centrali
    const cleanLogo = (`█████████████████████\n` +
        `██ ◥ ◣         ◢ ◤ ██\n` +
        `██   ◥ ◣     ◢ ◤   ██\n` +
        `██     ◥ ◣ ◢ ◤     ██\n` +
        `██       ◥ ◤       ██\n` +
        `█████████████████████`).trim();
    // 3. Box del logo con informazioni e input
    const statusLine = state.phase === 'installed'
        ? chalk.green('● SYSTEM READY')
        : state.phase === 'package-ready'
            ? chalk.yellow('◐ PACKAGE READY (NOT INSTALLED)')
            : chalk.red('○ PACKAGE NOT DOWNLOADED');

    const actionLine = state.phase === 'installed'
        ? `${chalk.dim('Premi INVIO per entrare oppure digita ')}${chalk.cyan('/init')}`
        : state.phase === 'package-ready'
            ? `${chalk.dim('Digita ')}${chalk.cyan('/init')}${chalk.dim(' per bootstrap oppure ')}${chalk.cyan('/download')}${chalk.dim(' per aggiornare il pacchetto')}`
            : `${chalk.dim('Digita ')}${chalk.cyan('/download')}${chalk.dim(' per scaricare il pacchetto, poi ')}${chalk.cyan('/init')}`;

    const splashLogo = blessed.box({
        parent: splashPage,
        top: 4,
        left: 'center',
        width: '80%',
        height: 20,
        align: 'center',
        content: `${chalk.hex(colors.logo).bold(cleanLogo)}\n\n` +
            `${chalk.white.bold('XMAIL CLI v1.0')}\n` +
            `${statusLine}\n\n` +
            `${actionLine}`,
        tags: true,
        style: { bg: '#1a1a1a' }
    });
    // 4. Informazioni di versione e hint
    const versionInfo = blessed.box({
        parent: splashPage,
        bottom: 1,
        left: 1,
        width: '50%',
        height: 1,
        align: 'left',
        valign: 'middle',
        content: `${chalk.dim('XMAIL CLI 1.0 - Developed by nicolamaisa')}`,
        style: { bg: '#1a1a1a', fg: '#555555' }
    });
    // 5. Hint per i comandi
    const helpInfo = blessed.box({
        parent: splashPage,
        bottom: 1,
        right: 1,
        width: '50%',
        height: 1,
        align: 'right',
        valign: 'middle',
        content: `${chalk.dim('Type /help for commands')}`,
        style: { bg: '#1a1a1a', fg: '#555555' }
    });
    // 6. Input del comando (con accento)
    const inputSplashContainer = blessed.box({
        parent: splashLogo,
        bottom: 5,
        left: 'center',
        align: 'center',
        valign: 'middle',
        width: '50%',
        height: 3,
        style: {
            bg: '#111111' // Un grigio scuro per staccare dallo sfondo
        }
    });
    // Linea di accento a sinistra dell'input
    const inputAccentLine = blessed.box({
        parent: inputSplashContainer,
        top: 0,
        left: 0,
        width: 1,
        height: '100%',
        style: {
            bg: '#00CED1' // Colore Ciano
        }
    });
    // Input vero e proprio
    const inputSplashBar = blessed.textbox({
        parent: inputSplashContainer,
        top: 1,      // Centrato verticalmente nel box da 3
        left: 3,      // Lascia spazio per la linea e un po' di padding
        width: '90%',
        height: 1,
        name: 'input',
        inputOnFocus: true,
        keys: true,
        mouse: true,
        style: {
            fg: 'white',
            bg: '#111111'


        }
    });
    // Hint testuale all'interno dell'input
    const hintText = blessed.text({
        parent: inputSplashContainer,
        top: 1,
        left: 3,
        content: 'Digita un comando... ',
        style: { fg: '#444444', bg: '#111111' } // Grigio molto spento
    });
    // 7. Box per suggerimenti e output dei comandi (nascosto di default)
    const splashSuggestions = blessed.box({
        parent: splashLogo,
        bottom: 0,
        left: 'center',
        width: '50%-2',
        height: 4,
        tags: true,
        keys: true,
        mouse: true,
        hidden: true,
        scrollable: true,
        style: {
            fg: '#C0C0C0',
            bg: '#1a1a1a',
        }
    });

    return {
        cleanLogo,
        splashLogo,
        splashPage,
        inputSplashBar,
        hintText,
        splashSuggestions,
        versionInfo,
        helpInfo,
        inputAccentLine,
        inputSplashContainer,
    };
}
