import { COMMANDS } from '../constants/commands.js';


/**
 * @param {string} value
 * @param {string[]} [allowedCommands]
 */
export function getCommandSplashSuggestions(value, allowedCommands = []) {
    const query = (value || '').trim().toLowerCase();

    if (!query.startsWith('/')) return [];

    const whitelist = allowedCommands.length > 0
        ? new Set(allowedCommands.map((cmd) => cmd.toLowerCase()))
        : null;

    return COMMANDS
        .filter(cmd => (whitelist ? whitelist.has(cmd.id.toLowerCase()) : true))
        .filter(cmd => cmd.id.startsWith(query))
        .slice(0, 3);
}

/** @param {string} value */
export function getCommandSuggestions(value) {
    const query = (value || '').trim().toLowerCase();

    if (!query.startsWith('/')) return [];

    return COMMANDS.filter(cmd => cmd.id.startsWith(query));

}
