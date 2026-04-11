import chalk from 'chalk';

/**
 * @param {AppContext} ctx
 * @param {string} title
 * @param {string[]} rows
 * @param {string} footer
 */
function renderHelpBlock(ctx, title, rows, footer = 'Usa /help per la lista completa') {
    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold(title)}`);
    for (const row of rows) {
        ctx.log(`${chalk.magenta('│')} ${row}`);
    }
    ctx.log(`${chalk.magenta('└──')} ${chalk.dim(footer)}`);
}

/**
 * @param {AppContext} ctx
 * @param {{ args?: string[] }} [invocation]
 */
export function runHelp(ctx, invocation = {}) {
    const topicRaw = invocation.args?.[0] || '';
    const topic = topicRaw.replace(/^\//, '').toLowerCase();

    if (topic === 'logs' || topic === 'log') {
        renderHelpBlock(ctx, 'Help: /logs', [
            `${chalk.cyan('/logs')} - Mostra gli ultimi log docker compose`,
            `${chalk.cyan('/logs <container>')} - Mostra gli ultimi log di un container`,
            `${chalk.cyan('/logs watch')} - Avvia stream live compose logs`,
            `${chalk.cyan('/logs watch <container>')} - Avvia stream live di un container`,
            `${chalk.cyan('/logs stop')} - Ferma il watch attivo`,
            `${chalk.cyan('/logs -h')} / ${chalk.cyan('/logs help')} - Mostra aiuto logs`,
        ], 'Esempio: /logs watch x-auth');
        return;
    }

    if (topic === 'down') {
        renderHelpBlock(ctx, 'Help: /down', [
            `${chalk.cyan('/down')} - Spegne/rimuove stack con flow guidato`,
            `${chalk.cyan('/down <container>')} - Rimuove un singolo container`,
            `Nel flow completo puoi scegliere: ${chalk.yellow('-v')} volumi, ${chalk.yellow('--remove-orphans')} e prune container exited`,
            `${chalk.cyan('/down -h')} - Mostra questo aiuto`,
        ], 'Tip: /down è il comando consigliato per pulizia stack');
        return;
    }

    if (topic === 'init') {
        renderHelpBlock(ctx, 'Help: /init', [
            `${chalk.cyan('/init')} - Avvia onboarding/bootstrap guidato`,
            `Legge ${chalk.cyan('/opt/xmail-prod/init.flow.json')} quando presente`,
            `Gestisce env, start servizi, migrazioni e check finali`,
            `${chalk.cyan('/init -h')} - Mostra questo aiuto`,
        ], 'Tip: aggiorna init.flow.json per cambiare il workflow');
        return;
    }

    if (topic === 'start' || topic === 'stop' || topic === 'restart') {
        renderHelpBlock(ctx, `Help: /${topic}`, [
            `${chalk.cyan('/start')} - Avvia stack XMail`,
            `${chalk.cyan('/stop')} - Ferma i container attivi`,
            `${chalk.cyan('/restart')} - Riavvia i container`,
            `${chalk.cyan(`/${topic} -h`)} - Mostra questo aiuto`,
        ], 'Tip: usa /status subito dopo start/restart');
        return;
    }

    if (topic === 'migrate' || topic === 'status' || topic === 'reset-db') {
        renderHelpBlock(ctx, `Help: /${topic}`, [
            `${chalk.cyan('/migrate')} - Esegue docker compose run --rm x-db-migrate`,
            `${chalk.cyan('/status')} - Mostra docker compose ps`,
            `${chalk.cyan('/reset-db')} - Reset completo dati PostgreSQL locali`,
            `${chalk.cyan(`/${topic} -h`)} - Mostra questo aiuto`,
        ], 'Attenzione: /reset-db è distruttivo sui dati DB locali');
        return;
    }

    if (topic === 'login' || topic === 'logout') {
        renderHelpBlock(ctx, `Help: /${topic}`, [
            `${chalk.cyan('/login api')} - Esegue login API e salva token in memoria TUI`,
            `${chalk.cyan('/logout api')} - Rimuove la sessione API dalla TUI`,
            `${chalk.cyan('/login -h')} / ${chalk.cyan('/logout -h')} - Mostra aiuto`,
        ], 'Tip: alcuni flow richiedono sessione API attiva');
        return;
    }

    if (topic) {
        renderHelpBlock(ctx, `Help non trovato: ${topic}`, [
            `Nessun topic dedicato per ${chalk.red(topic)}.`,
            `Prova ${chalk.cyan('/help logs')} o usa ${chalk.cyan('/help')} per la lista completa.`,
        ], 'Continuo ad aggiungere help topic man mano');
        return;
    }

    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold('Comandi Disponibili')}`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/init')} * - Onboarding e bootstrap completo di XMail`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/start')} - Avvia la stack XMail`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/stop')} - Ferma i container attivi`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/down')} * - Spegne/rimuove stack (supporta modalità avanzate)`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/restart')} - Riavvia i container`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/migrate')} - Esegue le migrazioni DB`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/status')} - Mostra docker compose ps`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/logs')} * - Log recenti e stream live`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/reset-db')} * - Reset dei dati PostgreSQL locali`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/login')} * - Login verso servizi esterni`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/logout')} * - Logout servizi esterni`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/frontend')} - Avvia il task di compilazione frontend`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/wizard')} - Avvia la configurazione iniziale guidata`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/export-log')} - Salva il log per supporto/debug`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/clear')} - Pulisce la console`);
    ctx.log(`${chalk.magenta('│')} ${chalk.cyan('/exit')} o ${chalk.cyan('/quit')} - Esci dall'applicazione`);
    ctx.log(`${chalk.magenta('│')} ${chalk.dim('* = ha sotto-comandi/opzioni. Usa /help <comando>, es: /help logs')}`);
    ctx.log(`${chalk.magenta('└──')} ${chalk.dim('E altri comandi in arrivo...')}`);
}
