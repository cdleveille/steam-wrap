#!/usr/bin/env bun

/**
 * vrr — enable Adaptive Sync (VRR) for a monitor while a game runs.
 *
 * Usage (in a Steam game's Launch Options):
 *
 *     vrr %command%
 *
 * Steam expands `%command%` into the full game command + arguments, so this
 * process receives them as its own argv. We:
 *
 *   1. Remember the monitor's current VRR policy.
 *   2. Switch VRR to "always".
 *   3. Run the game and wait for it to exit.
 *   4. Restore the original VRR policy — even on crash, or when Steam kills us.
 *
 * The target monitor defaults to HDMI-A-1 and can be overridden with the
 * VRR_MONITOR environment variable. Requires KDE's `kscreen-doctor`.
 */

const MONITOR = process.env.VRR_MONITOR ?? "HDMI-A-1";

/** VRR policies as reported / accepted by kscreen-doctor. */
type VrrPolicy = "Never" | "Automatic" | "Always";

/** Send a desktop notification. Best-effort — never throws. */
function notify(message: string, icon: string): void {
  try {
    Bun.spawnSync(["notify-send", message, `--icon=${icon}`]);
  } catch {
    // notify-send may be missing; the wrapper should still work.
  }
}

/** Strip ANSI color escape codes from kscreen-doctor output. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/** Read the current VRR policy for the target monitor, or null if unknown. */
function readVrrPolicy(): VrrPolicy | null {
  // Everything here is best-effort: if kscreen-doctor is missing or errors,
  // we must not throw — launching the game takes priority over VRR.
  try {
    const result = Bun.spawnSync(["kscreen-doctor", "-o"]);
    if (result.exitCode !== 0) return null;

    const output = stripAnsi(result.stdout.toString());
    const lines = output.split("\n");

    // Find the block for our monitor: from its `Output:` line to the next one.
    let inBlock = false;
    for (const line of lines) {
      if (/^Output:/.test(line)) {
        inBlock = line.includes(MONITOR);
        continue;
      }
      if (inBlock) {
        const match = line.match(/Vrr:\s*(\w+)/i);
        if (match?.[1]) {
          const value = match[1].toLowerCase();
          if (value === "never") return "Never";
          if (value === "automatic") return "Automatic";
          if (value === "always") return "Always";
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Apply a VRR policy to the target monitor. Returns whether it succeeded. */
function setVrrPolicy(policy: VrrPolicy): boolean {
  const value = policy.toLowerCase(); // never | automatic | always
  try {
    const result = Bun.spawnSync([
      "kscreen-doctor",
      `output.${MONITOR}.vrrpolicy.${value}`,
    ]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function main(): Promise<never> {
  const command = process.argv.slice(2);

  if (command.length === 0) {
    console.error("Usage: vrr <command> [args...]");
    console.error("Typically used in Steam Launch Options as: vrr %command%");
    process.exit(2);
  }

  // Turning VRR on must never prevent the game from launching. The helpers
  // are already non-throwing, but wrap the whole setup as a final backstop so
  // any unexpected error here still falls through to launching the game.
  let originalPolicy: VrrPolicy = "Never";
  try {
    // Capture the policy to restore afterwards. If we can't read it (e.g. the
    // command isn't KDE), fall back to "Never" so we still leave VRR sensible.
    originalPolicy = readVrrPolicy() ?? "Never";
    if (setVrrPolicy("Always")) {
      notify("✅ Adaptive Sync: Always", "applications-games");
    }
  } catch {
    // Ignore — proceed to launch the game regardless.
  }

  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    try {
      if (setVrrPolicy(originalPolicy)) {
        notify(`✅ Adaptive Sync: ${originalPolicy}`, "video-display");
      }
    } catch {
      // Best-effort restore; nothing more we can do.
    }
  };

  // Launch the game, wiring its stdio straight through to ours. If the command
  // itself can't be spawned, restore VRR and surface the error.
  let child: Bun.Subprocess;
  try {
    child = Bun.spawn(command, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  } catch (err) {
    restore();
    console.error("vrr: failed to launch command:", err);
    process.exit(1);
  }

  // If Steam (or the user) signals us, forward it to the game so it can shut
  // down cleanly; the child's exit then triggers the VRR restore below.
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
      console.error("vrr: failed to run command:", err);
      process.exit(1);
    }) as Promise<never>;
}

await main();
