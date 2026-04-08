/**
 * @param {LogStore} logs
 * @param {{ onOpen?: () => void, onClose?: () => void }} [options]
 * @returns {PromptStore}
 */
export function createPromptStore(logs, options = {}) {
  /** @type {{ title: string, mode: 'single' | 'history', entries: Array<PromptEntry & { optionCursor?: number }>, activeIndex: number, resolve: (value: PromptResult | null) => void } | null} */
  let activeForm = null;

  /**
   * @param {PromptEntry & { optionCursor?: number }} entry
   * @returns {string}
   */
  function summarizeEntry(entry) {
    if (entry.type === "info") {
      return "";
    }

    if (entry.type === "select") {
      const selected = entry.options.find(
        (option) => option.value === entry.value,
      );
      return selected?.label || "";
    }

    if (entry.type === "multiselect") {
      const values = entry.value || [];
      const labels = entry.options
        .filter((option) => values.includes(option.value))
        .map((option) => option.label.replace(/^\d+\.\s*/, ""));
      return labels.join(", ") || "None";
    }

    if (entry.type === "password") {
      return entry.value ? "********" : "Not set";
    }

    return entry.value || "";
  }

  /**
   * @param {PromptEntry & { optionCursor?: number }} entry
   * @param {boolean} isActive
   * @returns {string[]}
   */
  function renderQuestion(entry, isActive) {
    const pointer = isActive ? "{cyan-fg}◆{/cyan-fg}" : "{gray-fg}◇{/gray-fg}";

    if (entry.type === "info") {
      return [
        `${pointer} {red-fg}${entry.title}{/red-fg}`,
        "{gray-fg}├────────────────────────────{/gray-fg}",
        ...entry.content
          .split("\n")
          .map((line) => `{gray-fg}│{/gray-fg} ${line}`),
        "{gray-fg}├────────────────────────────{/gray-fg}",
        "",
      ];
    }

    if (entry.type === "select") {
      return [
        `${pointer} {red-fg}${entry.label}{/red-fg}`,
        ...entry.options.map((option, index) => {
          const selected = option.value === entry.value;
          const mark = selected ? "{green-fg}●{/green-fg}" : "○";
          const line = `  ${mark} ${option.label}`;
          return isActive && index === (entry.optionCursor || 0)
            ? `{cyan-fg}${line}{/cyan-fg}`
            : line;
        }),
        "",
      ];
    }

    if (entry.type === "multiselect") {
      return [
        `${pointer} {red-fg}${entry.label}{/red-fg}`,
        ...entry.options.map((option, index) => {
          const selected = entry.value?.includes(option.value);
          const mark = selected ? "{green-fg}■{/green-fg}" : "□";
          const line = `  ${mark} ${option.label}`;
          return isActive && index === (entry.optionCursor || 0)
            ? `{cyan-fg}${line}{/cyan-fg}`
            : line;
        }),
        "",
      ];
    }

    const rawValue = entry.value || "";
    const displayValue =
      entry.type === "password"
        ? "*".repeat(rawValue.length)
        : rawValue ||
          `{gray-fg}${entry.placeholder || "Type a value"}{/gray-fg}`;

    return [
      `${pointer} {red-fg}${entry.label}{/red-fg}`,
      `  {gray-fg}›{/gray-fg} ${displayValue}`,
      "",
    ];
  }

  /**
   * @param {PromptEntry & { optionCursor?: number }} entry
   * @returns {string[]}
   */
  function renderAnsweredEntry(entry) {
    if (entry.type === "info") {
      return [
        `{gray-fg}◇{/gray-fg} {red-fg}${entry.title}{/red-fg}`,
        "{gray-fg}├────────────────────────────{/gray-fg}",
        ...entry.content
          .split("\n")
          .map((line) => `{gray-fg}│{/gray-fg} ${line}`),
        "{gray-fg}├────────────────────────────{/gray-fg}",
        "",
      ];
    }

    return [
      `{gray-fg}◇{/gray-fg} {red-fg}${entry.label}{/red-fg}`,
      `${summarizeEntry(entry)}`,
      "",
    ];
  }

  function renderForm() {
    if (!activeForm) {
      logs.clearPromptBlock();
      return;
    }

    const currentForm = activeForm;
    const currentEntry = currentForm.entries[currentForm.activeIndex];
    if (!currentEntry) {
      logs.clearPromptBlock();
      return;
    }

    const totalQuestions = currentForm.entries.filter(
      (entry) => entry.type !== "info",
    ).length;
    const currentQuestionNumber = currentForm.entries
      .slice(0, currentForm.activeIndex + 1)
      .filter((entry) => entry.type !== "info").length;

    /** @type {string[]} */
    const lines = [
      "{gray-fg}────────────────────────────────{/gray-fg}",
      `{bold}${currentForm.title}{/bold}`,
      `{gray-fg}Step ${Math.max(currentQuestionNumber, 1)} of ${Math.max(totalQuestions, 1)}{/gray-fg}`,
      "{gray-fg}Left/Right change  Space toggle  Enter continue  Esc cancel{/gray-fg}",
      "",
    ];

    if (currentForm.mode === "history") {
      currentForm.entries.slice(0, currentForm.activeIndex).forEach((entry) => {
        lines.push(...renderAnsweredEntry(entry));
      });
    }

    lines.push(...renderQuestion(currentEntry, true));
    logs.setPromptBlock(lines);
  }

  /**
   * @param {PromptEntry[]} entries
   * @returns {PromptResult}
   */
  function collectValues(entries) {
    /** @type {PromptResult} */
    const result = {};

    for (const entry of entries) {
      if (entry.type === "info") continue;
      if (entry.type === "multiselect") {
        result[entry.id] = entry.value || [];
        continue;
      }
      result[entry.id] = entry.value || "";
    }

    return result;
  }

  /**
   * @param {number} startIndex
   * @returns {number}
   */
  function nextInteractiveIndex(startIndex) {
    if (!activeForm) {
      return startIndex;
    }

    let index = startIndex;
    while (
      index < activeForm.entries.length &&
      activeForm.entries[index]?.type === "info"
    ) {
      index += 1;
    }
    return index;
  }

  /**
   * @param {PromptEntry & { optionCursor?: number }} entry
   * @param {number} direction
   */
  function changeChoice(entry, direction) {
    if (entry.type !== "select" && entry.type !== "multiselect") {
      return;
    }

    const currentIndex =
      typeof entry.optionCursor === "number"
        ? entry.optionCursor
        : Math.max(
            0,
            entry.options.findIndex((option) => option.value === entry.value),
          );
    const nextIndex = Math.max(
      0,
      Math.min(entry.options.length - 1, currentIndex + direction),
    );
    entry.optionCursor = nextIndex;

    if (entry.type === "select") {
      entry.value =
        entry.options[nextIndex]?.value || entry.options[0]?.value || "";
    }
  }

  /**
   * @param {PromptEntry & { optionCursor?: number }} entry
   * @param {string} value
   */
  function toggleOption(entry, value) {
    if (entry.type !== "multiselect") {
      return;
    }

    entry.value = entry.value || [];
    if (entry.value.includes(value)) {
      entry.value = entry.value.filter((current) => current !== value);
    } else {
      entry.value = [...entry.value, value];
    }
  }

  function finalize() {
    if (!activeForm) {
      return true;
    }

    const current = activeForm;
    const result = collectValues(current.entries);
    activeForm = null;
    current.resolve(result);
    options.onClose?.();
    logs.clearPromptBlock();
    return true;
  }

  return {
    isActive() {
      return activeForm !== null;
    },

    openForm(definition) {
      if (activeForm) {
        const current = activeForm;
        current.resolve(null);
      }

      const entries = definition.entries.map((entry) => {
        if (entry.type === "select") {
          const initialValue = entry.value || entry.options[0]?.value || "";
          return {
            ...entry,
            value: initialValue,
            optionCursor: Math.max(
              0,
              entry.options.findIndex(
                (option) => option.value === initialValue,
              ),
            ),
          };
        }

        if (entry.type === "multiselect") {
          return {
            ...entry,
            value: entry.value ? [...entry.value] : [],
            optionCursor: 0,
          };
        }

        if (entry.type === "text" || entry.type === "password") {
          return {
            ...entry,
            value: entry.value || "",
          };
        }

        return { ...entry };
      });

      options.onOpen?.();

      return new Promise((resolve) => {
        const mode = definition.mode || "single";
        activeForm = {
          title: definition.title,
          mode,
          entries,
          activeIndex: 0,
          resolve,
        };
        renderForm();
      });
    },

    close() {
      if (!activeForm) {
        return;
      }

      const current = activeForm;
      activeForm = null;
      current.resolve(null);
      options.onClose?.();
      logs.clearPromptBlock();
    },

    handleKeypress(ch, key = {}) {
      if (!activeForm) {
        return false;
      }

      const entry = activeForm.entries[activeForm.activeIndex];
      if (!entry) {
        return false;
      }

      if (key.name === "escape") {
        const current = activeForm;
        activeForm = null;
        current.resolve(null);
        options.onClose?.();
        logs.clearPromptBlock();
        return true;
      }

      if (key.name === "left") {
        if (entry.type === "select" || entry.type === "multiselect") {
          changeChoice(entry, -1);
          renderForm();
          return true;
        }
      }

      if (key.name === "right") {
        if (entry.type === "select" || entry.type === "multiselect") {
          changeChoice(entry, 1);
          renderForm();
          return true;
        }
      }

      if (key.name === "space") {
        if (entry.type === "multiselect") {
          const optionValue = entry.options[entry.optionCursor || 0]?.value;
          if (optionValue) {
            toggleOption(entry, optionValue);
            renderForm();
            return true;
          }
        }

        if (entry.type === "select") {
          changeChoice(entry, 1);
          renderForm();
          return true;
        }
      }

      if (
        key.name === "backspace" &&
        (entry.type === "text" || entry.type === "password")
      ) {
        entry.value = (entry.value || "").slice(0, -1);
        renderForm();
        return true;
      }

      if (key.name === "return" || key.name === "enter") {
        if (entry.type === "info") {
          const nextIndex = nextInteractiveIndex(activeForm.activeIndex + 1);
          if (nextIndex < activeForm.entries.length) {
            activeForm.activeIndex = nextIndex;
            renderForm();
            return true;
          }
          return finalize();
        }

        const nextIndex = nextInteractiveIndex(activeForm.activeIndex + 1);
        if (nextIndex < activeForm.entries.length) {
          activeForm.activeIndex = nextIndex;
          renderForm();
          return true;
        }

        return finalize();
      }

      if (
        (entry.type === "text" || entry.type === "password") &&
        ch &&
        ch >= " "
      ) {
        entry.value = `${entry.value || ""}${ch}`;
        renderForm();
        return true;
      }

      if (entry.type === "multiselect" && /^[1-9]$/.test(key.name || "")) {
        const optionIndex = Number(key.name) - 1;
        const option = entry.options[optionIndex];
        if (option) {
          entry.optionCursor = optionIndex;
          toggleOption(entry, option.value);
          renderForm();
          return true;
        }
      }

      return false;
    },
  };
}
