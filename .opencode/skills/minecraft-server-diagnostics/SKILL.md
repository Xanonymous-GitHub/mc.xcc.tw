---
name: minecraft-server-diagnostics
description: Diagnose this project's remote Minecraft/Fabric Docker server safely. Use when debugging TPS lag, crashes, datapack or mod load errors, command loops, world corruption, RCON checks, SSH MC_XCCTW, docker compose mc, or live world issues.
---

# Minecraft Server Diagnostics

Use this skill when diagnosing the `mc.xcc.tw` Minecraft server or a similar remote Docker/Fabric server. The default posture is read-only, evidence-first, and world-safe.

## Safety Contract

- Do not stop, restart, reload, kill, prune, delete, move, overwrite, or edit live world files unless the user explicitly asks and the risk is stated.
- Do not run destructive Minecraft commands such as `/kill`, `/setblock`, `/fill`, `/datapack disable`, `/gamerule`, `/reload`, `/save-all`, `/stop`, or `/restart` unless the user explicitly approves.
- Prefer read-only commands: `git log`, `git status`, `docker compose ps`, `docker stats --no-stream`, `docker compose logs`, `rcon-cli "tick query"`, `rcon-cli "datapack list enabled"`, `rcon-cli "data get ..."`, `jcmd <pid> Thread.print -l`.
- If a command may mutate runtime state, say so before running it and ask one short question.
- Be careful with RCON output: some commands are slow or return huge responses on a lagging server. Use targeted selectors and avoid broad `@e` data dumps.
- If the server is already lagging badly, prefer passive evidence first: logs, stats, thread dump, current datapack list, and targeted score/storage reads.

## Project Shape

- Local repo path: `/Users/xanonymous/PROJECTS/mc.xcc.tw`.
- Remote host alias: `MC_XCCTW`.
- Remote repo path: `/home/xanonymous/mc.xcc.tw`.
- Main service is Docker Compose service `mc`.
- Common container name: `mcxcctw-mc-1`.
- Docker image currently configured in `docker-compose.yml`: `itzg/minecraft-server:stable-java25-graalvm`.
- Minecraft/Fabric version is configured by `VERSION` in `docker-compose.yml`.
- Mods are sourced from `mods.txt` via `MODS_FILE=/extras/mods.txt`.
- Datapacks are mounted from project `./datapacks/` to container `/datapacks`, then copied into `/data/world/datapacks` by the image.
- World data inside container: `/data/world`.
- Overworld dimension path in current server layout: `/data/world/dimensions/minecraft/overworld`.
- RCON is available through `docker exec <container> rcon-cli "<command>"`.
- The login shell on `MC_XCCTW` may be `fish`; wrap complex remote commands as `ssh MC_XCCTW 'bash -lc '\''... '\'''` or run simple single commands only.

## First Response Workflow

When a user reports lag, crash, startup failure, datapack issue, mod issue, or weird world behavior:

- State that you will start read-only and avoid touching world files.
- Inspect recent local commit history and dirty state.
- Compare remote repo revision/status with local `HEAD`.
- Check container status, resource usage, and recent logs.
- Confirm symptoms with read-only RCON if safe.
- Correlate logs, config changes, runtime state, and world state before proposing any mutation.

Recommended local commands:

```bash
git status --short
git log --oneline --decorate -20
git diff --stat
```

Recommended remote commands:

```bash
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && git rev-parse --short HEAD && git status --short && git log --oneline -10'
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && docker compose ps'
ssh MC_XCCTW 'docker stats --no-stream'
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && docker compose logs --no-color --tail=300 mc'
```

## TPS Lag Checklist

Confirm the lag:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "tick query"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "spark tps"'
```

Interpretation:

- Normal target is `50.0ms` per tick and `20 TPS`.
- If average tick time is hundreds or thousands of milliseconds, look for command loops, entity explosions, chunk generation, storage stalls, or GC pressure.
- `docker stats` CPU near one full core with Minecraft server thread hot usually points to main-thread work, not necessarily host starvation.
- Memory near the container limit plus GC-heavy logs suggests GC/memory pressure, but do not assume GC from high memory alone.

Search logs for high-signal patterns:

```bash
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && docker compose logs --no-color --since=20m mc | grep -E "Command execution stopped|Can't keep up|Failed to load function|Couldn't load tag|ERROR|WARN|Done|logged in"'
```

Important patterns:

- `Command execution stopped due to limit (executed 20000000 commands)` means Minecraft hit the command chain cap. This strongly indicates a runaway command-block or datapack function loop.
- `Failed to load function ...` during startup means a datapack function has invalid syntax for the current game version.
- `Couldn't load tag minecraft:load ... missing following references ...` means the load tag did not fully initialize. Other datapacks may then tick with missing scoreboards/storage.
- `Failed to load function ... minecraft:block_entity_data ... Unknown registry key ... minecraft:oak_sign` is a version-incompatible command syntax issue, often from old datapacks.
- `Timed out waiting for world statistics` from Spark during severe lag can be a symptom, not the cause.

