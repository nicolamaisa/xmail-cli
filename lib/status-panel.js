import os from 'os';
import { exec } from 'child_process';

/**
 * @param {number} value
 * @returns {string}
 */
function formatBytes(value) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let current = value;
    let index = 0;

    while (current >= 1024 && index < units.length - 1) {
        current /= 1024;
        index += 1;
    }

    return `${current.toFixed(index === 0 ? 0 : 1)}${units[index]}`;
}

/**
 * @param {string} memoryUsage
 * @returns {string}
 */
function normalizeMemoryUsage(memoryUsage) {
    return memoryUsage.replace(/\s+/g, ' ');
}

/**
 * @param {string} status
 * @returns {'healthy' | 'started' | 'error'}
 */
function classifyContainerStatus(status) {
    const normalized = status.toLowerCase();

    if (normalized.includes('healthy')) {
        return 'healthy';
    }

    if (
        normalized.includes('unhealthy') ||
        normalized.includes('exited') ||
        normalized.includes('dead') ||
        normalized.includes('restarting')
    ) {
        return 'error';
    }

    return 'started';
}

/**
 * @param {'healthy' | 'started' | 'error'} state
 * @param {number} pulseFrame
 * @returns {string}
 */
function renderStatusDot(state, pulseFrame) {
    if (state === 'healthy') {
        const symbol = pulseFrame % 2 === 0 ? '◈' : '◆';
        return `{green-fg}${symbol}{/green-fg}`;
    }

    if (state === 'started') {
        return '{green-fg}◇{/green-fg}';
    }

    return '{red-fg}◆{/red-fg}';
}

/** @param {string} command @returns {Promise<string>} */
function execCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: '/opt' }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(String(stdout || '').trim());
        });
    });
}

/**
 * @returns {Promise<{ containers: Array<{ name: string, status: string, cpu: string, memory: string, state: 'healthy' | 'started' | 'error' }>, error?: string, system: { totalMemory: number, freeMemory: number, load: number[] } }>}
 */
export async function fetchStatusPanelState() {
    try {
        const [psOutput, statsOutput] = await Promise.all([
            execCommand(`docker ps -a --format "{{.Names}}|{{.Status}}"`),
            execCommand(`docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"`)
        ]);

        const statsMap = new Map(
            statsOutput
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [name, cpu, memory] = line.split('|');
                    return [name, { cpu: cpu || 'n/a', memory: normalizeMemoryUsage(memory || 'n/a') }];
                })
        );

        const containers = psOutput
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                const [name, status] = line.split('|');
                const stats = statsMap.get(name) || { cpu: 'n/a', memory: 'n/a' };
                return {
                    name,
                    status: status || 'unknown',
                    state: classifyContainerStatus(status || 'unknown'),
                    cpu: stats.cpu,
                    memory: stats.memory
                };
            });

        return {
            containers,
            system: {
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                load: os.loadavg()
            }
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            containers: [],
            error: message.includes('permission denied') ? 'docker access denied' : 'docker unavailable',
            system: {
                totalMemory: os.totalmem(),
                freeMemory: os.freemem(),
                load: os.loadavg()
            }
        };
    }
}

/**
 * @param {{ containers: Array<{ name: string, status: string, cpu: string, memory: string, state: 'healthy' | 'started' | 'error' }>, error?: string, system: { totalMemory: number, freeMemory: number, load: number[] } }} statusState
 * @param {number} [pulseFrame]
 * @returns {string[]}
 */
export function renderStatusPanelLines(statusState, pulseFrame = 0) {
    const usedMemory = statusState.system.totalMemory - statusState.system.freeMemory;
    const sortedContainers = [...statusState.containers].sort((left, right) => left.name.localeCompare(right.name));
    const activeContainers = sortedContainers.filter((container) => container.status.toLowerCase().startsWith('up')).length;

    /** @type {string[]} */
    const lines = [
        '{red-fg}XMail runtime{/red-fg}',
        '',
        '{gray-fg}System{/gray-fg}',
        `  Host mem: ${formatBytes(usedMemory)} / ${formatBytes(statusState.system.totalMemory)}`,
        `  Load avg: ${statusState.system.load.map((value) => value.toFixed(2)).join('  ')}`,
        ''
    ];

    if (statusState.error) {
        lines.push('{gray-fg}Containers{/gray-fg}');
        lines.push(`  ${statusState.error}`);
        return lines;
    }

    lines.push('{gray-fg}Containers{/gray-fg}');
    lines.push(`  Active: ${activeContainers} / ${sortedContainers.length}`);
    lines.push('  Click panel + use wheel / arrows');
    lines.push('');

    if (sortedContainers.length === 0) {
        lines.push('  no running containers');
        return lines;
    }

    for (const container of sortedContainers) {
        const dot = renderStatusDot(container.state, pulseFrame);
        lines.push(`${dot} {cyan-fg}${container.name}{/cyan-fg}`);
        lines.push(`  ${container.status} | CPU ${container.cpu} | MEM ${container.memory}`);
        lines.push('');
    }

    return lines;
}
