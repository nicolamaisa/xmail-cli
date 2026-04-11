import { promises as fs } from "fs";
import path from "path";
import chalk from "chalk";
import { spawn } from "child_process";
import {
  discoverXmailState,
  findExistingPostgresVolumes,
  generateJwtKeys,
  writeXmailEnv,
} from "./xmail-control.js";

/**
 * @typedef {{
 *   id?: string
 *   type: string
 *   name?: string
 *   label?: string
 *   title?: string
 *   content?: string
 *   inputType?: 'text' | 'password' | 'url' | 'number'
 *   placeholder?: string
 *   required?: boolean
 *   validation?: string
 *   options?: Array<{ label: string, value: string }>
 *   actionOptions?: { includeSetupProfile?: boolean }
 *   value?: string | string[] | boolean
 *   fields?: string[]
 *   default?: boolean
 *   action?: string
 *   when?: string
 *   tone?: 'info' | 'warning' | 'error' | 'success'
 * }} InitFlowStep
 */

/**
 * @typedef {{
 *   schemaVersion?: string
 *   profile?: string
 *   init?: {
 *     title?: string
 *     mode?: 'history' | 'single'
 *     steps?: InitFlowStep[]
 *   }
 * }} InitFlowDefinition
 */

/**
 * @param {string} fieldName
 * @returns {boolean}
 */
function isSensitiveField(fieldName) {
  return /(PASSWORD|SECRET|TOKEN|KEY)/i.test(fieldName);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function summarizeValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ") || "none";
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value ?? "");
}

/**
 * @param {string | undefined} validation
 * @returns {(value: string) => string | null}
 */
function buildValidator(validation) {
  return (value) => {
    if (!validation) {
      return null;
    }

    if (validation === "email") {
      return value.includes("@") ? null : "Insert a valid email.";
    }

    if (validation === "domain") {
      return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)
        ? null
        : "Insert a valid domain.";
    }

    if (validation === "url") {
      try {
        const parsed = new URL(value);
        return parsed.protocol && parsed.host ? null : "Insert a valid URL.";
      } catch {
        return "Insert a valid URL.";
      }
    }

    const minLengthMatch = /^minLength:(\d+)$/i.exec(validation);
    if (minLengthMatch) {
      const min = Number(minLengthMatch[1]);
      if (value.length < min) {
        return `Minimum length is ${min}.`;
      }
      return null;
    }

    return null;
  };
}

/**
 * @param {string | undefined} when
 * @param {Record<string, unknown>} values
 * @returns {boolean}
 */
function evaluateWhen(when, values) {
  if (!when) {
    return true;
  }

  const containsMatch = /^contains\(([^,]+),\s*['"]([^'"]+)['"]\)$/i.exec(when);
  if (containsMatch) {
    const key = containsMatch[1]?.trim();
    const expected = containsMatch[2];
    const current = values[key];
    return Array.isArray(current) ? current.includes(expected) : false;
  }

  return true;
}

/**
 * @param {AppContext} ctx
 * @param {string} title
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, successFooter?: string, selfClosing?: boolean, timeoutMs?: number }} options
 */
async function runFlowCommand(ctx, title, command, args, options) {
  await ctx.flow.runProcessStep(
    title,
    async ({ append }) => {
      append(`${command} ${args.join(" ")}`);
      return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: options.cwd,
          env: process.env,
          shell: false,
        });

        /** @param {import("stream").Readable} stream @param {(line: string) => void} onLine */
        function wireProcessStream(stream, onLine) {
          let buffer = "";
          stream.on("data", (chunk) => {
            buffer += chunk.toString();
            const parts = buffer.split("\n");
            buffer = parts.pop() || "";
            for (const part of parts) {
              const line = part.trimEnd();
              if (line) {
                onLine(line);
              }
            }
          });
          return () => {
            const line = buffer.trimEnd();
            if (line) {
              onLine(line);
            }
          };
        }

        const flushStdout = wireProcessStream(child.stdout, (line) => append(line));
        const flushStderr = wireProcessStream(child.stderr, (line) =>
          append(`{gray-fg}${line}{/gray-fg}`),
        );

        let timedOut = false;
        const timeoutMs = options.timeoutMs || 0;
        const timer =
          timeoutMs > 0
            ? setTimeout(() => {
                timedOut = true;
                child.kill("SIGTERM");
              }, timeoutMs)
            : null;

        child.on("error", (error) => {
          if (timer) {
            clearTimeout(timer);
          }
          reject(error);
        });

        child.on("close", (code) => {
          if (timer) {
            clearTimeout(timer);
          }
          flushStdout();
          flushStderr();

          if (timedOut) {
            reject(new Error(`${title} timed out after ${timeoutMs}ms`));
            return;
          }

          if (code === 0) {
            resolve({
              status: "success",
              footer: chalk.green(options.successFooter || "Completed"),
            });
            return;
          }

          reject(new Error(`${title} failed with exit code ${code}`));
        });
      });
    },
    {
      maxVisibleLines: 4,
      selfClosing: options.selfClosing ?? true,
    },
  );
}

