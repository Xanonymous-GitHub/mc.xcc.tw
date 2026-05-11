#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "opencode-minecraft-mod-updater/1.0";
const STABLE_GAME_VERSION_RE = /^\d+\.\d+(?:\.\d+)?$/;

function usage() {
  console.error("Usage: bun .opencode/skills/minecraft-mod-updater/scripts/update-mods.mjs [--check|--dry-run] <target-version> [mods-file]");
}

function parseArgs(argv) {
  const flags = new Set();
  const rest = [];

  for (const arg of argv) {
    if (arg === "--check" || arg === "--dry-run") flags.add(arg);
    else rest.push(arg);
  }

  const [target, file = "mods.txt"] = rest;
  if (!target || !STABLE_GAME_VERSION_RE.test(target)) {
    usage();
    process.exit(2);
  }

  return {
    target,
    file,
    check: flags.has("--check"),
    dryRun: flags.has("--dry-run") || flags.has("--check"),
  };
}

function isStableGameVersion(version) {
  return STABLE_GAME_VERSION_RE.test(version);
}

function compareGameVersions(left, right) {
  const a = left.match(STABLE_GAME_VERSION_RE).slice(0, 4).slice(1).map((part) => part == null ? 0 : Number(part));
  const b = right.match(STABLE_GAME_VERSION_RE).slice(0, 4).slice(1).map((part) => part == null ? 0 : Number(part));

  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }

  return 0;
}

function latestNonSnapshot(gameVersions) {
  const stable = (gameVersions || []).filter(isStableGameVersion).sort(compareGameVersions);
  return stable[stable.length - 1] || null;
}

function parseItems(lines) {
  const items = [];
  const sourceRe = /^#\s+(https?:\/\/\S+)\s+(\S+)\s*$/;
  const downloadRe = /^(#\s*)?(https?:\/\/\S+)\s*$/;

  for (let i = 0; i < lines.length - 1; i += 1) {
    const sourceMatch = lines[i].match(sourceRe);
    if (!sourceMatch) continue;

    const downloadMatch = lines[i + 1].match(downloadRe);
    if (!downloadMatch) continue;

    items.push({
      sourceIndex: i,
      downloadIndex: i + 1,
      sourceUrl: sourceMatch[1],
      versionString: sourceMatch[2],
      downloadUrl: downloadMatch[2],
      commented: Boolean(downloadMatch[1]),
    });
  }

  return items;
}

function modrinthSlug(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.hostname !== "modrinth.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const typeIndex = parts.findIndex((part) => ["mod", "plugin", "datapack"].includes(part));
  if (typeIndex < 0 || !parts[typeIndex + 1]) return null;

  return parts[typeIndex + 1];
}

function githubRepo(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.hostname !== "github.com") return null;

  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;

  return `${owner}/${repo}`;
}

