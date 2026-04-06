/**
 * @typedef {{
 *   type: 'text',
 *   content: string
 * } | {
 *   type: 'process',
 *   id: string,
 *   title: string,
 *   status: 'running' | 'done',
 *   lines: string[],
 *   maxVisibleLines: number,
 *   footer: string
 * }} LogEntry
 */

/**
 * @param {any} logArea
 * @param {any} screen
 * @returns {LogStore}
 */
export function createLogStore(logArea, screen) {
    /** @type {LogEntry[]} */
    const entries = [];
    /** @type {string[]} */
    let promptBlock = [];

    /**
     * @param {string} value
     * @returns {string}
     */
    function stripTags(value) {
        return value.replace(/\{\/?[^}]+\}/g, '');
    }

    function renderLogs() {
        /** @type {string[]} */
        const lines = [];

        for (const entry of entries) {
            if (entry.type === 'text') {
                lines.push(entry.content);
                continue;
            }

            const visible = entry.lines.slice(-entry.maxVisibleLines);
            const padded = [...visible];

            while (padded.length < entry.maxVisibleLines) {
                padded.unshift('');
            }

            const frameColor = entry.status === 'running' ? 'yellow-fg' : 'green-fg';
            const footerColor = entry.status === 'running' ? 'yellow-fg' : 'green-fg';

            lines.push(`{${frameColor}}┌ ${entry.title}{/${frameColor}}`);

            for (const line of padded) {
                lines.push(`{gray-fg}│{/gray-fg} ${line}`);
            }

            lines.push(`{${footerColor}}└ ${entry.footer}{/${footerColor}}`);
            lines.push('');
        }

        if (promptBlock.length > 0) {
            if (lines.length > 0 && lines[lines.length - 1] !== '') {
                lines.push('');
            }

            lines.push(...promptBlock);
        }

        logArea.setContent(lines.join('\n'));
        logArea.setScrollPerc(100);
        screen.render();
    }

    return {
        clear(message = 'Console pulita.') {
            entries.length = 0;
            entries.push({
                type: 'text',
                content: `{gray-fg}${message}{/gray-fg}`
            });
            renderLogs();
        },

        logText(content) {
            entries.push({
                type: 'text',
                content
            });
            renderLogs();
        },

        startProcessLog(title, options = {}) {
            const id = `proc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            entries.push({
                type: 'process',
                id,
                title,
                status: 'running',
                lines: [],
                maxVisibleLines: options.maxVisibleLines ?? 3,
                footer: options.footer ?? 'running...'
            });

            renderLogs();
            return id;
        },

        appendProcessLog(id, line) {
            const entry = entries.find(
                (current) => current.type === 'process' && current.id === id
            );

            if (!entry || entry.type !== 'process') {
                return;
            }

            entry.lines.push(line);
            renderLogs();
        },

        finishProcessLog(id, footer = 'Completed') {
            const entry = entries.find(
                (current) => current.type === 'process' && current.id === id
            );

            if (!entry || entry.type !== 'process') {
                return;
            }

            entry.status = 'done';
            entry.footer = footer;
            renderLogs();
        },

        setPromptBlock(lines) {
            promptBlock = [...lines];
            renderLogs();
        },

        clearPromptBlock() {
            promptBlock = [];
            renderLogs();
        },

        getPlainText() {
            /** @type {string[]} */
            const lines = [];

            for (const entry of entries) {
                if (entry.type === 'text') {
                    lines.push(stripTags(entry.content));
                    continue;
                }

                const visible = entry.lines.slice(-entry.maxVisibleLines);
                const padded = [...visible];

                while (padded.length < entry.maxVisibleLines) {
                    padded.unshift('');
                }

                lines.push(`┌ ${entry.title}`);
                for (const line of padded) {
                    lines.push(`│ ${stripTags(line)}`);
                }
                lines.push(`└ ${stripTags(entry.footer)}`);
                lines.push('');
            }

            if (promptBlock.length > 0) {
                if (lines.length > 0 && lines[lines.length - 1] !== '') {
                    lines.push('');
                }
                lines.push(...promptBlock.map(stripTags));
            }

            return lines.join('\n');
        }
    };
}