/**
 * @param {AppContext} ctx
 * @returns {Promise<InitFlowDefinition | null>}
 */
async function readInitFlowDefinition(ctx) {
  const state = await discoverXmailState();
  const filePath = path.join(state.root, "init.flow.json");

  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * @param {AppContext} ctx
 * @returns {Promise<boolean>}
 */
export async function runInitFromFlowFile(ctx) {
  const definition = await readInitFlowDefinition(ctx);
  const steps = definition?.init?.steps || [];

  if (steps.length === 0) {
    return false;
  }

  const discovery = await discoverXmailState();
  const current = discovery.currentValues;
  const root = discovery.root;
  /** @type {Record<string, unknown>} */
  const values = {};
  /** @type {Record<string, string>} */
  let nextEnv = { ...current };

  ctx.flow.begin(definition?.init?.title || "XMail Initial Configuration");

  try {
    for (const step of steps) {
      if (!evaluateWhen(step.when, values)) {
        continue;
      }

      if (step.type === "info") {
        ctx.flow.addInfo(step.title || "Info", step.content || "", {
          tone: step.tone || "info",
        });
        continue;
      }

      if (step.type === "input") {
        const name = step.name || step.id || step.label || "value";
        const validator = buildValidator(step.validation);
        const inputType = step.inputType || "text";
        const initialValue =
          typeof step.value === "string"
            ? step.value
            : typeof current[name] === "string"
              ? current[name]
              : "";

        let result = null;
        if (inputType === "password") {
          result = await ctx.flow.askPassword({
            id: name,
            label: step.label || name,
            placeholder: step.placeholder,
            required: step.required,
            value: initialValue,
            validate: validator,
          });
        } else if (inputType === "url") {
          result = await ctx.flow.askUrl({
            id: name,
            label: step.label || name,
            placeholder: step.placeholder,
            required: step.required,
            value: initialValue,
            validate: validator,
          });
        } else if (inputType === "number") {
          const numberResult = await ctx.flow.askNumber({
            id: name,
            label: step.label || name,
            placeholder: step.placeholder,
            required: step.required,
            value:
              typeof step.value === "number"
                ? step.value
                : Number(current[name] || 0),
          });
          result = numberResult === null ? null : String(numberResult);
        } else {
          result = await ctx.flow.askText({
            id: name,
            label: step.label || name,
            placeholder: step.placeholder,
            required: step.required,
            value: initialValue,
            validate: validator,
          });
        }

        if (result === null) {
          ctx.flow.addNotice("{yellow-fg}⚠ Bootstrap annullato{/yellow-fg}");
          ctx.flow.complete(true, "Cancelled", { hideCompletion: true });
          return true;
        }

        values[name] = result;
        continue;
      }

      if (step.type === "multiselect") {
        const name = step.name || step.id || step.label || "selection";
        const selected = await ctx.flow.askMultiSelect({
          id: name,
          label: step.label || name,
          options: step.options || [],
          value: Array.isArray(step.value) ? step.value : [],
        });

        if (selected === null) {
          ctx.flow.addNotice("{yellow-fg}⚠ Bootstrap annullato{/yellow-fg}");
          ctx.flow.complete(true, "Cancelled", { hideCompletion: true });
          return true;
        }

        values[name] = selected;
        continue;
      }

      if (step.type === "confirm") {
        const name = step.name || step.id || step.label || "confirm";
        const confirmed = await ctx.flow.askConfirm({
          id: name,
          label: step.label || "Continue?",
          value: typeof step.default === "boolean" ? step.default : true,
        });

        if (confirmed === null || confirmed === false) {
          ctx.flow.addNotice("{yellow-fg}⚠ Bootstrap annullato{/yellow-fg}");
          ctx.flow.complete(true, "Cancelled", { hideCompletion: true });
          return true;
        }

        values[name] = confirmed;
        continue;
      }

      if (step.type === "review") {
        const fields = step.fields || [];
        ctx.flow.addReview(step.title || "Review", fields.map((field) => {
          const rawValue =
            values[field] !== undefined ? values[field] : current[field] || "";

          if (isSensitiveField(field)) {
            return {
              label: field,
              value: summarizeValue(rawValue) ? "set" : "missing",
            };
          }

          return {
            label: field,
            value: summarizeValue(rawValue),
          };
        }));
        continue;
      }

      if (step.type === "action") {
        const action = step.action || "";

        if (action === "generate_env") {
          const jwtKeys =
            !current.JWT_SECRET || !current.ANON_KEY || !current.SERVICE_ROLE_KEY
              ? await generateJwtKeys()
              : {
                JWT_SECRET: current.JWT_SECRET,
                ANON_KEY: current.ANON_KEY,
                SERVICE_ROLE_KEY: current.SERVICE_ROLE_KEY,
              };

          const publicUrl = String(
            values.PUBLIC_URL ||
            current.PUBLIC_URL ||
            current.SITE_URL ||
            "http://localhost:8000",
          );

          nextEnv = {
            ...current,
            ...Object.fromEntries(
              Object.entries(values).map(([key, value]) => [key, summarizeValue(value)]),
            ),
            PUBLIC_URL: publicUrl,
            SITE_URL: publicUrl,
            API_EXTERNAL_URL: publicUrl,
            PUBLIC_API_BASE_URL: `${publicUrl}/api`,
            PUBLIC_AI_BASE_URL: `${publicUrl}/ai`,
            JWT_SECRET: jwtKeys.JWT_SECRET,
            ANON_KEY: jwtKeys.ANON_KEY,
            SERVICE_ROLE_KEY: jwtKeys.SERVICE_ROLE_KEY,
          };
          continue;
        }

        if (action === "write_env") {
          await writeXmailEnv(nextEnv);
          ctx.flow.addNotice(
            `{green-fg}Configuration written to ${discovery.envFile}{/green-fg}`,
          );
          continue;
        }

        if (action === "docker_up") {
          const bootstrapOptions = Array.isArray(values.BOOTSTRAP_OPTIONS)
            ? values.BOOTSTRAP_OPTIONS
            : [];
          const includeSetupProfile = step.actionOptions?.includeSetupProfile === true;
          const composePrefix = includeSetupProfile
            ? ["compose", "--profile", "setup"]
            : ["compose"];

          if (bootstrapOptions.includes("reset_db_before_start")) {
            await runFlowCommand(
              ctx,
              "Stop DB-related services",
              "docker",
              [...composePrefix, "stop", "x-api", "x-auth", "x-rest", "x-db"],
              {
                cwd: root,
                successFooter: "DB-related services stopped",
                selfClosing: true,
              },
            );

            await runFlowCommand(
              ctx,
              "Remove DB service containers",
              "docker",
              [...composePrefix, "rm", "-sf", "x-api", "x-auth", "x-rest", "x-db", "x-db-migrate"],
              {
                cwd: root,
                successFooter: "DB-related containers removed",
                selfClosing: true,
              },
            );

            const existingVolumes = await findExistingPostgresVolumes();
            if (existingVolumes.length > 0) {
              for (const volumeName of existingVolumes) {
                await runFlowCommand(
                  ctx,
                  `Remove Postgres volume (${volumeName})`,
                  "docker",
                  ["volume", "rm", "-f", volumeName],
                  {
                    cwd: root,
                    successFooter: `${volumeName} removed`,
                    selfClosing: true,
                  },
                );
              }
            }

            const remainingVolumes = await findExistingPostgresVolumes();
            if (remainingVolumes.length > 0) {
              throw new Error(
                `Postgres volume still exists after reset: ${remainingVolumes.join(", ")}`,
              );
            }
          }

          await runFlowCommand(
            ctx,
            "Start core services",
            "docker",
            [...composePrefix, "up", "-d", "x-db", "x-auth"],
            {
              cwd: root,
              successFooter: "x-db and x-auth ready",
              timeoutMs: 180000,
            },
          );

          const composeUpArgs = [...composePrefix, "up", "-d"];
          if (bootstrapOptions.includes("dev_rebuild")) {
            composeUpArgs.push("--build");
          }

          await runFlowCommand(
            ctx,
            "Start remaining services",
            "docker",
            composeUpArgs,
            {
              cwd: root,
              successFooter: bootstrapOptions.includes("dev_rebuild")
                ? "Stack started with build"
                : "Stack started",
              timeoutMs: 300000,
            },
          );
          continue;
        }

        if (action === "migrate_if_selected") {
          const bootstrapOptions = Array.isArray(values.BOOTSTRAP_OPTIONS)
            ? values.BOOTSTRAP_OPTIONS
            : [];
          if (bootstrapOptions.includes("run_migrations")) {
            await runFlowCommand(
              ctx,
              "Run database migrations",
              "docker",
              ["compose", "--profile", "setup", "run", "--rm", "x-db-migrate"],
              {
                cwd: root,
                successFooter: "Migrations completed",
                timeoutMs: 180000,
              },
            );
          }
          continue;
        }

        if (action === "healthcheck_summary") {
          await runFlowCommand(
            ctx,
            "Compose status",
            "docker",
            ["compose", "ps"],
            {
              cwd: root,
              successFooter: "Status collected",
            },
          );
          continue;
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo(
      "Bootstrap failed",
      `Errore durante l'esecuzione dello step:\n${message}`,
      { tone: "error" },
    );
    ctx.flow.complete(true, "Failed", { hideCompletion: true });
    return true;
  }

  ctx.flow.complete(true, "Bootstrap completed");
  return true;
}
