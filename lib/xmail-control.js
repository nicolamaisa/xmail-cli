import { promises as fs } from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import chalk from "chalk";

/**
 * @typedef {{
 *   root: string,
 *   envFile: string,
 *   composeFile: string,
 *   dbVolume: string,
 *   envExists: boolean,
 *   composeExists: boolean,
 *   dbDataExists: boolean,
 *   containers: Array<{ name: string, status: string }>,
 *   currentValues: Record<string, string>,
 *   missingRequiredKeys: string[],
 *   isConfigured: boolean
 * }} XmailDiscoveryState
 */

/**
 * @typedef {{
 *   cwd?: string,
 *   successFooter?: string,
 *   failureFooter?: string
 *   logVariant?: 'footer' | 'compact',
 *   selfClosing?: boolean
 * }} LoggedCommandOptions
 */

/**
 * @typedef {{
 *   resetDb: boolean,
 *   runMigrations: boolean,
 *   devMode: boolean,
 *   includeSetupProfile?: boolean,
 *   showStatusAfter: boolean
 * }} BootstrapOptions
 */

export const XMAIL_ROOT = "/opt/xmail-prod";
const XMAIL_ENV_FILE = path.join(XMAIL_ROOT, ".env");
const XMAIL_ENV_EXAMPLE_FILE = path.join(XMAIL_ROOT, ".env.example");
const XMAIL_COMPOSE_FILE = path.join(XMAIL_ROOT, "docker-compose.yml");
const XMAIL_POSTGRES_VOLUME = "xmail-postgres-data";

const REQUIRED_ENV_KEYS = [
  "SITE_URL",
  "API_EXTERNAL_URL",
  "PUBLIC_URL",
  "PUBLIC_API_BASE_URL",
  "PUBLIC_AI_BASE_URL",
  "POSTGRES_PASSWORD",
  "MINIO_ROOT_PASSWORD",
  "RUSTFS_SECRET_KEY",
  "BASIC_PASS",
  "JWT_SECRET",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
];

/** @param {string} content */
function parseEnv(content) {
  /** @type {Record<string, string>} */
  const values = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return values;
}

/** @param {string} filePath */
async function readEnvFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
      });
    });
  });
}

/** @returns {Promise<Array<{ name: string, status: string }>>} */
async function readDockerContainers() {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["ps", "-a", "--format", "{{.Names}}|{{.Status}}"],
      { cwd: XMAIL_ROOT },
    );

    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, status] = line.split("|");
        return { name, status };
      })
      .filter(
        (container) =>
          container.name.startsWith("xmail-") ||
          container.name.startsWith("x-"),
      );
  } catch {
    return [];
  }
}

/** @returns {Promise<boolean>} */
async function postgresVolumeExists() {
  const volumes = await findExistingPostgresVolumes();
  return volumes.length > 0;
}

/** @returns {Promise<string[]>} */
export async function findExistingPostgresVolumes() {
  /** @type {Set<string>} */
  const names = new Set();

  const composeProjectPrefix = `${path.basename(XMAIL_ROOT)}_`;
  const expectedWithPrefix = `${composeProjectPrefix}${XMAIL_POSTGRES_VOLUME}`;
  const expectedSuffix = `_${XMAIL_POSTGRES_VOLUME}`;

  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["inspect", "xmail-db", "--format", "{{json .Mounts}}"],
      { cwd: XMAIL_ROOT },
    );
    const mounts = JSON.parse(stdout || "[]");
    if (Array.isArray(mounts)) {
      for (const mount of mounts) {
        if (
          mount?.Type === "volume" &&
          mount?.Destination === "/var/lib/postgresql/data" &&
          typeof mount?.Name === "string"
        ) {
          names.add(mount.Name);
        }
      }
    }
  } catch {
    // xmail-db may not exist; fallback to volume listing
  }

  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["volume", "ls", "--format", "{{.Name}}"],
      { cwd: XMAIL_ROOT },
    );
    for (const rawName of stdout.split("\n").map((line) => line.trim()).filter(Boolean)) {
      if (
        rawName === XMAIL_POSTGRES_VOLUME ||
        rawName === expectedWithPrefix ||
        rawName.endsWith(expectedSuffix)
      ) {
        names.add(rawName);
      }
    }
  } catch {
    // ignore; caller handles empty set
  }

  return [...names];
}

