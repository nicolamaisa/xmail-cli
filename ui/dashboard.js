import blessed from '@pm2/blessed';
import chalk from 'chalk';


/** @param {any} screen @param {ColorPalette} colors */
export function createDashboard(screen, colors) {
    const dashPage = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%-1',
        hidden: true // <--- NASCOSTA ALL'AVVIO
    });

    // Il tuo logo ASCII con escape dei backslash corretti
    const logoText = (
        `${chalk.hex(colors.logo)('█████████████████████')}    ██╗  ██╗      ███╗   ███╗ █████╗ ██╗██╗\n` +
        `${chalk.hex(colors.logo)('██ ◥ ◣         ◢ ◤ ██')}    ╚██╗██╔╝      ████╗ ████║██╔══██╗██║██║\n` +
        `${chalk.hex(colors.logo)('██   ◥ ◣     ◢ ◤   ██')}     ╚███╔╝ █████╗██╔████╔██║███████║██║██║\n` +
        `${chalk.hex(colors.logo)('██     ◥ ◣ ◢ ◤     ██')}     ██╔██╗ ╚════╝██║╚██╔╝██║██╔══██║██║██║\n` +
        `${chalk.hex(colors.logo)('██       ◥ ◤       ██')}    ██╔╝ ██╗      ██║ ╚═╝ ██║██║  ██║██║███████╗\n` +
        `${chalk.hex(colors.logo)('█████████████████████')}    ╚═╝  ╚═╝      ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝\n`).trim();


    const logoLines = logoText.split('\n');
    const logoLineCount = logoLines.length;


    const logoContainer = blessed.box({
        parent: dashPage,
        top: 0,
        left: 0,
        width: 'shrink',
        height: 10, // Altezza fissa per il logo
        align: 'center',
        valign: 'middle',

        style: {
            bg: '#1a1a1a'
        }
    });

    // 1. Header superiore (Più alto per contenere il logo)
    const logo = blessed.box({
        parent: logoContainer,
        top: 0,
        left: 0,
        width: 'shrink',
        height: logoLineCount,
        content: logoText,
        tags: true,
        style: {
            bg: '#1a1a1a'
        }
    });


    const header = blessed.box({
        parent: dashPage,

        top: 0,
        left: 0,
        width: 10,

        content: `\n ${chalk.bold.hex(colors.logo)(' XMAIL Control Script')} ${chalk.dim('v0.0.1')}`,
        height: 10, // Aumentato per il logo
        style: {
            bg: colors.header
        }
    });



    // 3. Input Bar (In fondo)

    const inputContainer = blessed.box({
        parent: dashPage,
        top: 11,
        left: 0,
        width: '80%',
        height: 3,
        style: {
            bg: '#111111' // Un grigio scuro per staccare dallo sfondo
        }
    });

    const dashInput = blessed.box({
        parent: inputContainer,
        top: 1,
        left: 3,
        width: '100%-6',
        height: 1,
        name: 'input',
        tags: true,
        keys: true,
        mouse: true,
        style: {
            fg: 'white',
            bg: '#111111'
        }
    });
    dashInput.value = '';
    dashInput.active = false;
    dashInput.cursorVisible = true;
    dashInput.getValue = () => dashInput.value || '';
    dashInput.setValue = /** @param {string | null | undefined} value */ (value) => {
        dashInput.value = value == null ? '' : String(value);
    };
    dashInput.clearValue = () => {
        dashInput.value = '';
    };
    dashInput.focus = () => {
        dashInput.active = true;
        dashInput.cursorVisible = true;
    };
    dashInput.blur = () => {
        dashInput.active = false;
        dashInput.cursorVisible = false;
    };

    const hintDashText = blessed.text({
        parent: inputContainer,
        top: 1,
        left: 3,
        hidden: true,
        content: '',
        style: { fg: '#444444', bg: '#111111' }
    });

    const dashInputAccentLine = blessed.box({
        parent: inputContainer,
        top: 0,
        left: 0,
        width: 1,
        height: '100%',
        style: {
            bg: '#00CED1' // Colore Ciano
        }
    });

    const sideInfo = blessed.box({
        parent: dashPage,
        top: 0,
        bottom: 0,
        right: 0,
        width: '28%',

        tags: true,
        style: {
            fg: colors.testo,
            bg: '#111111',

        }
    });

    const statusPanel = blessed.box({
        parent: sideInfo,
        top: 0,
        left: 0,
        width: '100%-2',
        height: '100%-2',
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        padding: { top: 1, right: 1, bottom: 1, left: 1 },
        style: {
            fg: colors.testo,
            bg: '#111111'
        },
        scrollbar: {
            ch: ' ',
            track: { bg: '#222' },
            style: { inverse: true }
        },
        content: [
            '{red-fg}XMail runtime{/red-fg}',
            '',
            '{gray-fg}Containers{/gray-fg}',
            '  waiting for docker data...'
        ].join('\n')
    });

    const bottomInfo = blessed.box({
        parent: dashPage,
        bottom: 0,
        left: 0,
        width: '80%',
        height: 1,
        content: `${chalk.dim('XMAIL CLI 1.0 - Developed by nicolamaisa')}`,
        style: { fg: '#555555', bg: '#1a1a1a' }
    });

    const keyInfo = blessed.box({
        parent: bottomInfo,
        top: 0,
        right: 1,
        width: 'shrink',
        height: 1,
        content: `${chalk.dim('Ctrl+C per uscire')}` + `${chalk.dim(' | Ctrl+L per pulire')}`,
        style: { fg: '#555555', bg: '#1a1a1a' }
    });

    // 2. Area Log (Parte sotto l'header, top: 10)
    const logArea = blessed.log({
        parent: dashPage,
        top: 15,
        left: 0,
        width: '80%',
        height: '100%-19', // Spazio per header (10) e input (3)
        tags: true,
        keys: true,
        mouse: false,
        padding: { top: 1, right: 1, bottom: 1, left: 1 },
        scrollable: true,
        style: {
            fg: colors.testo,
            bg: '#111111',

        },
        scrollbar: {
            ch: ' ',
            track: { bg: '#222' },
            style: { inverse: true }
        }
    });

    const logAreaSuggestion = blessed.box({
        parent: dashPage,
        bottom: 2,
        left: 1,
        width: '100%-2',
        height: 2,
        tags: true,
        style: { bg: '#111111', fg: '#C0C0C0' }
    });
    const logAreaSuggestionText = blessed.text({
        parent: logAreaSuggestion,
        top: 1,
        left: 1,
        right: 1,
        height: 1,
        tags: true,
        content: 'xconfig --help for configuration options',
        style: { bg: '#111111', fg: '#888888' }
    });
    const separatorLine = blessed.line({
        parent: logAreaSuggestion,
        bottom: 1,
        left: 0,
        width: '100%',
        orientation: 'horizontal',
        style: { fg: '#999999', bg: '#111111' }
    });




    const dashSuggestions = blessed.box({
        parent: dashPage,
        top: 8,
        left: 2,
        width: '50%',
        height: 3,
        tags: true,
        keys: true,
        mouse: true,
        padding: { top: 0, right: 1, bottom: 0, left: 1 },

        scrollable: true,
        style: {
            fg: '#C0C0C0',
            bg: '#1a1a1a',
        }
    });

    const dashSuggestionLines = [
        blessed.text({
            parent: dashSuggestions,
            bottom: 0,
            left: 1,
            right: 1,
            height: 1,
            tags: true,
            hidden: true,
            style: { bg: '#1a1a1a', fg: '#C0C0C0' }
        }),
        blessed.text({
            parent: dashSuggestions,
            bottom: 1,
            left: 1,
            right: 1,
            height: 1,
            tags: true,
            hidden: true,
            style: { bg: '#1a1a1a', fg: '#C0C0C0' }
        }),
        blessed.text({
            parent: dashSuggestions,
            bottom: 2,
            left: 1,
            right: 1,
            height: 1,
            tags: true,
            hidden: true,
            style: { bg: '#1a1a1a', fg: '#C0C0C0' }
        })
    ];

    return {
        dashPage,
        logoContainer,
        logo,
        header,
        sideInfo,
        statusPanel,
        inputContainer,
        dashInput,
        hintDashText,
        dashInputAccentLine,
        logArea,
        logAreaSuggestion,
        logAreaSuggestionText,
        bottomInfo,
        keyInfo,
        dashSuggestions,
        dashSuggestionLines
    };
}
