import { createHash } from "crypto";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { XMAIL_ROOT, captureCommand } from "../lib/xmail-control.js";

const DEFAULT_MASTER_DISTRIBUTION_URL = "http://localhost:10000/distribution";

/**
 * @typedef {{
 *   id: number
 *   name: string
 *   profile: string
 *   channel: string
 *   version: string
 *   fileUrl: string
 *   sha256: string
 *   sizeBytes: number | string
 *   publishedAt: string
 *   requiresMigration?: boolean
 * }} ReleaseItem
 */

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

/**
 * @param {number | string | null | undefined} sizeBytes
 * @returns {string}
 */
function formatSize(sizeBytes) {
  const bytes = Number(sizeBytes || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "n/a";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {string} iso
 * @returns {string}
 */
function formatPublishedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toISOString().replace("T", " ").replace(".000Z", "Z");
}

/**
 * @param {string} value
 * @returns {number[]}
 */
function parseVersion(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split("-")[0];
  const parts = cleaned.split(".").map((part) => Number(part));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part))) {
    return [];
  }
  return parts;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a.length === 0 || b.length === 0) {
    return String(left).localeCompare(String(right), undefined, { numeric: true });
  }

  const size = Math.max(a.length, b.length);
  for (let i = 0; i < size; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) {
      return 1;
    }
    if (av < bv) {
      return -1;
    }
  }
  return 0;
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function readFileOrEmpty(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseEnv(content) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = rawLine.slice(0, separatorIndex).trim();
    const value = rawLine.slice(separatorIndex + 1);
    values[key] = value;
  }
  return values;
}

/**
 * @param {string} content
 * @param {Record<string, string>} additions
 * @returns {string}
 */
function appendEnvKeys(content, additions) {
  const base = content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  const rows = Object.entries(additions).map(([key, value]) => `${key}=${value}`);
  if (rows.length === 0) {
    return base;
  }
  return `${base}${rows.join("\n")}\n`;
}

/**
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchJsonViaCurl(url) {
  const { stdout } = await captureCommand("curl", ["-sS", "-fL", url], {
    cwd: XMAIL_ROOT,
  });
  return JSON.parse(stdout);
}

/**
 * @returns {Promise<string | null>}
 */
async function detectCurrentVersionFromCompose() {
  try {
    const composePath = path.join(XMAIL_ROOT, "docker-compose.yml");
    const content = await fs.readFile(composePath, "utf8");
    const matches = [...content.matchAll(/image:\s+\S+\/xmail-[^:\s]+:([^\s]+)/g)];
    const versions = matches.map((match) => match[1]).filter(Boolean);
    if (versions.length === 0) {
      return null;
    }
    const uniq = [...new Set(versions)];
    return uniq[0] || null;
  } catch {
    return null;
  }
}

/**
 * @param {AppContext} ctx
 * @param {string} title
 * @param {string} command
 * @param {string[]} args
 * @param {{ successFooter?: string, selfClosing?: boolean }} [options]
 */
async function runFlowCommand(ctx, title, command, args, options = {}) {
  await ctx.flow.runProcessStep(
    title,
    async ({ append }) => {
      append(`${command} ${args.join(" ")}`);
      await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: XMAIL_ROOT,
          env: process.env,
          shell: false,
        });

        /**
         * @param {import("stream").Readable} stream
         * @param {(line: string) => void} onLine
         * @returns {() => void}
         */
        function wireProcessStream(stream, onLine) {
          let buffer = "";
          stream.on("data", (chunk) => {
            buffer += chunk.toString().replace(/\r/g, "\n");
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

        child.on("error", (error) => {
          flushStdout();
          flushStderr();
          reject(error);
        });

        child.on("close", (code) => {
          flushStdout();
          flushStderr();
          if (code === 0) {
            resolve(undefined);
            return;
          }
          reject(new Error(`${command} failed with exit code ${code}`));
        });
      });

      return { status: "success", footer: options.successFooter || "Completed" };
    },
    {
      maxVisibleLines: 4,
      selfClosing: options.selfClosing ?? true,
    },
  );
}

