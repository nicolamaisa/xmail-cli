import chalk from 'chalk';
import { requireApiLogin } from '../lib/flow-guards.js';

/** @param {number} ms */
function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** @param {AppContext} ctx */
export async function runTest(ctx) {
    ctx.flow.begin('Fake Test Runner');
    ctx.flow.addInfo('Prompt demo', 'Questo flow mescola domande e processi nello stesso albero.');
    const infoAccepted = await ctx.flow.askInfo({
        title: 'Security warning',
        content: 'Leggi questa nota prima di continuare.',
        instructions:
            '{gray-fg}{bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}',
    });

    if (!infoAccepted) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    const canContinue = await requireApiLogin(ctx.flow, ctx.appState, {
        title: 'API login missing',
        message:
            'Questo demo testa anche le guardie di stato globale.\nEsegui /login api e poi rilancia /test.',
    });

    if (!canContinue) {
        ctx.flow.addNotice('{yellow-fg}API login missing.{/yellow-fg}');
        ctx.flow.complete(true, 'API login required', { hideCompletion: true });
        return;
    }

    const firstAnswer = await ctx.flow.askConfirm({
        id: 'run_first_process',
        label: 'Avviare il primo processo finto?',
        value: true
    });

    if (!firstAnswer) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    const firstProcessId = ctx.flow.startProcess('Test Suite', {
        selfClosing: true,
        maxVisibleLines: 4
    });

    await wait(150);
    ctx.flow.appendProcess(firstProcessId, 'collecting tests...');
    await wait(350);
    ctx.flow.appendProcess(firstProcessId, 'running mail sync tests...');
    await wait(350);
    ctx.flow.appendProcess(firstProcessId, 'running mail sync tests...');
    await wait(1400);
    ctx.flow.appendProcess(firstProcessId, 'running mail sync tests...');
    await wait(1350);
    ctx.flow.finishProcess(firstProcessId, 'success', chalk.green('12 tests passed'));
    await (wait(500));

    const selectedHooks = await ctx.flow.askMultiSelect({
        id: 'hooks',
        label: 'Quali hook demo vuoi abilitare?',
        options: [
            { label: 'boot-md', value: 'boot-md' },
            { label: 'command-logger', value: 'command-logger' },
            { label: 'session-memory', value: 'session-memory' }
        ],
        value: ['command-logger'],
        instructions:
            '{gray-fg}{bold}Up/Down{/bold} move  {bold}Space{/bold} toggle  {bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}',
    });

    if (!selectedHooks) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    const projectName = await ctx.flow.askText({
        id: 'project_name',
        label: 'Project name',
        placeholder: 'xmail-prod',
        value: 'xmail-demo',
        required: true,
        validate(value) {
            if (!/^[a-z0-9-]+$/i.test(value)) {
                return 'Use only letters, numbers and dashes.';
            }

            return null;
        }
    });

    if (!projectName) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    const dbPassword = await ctx.flow.askPassword({
        id: 'db_password',
        label: 'DB password',
        placeholder: 'Insert password',
        required: true,
        validate(value) {
            if (value.length < 8) {
                return 'Password must be at least 8 chars.';
            }

            return null;
        }
    });

    if (!dbPassword) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    const publicUrl = await ctx.flow.askUrl({
        id: 'public_url',
        label: 'Public URL',
        placeholder: 'https://mail.example.com',
        value: 'https://xmail.local',
        required: true
    });

    if (!publicUrl) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    const port = await ctx.flow.askNumber({
        id: 'port',
        label: 'HTTP port',
        placeholder: '8080',
        value: 8080,
        required: true,
        integer: true,
        min: 1,
        max: 65535
    });

    if (port === null) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    const extraProcesses = await ctx.flow.askMultiSelect({
        id: 'extra_processes',
        label: 'Quali processi aggiuntivi vuoi eseguire?',
        options: [
            { label: 'Processo 3', value: 'process-3' },
            { label: 'Processo 4', value: 'process-4' },
            { label: 'Processo 5', value: 'process-5' }
        ],
        value: ['process-3']
    });

    if (!extraProcesses) {
        ctx.flow.addNotice('{yellow-fg}⚠ Test annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Test cancelled', { hideCompletion: true });
        return;
    }

    ctx.flow.addReview('Review demo', [
        { label: 'Project name', value: projectName },
        { label: 'Public URL', value: publicUrl },
        { label: 'Port', value: String(port) },
        { label: 'Hooks', value: selectedHooks.join(', ') || 'none' },
        { label: 'Extra processes', value: extraProcesses.join(', ') || 'none' },
    ]);

    const secondAnswer = await ctx.flow.askConfirm({
        id: 'run_cleanup',
        label: 'Vuoi eseguire anche il secondo processo demo con gli hook selezionati?',
        value: true,
        trueLabel: 'Run',
        falseLabel: 'Skip'
    });

    if (secondAnswer) {
        await ctx.flow.runProcessStep(
            'Cleanup Demo',
            async ({ append }) => {
                await wait(200);
                append(`enabled hooks: ${selectedHooks.join(', ') || 'none'}`);
                await wait(200);
                append(`project: ${projectName}`);
                await wait(200);
                append(`db password length: ${dbPassword.length}`);
                await wait(200);
                append(`public url: ${publicUrl}`);
                await wait(200);
                append(`http port: ${port}`);
                await wait(250);
                append('removing temp files...');
                await wait(300);

                return {
                    status: 'success',
                    footer: chalk.green('cleanup completed'),
                };
            },
            {
                maxVisibleLines: 4
            }
        );
    }

    for (const processName of extraProcesses) {
        await wait(500);
        await ctx.flow.runProcessStep(
            `Extra ${processName}`,
            async ({ append }) => {
                append(`starting ${processName}...`);
                await wait(250);
                append(`using hooks: ${selectedHooks.join(', ') || 'none'}`);
                await wait(250);
                append(`project scope: ${projectName}`);
                await wait(300);

                return {
                    status: 'success',
                    footer: chalk.green(`${processName} completed`),
                };
            },
            {
                selfClosing: true,
                maxVisibleLines: 4
            }
        );
    }

    const flowState = ctx.flow.getState();
    ctx.flow.addReview(
        'Structured flow state',
        Object.entries(flowState).map(([label, value]) => ({
            label,
            value: Array.isArray(value) ? value.join(', ') : String(value),
        }))
    );

    ctx.flow.complete(true, 'Test completed');
}
