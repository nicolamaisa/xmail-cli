import { spawn } from 'child_process';
import { discoverXmailState, XMAIL_ROOT } from '../lib/xmail-control.js';

/**
 * @param {AppContext} ctx
 * @param {string} title
 * @param {string} command
 * @param {string[]} args
 * @param {{ successFooter?: string, selfClosing?: boolean }} [options]
 */
async function runFlowCommand(ctx, title, command, args, options = {}) {
    await ctx.flow.runProcessStep(
        title,
        async ({ append }) => {
            append(`${command} ${args.join(' ')}`);
            return await new Promise((resolve, reject) => {
                const child = spawn(command, args, {
                    cwd: XMAIL_ROOT,
                    env: process.env,
                    shell: false
                });

                /**
                 * @param {import('stream').Readable} stream
                 * @param {(line: string) => void} onLine
                 * @returns {() => void}
                 */
                function wireProcessStream(stream, onLine) {
                    let buffer = '';
                    stream.on('data', (chunk) => {
                        buffer += chunk.toString();
                        const parts = buffer.split('\n');
                        buffer = parts.pop() || '';
                        for (const part of parts) {
                            const line = part.trimEnd();
                            if (line) {
                                onLine(line);
                            }
                        }
                    });

                    return () => {
                        const line = buffer.trimEnd();
                        if (line) {
                            onLine(line);
                        }
                    };
                }

                const flushStdout = wireProcessStream(child.stdout, (line) => append(line));
                const flushStderr = wireProcessStream(child.stderr, (line) => append(`{gray-fg}${line}{/gray-fg}`));

                child.on('error', (error) => reject(error));

                child.on('close', (code) => {
                    flushStdout();
                    flushStderr();
                    if (code === 0) {
                        resolve({
                            status: 'success',
                            footer: options.successFooter || 'Completed'
                        });
                        return;
                    }

                    reject(new Error(`${title} failed with exit code ${code}`));
                });
            });
        },
        {
            maxVisibleLines: 4,
            selfClosing: options.selfClosing ?? true
        }
    );
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
        aliases: buildAliases(container.name)
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
            .slice(0, 5)
    };
}

/**
 * @param {AppContext} ctx
 * @param {{ args?: string[] }} [command]
 */
export async function runDown(ctx, command = {}) {
    const query = command.args?.join(' ').trim() || '';
    ctx.flow.begin('XMail Down');

    if (query) {
        const state = await discoverXmailState();
        const match = resolveContainerName(query, state.containers);

        if (!match.container) {
            const suffix = match.suggestions.length > 0
                ? `\nPossibili match: ${match.suggestions.join(', ')}`
                : '';
            ctx.flow.addInfo(
                'Container non trovato',
                `Nessun container corrisponde a "${query}".${suffix}`,
                { tone: 'error' }
            );
            ctx.flow.complete(true, 'Down cancelled', { hideCompletion: true });
            return;
        }

        const confirmSingle = await ctx.flow.askConfirm({
            id: 'confirm_single_down',
            label: `Rimuovere il container ${match.container}?`,
            trueLabel: 'Remove',
            falseLabel: 'Cancel',
            value: false
        });

        if (!confirmSingle) {
            ctx.flow.addNotice('{yellow-fg}⚠ Down annullato{/yellow-fg}');
            ctx.flow.complete(true, 'Down cancelled', { hideCompletion: true });
            return;
        }

        try {
            await runFlowCommand(
                ctx,
                `Remove container ${match.container}`,
                'docker',
                ['rm', '-f', match.container],
                {
                    successFooter: `${match.container} removed`,
                    selfClosing: true
                }
            );
            ctx.flow.complete(true, 'Container removed');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.flow.addInfo('Down container failed', message, { tone: 'error' });
            ctx.flow.complete(true, 'Down failed', { hideCompletion: true });
        }
        return;
    }

    const infoAccepted = await ctx.flow.askInfo({
        title: 'Compose down',
        content: 'Questa operazione spegne e rimuove i servizi della stack.',
        instructions:
            '{gray-fg}{bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}',
    });

    if (!infoAccepted) {
        ctx.flow.addNotice('{yellow-fg}⚠ Down annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Down cancelled', { hideCompletion: true });
        return;
    }

    const resetData = await ctx.flow.askConfirm({
        id: 'reset_data',
        label: 'Rimuovere anche i volumi dati (-v)? Operazione irreversibile.',
        value: false
    });
    if (resetData === null) {
        ctx.flow.addNotice('{yellow-fg}⚠ Down annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Down cancelled', { hideCompletion: true });
        return;
    }

    const removeOrphans = await ctx.flow.askConfirm({
        id: 'remove_orphans',
        label: 'Rimuovere anche i container orfani (--remove-orphans)?',
        value: true
    });
    if (removeOrphans === null) {
        ctx.flow.addNotice('{yellow-fg}⚠ Down annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Down cancelled', { hideCompletion: true });
        return;
    }

    const pruneStopped = await ctx.flow.askConfirm({
        id: 'prune_stopped',
        label: 'Pulire anche i container stopped/exited residui del progetto?',
        trueLabel: 'Prune',
        falseLabel: 'Skip',
        value: true
    });
    if (pruneStopped === null) {
        ctx.flow.addNotice('{yellow-fg}⚠ Down annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Down cancelled', { hideCompletion: true });
        return;
    }

    /** @type {string[]} */
    const composeArgs = ['compose', 'down'];
    if (resetData) {
        composeArgs.push('-v');
    }
    if (removeOrphans) {
        composeArgs.push('--remove-orphans');
    }

    try {
        await runFlowCommand(ctx, 'Compose down', 'docker', composeArgs, {
            successFooter: 'Stack removed',
            selfClosing: true
        });

        if (pruneStopped) {
            await runFlowCommand(
                ctx,
                'Prune stopped project containers',
                'docker',
                [
                    'container',
                    'prune',
                    '-f',
                    '--filter',
                    'label=com.docker.compose.project=xmail-prod'
                ],
                {
                    successFooter: 'Stopped/exited containers pruned',
                    selfClosing: true
                }
            );
        }

        ctx.flow.complete(true, 'Down completed');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.flow.addInfo('Compose down failed', message, { tone: 'error' });
        ctx.flow.complete(true, 'Down failed', { hideCompletion: true });
    }
}
