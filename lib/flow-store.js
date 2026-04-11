import { renderInfoBox } from "./info-box.js";

/**
 * @param {LogStore} logs
 * @param {{ onOpen?: () => void, onClose?: () => void, onInstructionsChange?: (content: string) => void }} [options]
 * @returns {FlowStore}
 */
export function createFlowStore(logs, options = {}) {
  /**
   * @param {{ name?: string }} [key]
   * @returns {boolean}
   */
  function isEscapeKey(key) {
    return key?.name === "escape" || key?.name === "esc";
  }

  /**
   * @typedef {{
   *   type: 'info',
   *   title: string,
   *   content: string
   * } | {
   *   type: 'answer',
   *   label: string,
   *   value: string
   * } | {
   *   type: 'notice',
   *   content: string
   * } | {
   *   type: 'process',
   *   id: string,
   *   title: string,
   *   status: 'running' | 'success' | 'error',
   *   lines: string[],
   *   maxVisibleLines: number,
   *   footer: string,
   *   selfClosing: boolean,
   *   spinFrame: number,
   *   startedAt: number,
   *   elapsedMs?: number
   * }} FlowEntry
   */

  /**
   * @typedef {{
   *   type: 'select',
   *   id?: string,
   *   label: string,
   *   options: PromptChoice[],
   *   value: string,
   *   optionCursor: number,
   *   instructions?: string,
   *   resolve: (value: string | null) => void
   * } | {
   *   type: 'multiselect',
   *   id?: string,
   *   label: string,
   *   options: PromptChoice[],
   *   value: string[],
   *   optionCursor: number,
   *   instructions?: string,
   *   resolve: (value: string[] | null) => void
   * } | {
   *   type: 'text' | 'password',
   *   id?: string,
   *   label: string,
   *   value: string,
   *   placeholder?: string,
   *   required?: boolean,
   *   instructions?: string,
   *   validate?: (value: string) => string | null,
   *   validationError?: string,
   *   resolve: (value: string | null) => void
   * }} FlowQuestionEntry
   */

  /**
   * @typedef {{
   *   type: 'blocking-info',
   *   title: string,
   *   content: string,
   *   instructions: string,
   *   resolve: (value: boolean | null) => void
   * }} FlowInfoPromptEntry
   */

  /** @typedef {Extract<FlowEntry, { type: 'process' }>} FlowProcessEntry */

  /** @type {{ title: string, entries: Array<FlowEntry>, results: Record<string, unknown>, currentInfo: FlowInfoPromptEntry | null, currentQuestion: FlowQuestionEntry | null } | null} */
  let activeFlow = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let spinnerTimer = null;
  let ignoreEnterUntil = 0;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  /**
   * @param {number} elapsedMs
   * @returns {string}
   */
  function formatElapsed(elapsedMs) {
    if (elapsedMs < 1000) {
      return `${elapsedMs}ms`;
    }

    return `${(elapsedMs / 1000).toFixed(1)}s`;
  }

  function hasRunningProcesses() {
    return Boolean(
      activeFlow?.entries.some(
        (entry) => entry.type === "process" && entry.status === "running",
      ),
    );
  }

  function syncSpinner() {
    if (hasRunningProcesses()) {
      if (spinnerTimer) {
        return;
      }

      spinnerTimer = setInterval(() => {
        if (!activeFlow) {
          return;
        }

        let changed = false;
        for (const entry of activeFlow.entries) {
          if (entry.type === "process" && entry.status === "running") {
            entry.spinFrame = (entry.spinFrame + 1) % frames.length;
            changed = true;
          }
        }

        if (changed) {
          render();
        }
      }, 120);
      return;
    }

    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }
  }

  /**
   * @param {FlowEntry} entry
   * @returns {string}
   */
  function renderEntryMarker(entry) {
    if (entry.type !== "process") {
      return "{gray-fg}♢{/gray-fg}";
    }

    if (entry.status === "running") {
      return "{cyan-fg}♦{/cyan-fg}";
    }

    return entry.status === "error"
      ? "{gray-fg}♢{/gray-fg} {red-fg}✖{/red-fg}"
      : "{gray-fg}♢{/gray-fg} {green-fg}✔{/green-fg}";
  }

  /**
   * @param {FlowProcessEntry} entry
   * @returns {string[]}
   */
  function renderProcess(entry) {
    const frameColor =
      entry.status === "error"
        ? "red-fg"
        : entry.status === "running"
          ? "yellow-fg"
          : "green-fg";
    const titlePrefix =
      entry.status === "running" ? `${frames[entry.spinFrame % frames.length]} ` : "";
    const titleSuffix =
      entry.status === "running" || typeof entry.elapsedMs !== "number"
        ? ""
        : ` {gray-fg}(${formatElapsed(entry.elapsedMs)}){/gray-fg}`;
    const visible = entry.lines.slice(-entry.maxVisibleLines);
    const padded = [...visible];

    while (padded.length < entry.maxVisibleLines) {
      padded.unshift("");
    }

    if (entry.selfClosing && entry.status !== "running") {
      return [
        `${renderEntryMarker(entry)} {${frameColor}}${titlePrefix}${entry.title}{/${frameColor}}${titleSuffix}`,
      ];
    }

    return [
      `${renderEntryMarker(entry)} {${frameColor}}${titlePrefix}${entry.title}{/${frameColor}}${titleSuffix}`,
      ...padded.map((/** @type {string} */ line) => `{gray-fg}│{/gray-fg} {gray-fg}│{/gray-fg} ${line}`),
      `{gray-fg}│{/gray-fg} {${frameColor}}└{/${frameColor}} {${frameColor}}${entry.footer}{/${frameColor}}`,
    ];
  }

  /**
   * @param {FlowEntry} entry
   * @returns {string[]}
   */
  function renderEntry(entry) {
    if (entry.type === "info") {
      return renderInfoBox(entry.title, entry.content, {
        pointer: "{gray-fg}♢{/gray-fg}",
        maxWidth: logs.getPromptWidth(),
      });
    }

    if (entry.type === "answer") {
      return [
        `{gray-fg}♢{/gray-fg} {red-fg}${entry.label}{/red-fg}`,
        `{gray-fg}│{/gray-fg} ${entry.value}`,
      ];
    }

    if (entry.type === "notice") {
      return [`{gray-fg}│{/gray-fg} ${entry.content}`];
    }

    return renderProcess(entry);
  }

  /**
   * @param {FlowQuestionEntry} entry
   * @returns {string[]}
   */
  function renderQuestion(entry) {
    if (entry.type === "text" || entry.type === "password") {
      const rawValue = entry.value || "";
      const displayValue = entry.type === "password"
        ? "*".repeat(rawValue.length)
        : rawValue || `{gray-fg}${entry.placeholder || "Type a value"}{/gray-fg}`;
      const lines = [
        `{cyan-fg}♦{/cyan-fg} {red-fg}${entry.label}{/red-fg}`,
        `{gray-fg}│{/gray-fg} {gray-fg}›{/gray-fg} ${displayValue}`,
      ];

      if (entry.validationError) {
        lines.push(`{gray-fg}│{/gray-fg} {red-fg}${entry.validationError}{/red-fg}`);
      }

      return lines;
    }

    if (entry.type !== "select" && entry.type !== "multiselect") {
      return [];
    }

    return [
      `{cyan-fg}♦{/cyan-fg} {red-fg}${entry.label}{/red-fg}`,
      ...entry.options.map((/** @type {PromptChoice} */ option, /** @type {number} */ index) => {
        const selected =
          entry.type === "multiselect"
            ? entry.value.includes(option.value)
            : option.value === entry.value;
        const mark =
          entry.type === "multiselect"
            ? selected
              ? "{green-fg}■{/green-fg}"
              : "□"
            : selected
              ? "{green-fg}●{/green-fg}"
              : "○";
        const line = `  ${mark} ${option.label}`;
        const rendered = index === entry.optionCursor ? `{cyan-fg}${line}{/cyan-fg}` : line;
        return `{gray-fg}│{/gray-fg} ${rendered}`;
      }),
    ];
  }

  /**
   * @param {FlowInfoPromptEntry} entry
   * @returns {string[]}
   */
  function renderBlockingInfo(entry) {
    return renderInfoBox(entry.title, entry.content, {
      pointer: "{cyan-fg}♦{/cyan-fg}",
      maxWidth: logs.getPromptWidth(),
    });
  }

  /**
   * @param {boolean} [includeCompletion]
   * @param {string} [completionLabel]
   */
  function buildLines(includeCompletion = false, completionLabel = "Complete!") {
    if (!activeFlow) {
      return [];
    }

    /** @type {string[]} */
    const lines = [
      "{gray-fg}┌────────────────────────────────{/gray-fg}",
      `{gray-fg}│{/gray-fg} {bold}${activeFlow.title}{/bold}`,
      "{gray-fg}│{/gray-fg}",
    ];

    for (const entry of activeFlow.entries) {
      lines.push(...renderEntry(entry));
      lines.push("{gray-fg}│{/gray-fg}");
    }

    if (activeFlow.currentQuestion) {
      lines.push(...renderQuestion(activeFlow.currentQuestion));
      lines.push("{gray-fg}│{/gray-fg}");
    }

    if (activeFlow.currentInfo) {
      lines.push(...renderBlockingInfo(activeFlow.currentInfo));
      lines.push("{gray-fg}│{/gray-fg}");
    }

    if (includeCompletion) {
      const completedProcesses = activeFlow.entries.filter(
        (entry) => entry.type === "process" && typeof entry.elapsedMs === "number",
      );
      const totalElapsedMs = completedProcesses.reduce(
        (sum, entry) =>
          sum + (entry.type === "process" ? entry.elapsedMs || 0 : 0),
        0,
      );
      const suffix = totalElapsedMs > 0
        ? ` {gray-fg}(${formatElapsed(totalElapsedMs)}){/gray-fg}`
        : "";
      lines.push(`{gray-fg}│{/gray-fg} {green-fg}✔ ${completionLabel}{/green-fg}${suffix}`);
      lines.push("{gray-fg}└────────────────────────────────{/gray-fg}");
    }

    return lines;
  }

  /**
   * @returns {string}
   */
  function flowBottomBorder() {
    return "{gray-fg}└────────────────────────────────{/gray-fg}";
  }

  function render() {
    if (!activeFlow) {
      options.onInstructionsChange?.("");
      logs.clearPromptBlock();
      return;
    }

    options.onInstructionsChange?.(
      activeFlow.currentInfo
        ? activeFlow.currentInfo.instructions
        : activeFlow.currentQuestion
          ? activeFlow.currentQuestion.type === "multiselect"
            ? activeFlow.currentQuestion.instructions || "{gray-fg}{bold}Up/Down{/bold} move  {bold}Space{/bold} toggle  {bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}"
            : activeFlow.currentQuestion.type === "text" || activeFlow.currentQuestion.type === "password"
              ? activeFlow.currentQuestion.instructions || "{gray-fg}{bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}"
              : activeFlow.currentQuestion.instructions || "{gray-fg}{bold}Left/Right{/bold} change  {bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}"
          : "",
    );
    logs.setPromptBlock(buildLines());
  }

  return {
    isActive() {
      return activeFlow !== null;
    },

    begin(title) {
      if (!activeFlow) {
        options.onOpen?.();
      }

      activeFlow = {
        title,
        entries: [],
        results: {},
        currentInfo: null,
        currentQuestion: null,
      };
      render();
    },

    addInfo(title, content) {
      if (!activeFlow) {
        return;
      }

      activeFlow.entries.push({
        type: "info",
        title,
        content,
      });
      render();
    },

    addReview(title, items) {
      if (!activeFlow) {
        return;
      }

      const content = items
        .map((item) => `${item.label}: ${item.value}`)
        .join("\n");

      activeFlow.entries.push({
        type: "info",
        title,
        content,
      });
      render();
    },

    addNotice(content) {
      if (!activeFlow) {
        return;
      }

      activeFlow.entries.push({
        type: "notice",
        content,
      });
      render();
    },

    askInfo(definition) {
      if (!activeFlow) {
        this.begin("Flow");
      }

      return new Promise((resolve) => {
        if (!activeFlow) {
          resolve(null);
          return;
        }

        activeFlow.currentInfo = {
          type: "blocking-info",
          title: definition.title,
          content: definition.content,
          instructions:
            definition.instructions ??
            "{gray-fg}{bold}Enter{/bold} continue  {bold}Esc{/bold} cancel{/gray-fg}",
          resolve,
        };
        ignoreEnterUntil = Date.now() + 150;
        render();
      });
    },

    askSelect(definition) {
      if (!activeFlow) {
        this.begin(definition.title || "Flow");
      }

      return new Promise((resolve) => {
        if (!activeFlow) {
          resolve(null);
          return;
        }

        activeFlow.currentQuestion = {
          type: "select",
          id: definition.id,
          label: definition.label,
          options: definition.options,
          value: definition.value || definition.options[0]?.value || "",
          optionCursor: Math.max(
            0,
            definition.options.findIndex(
              (option) =>
                option.value ===
                (definition.value || definition.options[0]?.value || ""),
            ),
          ),
          instructions: definition.instructions,
          resolve,
        };
        activeFlow.currentInfo = null;
        ignoreEnterUntil = Date.now() + 150;
        render();
      });
    },

    askMultiSelect(definition) {
      if (!activeFlow) {
        this.begin(definition.title || "Flow");
      }

      return new Promise((resolve) => {
        if (!activeFlow) {
          resolve(null);
          return;
        }

        activeFlow.currentQuestion = {
          type: "multiselect",
          id: definition.id,
          label: definition.label,
          options: definition.options,
          value: definition.value ? [...definition.value] : [],
          optionCursor: 0,
          instructions: definition.instructions,
          resolve,
        };
        activeFlow.currentInfo = null;
        ignoreEnterUntil = Date.now() + 150;
        render();
      });
    },

    askText(definition) {
      if (!activeFlow) {
        this.begin(definition.title || "Flow");
      }

      return new Promise((resolve) => {
        if (!activeFlow) {
          resolve(null);
          return;
        }

        activeFlow.currentQuestion = {
          type: "text",
          id: definition.id,
          label: definition.label,
          value: definition.value || "",
          placeholder: definition.placeholder,
          required: definition.required ?? false,
          instructions: definition.instructions,
          validate: definition.validate,
          validationError: "",
          resolve,
        };
        activeFlow.currentInfo = null;
        ignoreEnterUntil = Date.now() + 150;
        render();
      });
    },

    askPassword(definition) {
      if (!activeFlow) {
        this.begin(definition.title || "Flow");
      }

      return new Promise((resolve) => {
        if (!activeFlow) {
          resolve(null);
          return;
        }

        activeFlow.currentQuestion = {
          type: "password",
          id: definition.id,
          label: definition.label,
          value: definition.value || "",
          placeholder: definition.placeholder,
          required: definition.required ?? false,
          instructions: definition.instructions,
          validate: definition.validate,
          validationError: "",
          resolve,
        };
        activeFlow.currentInfo = null;
        ignoreEnterUntil = Date.now() + 150;
        render();
      });
    },

    askConfirm(definition) {
      return this.askSelect({
        id: definition.id,
        title: definition.title,
        label: definition.label,
        options: [
          { label: definition.trueLabel || "Yes", value: "yes" },
          { label: definition.falseLabel || "No", value: "no" },
        ],
        value: definition.value === false ? "no" : "yes",
        instructions: definition.instructions,
      }).then((value) => (value === null ? null : value === "yes"));
    },

    askNumber(definition) {
      return this.askText({
        id: definition.id,
        title: definition.title,
        label: definition.label,
        placeholder: definition.placeholder,
        value:
          typeof definition.value === "number" ? String(definition.value) : "",
        required: definition.required,
        instructions: definition.instructions,
        validate(value) {
          const trimmed = value.trim();
          if (!trimmed) {
            return definition.required ? "This field is required." : null;
          }

          const parsed = Number(trimmed);
          if (Number.isNaN(parsed)) {
            return "Insert a valid number.";
          }

          if (definition.integer && !Number.isInteger(parsed)) {
            return "Insert a whole number.";
          }

          if (typeof definition.min === "number" && parsed < definition.min) {
            return `Minimum value is ${definition.min}.`;
          }

          if (typeof definition.max === "number" && parsed > definition.max) {
            return `Maximum value is ${definition.max}.`;
          }

          return definition.validate ? definition.validate(parsed) : null;
        },
      }).then((value) => (value === null || value.trim() === "" ? null : Number(value)));
    },

    askUrl(definition) {
      return this.askText({
        id: definition.id,
        title: definition.title,
        label: definition.label,
        placeholder: definition.placeholder || "https://example.com",
        value: definition.value || "",
        required: definition.required,
        instructions: definition.instructions,
        validate(value) {
          const trimmed = value.trim();
          if (!trimmed) {
            return definition.required ? "This field is required." : null;
          }

          try {
            const parsed = new URL(trimmed);
            if (!parsed.protocol || !parsed.host) {
              return "Insert a valid URL.";
            }
          } catch {
            return "Insert a valid URL.";
          }

          return definition.validate ? definition.validate(trimmed) : null;
        },
      });
    },

    async runProcessStep(title, worker, processOptions = {}) {
      const processId = this.startProcess(title, processOptions);

      try {
        const result = await worker({
          append: (line) => this.appendProcess(processId, line),
          finish: (status, footer) => this.finishProcess(processId, status, footer),
        });

        if (!result || !result.handled) {
          this.finishProcess(
            processId,
            result?.status || "success",
            result?.footer,
          );
        }

        return result?.value;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed";
        this.finishProcess(processId, "error", message);
        throw error;
      }
    },

    getState() {
      return activeFlow ? { ...activeFlow.results } : {};
    },

    startProcess(title, options = {}) {
      if (!activeFlow) {
        return "";
      }

      const id = `flow-proc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeFlow.entries.push({
        type: "process",
        id,
        title,
        status: "running",
        lines: [],
        maxVisibleLines: options.maxVisibleLines ?? 4,
        footer: options.footer ?? "running...",
        selfClosing: options.selfClosing ?? false,
        spinFrame: 0,
        startedAt: Date.now(),
      });
      syncSpinner();
      render();
      return id;
    },

    appendProcess(id, line) {
      const entry = activeFlow?.entries.find(
        (current) => current.type === "process" && current.id === id,
      );
      if (!entry || entry.type !== "process") {
        return;
      }

      entry.lines.push(line);
      render();
    },

    finishProcess(id, status = "success", footer) {
      const entry = activeFlow?.entries.find(
        (current) => current.type === "process" && current.id === id,
      );
      if (!entry || entry.type !== "process") {
        return;
      }

      entry.status = status;
      entry.footer =
        footer || (status === "error" ? "{red-fg}Failed{/red-fg}" : "{green-fg}Completed{/green-fg}");
      entry.elapsedMs = Math.max(0, Date.now() - entry.startedAt);
      syncSpinner();
      render();
    },

    complete(persist = true, completionLabel = "Complete!", completeOptions = {}) {
      if (!activeFlow) {
        return;
      }

      const hideCompletion = completeOptions.hideCompletion === true;
      let lines = buildLines(true, completionLabel);
      if (hideCompletion) {
        const draft = buildLines(false);
        // When hiding completion, avoid leaving the trailing spacer row before closing border.
        while (draft.length > 0 && draft[draft.length - 1] === "{gray-fg}│{/gray-fg}") {
          draft.pop();
        }
        lines = [...draft, flowBottomBorder()];
      }
      activeFlow = null;
      syncSpinner();
      options.onInstructionsChange?.("");
      logs.clearPromptBlock();
      options.onClose?.();

      if (persist && lines.length > 0) {
        logs.logText(lines.join("\n"));
      }
    },

    handleKeypress(ch, key = {}) {
      if (!activeFlow) {
        return false;
      }

      if (activeFlow.currentInfo) {
        const info = activeFlow.currentInfo;

        if (isEscapeKey(key)) {
          info.resolve(null);
          activeFlow.currentInfo = null;
          render();
          return true;
        }

        if (key.name === "enter" || key.name === "return") {
          if (Date.now() < ignoreEnterUntil) {
            return true;
          }

          activeFlow.entries.push({
            type: "info",
            title: info.title,
            content: info.content,
          });
          activeFlow.currentInfo = null;
          info.resolve(true);
          render();
          return true;
        }

        return true;
      }

      if (!activeFlow.currentQuestion) {
        return false;
      }

      const question = activeFlow.currentQuestion;

      if (isEscapeKey(key)) {
        question.resolve(null);
        activeFlow.currentQuestion = null;
        render();
        return true;
      }

      if (question.type === "text" || question.type === "password") {
        if (key.name === "backspace" || key.name === "delete") {
          question.value = question.value.slice(0, -1);
          question.validationError = "";
          render();
          return true;
        }

        if ((key.name === "enter" || key.name === "return")) {
          if (Date.now() < ignoreEnterUntil) {
            return true;
          }

          if (question.required && !question.value.trim()) {
            question.validationError = "This field is required.";
            render();
            return true;
          }

          const customError = question.validate?.(question.value);
          if (customError) {
            question.validationError = customError;
            render();
            return true;
          }

          const answerValue = question.type === "password"
            ? "{green-fg}********{/green-fg}"
            : `{green-fg}${question.value || ""}{/green-fg}`;
          activeFlow.entries.push({
            type: "answer",
            label: question.label,
            value: answerValue,
          });
          if (question.id) {
            activeFlow.results[question.id] = question.value;
          }
          activeFlow.currentQuestion = null;
          question.resolve(question.value);
          render();
          return true;
        }

        if (typeof ch === "string" && ch.length > 0 && !key.ctrl && !key.meta) {
          question.value += ch;
          question.validationError = "";
          render();
          return true;
        }

        return true;
      }

      if (question.type !== "select" && question.type !== "multiselect") {
        return true;
      }

      if (key.name === "left" || key.name === "up") {
        question.optionCursor = Math.max(0, question.optionCursor - 1);
        if (question.type === "select") {
          question.value = question.options[question.optionCursor]?.value || question.value;
        }
        render();
        return true;
      }

      if (key.name === "right" || key.name === "down") {
        question.optionCursor = Math.min(
          question.options.length - 1,
          question.optionCursor + 1,
        );
        if (question.type === "select") {
          question.value = question.options[question.optionCursor]?.value || question.value;
        }
        render();
        return true;
      }

      if (key.name === "space") {
        if (question.type === "multiselect") {
          const option = question.options[question.optionCursor];
          if (option) {
            if (question.value.includes(option.value)) {
              question.value = question.value.filter((value) => value !== option.value);
            } else {
              question.value = [...question.value, option.value];
            }
          }
        } else {
          question.optionCursor = Math.min(
            question.options.length - 1,
            question.optionCursor + 1,
          );
          question.value = question.options[question.optionCursor]?.value || question.value;
        }
        render();
        return true;
      }

      if (key.name === "enter" || key.name === "return") {
        if (Date.now() < ignoreEnterUntil) {
          return true;
        }

        const label =
          question.type === "multiselect"
            ? question.options
              .filter((option) => question.value.includes(option.value))
              .map((option) => option.label)
              .join(", ") || "None"
            : question.options[question.optionCursor]?.label || question.value;
        activeFlow.entries.push({
          type: "answer",
          label: question.label,
          value: `{green-fg}${label}{/green-fg}`,
        });
        if (question.id) {
          activeFlow.results[question.id] =
            question.type === "multiselect" ? [...question.value] : question.value;
        }
        activeFlow.currentQuestion = null;
        if (question.type === "multiselect") {
          question.resolve([...question.value]);
        } else {
          question.resolve(question.value);
        }
        render();
        return true;
      }

      return false;
    },
  };
}
