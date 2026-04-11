import chalk from 'chalk';
import { spawn } from 'child_process';
import { captureCommand, discoverXmailState, XMAIL_ROOT } from '../lib/xmail-control.js';

/** @type {{ child: import('child_process').ChildProcessWithoutNullStreams, processId: string, title: string } | null} */
let activeLogWatch = null;

/**
 * @param {AppContext} ctx
 * @returns {number}
 */
function getProcessWrapWidth(ctx) {
    const rawWidth = typeof ctx.logArea?.width === 'number'
        ? ctx.logArea.width
        : Number.parseInt(String(ctx.logArea?.width || ''), 10);
    const safeWidth = Number.isFinite(rawWidth) ? rawWidth : 100;
    return Math.max(40, safeWidth - 10);
}

/**
 * @param {string} line
 * @param {number} maxWidth
 * @returns {string[]}
 */
function wrapLine(line, maxWidth) {
    if (!line) {
        return [''];
    }

    /** @type {string[]} */
    const wrapped = [];
    let remaining = line;

    while (remaining.length > maxWidth) {
        const boundary = remaining.lastIndexOf(' ', maxWidth);
        const splitAt = boundary > Math.floor(maxWidth * 0.5) ? boundary : maxWidth;
        wrapped.push(remaining.slice(0, splitAt).trimEnd());
        remaining = remaining.slice(splitAt).trimStart();
    }

    if (remaining.length > 0) {
        wrapped.push(remaining);
    }

    return wrapped.length > 0 ? wrapped : [''];
}

/**
 * @param {AppContext} ctx
 * @param {string} processId
 * @param {string} line
 */
