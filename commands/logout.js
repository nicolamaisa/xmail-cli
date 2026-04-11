import chalk from 'chalk';

/**
 * @param {AppContext} ctx
 * @param {CommandInvocation | undefined} invocation
 */
export async function runLogout(ctx, invocation) {
    const target = invocation?.args?.[0]?.toLowerCase() || "";

    if (target !== "api") {
        ctx.log(`${chalk.red("✖")} Uso: ${chalk.cyan("/logout api")}`);
        return;
    }

    const currentSession = ctx.appState.getApiSession();
    if (!currentSession.accessToken) {
        ctx.log(`${chalk.yellow('⚠')} Nessuna sessione API attiva. Usa ${chalk.cyan('/login api')} prima di fare logout.`);
        return;
    }

    ctx.flow.begin("XMail API Logout");
    const introAccepted = await ctx.flow.askInfo({
        title: "API session bootstrap",
        content:
            "Questo flow esegue il logout contro l'API del progetto e rimuove il token dalla sessione della TUI.",
        instructions:
            "{gray-fg}{bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}",
    });

    if (!introAccepted) {
        ctx.flow.addNotice('{yellow-fg}⚠ Logout API annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Logout cancelled', { hideCompletion: true });
        return;
    }

    const confirmed = await ctx.flow.askConfirm({
        label: "Eseguire logout API ora?",
        value: true,
        trueLabel: "Logout",
        falseLabel: "Cancel",
    });

    if (!confirmed) {
        ctx.flow.addNotice('{yellow-fg}⚠ Logout API annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Logout cancelled', { hideCompletion: true });
        return;
    }

    await ctx.flow.runProcessStep(
        "API logout",
        async ({ append }) => {
            append("Eseguendo logout API...");
            await new Promise((resolve) => setTimeout(resolve, 600));

            ctx.appState.clearApiSession();
            ctx.appState.setCheck("api_login", {
                ok: false,
                email: null,
                at: new Date().toISOString(),
            });

            return {
                status: "success",
                footer: chalk.green("session cleared from TUI state"),
            };
        },
        {
            maxVisibleLines: 4,
            selfClosing: true,
        },
    );

    ctx.flow.complete(true, "Logout completed");
}