## Datapack Diagnostics

Read-only live datapack list:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "datapack list enabled"'
```

Static local datapack inspection is safe. Use Python `zipfile` to read `tick.json`, `load.json`, and `.mcfunction` files without extracting or modifying archives.

Questions to answer:

- Which datapacks register `minecraft:tick` functions?
- Which datapacks register `minecraft:load` functions?
- Which load functions fail in logs?
- Are tick functions safe if load initialization failed?
- Are there recursive function chains reachable from tick?
- Are macro functions (`$...`, `function ... with storage ...`) involved in the hot stack?

Useful static concepts:

- `data/minecraft/tags/function/load.json` schedules functions at datapack load.
- `data/minecraft/tags/function/tick.json` schedules functions every tick.
- Old packs may use `data/minecraft/tags/functions/...`; newer packs use singular `function` in current versions. Check actual archive paths.
- A failing load tag can leave scoreboards or storage unset while tick functions still run.
- Recursive `.mcfunction` chains are not always bugs, but they need a reliable stop condition.
- Missing scoreboard values in stop conditions can produce infinite loops.

Incident-derived high-value heuristic:

- If logs show `Command execution stopped due to limit` and thread dumps show `ServerFunctionManager.tick`, inspect tick-reachable datapack recursion and live scoreboard/storage initialization.
- If `minecraft:load` failed because one datapack has invalid functions, suspect other datapacks that rely on load-time setup.

## TreeCapitator-Specific Lesson

The incident diagnosed on this server had this chain:

- FTMC Bullet Cart and FTMC Railway datapacks had invalid functions for the current Minecraft version.
- Logs showed `Failed to load function ftmc:bcartv2/init`, `Failed to load function ftmc:subwayengine/init`, and `Couldn't load tag minecraft:load`.
- TreeCapitator's `tc:install` did not initialize `tc.axe_count`, `tc.tree_count`, `tc:storage axes`, or `tc:storage trees`.
- TreeCapitator's tick function still ran.
- `tc:tick` called `tc:player/used_axe_check`, which recursively called `tc:player/used_axe_check/loop` until `tc.current_axe_id >= tc.axe_count`.
- Because `tc.axe_count` was unset, the loop never terminated and hit `20000000` commands repeatedly.

Live verification commands from that incident:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "scoreboard players get tc.axe_count tc.value"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "scoreboard players get tc.tree_count tc.value"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "data get storage tc:storage axes"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "data get storage tc:storage trees"'
```

Expected healthy TreeCapitator values for `treecapitator-v5-0.zip`:

- `tc.axe_count tc.value`: `7`.
- `tc.tree_count tc.value`: `11`.
- `tc:storage axes`: present, non-empty.
- `tc:storage trees`: present, non-empty.

If these are missing and `tc:tick` is enabled, TreeCapitator can destroy TPS.

Possible mitigations, from safest to broadest:

- Remove or disable the datapack whose tick function is looping, then restart only after user approval.
- Remove or update the incompatible datapacks that broke `minecraft:load`, then restart only after user approval.
- Manually run a missing install function only with user approval; this mutates scoreboard/storage and may hide the real startup problem.

## JVM Thread Dumps

Use thread dumps when logs show lag but not the hot path. This is read-only.

Find Java process:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 ps -eo pid,ppid,comm,args'
```

Print threads:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 jcmd <java-pid> Thread.print -l'
```

Interpretation:

- `Server thread` inside `ServerFunctionManager.tick`, `Commands.executeCommandInContext`, `ExecutionContext.runCommandQueue`, `FunctionCommand`, or `MacroFunction.instantiate` means datapack/command execution is hot.
- `NbtPathArgument.parse` inside `MacroFunction.instantiate` means macro commands with NBT paths are being repeatedly parsed.
- `MinecraftServer.tickChildren` with chunk or worldgen classes suggests chunk/entity/world work.
- Many GC threads active does not prove GC pressure; check server thread stack and GC logs before concluding.

## World File Inspection

Read-only world inspection can be useful, but avoid writing. Prefer container paths to bypass host permission issues.

List world layout:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 sh -lc "find /data/world -maxdepth 3 -type d -printf \"%p\\n\" | sort"'
```

Common current paths:

- Overworld region files: `/data/world/dimensions/minecraft/overworld/region`.
- Overworld entity files: `/data/world/dimensions/minecraft/overworld/entities`.
- Nether: `/data/world/dimensions/minecraft/the_nether` or legacy `/data/world/DIM-1` depending on server/version.
- End: `/data/world/dimensions/minecraft/the_end` or legacy `/data/world/DIM1` depending on server/version.

When inspecting Anvil `.mca` files:

- Use read-only parsers against copied bytes or direct reads inside container.
- Target the player's current region first instead of scanning the whole world.
- Region file coordinate formula: `region_x = floor(block_x / 512)`, `region_z = floor(block_z / 512)`.
- Player at `(2249, 55, -10)` is in region `r.4.-1.mca`.
- Look for `minecraft:command_block`, `minecraft:repeating_command_block`, `minecraft:chain_command_block`, and `minecraft:command_block_minecart`.
- In-world command blocks can be causal when logs show command cap, but distinguish them from datapack tick loops with thread dumps and command outputs.

