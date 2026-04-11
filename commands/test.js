import chalk from 'chalk';

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
        ctx.log(chalk.yellow('Test annullato.'));
        return;
    }


    const firstAnswer = await ctx.flow.askSelect({
        label: 'Avviare il primo processo finto?',
        options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' }
        ],
        value: 'yes'
    });

    if (!firstAnswer || firstAnswer !== 'yes') {
        ctx.flow.complete(true);
        ctx.log(chalk.yellow('Test annullato.'));
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
        label: 'Quali hook demo vuoi abilitare?',
        options: [
            { label: 'boot-md', value: 'boot-md' },
            { label: 'command-logger', value: 'command-logger' },
            { label: 'session-memory', value: 'session-memory' }
        ],
        value: ['command-logger']
    });

    if (!selectedHooks) {
        ctx.flow.complete(true);
        ctx.log(chalk.yellow('Test annullato.'));
        return;
    }

    const secondAnswer = await ctx.flow.askSelect({
        label: 'Vuoi eseguire anche il secondo processo demo con gli hook selezionati?',
        options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' }
        ],
        value: 'yes'
    });

    if (secondAnswer === 'yes') {
        const secondProcessId = ctx.flow.startProcess('Cleanup Demo', {
            maxVisibleLines: 4
        });

        await wait(200);
        ctx.flow.appendProcess(
            secondProcessId,
            `enabled hooks: ${selectedHooks.join(', ') || 'none'}`
        );
        await wait(250);
        ctx.flow.appendProcess(secondProcessId, 'removing temp files...');
        await wait(300);
        ctx.flow.finishProcess(secondProcessId, 'success', chalk.green('cleanup completed'));
    }

    ctx.flow.complete(true);
}
