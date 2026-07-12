# vrr

A tiny wrapper that enables **Adaptive Sync (VRR)** on your monitor while a
Steam game runs, and restores your previous setting when the game exits.

It replaces the manual [`toggle-vrr.sh`](toggle-vrr.sh) script: instead of
flipping VRR by hand before and after playing, you let `vrr` do it around the
game's lifetime.

Requires KDE Plasma's `kscreen-doctor` (and, optionally, `notify-send` for
desktop notifications).

## Build

```bash
bun install
bun run build   # produces the ./vrr single-file binary
```

## Install

Put the compiled `vrr` binary somewhere on your `PATH`, e.g.:

```bash
install -m755 vrr ~/.local/bin/vrr
```

## Use

In the Steam game's **Launch Options** (right-click game → Properties):

```
vrr %command%
```

Steam expands `%command%` into the full game command, which `vrr` runs. It:

1. Records the monitor's current VRR policy.
2. Sets VRR to **Always**.
3. Runs the game and waits for it to exit.
4. Restores the original VRR policy — even if the game crashes or Steam kills it.

## Configuration

The target monitor defaults to `HDMI-A-1`. Override it with an environment
variable:

```
VRR_MONITOR=DP-3 vrr %command%
```

Run `kscreen-doctor -o` to see your monitor output names.
