/**
 * @param {FlowStore} flow
 * @param {AppStateStore} appState
 * @param {{ title?: string, message?: string }} [options]
 * @returns {Promise<boolean>}
 */
export async function requireApiLogin(flow, appState, options = {}) {
  const session = appState.getApiSession();
  if (session.accessToken) {
    return true;
  }

  await flow.askInfo({
    title: options.title || "API login required",
    content:
      options.message ||
      "Questa operazione richiede una sessione API attiva.\nEsegui /login api e poi rilancia il flow.",
    instructions:
      "{gray-fg}{bold}Enter{/bold} close  {bold}Esc{/bold} cancel{/gray-fg}",
  });

  return false;
}
