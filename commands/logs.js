import chalk from 'chalk';
import { captureCommand, discoverXmailState } from '../lib/xmail-control.js';

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
 * @param {AppContext} ctx
 * @param {{ args?: string[] }} [command]
 */
export async function runLogs(ctx, command = {}) {
    const query = command.args?.join(' ').trim() || '';

    let title = 'Recent Compose Logs';
    let stdout = '';
    let stderr = '';

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

    ctx.log(`${chalk.magenta('┌──')} ${chalk.bold(title)}`);
    for (const line of stdout.split('\n').filter(Boolean)) {
        ctx.log(`${chalk.magenta('│')} ${line}`);
    }
    for (const line of stderr.split('\n').filter(Boolean)) {
        ctx.log(`${chalk.magenta('│')} ${chalk.red(line)}`);
    }
    ctx.log(`${chalk.magenta('└──')} ${chalk.dim('End logs')}`);
}
