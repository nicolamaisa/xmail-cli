import os from 'os';
import { exec } from 'child_process';
import { XMAIL_ROOT } from './xmail-control.js';

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

/**
 * @param {'valid' | 'grace' | 'expired' | 'revoked' | 'compromised' | 'missing' | 'invalid' | string} status
 * @param {string | null | undefined} plan
 * @returns {{ state: 'healthy' | 'started' | 'error' | 'unknown', label: string, hint?: string }}
 */
function buildLicenseStateFromApi(status, plan) {
    const normalizedStatus = String(status || 'unknown').toLowerCase();
    const normalizedPlan = plan ? String(plan) : null;

    if (normalizedStatus === 'valid') {
        return {
            state: 'healthy',
            label: `${normalizedPlan || 'plan?'} • valid`
        };
    }

    if (normalizedStatus === 'grace') {
        return {
            state: 'started',
            label: `${normalizedPlan || 'plan?'} • grace`
        };
    }

    if (normalizedStatus === 'missing' || normalizedStatus === 'invalid') {
        return {
            state: 'error',
            label: normalizedStatus,
            hint: 'license non valida o assente'
        };
    }

    if (normalizedStatus === 'revoked' || normalizedStatus === 'expired' || normalizedStatus === 'compromised') {
        return {
            state: 'error',
            label: normalizedStatus
        };
    }

    return {
        state: 'unknown',
        label: 'unknown'
    };
}

/**
 * @param {{ baseUrl?: string | null, accessToken?: string | null }} [apiSession]
 * @returns {Promise<{ state: 'healthy' | 'started' | 'error' | 'unknown', label: string, hint?: string }>}
 */
async function fetchLicenseStateFromApi(apiSession) {
    const accessToken = apiSession?.accessToken || null;
    const baseUrl = (apiSession?.baseUrl || '').replace(/\/$/, '');

    if (!accessToken || !baseUrl) {
        return {
            state: 'unknown',
            label: 'unknown',
            hint: 'esegui /login api per status'
        };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
        const response = await fetch(`${baseUrl}/api/v1/app/license/internal-state`, {
            method: 'GET',
            headers: {
                authorization: `Bearer ${accessToken}`
            },
            signal: controller.signal
        });

        if (!response.ok) {
            return {
                state: 'error',
                label: `api ${response.status}`,
                hint: 'verifica sessione /login api'
            };
        }

        const payload = await response.json().catch(() => ({}));
        const state = payload?.state || null;
        if (!state || typeof state !== 'object') {
            return {
                state: 'started',
                label: 'syncing',
                hint: 'x-api non ha ancora caricato la licenza'
            };
        }

        return buildLicenseStateFromApi(state.status, state.plan);
    } catch {
        return {
            state: 'error',
            label: 'api unreachable',
            hint: 'controlla x-api o base URL'
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

/** @param {string} command @returns {Promise<string>} */
function execCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: XMAIL_ROOT }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(String(stdout || '').trim());
        });
    });
}

/**
 * @param {{ baseUrl?: string | null, accessToken?: string | null }} [apiSession]
 * @returns {Promise<{ containers: Array<{ name: string, status: string, cpu: string, memory: string, state: 'healthy' | 'started' | 'error' }>, license: { state: 'healthy' | 'started' | 'error' | 'unknown', label: string, hint?: string }, error?: string, system: { totalMemory: number, freeMemory: number, load: number[] } }>}
 */
export async function fetchStatusPanelState(apiSession) {
    try {
        const [psOutput, statsOutput, license] = await Promise.all([
            execCommand(`docker compose ps -a --format "{{.Names}}|{{.Status}}"`),
            execCommand(`docker compose stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"`),
            fetchLicenseStateFromApi(apiSession)
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
            license,
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
            license: {
                state: 'unknown',
                label: 'unavailable',
                hint: 'esegui /login api per status'
            },
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
 * @param {{ containers: Array<{ name: string, status: string, cpu: string, memory: string, state: 'healthy' | 'started' | 'error' }>, license: { state: 'healthy' | 'started' | 'error' | 'unknown', label: string, hint?: string }, error?: string, system: { totalMemory: number, freeMemory: number, load: number[] } }} statusState
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