function appendWrappedProcessLine(ctx, processId, line) {
    const width = getProcessWrapWidth(ctx);
    const chunks = wrapLine(line, width);
    for (const chunk of chunks) {
        ctx.logs.appendProcessLog(processId, chunk);
    }
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeName(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * @param {string} needle
 * @param {string} haystack
 * @returns {boolean}
 */
function isSubsequence(needle, haystack) {
    let cursor = 0;

    for (const char of haystack) {
        if (char === needle[cursor]) {
            cursor += 1;
            if (cursor === needle.length) {
                return true;
            }
        }
    }

    return needle.length === 0;
}

/**
 * @param {string} containerName
 * @returns {string[]}
 */
function buildAliases(containerName) {
    const aliases = new Set([containerName]);

    if (containerName.startsWith('xmail-')) {
        const shortName = containerName.slice('xmail-'.length);
        aliases.add(shortName);
        aliases.add(`x-${shortName}`);
    }

    if (containerName.startsWith('x-')) {
        aliases.add(containerName.slice(2));
    }

    return [...aliases];
}

/**
 * @param {string} query
 * @param {Array<{ name: string, status: string }>} containers
 * @returns {{ container: string | null, suggestions: string[] }}
 */
function resolveContainerName(query, containers) {
    const normalizedQuery = normalizeName(query);
    if (!normalizedQuery) {
        return { container: null, suggestions: [] };
    }

    const candidates = containers.map((container) => ({
        name: container.name,
        aliases: buildAliases(container.name),
    }));

    for (const candidate of candidates) {
        if (candidate.aliases.some((alias) => normalizeName(alias) === normalizedQuery)) {
            return { container: candidate.name, suggestions: [] };
        }
    }

    for (const candidate of candidates) {
        if (candidate.aliases.some((alias) => normalizeName(alias).includes(normalizedQuery))) {
            return { container: candidate.name, suggestions: [] };
        }
    }

    for (const candidate of candidates) {
        if (candidate.aliases.some((alias) => isSubsequence(normalizedQuery, normalizeName(alias)))) {
            return { container: candidate.name, suggestions: [] };
        }
    }

    return {
        container: null,
        suggestions: candidates
            .flatMap((candidate) => candidate.aliases.map((alias) => ({ alias, name: candidate.name })))
            .filter((candidate) => {
                const normalizedAlias = normalizeName(candidate.alias);
                return normalizedAlias.includes(normalizedQuery)
                    || normalizedQuery.includes(normalizedAlias)
                    || isSubsequence(normalizedQuery, normalizedAlias);
            })
            .map((candidate) => candidate.name)
            .filter((value, index, array) => array.indexOf(value) === index)
            .slice(0, 5),
    };
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitNonEmptyLines(text) {
    return text
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean);
}

/**
 * @param {AppContext} ctx
 * @param {string} reason
 */
function stopActiveLogWatch(ctx, reason = 'Stopped') {
    if (!activeLogWatch) {
        return false;
    }

    const watcher = activeLogWatch;
    activeLogWatch = null;
    watcher.child.kill('SIGTERM');
    ctx.logs.finishProcessLog(
        watcher.processId,
        `{yellow-fg}${reason}{/yellow-fg}`,
        'success'
    );
    return true;
}

/**
 * @param {AppContext} ctx
 * @param {string | null} containerName
 */
function startLogWatch(ctx, containerName) {
    if (activeLogWatch) {
        stopActiveLogWatch(ctx, 'Previous watch stopped');
    }

    const dockerArgs = containerName
        ? ['logs', '-f', '--tail=50', containerName]
        : ['compose', 'logs', '-f', '--tail=50'];
    const title = containerName
        ? `Watch logs: ${containerName}`
        : 'Watch compose logs';

    const processId = ctx.logs.startProcessLog(title, {
        maxVisibleLines: 10,
        footer: '{yellow-fg}watching...{/yellow-fg}',
        selfClosing: false,
    });
    appendWrappedProcessLine(ctx, processId, `docker ${dockerArgs.join(' ')}`);

    const child = spawn('docker', dockerArgs, {
        cwd: XMAIL_ROOT,
        env: process.env,
        shell: false,
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    /** @param {string} chunk @param {(line: string) => void} onLine @param {'stdout' | 'stderr'} key */
    function ingest(chunk, onLine, key) {
        if (key === 'stdout') {
            stdoutBuffer += chunk;
            const parts = stdoutBuffer.split('\n');
            stdoutBuffer = parts.pop() || '';
            for (const part of parts) {
                const line = part.trimEnd();
                if (line) {
                    onLine(line);
                }
            }
            return;
        }

        stderrBuffer += chunk;
        const parts = stderrBuffer.split('\n');
        stderrBuffer = parts.pop() || '';
        for (const part of parts) {
            const line = part.trimEnd();
            if (line) {
                onLine(line);
            }
        }
    }

    child.stdout.on('data', (chunk) => {
        ingest(chunk.toString(), (line) => appendWrappedProcessLine(ctx, processId, line), 'stdout');
    });
    child.stderr.on('data', (chunk) => {
        ingest(
            chunk.toString(),
            (line) => appendWrappedProcessLine(ctx, processId, `{gray-fg}${line}{/gray-fg}`),
            'stderr'
        );
    });

    child.on('error', (error) => {
        if (activeLogWatch?.processId === processId) {
            activeLogWatch = null;
        }
        ctx.logs.finishProcessLog(
            processId,
            `{red-fg}Watch failed: ${error.message}{/red-fg}`,
            'error'
        );
    });

    child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
            appendWrappedProcessLine(ctx, processId, stdoutBuffer.trimEnd());
        }
        if (stderrBuffer.trim()) {
            appendWrappedProcessLine(ctx, processId, `{gray-fg}${stderrBuffer.trimEnd()}{/gray-fg}`);
        }

        if (activeLogWatch?.processId === processId) {
            activeLogWatch = null;
            const statusFooter = code === 0
                ? '{green-fg}Watch ended{/green-fg}'
                : `{red-fg}Watch ended with exit code ${code}{/red-fg}`;
            ctx.logs.finishProcessLog(processId, statusFooter, code === 0 ? 'success' : 'error');
        }
    });

    activeLogWatch = { child, processId, title };
}

/**
 * @param {AppContext} ctx
 * @param {{ args?: string[] }} [command]
 */
export async function runLogs(ctx, command = {}) {
    const args = command.args || [];
    const wantsWatch = args.includes('watch');
    const wantsStop = args.includes('stop');
    const query = args.filter((arg) => arg !== 'watch' && arg !== 'stop').join(' ').trim();

    if (wantsStop) {
        const stopped = stopActiveLogWatch(ctx, 'Watch stopped');
        if (!stopped) {
            ctx.log(`${chalk.yellow('⚠')} Nessun log watch attivo.`);
        }
        return;
    }

    let title = 'Recent Compose Logs';
    let stdout = '';
    let stderr = '';

    if (wantsWatch) {
        if (query) {
            const state = await discoverXmailState();
            const match = resolveContainerName(query, state.containers);

            if (!match.container) {
                const suffix = match.suggestions.length > 0
                    ? ` Possibili match: ${match.suggestions.join(', ')}`
                    : '';
                ctx.log(`${chalk.red('✖')} Container non trovato per "${query}".${suffix}`);
                return;
            }

            startLogWatch(ctx, match.container);
            ctx.log(`${chalk.green('✔')} Watch avviato su ${match.container}. Usa ${chalk.cyan('/logs stop')} per fermarlo.`);
            return;
        }

        startLogWatch(ctx, null);
        ctx.log(`${chalk.green('✔')} Watch avviato su compose logs. Usa ${chalk.cyan('/logs stop')} per fermarlo.`);
        return;
    }

    if (query) {
        const state = await discoverXmailState();
        const match = resolveContainerName(query, state.containers);

        if (!match.container) {
            const suffix = match.suggestions.length > 0
                ? ` Possibili match: ${match.suggestions.join(', ')}`
                : '';
            ctx.log(`${chalk.red('✖')} Container non trovato per "${query}".${suffix}`);
            return;
        }

        ({ stdout, stderr } = await captureCommand('docker', ['logs', '--tail=100', match.container]));
        title = `Recent Container Logs: ${match.container}`;
    } else {
        ({ stdout, stderr } = await captureCommand('docker', ['compose', 'logs', '--tail=100']));
    }

    ctx.log(`${chalk.magenta('╔══')} ${chalk.bold(title)}`);
    for (const line of splitNonEmptyLines(stdout)) {
        ctx.log(`${chalk.magenta('║')} ${line}`);
    }
    for (const line of splitNonEmptyLines(stderr)) {
        ctx.log(`${chalk.magenta('║')} ${chalk.red(line)}`);
    }
    ctx.log(`${chalk.magenta('╚══')} ${chalk.dim('End logs')}`);
}
