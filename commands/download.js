import { createHash } from "crypto";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import chalk from "chalk";
import { XMAIL_ROOT, captureCommand } from "../lib/xmail-control.js";

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
 * }} ReleaseItem
 */

const DEFAULT_MASTER_DISTRIBUTION_URL = "http://localhost:10000/distribution";

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
 * @param {string} command
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {Promise<void>}
 */
async function runCommand(command, args, cwd = XMAIL_ROOT) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${command} failed with exit code ${code}`));
    });
  });
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
      await runCommand(command, args, XMAIL_ROOT);
      return {
        status: "success",
        footer: options.successFooter || "Completed",
      };
    },
    {
      maxVisibleLines: 4,
      selfClosing: options.selfClosing ?? true,
    }
  );
}

/**
 * @param {AppContext} ctx
 * @param {{ args?: string[] }} [invocation]
 */
export async function runDownload(ctx, invocation = {}) {
  const channelArg = (invocation.args?.[0] || "").toLowerCase();
  const initialChannel = ["stable", "beta", "dev"].includes(channelArg)
    ? channelArg
    : "beta";

  ctx.flow.begin("XMail Release Download");

  const baseUrl = await ctx.flow.askUrl({
    id: "distribution_base_url",
    label: "Distribution base URL",
    value: DEFAULT_MASTER_DISTRIBUTION_URL,
    required: true,
  });
  if (!baseUrl) {
    ctx.flow.addNotice("{yellow-fg}⚠ Download annullato{/yellow-fg}");
    ctx.flow.complete(true, "Download cancelled", { hideCompletion: true });
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
    ctx.flow.addNotice("{yellow-fg}⚠ Download annullato{/yellow-fg}");
    ctx.flow.complete(true, "Download cancelled", { hideCompletion: true });
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
    ctx.flow.addNotice("{yellow-fg}⚠ Download annullato{/yellow-fg}");
    ctx.flow.complete(true, "Download cancelled", { hideCompletion: true });
    return;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const releasesEndpoint = `${normalizedBaseUrl}/v1/releases?profile=${encodeURIComponent(
    profile
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
      { selfClosing: true }
    );
    releases = Array.isArray(releaseList)
      ? /** @type {ReleaseItem[]} */ (releaseList)
      : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Errore check release", message, { tone: "error" });
    ctx.flow.complete(true, "Download failed", { hideCompletion: true });
    return;
  }

  if (!releases || releases.length === 0) {
    ctx.flow.addInfo(
      "Nessuna release disponibile",
      `Nessuna release trovata per profile=${profile}, channel=${channel}.`,
      { tone: "warning" }
    );
    ctx.flow.complete(true, "Nothing to download", { hideCompletion: true });
    return;
  }

  const currentVersion = (await detectCurrentVersionFromCompose()) || "unknown";
  ctx.flow.addReview("Context", [
    { label: "Current version", value: currentVersion },
    { label: "Channel", value: channel },
    { label: "Profile", value: profile },
  ]);

  const releaseMap = new Map(releases.map((release) => [release.version, release]));
  const selectedVersions = await ctx.flow.askMultiSelect({
    id: "release_versions",
    label: "Release disponibili (seleziona una o più, poi scegli quella finale)",
    value: [],
    options: releases.map((release) => ({
      value: release.version,
      label: `${release.version}  •  ${formatSize(
        release.sizeBytes
      )}  •  ${formatPublishedAt(release.publishedAt)}`,
    })),
  });

  if (!selectedVersions || selectedVersions.length === 0) {
    ctx.flow.addNotice("{yellow-fg}⚠ Nessuna release selezionata{/yellow-fg}");
    ctx.flow.complete(true, "Download cancelled", { hideCompletion: true });
    return;
  }

  const chosenVersion =
    selectedVersions.length === 1
      ? selectedVersions[0]
      : await ctx.flow.askSelect({
          id: "final_release_version",
          label: "Hai selezionato più release. Quale vuoi scaricare adesso?",
          value: selectedVersions[0],
          options: selectedVersions.map((version) => ({
            value: version,
            label: version,
          })),
        });

  if (!chosenVersion) {
    ctx.flow.addNotice("{yellow-fg}⚠ Download annullato{/yellow-fg}");
    ctx.flow.complete(true, "Download cancelled", { hideCompletion: true });
    return;
  }

  const chosenRelease = releaseMap.get(chosenVersion);
  if (!chosenRelease) {
    ctx.flow.addInfo(
      "Release non trovata",
      `Impossibile risolvere la release ${chosenVersion}.`,
      { tone: "error" }
    );
    ctx.flow.complete(true, "Download failed", { hideCompletion: true });
    return;
  }

  const confirmDownload = await ctx.flow.askConfirm({
    id: "confirm_download",
    label: `Confermi download di ${chosenRelease.version}?`,
    trueLabel: "Download",
    falseLabel: "Cancel",
    value: true,
  });
  if (!confirmDownload) {
    ctx.flow.addNotice("{yellow-fg}⚠ Download annullato{/yellow-fg}");
    ctx.flow.complete(true, "Download cancelled", { hideCompletion: true });
    return;
  }

  const downloadsDir = path.join(XMAIL_ROOT, ".downloads");
  await fs.mkdir(downloadsDir, { recursive: true });
  const archivePath = path.join(downloadsDir, `xmail.${chosenRelease.version}.tar.gz`);

  try {
    await runFlowCommand(
      ctx,
      `Download release ${chosenRelease.version}`,
      "curl",
      ["-fSL", chosenRelease.fileUrl, "-o", archivePath],
      { successFooter: `Downloaded to ${archivePath}` }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Download fallito", message, { tone: "error" });
    ctx.flow.complete(true, "Download failed", { hideCompletion: true });
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
          footer:
            computed === chosenRelease.sha256
              ? "Checksum verified"
              : "Checksum mismatch",
          value: computed,
        };
      },
      { selfClosing: false }
    );

    if (actualSha !== chosenRelease.sha256) {
      ctx.flow.addInfo(
        "Verifica SHA fallita",
        `Checksum non valido per ${chosenRelease.version}. Download interrotto.`,
        { tone: "error" }
      );
      ctx.flow.complete(true, "Download failed", { hideCompletion: true });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Errore verifica SHA", message, { tone: "error" });
    ctx.flow.complete(true, "Download failed", { hideCompletion: true });
    return;
  }

  const confirmExtract = await ctx.flow.askConfirm({
    id: "confirm_extract",
    label: `SHA ok. Vuoi estrarre il pacchetto in ${XMAIL_ROOT}?`,
    trueLabel: "Estrai",
    falseLabel: "No",
    value: true,
  });

  if (!confirmExtract) {
    ctx.flow.addNotice(
      `{yellow-fg}⚠ Archivio scaricato e verificato. Estrazione saltata: ${archivePath}{/yellow-fg}`
    );
    ctx.flow.complete(true, "Download completed");
    return;
  }

  try {
    await runFlowCommand(
      ctx,
      `Estrazione release ${chosenRelease.version}`,
      "tar",
      ["-xzf", archivePath, "-C", XMAIL_ROOT],
      { successFooter: "Pacchetto estratto con successo" }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.flow.addInfo("Estrazione fallita", message, { tone: "error" });
    ctx.flow.complete(true, "Download failed", { hideCompletion: true });
    return;
  }

  ctx.flow.addInfo(
    "Release pronta",
    [
      `Release ${chosenRelease.version} scaricata, verificata ed estratta.`,
      `Archivio: ${archivePath}`,
      "",
      `${chalk.green("Prossimo passo: esegui /init")}`,
    ].join("\n"),
    { tone: "success" }
  );
  ctx.flow.complete(true, "Download complete");
}
