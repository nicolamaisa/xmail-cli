import { COMMANDS } from '../constants/commands.js';


/** @param {string} value */
export function getCommandSplashSuggestions(value) {
    const query = (value || '').trim().toLowerCase();

    if (!query.startsWith('/')) return [];

    return COMMANDS.filter(cmd => cmd.id.startsWith(query)).slice(0, 3);
}

/** @param {string} value */
export function getCommandSuggestions(value) {
    const query = (value || '').trim().toLowerCase();

    if (!query.startsWith('/')) return [];

    return COMMANDS.filter(cmd => cmd.id.startsWith(query));

}
