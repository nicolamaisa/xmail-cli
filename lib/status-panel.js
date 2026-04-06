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
 * @returns {Promise<{ containers: Array<{ name: string, status: string, cpu: string, memory: string }>, error?: string }>}
 */
async function readDockerState() {
    try {
        const [psOutput, statsOutput] = await Promise.all([
            execCommand(`docker ps --format "{{.Names}}|{{.Status}}"`),
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
                    cpu: stats.cpu,
                    memory: stats.memory
                };
            });

        return { containers };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            containers: [],
            error: message.includes('permission denied') ? 'docker access denied' : 'docker unavailable'
        };
    }
}

/**
 * @returns {Promise<string[]>}
 */
export async function buildStatusPanelLines() {
    const dockerState = await readDockerState();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const load = os.loadavg();

    /** @type {string[]} */
    const lines = [
        '{red-fg}XMail runtime{/red-fg}',
        '',
        '{gray-fg}System{/gray-fg}',
        `  Host mem: ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}`,
        `  Load avg: ${load.map((value) => value.toFixed(2)).join('  ')}`,
        ''
    ];

    if (dockerState.error) {
        lines.push('{gray-fg}Containers{/gray-fg}');
        lines.push(`  ${dockerState.error}`);
        return lines;
    }

    lines.push('{gray-fg}Containers{/gray-fg}');
    lines.push(`  Active: ${dockerState.containers.length}`);
    lines.push('');

    if (dockerState.containers.length === 0) {
        lines.push('  no running containers');
        return lines;
    }

    for (const container of dockerState.containers) {
        lines.push(`{cyan-fg}${container.name}{/cyan-fg}`);
        lines.push(`  ${container.status}`);
        lines.push(`  CPU: ${container.cpu}`);
        lines.push(`  MEM: ${container.memory}`);
        lines.push('');
    }

    return lines;
}
