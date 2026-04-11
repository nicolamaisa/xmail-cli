/**
 * @param {string} value
 * @returns {string}
 */
function stripTags(value) {
  return value.replace(/\{\/?[^}]+\}/g, "");
}

/**
 * @param {string} text
 * @param {number} width
 * @returns {string[]}
 */
function wrapParagraph(text, width) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  /** @type {string[]} */
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (`${currentLine} ${word}`.length <= width) {
      currentLine += ` ${word}`;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * @param {string} content
 * @param {number} width
 * @returns {string[]}
 */
function wrapContent(content, width) {
  /** @type {string[]} */
  const lines = [];

  for (const rawLine of content.split("\n")) {
    if (!rawLine.trim()) {
      lines.push("");
      continue;
    }

    lines.push(...wrapParagraph(rawLine, width));
  }

  return lines.length > 0 ? lines : [""];
}

/**
 * @param {string} value
 * @param {number} width
 * @returns {string}
 */
function padRight(value, width) {
  return value + " ".repeat(Math.max(0, width - stripTags(value).length));
}

/**
 * @param {string} title
 * @param {string} content
 * @param {{ pointer?: string, titleColor?: string, borderColor?: string, maxWidth?: number }} [options]
 * @returns {string[]}
 */
export function renderInfoBox(title, content, options = {}) {
  const pointer = options.pointer ?? "{gray-fg}♢{/gray-fg}";
  const titleColor = options.titleColor ?? "red-fg";
  const borderColor = options.borderColor ?? "gray-fg";
  const maxWidth = Math.max(20, options.maxWidth ?? 60);
  const contentWidth = Math.max(16, maxWidth - 4);
  const wrappedLines = wrapContent(content, contentWidth);
  const visibleWidth = wrappedLines.reduce(
    (max, line) => Math.max(max, stripTags(line).length),
    0,
  );
  const boxInnerWidth = Math.max(visibleWidth, 16);
  const titleVisibleWidth = stripTags(title).length;
  const topLineFill = Math.max(2, boxInnerWidth - titleVisibleWidth);

  return [
    `${pointer} {${titleColor}}${title}{/${titleColor}} {${borderColor}}${"─".repeat(topLineFill)}┐{/${borderColor}}`,
    ...wrappedLines.map(
      (line) =>
        `{${borderColor}}│{/${borderColor}} ${padRight(line, boxInnerWidth)} {${borderColor}}│{/${borderColor}}`,
    ),
    `{${borderColor}}├${"─".repeat(boxInnerWidth + 2)}┘{/${borderColor}}`,
  ];
}
