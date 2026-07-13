#!/usr/bin/env bun

/**
 * gm — run a game under gamemode + CachyOS game-performance, pausing
 * ananicy-cpp for the duration so the two niceness managers don't fight.
 *
 * Usage (in a Steam game's Launch Options):
 *
 *     gm %command%
 *
 * Steam expands `%command%` into the full game command + arguments, so this
 * process receives them as its own argv. We:
 *
 *   1. Note whether ananicy-cpp is running, and stop it if so.
 *   2. Launch the game wrapped as `game-performance gamemoderun <game>`.
 *   3. Wait for the game to exit.
 *   4. Restart ananicy-cpp if we stopped it — even on crash, or when Steam
 *      kills us.
 *
 * ananicy-cpp is a system service, so stopping/starting it needs root. This
 * wrapper shells out to `sudo -n` (non-interactive); grant it a passwordless
 * rule for just those two commands — see the README. If the service can't be
 * stopped (no rule, sudo missing, etc.) we log it and launch the game anyway.
 *
 * The service defaults to `ananicy-cpp` and can be overridden with the
 * GM_SERVICE environment variable.
 */

const SERVICE = process.env.GM_SERVICE ?? "ananicy-cpp";

/** Send a desktop notification. Best-effort — never throws. */
function notify(message: string, icon: string): void {
  try {
    Bun.spawnSync(["notify-send", message, `--icon=${icon}`]);
  } catch {
    // notify-send may be missing; the wrapper should still work.
  }
}

/** Whether the given systemd service is currently active. */
function isServiceActive(service: string): boolean {
  // `is-active` doesn't need root, so this is a plain query.
  try {
    const result = Bun.spawnSync(["systemctl", "is-active", "--quiet", service]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Stop or start the service via passwordless sudo. Returns whether the
 * systemctl command reported success. Best-effort — never throws.
 */
function controlService(action: "stop" | "start", service: string): boolean {
  try {
    const result = Bun.spawnSync(["sudo", "-n", "systemctl", action, service]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Build the launch command, wrapping the game with whichever of
 * game-performance and gamemoderun are actually installed. Missing wrappers
 * are skipped rather than failing the launch.
 */
function buildCommand(game: string[]): string[] {
  const prefix: string[] = [];
  if (Bun.which("game-performance")) prefix.push("game-performance");
  if (Bun.which("gamemoderun")) prefix.push("gamemoderun");
  return [...prefix, ...game];
}

function main(): Promise<never> {
  const game = process.argv.slice(2);

  if (game.length === 0) {
    console.error("Usage: gm <command> [args...]");
    console.error("Typically used in Steam Launch Options as: gm %command%");
    process.exit(2);
  }

  // Pausing ananicy-cpp must never prevent the game from launching. The helpers
  // are already non-throwing, but wrap the whole setup as a final backstop so
  // any unexpected error here still falls through to launching the game.
  let stoppedService = false;
  try {
    // Only touch the service if it's actually running — and only arrange to
    // restart it if we were the one who stopped it.
    if (isServiceActive(SERVICE)) {
      if (controlService("stop", SERVICE)) {
        stoppedService = true;
        notify(`⏸️ Paused ${SERVICE}`, "applications-games");
      } else {
        console.error(`gm: could not stop ${SERVICE} (need passwordless sudo?)`);
      }
    }
  } catch {
    // Ignore — proceed to launch the game regardless.
  }

  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    if (!stoppedService) return;
    try {
      if (controlService("start", SERVICE)) {
        notify(`▶️ Resumed ${SERVICE}`, "applications-games");
      }
    } catch {
      // Best-effort restore; nothing more we can do.
    }
  };

  const command = buildCommand(game);

  // Launch the game, wiring its stdio straight through to ours. If the command
  // itself can't be spawned, restart the service and surface the error.
  let child: Bun.Subprocess;
  try {
    child = Bun.spawn(command, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  } catch (err) {
    restore();
    console.error("gm: failed to launch command:", err);
    process.exit(1);
  }

  // If Steam (or the user) signals us, forward it to the game so it can shut
  // down cleanly; the child's exit then triggers the service restart below.
  process.on("SIGINT", () => {
    try {
      child.kill("SIGINT");
    } catch {}
  });
  process.on("SIGTERM", () => {
    try {
      child.kill("SIGTERM");
    } catch {}
  });

  return child.exited
    .then((code) => {
      restore();
      process.exit(code);
    })
    .catch((err) => {
      restore();
      console.error("gm: failed to run command:", err);
      process.exit(1);
    }) as Promise<never>;
}

await main();
