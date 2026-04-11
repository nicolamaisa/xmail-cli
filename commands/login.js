import chalk from 'chalk';

/**
 * @param {AppContext} ctx
 * @param {CommandInvocation | undefined} invocation
 */
export async function runLogin(ctx, invocation) {
  const target = invocation?.args?.[0]?.toLowerCase() || "";

  if (target !== "api") {
    ctx.log(`${chalk.red("✖")} Uso: ${chalk.cyan("/login api")}`);
    return;
  }

  const currentSession = ctx.appState.getApiSession();

  ctx.flow.begin("XMail API Login");
  const introAccepted = await ctx.flow.askInfo({
    title: "API session bootstrap",
    content:
      "Questo flow esegue il login contro l'API del progetto e salva il token nella sessione della TUI.",
    instructions:
      "{gray-fg}{bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}",
  });

  if (!introAccepted) {
    ctx.flow.addNotice('{yellow-fg}⚠ Login API annullato{/yellow-fg}');
    ctx.flow.complete(true, 'Login cancelled', { hideCompletion: true });
    return;
  }

  const baseUrl = await ctx.flow.askUrl({
    id: "api_base_url",
    label: "API base URL",
    placeholder: "http://localhost:8000",
    value: currentSession.baseUrl,
    required: true,
  });

  if (!baseUrl) {
    ctx.flow.addNotice('{yellow-fg}⚠ Login API annullato{/yellow-fg}');
    ctx.flow.complete(true, 'Login cancelled', { hideCompletion: true });
    return;
  }

  const email = await ctx.flow.askText({
    id: "api_email",
    label: "User email",
    placeholder: "nicola@example.com",
    value: currentSession.email || "",
    required: true,
    validate(value) {
      return value.includes("@") ? null : "Insert a valid email.";
    },
  });

  if (!email) {
    ctx.flow.addNotice('{yellow-fg}⚠ Login API annullato{/yellow-fg}');
    ctx.flow.complete(true, 'Login cancelled', { hideCompletion: true });
    return;
  }

  const password = await ctx.flow.askPassword({
    label: "Password",
    placeholder: "Insert password",
    required: true,
  });

  if (!password) {
    ctx.flow.addNotice('{yellow-fg}⚠ Login API annullato{/yellow-fg}');
    ctx.flow.complete(true, 'Login cancelled', { hideCompletion: true });
    return;
  }

  ctx.flow.addReview("API login review", [
    { label: "Base URL", value: baseUrl },
    { label: "Email", value: email },
  ]);

  const confirmed = await ctx.flow.askConfirm({
    label: "Eseguire login API ora?",
    value: true,
    trueLabel: "Login",
    falseLabel: "Cancel",
  });

  if (!confirmed) {
    ctx.flow.addNotice('{yellow-fg}⚠ Login API annullato{/yellow-fg}');
    ctx.flow.complete(true, 'Login cancelled', { hideCompletion: true });
    return;
  }

  /** @type {unknown} */
  let result = null;
  let loginPassword = password;
  const maxAttempts = 3;
  let attempts = 0;

  while (true) {
    try {
      attempts += 1;
      result = await ctx.flow.runProcessStep(
        "API login",
        async ({ append }) => {
          append(`POST ${baseUrl}/auth/v1/token?grant_type=password`);

          const response = await fetch(
            `${baseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email,
                password: loginPassword,
              }),
            },
          );

          const payload = await response.json().catch(() => ({}));

          if (!response.ok || !payload?.access_token) {
            const message =
              payload?.msg ||
              payload?.message ||
              `Login failed with HTTP ${response.status}`;
            throw new Error(message);
          }

          append("token received");

          ctx.appState.setApiSession({
            baseUrl,
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token || null,
            email,
            user: payload.user || null,
            lastLoginAt: new Date().toISOString(),
          });

          ctx.appState.setCheck("api_login", {
            ok: true,
            email,
            at: new Date().toISOString(),
          });

          return {
            status: "success",
            footer: chalk.green("session stored in TUI state"),
            value: payload,
          };
        },
        {
          maxVisibleLines: 4,
          selfClosing: true,
        },
      );
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      ctx.flow.addInfo(
        "Login failed",
        `Autenticazione fallita: ${message}\nTentativo ${attempts}/${maxAttempts}. Controlla credenziali o endpoint API.`,
      );

      if (attempts >= maxAttempts) {
        ctx.flow.addInfo(
          "Max attempts reached",
          "Hai raggiunto il limite di 3 tentativi. Rilancia /login api per riprovare.",
        );
        ctx.flow.addNotice('{yellow-fg}⚠ Login API interrotto (limite tentativi raggiunto){/yellow-fg}');
        ctx.flow.complete(true, "Login failed", { hideCompletion: true });
        return;
      }

      const retry = await ctx.flow.askConfirm({
        label: `Vuoi riprovare con una nuova password? (${maxAttempts - attempts} tentativi rimasti)`,
        value: true,
        trueLabel: "Retry",
        falseLabel: "Stop",
      });

      if (!retry) {
        ctx.flow.addNotice('{yellow-fg}⚠ Login API interrotto{/yellow-fg}');
        ctx.flow.complete(true, "Login failed", { hideCompletion: true });
        return;
      }

      const nextPassword = await ctx.flow.askPassword({
        label: "Password",
        placeholder: "Insert password",
        required: true,
      });

      if (!nextPassword) {
        ctx.flow.addNotice('{yellow-fg}⚠ Login API annullato{/yellow-fg}');
        ctx.flow.complete(true, 'Login cancelled', { hideCompletion: true });
        return;
      }

      loginPassword = nextPassword;
    }
  }

  if (result) {
    ctx.flow.addReview("Stored session", [
      { label: "Email", value: email },
      { label: "Base URL", value: baseUrl },
      { label: "Token", value: "stored in memory" },
    ]);
  }

  ctx.flow.complete(true, "Login completed");
}
