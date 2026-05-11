---
name: minecraft-mod-updater
description: Update this project's mods.txt Fabric/Modrinth/GitHub mod download URLs to a requested non-snapshot game version while preserving exact per-URL support semantics. Use when the user asks to update mods.txt, Minecraft/Fabric mods, or mod download URLs to a target game version.
---

# Minecraft Mod Updater

Use this skill to update `mods.txt` for a requested game version, for example `26.1.2`.

## File Contract

Each mod item is two lines:

```text
# <source versions page> <latest supported non-snapshot game version for the download URL below>
[optional "# "]<download URL>
```

Definitions:

- Required game version: user target, for example `26.1.2`.
- Version string: latest supported non-snapshot game version for the exact download URL on the next line.
- Non-snapshot game version: numeric `N.N` or `N.N.N`; exclude snapshots, pre-releases, release candidates, beta snapshots, and wildcard strings.
- Active URL: download line does not start with `#`.
- Commented URL: download line starts with `#`.

## Core Rules

- Query live source metadata every run. Do not rely on file names alone.
- If metadata/API for an item cannot be fetched or parsed, leave that item unchanged.
- If a downloadable mod version exists whose latest supported non-snapshot game version equals the required game version, set the comment version to the required version, update to that download URL, and uncomment it.
- If no downloadable mod version exists whose latest supported non-snapshot game version equals the required game version, comment out the download URL and set the comment version to the latest supported non-snapshot game version for that exact URL.
- If a previously commented URL now has a valid target version, update the URL and uncomment it.
- If an active URL no longer matches the required game version by the version-string rule, comment it out.
- Do not update unrelated comments, headings, or spacing.

## Source Rules

Modrinth:

- Use Modrinth API, not page scraping.
- Parse slug from `/mod/<slug>/versions`, `/plugin/<slug>/versions`, or `/datapack/<slug>/versions`.
- Query `GET https://api.modrinth.com/v2/project/<slug>/version` with `loaders=["fabric"]` and `game_versions=[target]`.
- If source URL has `c=release`, only accept `version_type === "release"`.
- Choose newest matching version by `date_published`.
- Use primary file; otherwise first non-source file.
- Accept target only when `latestNonSnapshot(game_versions) === target`, not merely when `game_versions` contains target.
- For unsupported items, query current URL's `/versions/<id>/` metadata via `GET https://api.modrinth.com/v2/version/<id>` and compute its latest non-snapshot game version.

GitHub releases:

- Use GitHub releases API.
- Only update/uncomment when release metadata clearly states the required game version for a downloadable asset.
- Prefer assets ending in `.jar`; ignore sources, dev, javadoc, and api jars unless the source already requires them.
- If no exact target release exists, comment out the current URL only if the current release's latest non-snapshot game version can be determined.
- If current release compatibility cannot be determined, leave the item unchanged.

## Recommended Command

Use bundled helper for this project. Always run it with Bun.

```bash
bun .opencode/skills/minecraft-mod-updater/scripts/update-mods.mjs <target-version> [mods-file]
```

Examples:

```bash
bun .opencode/skills/minecraft-mod-updater/scripts/update-mods.mjs 26.1.2
bun .opencode/skills/minecraft-mod-updater/scripts/update-mods.mjs --check 26.1.2 mods.txt
```

## Manual Fallback

If script cannot handle a source, perform the same rules manually:

- Read source metadata from official API.
- Confirm exact latest non-snapshot game version for chosen download URL.
- Edit only that item's two lines.
- Leave item unchanged if source metadata is uncertain.

## Verification

After updating:

- Run helper with `--check` for same target.
- Confirm every active URL has comment version equal to target.
- Confirm every commented URL lacks a target-compatible downloadable version or was left unchanged due to fetch/parse failure.
- Report API failures and unchanged items explicitly.
