/**
 * @typedef {{
 *   type: 'text',
 *   content: string
 * } | {
 *   type: 'live',
 *   id: string,
 *   content: string
 * } | {
 *   type: 'process',
 *   id: string,
 *   title: string,
 *   status: 'running' | 'success' | 'error',
 *   lines: string[],
 *   maxVisibleLines: number,
 *   maxBufferedLines: number,
 *   footer: string,
 *   variant: 'footer' | 'compact',
 *   spinFrame: number,
 *   startedAt: number,
 *   elapsedMs?: number,
 *   selfClosing: boolean
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
    /** @type {ReturnType<typeof setInterval> | null} */
    let spinnerTimer = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let scheduledRender = null;

    /**
     * @param {string} value
     * @returns {string}
     */
    function stripTags(value) {
        return value.replace(/\{\/?[^}]+\}/g, '');
    }

    /**
     * @returns {number}
     */
    function getPromptWidth() {
        const width = typeof logArea?.width === 'number'
            ? logArea.width
            : typeof logArea?.width === 'string'
                ? Number.parseInt(logArea.width, 10)
                : 80;

        return Math.max(24, width - 6);
    }

    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

    /**
     * @param {number} elapsedMs
     * @returns {string}
     */
    function formatElapsed(elapsedMs) {
        if (elapsedMs < 1000) {
            return `${elapsedMs}ms`;
        }

        return `${(elapsedMs / 1000).toFixed(1)}s`;
    }

    function hasRunningProcesses() {
        return entries.some((entry) => entry.type === 'process' && entry.status === 'running');
    }

    /**
     * @param {Extract<LogEntry, { type: 'process' }>} entry
     * @returns {string}
     */
    function buildCollapsedProcessLine(entry) {
        const color = entry.status === 'error' ? 'red-fg' : 'green-fg';
        const prefix = entry.status === 'error' ? '✖' : '✔';
        const suffix = typeof entry.elapsedMs === 'number'
            ? ` {gray-fg}(${formatElapsed(entry.elapsedMs)}){/gray-fg}`
            : '';
        return `{${color}}${prefix} ${entry.title}{/${color}}${suffix}`;
    }

    function syncSpinner() {
        if (hasRunningProcesses()) {
            if (spinnerTimer) {
                return;
            }

            spinnerTimer = setInterval(() => {
                let changed = false;

                for (const entry of entries) {
                    if (entry.type === 'process' && entry.status === 'running') {
                        entry.spinFrame = (entry.spinFrame + 1) % frames.length;
                        changed = true;
                    }
                }

                if (changed) {
                    renderLogs();
                }
            }, 120);
            return;
        }

        if (spinnerTimer) {
            clearInterval(spinnerTimer);
            spinnerTimer = null;
        }
    }

    function renderLogs() {
        /** @type {string[]} */
        const lines = [];

        for (const entry of entries) {
            if (entry.type === 'text') {
                lines.push(entry.content);
                continue;
            }

            if (entry.type === 'live') {
                lines.push(entry.content);
                continue;
            }

            const visible = entry.lines.slice(-entry.maxVisibleLines);
            const padded = [...visible];

            while (padded.length < entry.maxVisibleLines) {
                padded.unshift('');
            }

            const frameColor = entry.status === 'error'
                ? 'red-fg'
                : entry.status === 'running'
                    ? 'yellow-fg'
                    : 'green-fg';
            const footerColor = frameColor;
            const titlePrefix = entry.status === 'running'
                ? `${frames[entry.spinFrame % frames.length]} `
                : entry.status === 'error'
                    ? '✖ '
                    : '✔ ';
            const titleSuffix = entry.status === 'running' || typeof entry.elapsedMs !== 'number'
                ? ''
                : ` {gray-fg}(${formatElapsed(entry.elapsedMs)}){/gray-fg}`;

            lines.push(`{${frameColor}}♢ ${titlePrefix}${entry.title}{/${frameColor}}${titleSuffix}`);

            for (const line of padded) {
                lines.push(`{gray-fg}│{/gray-fg} ${line}`);
            }

            if (entry.variant === 'compact') {
                lines.push(`{${footerColor}}└{/${footerColor}}`);
            } else {
                lines.push(`{${footerColor}}└ ${entry.footer}{/${footerColor}}`);
            }
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

    function scheduleRender() {
        if (scheduledRender) {
            return;
        }

        scheduledRender = setTimeout(() => {
            scheduledRender = null;
            renderLogs();
        }, 50);
    }

    return {
        clear(message = 'Console pulita.') {
            entries.length = 0;
            syncSpinner();
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

        createLiveLine(content = '') {
            const id = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            entries.push({
                type: 'live',
                id,
                content
            });

            renderLogs();

            return {
                id,
                set(nextContent) {
                    const entry = entries.find(
                        (current) => current.type === 'live' && current.id === id
                    );

                    if (!entry || entry.type !== 'live') {
                        return;
                    }

                    entry.content = nextContent;
                    renderLogs();
                },

                append(nextContent) {
                    const entry = entries.find(
                        (current) => current.type === 'live' && current.id === id
                    );

                    if (!entry || entry.type !== 'live') {
                        return;
                    }

                    entry.content += nextContent;
                    renderLogs();
                },

                finish(nextContent) {
                    const entry = entries.find(
                        (current) => current.type === 'live' && current.id === id
                    );

                    if (!entry || entry.type !== 'live') {
                        return;
                    }

                    entry.content = nextContent;
                    renderLogs();
                },

                remove() {
                    const index = entries.findIndex(
                        (current) => current.type === 'live' && current.id === id
                    );

                    if (index === -1) {
                        return;
                    }

                    entries.splice(index, 1);
                    renderLogs();
                }
            };
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
                maxBufferedLines: options.maxBufferedLines ?? 400,
                footer: options.footer ?? 'running...',
                variant: options.variant ?? 'footer',
                spinFrame: 0,
                startedAt: Date.now(),
                selfClosing: options.selfClosing ?? false
            });

            syncSpinner();
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
            if (entry.lines.length > entry.maxBufferedLines) {
                entry.lines.splice(0, entry.lines.length - entry.maxBufferedLines);
            }
            scheduleRender();
        },

        finishProcessLog(id, footer = 'Completed', status = 'success') {
            const entry = entries.find(
                (current) => current.type === 'process' && current.id === id
            );

            if (!entry || entry.type !== 'process') {
                return;
            }

            entry.status = status;
            entry.footer = footer;
            entry.elapsedMs = Math.max(0, Date.now() - entry.startedAt);
            syncSpinner();

            if (entry.selfClosing) {
                const index = entries.findIndex(
                    (current) => current.type === 'process' && current.id === id
                );

                if (index !== -1) {
                    entries[index] = {
                        type: 'text',
                        content: buildCollapsedProcessLine(entry)
                    };
                }
            }

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

        getPromptWidth() {
            return getPromptWidth();
        },

        getPlainText() {
            /** @type {string[]} */
            const lines = [];

            for (const entry of entries) {
                if (entry.type === 'text') {
                    lines.push(stripTags(entry.content));
                    continue;
                }

                if (entry.type === 'live') {
                    lines.push(stripTags(entry.content));
                    continue;
                }

                const suffix = typeof entry.elapsedMs === 'number'
                    ? ` (${formatElapsed(entry.elapsedMs)})`
                    : '';
                lines.push(`┌ ${entry.title}${suffix}`);
                for (const line of entry.lines) {
                    lines.push(`│ ${stripTags(line)}`);
                }
                if (entry.variant === 'compact') {
                    lines.push('└');
                } else {
                    lines.push(`└ ${stripTags(entry.footer)}`);
                }
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