Targeted RCON block/entity reads are safer than broad selector dumps:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "data get block <x> <y> <z>"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "execute positioned <x> <y> <z> run data get entity @e[type=minecart,distance=..5,limit=1,sort=nearest]"'
```

Avoid this on live laggy servers unless scoped tightly:

```bash
data get entity @e
kill @e
forceload remove all
fill ... air
```

## Mod Diagnostics

Use `mods.txt`, logs, and the live `/data/mods` folder to confirm the actual mod set.

Important project behaviors:

- `REMOVE_OLD_MODS=true` may be disabled by the image when `MODS_FILE` is set. Watch for init warning: `Using REMOVE_OLD_MODS interferes with MODS_FILE or PLUGINS_FILE is set -- it is now disabled`.
- Old jars may persist in `/data/mods` if not explicitly removed by the image or a manual cleanup flow.
- Do not delete old mods from the live volume without explicit approval and a backup plan.
- Client-only mod warnings in server logs can be harmless, but missing required server-side dependencies are not.

Useful commands:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 sh -lc "ls -1 /data/mods | sort"'
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && sed -n "1,220p" mods.txt'
```

If a mod API or compatibility detail is uncertain, use current official docs/API before recommending a version.

## Crash And Startup Failure Checklist

Collect:

- Last 300 to 1000 lines of `mc` logs.
- Current commit and dirty status on remote.
- `docker compose ps` status and health.
- Mod list and datapack list.
- First error, not just last error.

High-signal startup patterns:

- Missing mod dependency: add the required mod to `mods.txt` only after verifying exact supported game version.
- Datapack syntax errors: remove/update the incompatible datapack; do not patch zip internals unless the user asks.
- Resource pack SHA mismatch: update `RESOURCE_PACK_SHA1` after verifying the exact downloaded file.
- World upgrade/registry errors: stop and ask before mutating; backups and exact version history matter.

## Safe Reporting Format

Report findings in this order:

- Root cause or strongest current hypothesis.
- Evidence with exact log lines, commands, or live state.
- What was ruled out.
- Risk of proposed fixes.
- Lowest-risk next step.

Example:

```text
Root cause: TreeCapitator tick loop caused by missing load initialization.
Evidence: logs hit 20000000 command cap; JVM server thread is in ServerFunctionManager.tick; tc.axe_count is unset.
Ruled out: container not unhealthy; Java process not primarily blocked on GC; nearby FTMC command blocks were not sufficient to explain 20M loop.
Next step: remove/disable TreeCapitator for quick recovery, or fix incompatible FTMC datapacks so minecraft:load initializes cleanly.
```

## Fix Escalation Rules

- For quick recovery, propose the smallest reversible runtime/config change.
- For permanent recovery, fix the first broken load/startup error, not only the final TPS symptom.
- If multiple datapacks are involved, disable one suspected datapack at a time and verify TPS/logs after restart.
- Before any restart or destructive change, ask for approval and mention whether players may be kicked or data may be saved.
- After a fix, verify with `docker compose logs`, `datapack list enabled`, relevant scoreboard/storage checks, and `tick query`.

## Known Useful Commands

Read-only status:

```bash
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && git rev-parse --short HEAD && git status --short'
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && docker compose ps'
ssh MC_XCCTW 'docker stats --no-stream'
ssh MC_XCCTW 'cd /home/xanonymous/mc.xcc.tw && docker compose logs --no-color --tail=300 mc'
```

Read-only RCON:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "tick query"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "datapack list enabled"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "data get block <x> <y> <z>"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "scoreboard players get <player> <objective>"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 rcon-cli "data get storage <namespace:path> <path>"'
```

Read-only JVM/process:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 ps -eo pid,ppid,comm,args'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 jcmd <java-pid> Thread.print -l'
```

Read-only world layout:

```bash
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 sh -lc "find /data/world -maxdepth 3 -type d -printf \"%p\\n\" | sort"'
ssh MC_XCCTW 'docker exec mcxcctw-mc-1 sh -lc "find /data/world/datapacks -maxdepth 1 -type f -name \"*.zip\" -printf \"%f\\n\" | sort"'
```

## Things Not To Forget

- One datapack failing load can break another datapack's initialization.
- Tick functions can still run even when load initialization failed.
- `Command execution stopped due to limit` is often a symptom of an infinite datapack/command-block loop, not a generic performance issue.
- Thread dumps are valuable because they show the active hot path without modifying server state.
- World file permissions on the host may block direct reads; reading from inside the container is usually easier and still safe if read-only.
- Avoid broad entity selectors on a lagging server; scope by type, distance, coordinates, and `limit=1`.
- Always distinguish quick mitigation from root fix.
- After editing or creating an OpenCode skill, tell the user to restart OpenCode for future sessions to load it.