/** @param {Record<string, string>} values */
function buildDerivedEnv(values) {
  const publicUrl =
    values.PUBLIC_URL || values.SITE_URL || "http://localhost:8000";

  /** @type {Record<string, string>} */
  const derived = {
    SITE_URL: values.SITE_URL || publicUrl,
    API_EXTERNAL_URL: values.API_EXTERNAL_URL || publicUrl,
    PUBLIC_URL: publicUrl,
    PUBLIC_API_BASE_URL: values.PUBLIC_API_BASE_URL || `${publicUrl}/api`,
    PUBLIC_AI_BASE_URL: values.PUBLIC_AI_BASE_URL || `${publicUrl}/ai`,
    POSTGRES_USER: values.POSTGRES_USER || "xmail",
    POSTGRES_DB: values.POSTGRES_DB || "xmail",
    MINIO_ROOT_USER: values.MINIO_ROOT_USER || "minio",
    RUSTFS_ACCESS_KEY: values.RUSTFS_ACCESS_KEY || "xmail",
    BASIC_USER: values.BASIC_USER || "admin",
    AUTH_COOKIE_NAME: values.AUTH_COOKIE_NAME || "sb_access_token",
    ...values,
  };

  return derived;
}

/**
 * @param {string} existingContent
 * @param {Record<string, string>} nextValues
 * @returns {string}
 */
function mergeEnvContent(existingContent, nextValues) {
  const lines = existingContent ? existingContent.split("\n") : [];
  const seen = new Set();

  const updated = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !rawLine.includes("=")) {
      return rawLine;
    }

    const separatorIndex = rawLine.indexOf("=");
    const key = rawLine.slice(0, separatorIndex).trim();
    if (!(key in nextValues)) {
      return rawLine;
    }

    seen.add(key);
    return `${key}=${nextValues[key]}`;
  });

  for (const [key, value] of Object.entries(nextValues)) {
    if (!seen.has(key)) {
      updated.push(`${key}=${value}`);
    }
  }

  return `${updated.join("\n").trim()}\n`;
}

/** @returns {Promise<XmailDiscoveryState>} */
export async function discoverXmailState() {
  const [exampleContent, envContent, containers, dbVolumeExists] =
    await Promise.all([
      readEnvFile(XMAIL_ENV_EXAMPLE_FILE),
      readEnvFile(XMAIL_ENV_FILE),
      readDockerContainers(),
      postgresVolumeExists(),
    ]);

  const exampleValues = parseEnv(exampleContent);
  const currentValues = parseEnv(envContent);
  const mergedValues = buildDerivedEnv({
    ...exampleValues,
    ...currentValues,
  });

  const missingRequiredKeys = REQUIRED_ENV_KEYS.filter(
    (key) => !mergedValues[key],
  );

  return {
    root: XMAIL_ROOT,
    envFile: XMAIL_ENV_FILE,
    composeFile: XMAIL_COMPOSE_FILE,
    dbVolume: XMAIL_POSTGRES_VOLUME,
    envExists: envContent.trim().length > 0,
    composeExists: await fs
      .access(XMAIL_COMPOSE_FILE)
      .then(() => true)
      .catch(() => false),
    dbDataExists: dbVolumeExists,
    containers,
    currentValues: mergedValues,
    missingRequiredKeys,
    isConfigured: missingRequiredKeys.length === 0,
  };
}

export async function generateJwtKeys() {
  const { stdout } = await execFileAsync(
    "node",
    ["scripts/generate-keys.mjs"],
    {
      cwd: XMAIL_ROOT,
    },
  );

  const parsed = parseEnv(stdout);

  return {
    JWT_SECRET: parsed.JWT_SECRET || "",
    ANON_KEY: parsed.ANON_KEY || "",
    SERVICE_ROLE_KEY: parsed.SERVICE_ROLE_KEY || "",
  };
}

/** @param {Record<string, string>} nextValues */
export async function writeXmailEnv(nextValues) {
  const existingContent = await readEnvFile(XMAIL_ENV_FILE);
  const merged = mergeEnvContent(existingContent, buildDerivedEnv(nextValues));
  await fs.writeFile(XMAIL_ENV_FILE, merged, "utf8");
}

/**
 * @param {import('stream').Readable} stream
 * @param {(line: string) => void} onLine
 * @returns {() => void}
 */
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

/**
 * @param {AppContext} ctx
 * @param {string} title
 * @param {string} command
 * @param {string[]} args
 * @param {LoggedCommandOptions} [options]
 * @returns {Promise<void>}
 */
