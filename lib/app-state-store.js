/**
 * @returns {AppStateStore}
 */
export function createAppStateStore() {
  /** @type {AppState} */
  const state = {
    api: {
      baseUrl: "http://localhost:8000",
      accessToken: null,
      refreshToken: null,
      email: null,
      user: null,
      lastLoginAt: null,
    },
    checks: {},
  };

  return {
    getState() {
      return state;
    },

    getApiSession() {
      return state.api;
    },

    setApiSession(session) {
      state.api = {
        ...state.api,
        ...session,
      };
    },

    clearApiSession() {
      state.api = {
        ...state.api,
        accessToken: null,
        refreshToken: null,
        email: null,
        user: null,
        lastLoginAt: null,
      };
    },

    setCheck(key, value) {
      state.checks[key] = value;
    },
  };
}