/**
 * @param {AppContext} ctx
 * @param {{ args?: string[] }} [invocation]
 */
export async function runUpdate(ctx, invocation = {}) {
  const rawArgs = invocation.args || [];
  let dryRun = false;
  /** @type {string[]} */
  const positional = [];
  for (const arg of rawArgs) {
    const normalized = String(arg || "").toLowerCase();
    if (normalized === "-d" || normalized === "--dry-run") {
      dryRun = true;
      continue;
    }
    positional.push(arg);
  }

  const channelArg = (positional[0] || "").toLowerCase();
  const initialChannel = ["stable", "beta", "dev"].includes(channelArg)
    ? channelArg
    : "stable";

  ctx.flow.begin("XMail Update");

  const baseUrl = await ctx.flow.askUrl({
    id: "distribution_base_url",
    label: "Distribution base URL",
    value: DEFAULT_MASTER_DISTRIBUTION_URL,
    required: true,
  });
  if (!baseUrl) {
    ctx.flow.addNotice("{yellow-fg}⚠ Update annullato{/yellow-fg}");
    ctx.flow.complete(true, "Update cancelled", { hideCompletion: true });
    return;
  }

  const channel = await ctx.flow.askSelect({
    id: "release_channel",
    label: "Canale release",
    value: initialChannel,
    options: [
      { label: "Stable", value: "stable" },
      { label: "Beta", value: "beta" },
      { label: "Dev", value: "dev" },
    ],
  });
  if (!channel) {
    ctx.flow.addNotice("{yellow-fg}⚠ Update annullato{/yellow-fg}");
    ctx.flow.complete(true, "Update cancelled", { hideCompletion: true });
    return;
  }

  const profile = await ctx.flow.askSelect({
    id: "release_profile",
    label: "Profilo release",
    value: "full",
    options: [
      { label: "Full", value: "full" },
      { label: "Client-only", value: "client-only" },
      { label: "Dev", value: "dev" },
    ],
  });
  if (!profile) {
    ctx.flow.addNotice("{yellow-fg}⚠ Update annullato{/yellow-fg}");
    ctx.flow.complete(true, "Update cancelled", { hideCompletion: true });
    return;
  }

  const currentVersion = (await detectCurrentVersionFromCompose()) || "unknown";
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const releasesEndpoint = `${normalizedBaseUrl}/v1/releases?profile=${encodeURIComponent(
    profile,
  )}&channel=${encodeURIComponent(channel)}&limit=30`;

  /** @type {ReleaseItem[]} */
  let releases = [];
  try {
    const releaseList = await ctx.flow.runProcessStep(
      "Check release disponibili (curl)",
      async ({ append }) => {
        append(`curl -sS -fL ${releasesEndpoint}`);
        const data = await fetchJsonViaCurl(releasesEndpoint);
        const list = Array.isArray(data?.releases) ? data.releases : [];
        append(`Trovate ${list.length} release sul canale ${channel}`);
        return { status: "success", footer: "Release list loaded", value: list };
      },
      { selfClosing: true },
    );
    releases = Array.isArray(releaseList)
      ? /** @type {ReleaseItem[]} */ (releaseList)
      : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Errore check release", message, { tone: "error" });
    ctx.flow.complete(true, "Update failed", { hideCompletion: true });
    return;
  }

  if (releases.length === 0) {
    ctx.flow.addInfo(
      "Nessuna release disponibile",
      `Nessuna release trovata per profile=${profile}, channel=${channel}.`,
      { tone: "warning" },
    );
    ctx.flow.complete(true, "Nothing to update", { hideCompletion: true });
    return;
  }

  const releaseMap = new Map(releases.map((release) => [release.version, release]));
  const newerReleases =
    currentVersion === "unknown"
      ? releases
      : releases.filter((release) => compareVersions(release.version, currentVersion) > 0);
  const latest = newerReleases[0] || releases[0];

  ctx.flow.addReview("Context", [
    { label: "Current version", value: currentVersion },
    { label: "Latest version", value: latest?.version || "n/a" },
    { label: "Channel", value: channel },
    { label: "Profile", value: profile },
    { label: "Dry-run", value: dryRun ? "yes" : "no" },
  ]);

  if (currentVersion !== "unknown" && newerReleases.length === 0) {
    ctx.flow.addInfo(
      "Nessun update disponibile",
      `Sei già all'ultima versione compatibile (${currentVersion}) per channel=${channel}, profile=${profile}.`,
      { tone: "success" },
    );
    ctx.flow.complete(true, "Already up-to-date", { hideCompletion: true });
    return;
  }

  const selectedVersion = await ctx.flow.askSelect({
    id: "target_version",
    label: "Release disponibili",
    value: latest?.version || (newerReleases[0]?.version || releases[0].version),
    options: newerReleases.map((release) => ({
      value: release.version,
      label: `${release.version}  •  ${formatSize(release.sizeBytes)}  •  ${formatPublishedAt(
        release.publishedAt,
      )}`,
    })),
  });
  if (!selectedVersion) {
    ctx.flow.addNotice("{yellow-fg}⚠ Update annullato{/yellow-fg}");
    ctx.flow.complete(true, "Update cancelled", { hideCompletion: true });
    return;
  }

  const chosenRelease = releaseMap.get(selectedVersion);
  if (!chosenRelease) {
    ctx.flow.addInfo("Release non trovata", `Impossibile risolvere ${selectedVersion}.`, {
      tone: "error",
    });
    ctx.flow.complete(true, "Update failed", { hideCompletion: true });
    return;
  }

  ctx.flow.addReview("Release metadata", [
    { label: "Version", value: chosenRelease.version },
    {
      label: "Requires migration",
      value:
        typeof chosenRelease.requiresMigration === "boolean"
          ? chosenRelease.requiresMigration
            ? "yes"
            : "no"
          : "unknown",
    },
  ]);

  const confirmApply = await ctx.flow.askConfirm({
    id: "confirm_apply_update",
    label: dryRun
      ? `Simulare update da ${currentVersion} a ${chosenRelease.version}?`
      : `Aggiornare da ${currentVersion} a ${chosenRelease.version}?`,
    trueLabel: dryRun ? "Run dry-run" : "Update",
    falseLabel: "Cancel",
    value: true,
  });
  if (!confirmApply) {
    ctx.flow.addNotice("{yellow-fg}⚠ Update annullato{/yellow-fg}");
    ctx.flow.complete(true, "Update cancelled", { hideCompletion: true });
    return;
  }

  const installPath = XMAIL_ROOT;
  const downloadsDir = path.join(installPath, ".downloads");
  const updatesTmpRoot = path.join(installPath, ".updates");
  const archivePath = path.join(downloadsDir, `xmail.${chosenRelease.version}.tar.gz`);
  const extractTempDir = path.join(updatesTmpRoot, `release-${chosenRelease.version}-${Date.now()}`);
  const envFilePath = path.join(installPath, ".env");
  const envExamplePath = path.join(installPath, ".env.example");
  const requiresMigrationMeta =
    typeof chosenRelease.requiresMigration === "boolean"
      ? chosenRelease.requiresMigration
      : null;

  const runMigrationsAfterUpdate = dryRun
    ? false
    : await ctx.flow.askConfirm({
        id: "run_migrations_after_update",
        label:
          requiresMigrationMeta === true
            ? "Questa release richiede migrazioni DB (metadata server). Eseguirle ora?"
            : requiresMigrationMeta === false
              ? "Metadata server: questa release NON richiede migrazioni DB. Vuoi comunque eseguirle?"
              : "Metadata migrazioni non disponibile. Eseguire migrazioni DB dopo l'update?",
        trueLabel: "Migra",
        falseLabel: "Skip",
        value: requiresMigrationMeta === true,
      });

  if (runMigrationsAfterUpdate === null) {
    ctx.flow.addNotice("{yellow-fg}⚠ Update annullato{/yellow-fg}");
    ctx.flow.complete(true, "Update cancelled", { hideCompletion: true });
    return;
  }

  if (dryRun) {
    ctx.flow.addInfo(
      "Dry-run plan",
      [
        `Target release: ${chosenRelease.version}`,
        `Requires migration (server): ${
          requiresMigrationMeta === null ? "unknown" : requiresMigrationMeta ? "yes" : "no"
        }`,
        `Archive target: ${archivePath}`,
        "",
        "Operazioni pianificate (non eseguite):",
        "1) download release e verifica SHA256",
        "2) estrazione in cartella temporanea",
        "3) sync file aggiornati (senza toccare file invariati)",
        "4) stop container",
        "5) pull nuove immagini",
        "6) up core services (x-db, x-auth)",
        "7) up stack completa (--remove-orphans)",
        "8) sync .env solo se cambia .env.example",
      ].join("\n"),
      { tone: "info" },
    );
    ctx.flow.complete(true, "Dry-run complete");
    return;
  }

  await fs.mkdir(downloadsDir, { recursive: true });
  await fs.mkdir(updatesTmpRoot, { recursive: true });

  const envExampleBefore = await readFileOrEmpty(envExamplePath);

  try {
    await runFlowCommand(
      ctx,
      `Download release ${chosenRelease.version}`,
      "curl",
      ["-fSL", chosenRelease.fileUrl, "-o", archivePath],
      { successFooter: `Downloaded to ${archivePath}` },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Download fallito", message, { tone: "error" });
    ctx.flow.complete(true, "Update failed", { hideCompletion: true });
    return;
  }

  try {
    const actualSha = await ctx.flow.runProcessStep(
      "Verifica SHA256",
      async ({ append }) => {
        append(`File: ${archivePath}`);
        append(`Expected: ${chosenRelease.sha256}`);
        const computed = await sha256File(archivePath);
        append(`Actual:   ${computed}`);
        return {
          status: computed === chosenRelease.sha256 ? "success" : "error",
          footer: computed === chosenRelease.sha256 ? "Checksum verified" : "Checksum mismatch",
          value: computed,
        };
      },
      { selfClosing: false },
    );

    if (actualSha !== chosenRelease.sha256) {
      ctx.flow.addInfo(
        "Verifica SHA fallita",
        `Checksum non valido per ${chosenRelease.version}. Update interrotto.`,
        { tone: "error" },
      );
      ctx.flow.complete(true, "Update failed", { hideCompletion: true });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Errore verifica SHA", message, { tone: "error" });
    ctx.flow.complete(true, "Update failed", { hideCompletion: true });
    return;
  }

  const confirmExtract = await ctx.flow.askConfirm({
    id: "confirm_extract_update",
    label:
      "Confermi applicazione update? I file invariati non verranno toccati; .env viene aggiornato solo se cambia .env.example.",
    trueLabel: "Applica update",
    falseLabel: "Stop",
    value: true,
  });

  if (!confirmExtract) {
    ctx.flow.addNotice("{yellow-fg}⚠ Archivio scaricato/verificato. Update non applicato.{/yellow-fg}");
    ctx.flow.complete(true, "Update cancelled", { hideCompletion: true });
    return;
  }

  try {
    await fs.rm(extractTempDir, { recursive: true, force: true });
    await fs.mkdir(extractTempDir, { recursive: true });

    await runFlowCommand(
      ctx,
      `Estrazione release ${chosenRelease.version}`,
      "tar",
      ["-xzf", archivePath, "-C", extractTempDir],
      { successFooter: "Pacchetto estratto" },
    );

    const extractedEntries = await fs.readdir(extractTempDir, { withFileTypes: true });
    let payloadRoot = extractTempDir;
    if (extractedEntries.length === 1 && extractedEntries[0].isDirectory()) {
      payloadRoot = path.join(extractTempDir, extractedEntries[0].name);
    }

    await ctx.flow.runProcessStep(
      "Sync file aggiornati",
      async ({ append }) => {
        const args = [
          "-a",
          "--checksum",
          "--itemize-changes",
          "--human-readable",
          "--exclude=.env",
          "--exclude=.downloads",
          "--exclude=.updates",
          `${payloadRoot}/`,
          `${installPath}/`,
        ];
        append(`rsync ${args.join(" ")}`);
        const { stdout } = await captureCommand("rsync", args, { cwd: installPath });
        const lines = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const preview = lines.slice(0, 8);
        for (const line of preview) {
          append(line);
        }
        if (lines.length > preview.length) {
          append(`... ${lines.length - preview.length} altre modifiche`);
        }
        return {
          status: "success",
          footer: lines.length > 0 ? `${lines.length} file paths valutati` : "Nessuna differenza",
        };
      },
      { maxVisibleLines: 4, selfClosing: false },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Applicazione update fallita", message, { tone: "error" });
    ctx.flow.complete(true, "Update failed", { hideCompletion: true });
    return;
  } finally {
    await fs.rm(extractTempDir, { recursive: true, force: true }).catch(() => {});
  }

  try {
    await runFlowCommand(ctx, "Stop containers before update", "docker", ["compose", "stop"], {
      successFooter: "Containers stopped",
      selfClosing: true,
    });

    await runFlowCommand(ctx, "Pull updated images", "docker", ["compose", "pull"], {
      successFooter: "Images updated",
      selfClosing: true,
    });

    await runFlowCommand(
      ctx,
      "Start core services",
      "docker",
      ["compose", "up", "-d", "x-db", "x-auth"],
      {
        successFooter: "x-db and x-auth ready",
        selfClosing: true,
      },
    );

    if (runMigrationsAfterUpdate) {
      await runFlowCommand(
        ctx,
        "Run database migrations",
        "docker",
        ["compose", "--profile", "setup", "run", "--rm", "x-db-migrate"],
        {
          successFooter: "Migrations completed",
          selfClosing: true,
        },
      );
    }

    await runFlowCommand(
      ctx,
      "Start updated stack",
      "docker",
      ["compose", "up", "-d", "--remove-orphans"],
      {
        successFooter: "Stack started",
        selfClosing: true,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Riavvio stack fallito", message, { tone: "error" });
    ctx.flow.complete(true, "Update failed", { hideCompletion: true });
    return;
  }

  const envExampleAfter = await readFileOrEmpty(envExamplePath);
  let envAddedKeys = 0;

  if (envExampleBefore !== envExampleAfter && envExampleAfter.trim()) {
    const currentEnvContent = await readFileOrEmpty(envFilePath);
    const currentEnv = parseEnv(currentEnvContent);
    const exampleEnv = parseEnv(envExampleAfter);

    /** @type {Record<string, string>} */
    const missing = {};
    for (const [key, value] of Object.entries(exampleEnv)) {
      if (!(key in currentEnv)) {
        missing[key] = value;
      }
    }

    envAddedKeys = Object.keys(missing).length;
    if (envAddedKeys > 0) {
      const merged = appendEnvKeys(currentEnvContent, missing);
      await fs.writeFile(envFilePath, merged, "utf8");
    }
  }

  ctx.flow.addInfo(
    "Update completato",
    [
      `Versione target: ${chosenRelease.version}`,
      `Archivio: ${archivePath}`,
      `Installazione: ${installPath}`,
      `Requires migration (server): ${
        requiresMigrationMeta === null ? "unknown" : requiresMigrationMeta ? "yes" : "no"
      }`,
      `Migrations executed: ${runMigrationsAfterUpdate ? "yes" : "no"}`,
      `Env example changed: ${envExampleBefore !== envExampleAfter ? "yes" : "no"}`,
      `Nuove chiavi aggiunte in .env: ${envAddedKeys}`,
      "",
      "{green-fg}Stack aggiornata e riavviata con successo.{/green-fg}",
    ].join("\n"),
    { tone: "success" },
  );

  ctx.flow.complete(true, "Update complete");
}