function versionIdFromModrinthUrl(downloadUrl) {
  return downloadUrl.match(/\/versions\/([^/]+)\//)?.[1] || null;
}

function chooseModrinthFile(version) {
  return version.files?.find((file) => file.primary)
    || version.files?.find((file) => !file.filename?.includes("-sources"))
    || version.files?.[0]
    || null;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      ...headers,
    },
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function modrinthTargetResult(item, target) {
  const slug = modrinthSlug(item.sourceUrl);
  if (!slug) return null;

  const source = new URL(item.sourceUrl);
  const releaseOnly = source.searchParams.get("c") === "release";
  const params = new URLSearchParams();
  params.set("loaders", JSON.stringify(["fabric"]));
  params.set("game_versions", JSON.stringify([target]));

  let versions = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?${params}`);
  if (releaseOnly) versions = versions.filter((version) => version.version_type === "release");

  versions = versions
    .filter((version) => version.loaders?.includes("fabric"))
    .filter((version) => version.game_versions?.includes(target))
    .filter((version) => latestNonSnapshot(version.game_versions) === target)
    .sort((a, b) => Date.parse(b.date_published) - Date.parse(a.date_published));

  const version = versions[0];
  if (!version) return null;

  const file = chooseModrinthFile(version);
  if (!file?.url) throw new Error(`no downloadable file for ${slug}`);

  return {
    active: true,
    versionString: target,
    downloadUrl: file.url,
    label: slug,
  };
}

async function modrinthCurrentResult(item) {
  const slug = modrinthSlug(item.sourceUrl);
  if (!slug) return null;

  const versionId = versionIdFromModrinthUrl(item.downloadUrl);
  if (!versionId) throw new Error(`cannot parse Modrinth version id for ${slug}`);

  const version = await fetchJson(`https://api.modrinth.com/v2/version/${encodeURIComponent(versionId)}`);
  const current = latestNonSnapshot(version.game_versions);
  if (!current) throw new Error(`cannot determine current game version for ${slug}`);

  return {
    active: false,
    versionString: current,
    downloadUrl: item.downloadUrl,
    label: slug,
  };
}

function normalizedUrl(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPreferredGithubAsset(asset) {
  const name = asset.name || "";
  if (!name.endsWith(".jar")) return false;
  if (/(?:^|[-_.])(sources|source|dev|javadoc|api)(?:[-_.]|$)/i.test(name)) return false;
  return true;
}

function minecraftVersionsFromRelease(release, asset = null) {
  const text = `${release.name || ""}\n${release.tag_name || ""}\n${asset?.name || ""}\n${release.body || ""}`;
  const versions = [];

  for (const match of text.matchAll(/Minecraft\s+([^\n\r]+)/gi)) {
    const segment = match[1];
    for (const version of segment.matchAll(/\b\d+\.\d+(?:\.\d+)?\b/g)) {
      versions.push(version[0]);
    }
  }

  return versions.filter(isStableGameVersion);
}

async function githubResult(item, target) {
  const repo = githubRepo(item.sourceUrl);
  if (!repo) return null;

  const releases = await fetchJson(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    Accept: "application/vnd.github+json",
  });

  for (const release of releases) {
    const releaseVersions = minecraftVersionsFromRelease(release);
    if (!releaseVersions.includes(target) || latestNonSnapshot(releaseVersions) !== target) continue;

    const asset = release.assets?.find(isPreferredGithubAsset) || release.assets?.[0];
    if (!asset?.browser_download_url) continue;

    return {
      active: true,
      versionString: target,
      downloadUrl: asset.browser_download_url,
      label: repo,
    };
  }

  const currentUrl = normalizedUrl(item.downloadUrl);
  const currentAsset = releases
    .flatMap((release) => (release.assets || []).map((asset) => ({ release, asset })))
    .find(({ asset }) => normalizedUrl(asset.browser_download_url) === currentUrl);

  if (!currentAsset) throw new Error(`cannot find current GitHub asset for ${repo}`);

  const currentVersions = minecraftVersionsFromRelease(currentAsset.release, currentAsset.asset);
  const current = latestNonSnapshot(currentVersions);
  if (!current) throw new Error(`cannot determine current game version for ${repo}`);

  return {
    active: false,
    versionString: current,
    downloadUrl: item.downloadUrl,
    label: repo,
  };
}

async function resolveItem(item, target) {
  const modrinth = modrinthSlug(item.sourceUrl);
  if (modrinth) return await modrinthTargetResult(item, target) || await modrinthCurrentResult(item);

  const github = githubRepo(item.sourceUrl);
  if (github) return await githubResult(item, target);

  throw new Error("unsupported source URL");
}

function applyResult(lines, item, result) {
  const sourceLine = `# ${item.sourceUrl} ${result.versionString}`;
  const downloadLine = result.active ? result.downloadUrl : `# ${result.downloadUrl}`;
  const changed = lines[item.sourceIndex] !== sourceLine || lines[item.downloadIndex] !== downloadLine;

  if (changed) {
    lines[item.sourceIndex] = sourceLine;
    lines[item.downloadIndex] = downloadLine;
  }

  return changed;
}

async function main() {
  const { target, file, check, dryRun } = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(file);
  const originalText = await readFile(filePath, "utf8");
  const hadTrailingNewline = originalText.endsWith("\n");
  const lines = originalText.replace(/\n$/, "").split("\n");
  const items = parseItems(lines);
  const changedItems = [];
  const unchangedItems = [];
  const failedItems = [];

  for (const item of items) {
    try {
      const result = await resolveItem(item, target);
      const changed = applyResult(lines, item, result);
      const status = result.active ? "active" : "commented";
      const message = `${result.label}: ${status} ${result.versionString}`;

      if (changed) changedItems.push(message);
      else unchangedItems.push(message);
    } catch (error) {
      failedItems.push(`${item.sourceUrl}: ${error.message}`);
    }
  }

  const nextText = `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}`;
  const fileChanged = nextText !== originalText;

  if (fileChanged && !dryRun) {
    await writeFile(filePath, nextText, "utf8");
  }

  console.log(`${items.length} mod items checked for ${target}`);
  console.log(`${changedItems.length} would change${dryRun ? "" : "d"}`);
  console.log(`${unchangedItems.length} unchanged`);
  console.log(`${failedItems.length} failed/left unchanged`);

  for (const item of changedItems) console.log(`CHANGE ${item}`);
  for (const item of failedItems) console.log(`FAIL ${item}`);

  if (check && fileChanged) {
    console.error("mods.txt is not up to date");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
