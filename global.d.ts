type ColorPalette = {
  logo: string;
  testo: string;
  header: string;
  arancio: string;
  cian: string;
  bordo: string;
  sfondo: string;
};

type AppContext = {
  screen: any;
  logArea: any;
  dashInput: any;
  logs: LogStore;
  prompts: PromptStore;
  flow: FlowStore;
  appState: AppStateStore;
  state: Record<string, unknown>;
  log: (message: string) => void;
  quit: () => void;
};

type AppState = {
  api: {
    baseUrl: string;
    accessToken: string | null;
    refreshToken: string | null;
    email: string | null;
    user: unknown;
    lastLoginAt: string | null;
  };
  checks: Record<string, unknown>;
};

type AppStateStore = {
  getState: () => AppState;
  getApiSession: () => AppState["api"];
  setApiSession: (session: Partial<AppState["api"]>) => void;
  clearApiSession: () => void;
  setCheck: (key: string, value: unknown) => void;
};

type CommandInvocation = {
  raw: string;
  command: string;
  args: string[];
};

type CommandHandler = (
  ctx: AppContext,
  invocation?: CommandInvocation,
) => void | Promise<void>;

type SplashUi = {
  inputSplashBar: any;
  hintText: any;
  inputAccentLine: any;
  splashSuggestions: any;
  screen: any;
};

type LiveLogLine = {
  id: string;
  set: (nextContent: string) => void;
  append: (nextContent: string) => void;
  finish: (nextContent: string) => void;
  remove: () => void;
};

type DashboardUi = {
  dashInput: any;
  hintDashText: any;
  dashInputAccentLine: any;
  headerLicenseStatus: any;
  headerLicenseHint: any;
  dashSuggestionLines: any[];
  dashSuggestions: any;
  screen: any;
};

type LogStore = {
  clear: (message?: string) => void;
  logText: (content: string) => void;
  createLiveLine: (content?: string) => LiveLogLine;
  startProcessLog: (
    title: string,
    options?: {
      maxVisibleLines?: number;
      maxBufferedLines?: number;
      footer?: string;
      variant?: "footer" | "compact";
      selfClosing?: boolean;
    },
  ) => string;
  appendProcessLog: (id: string, line: string) => void;
  finishProcessLog: (
    id: string,
    footer?: string,
    status?: "success" | "error",
  ) => void;
  setPromptBlock: (lines: string[]) => void;
  clearPromptBlock: () => void;
  getPromptWidth: () => number;
  getPlainText: () => string;
};

type PromptChoice = {
  label: string;
  value: string;
};

type PromptEntry =
  | {
      type: "info";
      id: string;
      title: string;
      content: string;
    }
  | {
      type: "select";
      id: string;
      label: string;
      options: PromptChoice[];
      value?: string;
    }
  | {
      type: "multiselect";
      id: string;
      label: string;
      options: PromptChoice[];
      value?: string[];
    }
  | {
      type: "text" | "password";
      id: string;
      label: string;
      placeholder?: string;
      value?: string;
      required?: boolean;
    };

type PromptResult = Record<string, string | string[]>;

type PromptStore = {
  isActive: () => boolean;
  openForm: (definition: {
    title: string;
    entries: PromptEntry[];
    mode?: "single" | "history";
  }) => Promise<PromptResult | null>;
  close: () => void;
  handleKeypress: (
    ch?: string,
    key?: {
      name?: string;
      full?: string;
      sequence?: string;
      ctrl?: boolean;
      meta?: boolean;
      shift?: boolean;
    },
  ) => boolean;
};

type FlowStore = {
  isActive: () => boolean;
  begin: (title: string) => void;
  addInfo: (
    title: string,
    content: string,
    options?: { tone?: "info" | "warning" | "error" | "success" },
  ) => void;
  addReview: (
    title: string,
    items: Array<{ label: string; value: string }>,
  ) => void;
  addNotice: (content: string) => void;
  askInfo: (definition: {
    title: string;
    content: string;
    instructions?: string;
  }) => Promise<boolean | null>;
  askSelect: (definition: {
    id?: string;
    title?: string;
    label: string;
    options: PromptChoice[];
    value?: string;
    instructions?: string;
  }) => Promise<string | null>;
  askMultiSelect: (definition: {
    id?: string;
    title?: string;
    label: string;
    options: PromptChoice[];
    value?: string[];
    instructions?: string;
  }) => Promise<string[] | null>;
  askConfirm: (definition: {
    id?: string;
    title?: string;
    label: string;
    value?: boolean;
    trueLabel?: string;
    falseLabel?: string;
    instructions?: string;
  }) => Promise<boolean | null>;
  askText: (definition: {
    id?: string;
    title?: string;
    label: string;
    placeholder?: string;
    value?: string;
    required?: boolean;
    instructions?: string;
    validate?: (value: string) => string | null;
  }) => Promise<string | null>;
  askPassword: (definition: {
    id?: string;
    title?: string;
    label: string;
    placeholder?: string;
    value?: string;
    required?: boolean;
    instructions?: string;
    validate?: (value: string) => string | null;
  }) => Promise<string | null>;
  askNumber: (definition: {
    id?: string;
    title?: string;
    label: string;
    placeholder?: string;
    value?: number;
    required?: boolean;
    instructions?: string;
    integer?: boolean;
    min?: number;
    max?: number;
    validate?: (value: number) => string | null;
  }) => Promise<number | null>;
  askUrl: (definition: {
    id?: string;
    title?: string;
    label: string;
    placeholder?: string;
    value?: string;
    required?: boolean;
    instructions?: string;
    validate?: (value: string) => string | null;
  }) => Promise<string | null>;
  startProcess: (
    title: string,
    options?: {
      maxVisibleLines?: number;
      footer?: string;
      selfClosing?: boolean;
    },
  ) => string;
  appendProcess: (id: string, line: string) => void;
  finishProcess: (
    id: string,
    status?: "success" | "error",
    footer?: string,
  ) => void;
  runProcessStep: (
    title: string,
    worker: (helpers: {
      append: (line: string) => void;
      finish: (status?: "success" | "error", footer?: string) => void;
    }) => Promise<
      | void
      | {
          handled?: boolean;
          status?: "success" | "error";
          footer?: string;
          value?: unknown;
        }
    >,
    processOptions?: {
      maxVisibleLines?: number;
      footer?: string;
      selfClosing?: boolean;
    },
  ) => Promise<unknown>;
  getState: () => Record<string, unknown>;
  complete: (
    persist?: boolean,
    completionLabel?: string,
    options?: { hideCompletion?: boolean },
  ) => void;
  handleKeypress: (
    ch?: string,
    key?: {
      name?: string;
      full?: string;
      sequence?: string;
      ctrl?: boolean;
      meta?: boolean;
      shift?: boolean;
    },
  ) => boolean;
};