export function runLoggedCommand(ctx, title, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const processId = ctx.logs.startProcessLog(title, {
      maxVisibleLines: 4,
      footer: "running...",
      variant: options.logVariant || "footer",
      selfClosing: options.selfClosing || false,
    });

    const child = spawn(command, args, {
      cwd: options.cwd || XMAIL_ROOT,
      env: process.env,
      shell: false,
    });

    const flushStdout = wireProcessStream(child.stdout, (line) =>
      ctx.logs.appendProcessLog(processId, line),
    );
    const flushStderr = wireProcessStream(child.stderr, (line) =>
      ctx.logs.appendProcessLog(processId, `{red-fg}${line}{/red-fg}`),
    );

    child.on("error", (error) => {
      ctx.logs.finishProcessLog(
        processId,
        chalk.red(`Failed: ${error.message}`),
        "error",
      );
      /** @type {Error & { handled?: boolean }} */ (error).handled = true;
      reject(error);
    });

    child.on("close", (code) => {
      flushStdout();
      flushStderr();

      if (code === 0) {
        ctx.logs.finishProcessLog(
          processId,
          chalk.green(options.successFooter || "Completed"),
          "success",
        );
        resolve();
        return;
      }

      const error = new Error(`${title} failed with exit code ${code}`);
      ctx.logs.finishProcessLog(
        processId,
        chalk.red(options.failureFooter || `Failed with exit code ${code}`),
        "error",
      );
      /** @type {Error & { handled?: boolean }} */ (error).handled = true;
      reject(error);
    });
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string }} [options]
 */
export async function captureCommand(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd || XMAIL_ROOT,
  });

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

/** @param {AppContext} ctx */
export async function runComposeStatus(ctx) {
  const { stdout } = await captureCommand("docker", ["compose", "ps"]);
  ctx.log(chalk.magenta("├──") + " " + chalk.bold("Compose Status"));
  for (const line of stdout.split("\n").filter(Boolean)) {
    ctx.log(`${chalk.magenta("│")} ${line}`);
  }
  ctx.log(chalk.magenta("├──") + " " + chalk.dim("End status"));
}

/** @param {AppContext} ctx */
export async function resetDbData(ctx) {
  await runLoggedCommand(ctx, "Stop DB-related services", "docker", [
    "compose",
    "stop",
    "x-api",
    "x-auth",
    "x-rest",
    "x-db",
  ]);

  await runLoggedCommand(ctx, "Remove DB service containers", "docker", [
    "compose",
    "rm",
    "-sf",
    "x-api",
    "x-auth",
    "x-rest",
    "x-db",
    "x-db-migrate",
  ], {
    successFooter: "DB-related containers removed",
    logVariant: "compact",
  });

  const volumes = await findExistingPostgresVolumes();
  if (volumes.length === 0) {
    ctx.log(chalk.yellow("No Postgres volume found to remove."));
  } else {
    for (const volumeName of volumes) {
      await runLoggedCommand(
        ctx,
        `Remove Postgres volume (${volumeName})`,
        "docker",
        ["volume", "rm", "-f", volumeName],
        {
          successFooter: `Removed ${volumeName}`,
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

  ctx.log(chalk.green(`DB volume reset completed.`));
}

/**
 * @param {AppContext} ctx
 * @param {BootstrapOptions} options
 */
export async function bootstrapXmailStack(ctx, options) {
  const composePrefix = options.includeSetupProfile
    ? ["compose", "--profile", "setup"]
    : ["compose"];

  if (options.resetDb) {
    await resetDbData(ctx);
  }

  await runLoggedCommand(
    ctx,
    "Start core services",
    "docker",
    [...composePrefix, "up", "-d", "x-db", "x-auth"],
    {
      successFooter: "x-db and x-auth ready",
      selfClosing: true,
    },
  );

  if (options.runMigrations) {
    await runLoggedCommand(
      ctx,
      "Run database migrations",
      "docker",
      [...composePrefix, "run", "--rm", "x-db-migrate"],
      {
        successFooter: "Migrations completed",
        selfClosing: true,
      },
    );
  }

  const composeArgs = [...composePrefix, "up", "-d"];
  if (options.devMode) {
    composeArgs.push("--build");
  }

  await runLoggedCommand(
    ctx,
    "Start remaining services",
    "docker",
    composeArgs,
    {
      successFooter: options.devMode
        ? "Stack started with build"
        : "Stack started",
      selfClosing: true,
    },
  );

}
