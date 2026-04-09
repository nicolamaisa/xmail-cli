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
  state: Record<string, unknown>;
  log: (message: string) => void;
  quit: () => void;
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
    options?: { maxVisibleLines?: number; footer?: string },
  ) => string;
  appendProcessLog: (id: string, line: string) => void;
  finishProcessLog: (id: string, footer?: string) => void;
  setPromptBlock: (lines: string[]) => void;
  clearPromptBlock: () => void;
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
