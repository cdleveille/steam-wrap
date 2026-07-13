# steamwrap

Steam game launch option wrappers for CachyOS Linux that manage **Adaptive Sync (VRR)** and **gamemode**/**game-performance**.

## vrr

A tiny wrapper that enables **Adaptive Sync (VRR)** on your monitor while a
Steam game runs, and restores your previous setting when the game exits.

Requires KDE Plasma's `kscreen-doctor` (and, optionally, `notify-send` for
desktop notifications).

### Build

```bash
bun install
bun build:vrr   # produces the bin/vrr single-file binary
```

### Install

Put the compiled `vrr` binary somewhere on your `PATH`, e.g.:

```bash
install -m755 bin/vrr ~/.local/bin/vrr
```

### Use

In the Steam game's **Launch Options** (right-click game → Properties):

```
vrr %command%
```

Steam expands `%command%` into the full game command, which `vrr` runs. It:

1. Records the monitor's current VRR policy.
2. Sets VRR to **Always**.
3. Runs the game and waits for it to exit.
4. Restores the original VRR policy — even if the game crashes or Steam kills it.

### Configuration

The target monitor defaults to `HDMI-A-1`. Override it with an environment
variable:

```
VRR_MONITOR=DP-3 vrr %command%
```

Run `kscreen-doctor -o` to see your monitor output names.

---

## gm

A companion wrapper that runs a Steam game under **gamemode** and CachyOS's
**game-performance**, and pauses the **ananicy-cpp** service while the game
runs — so the two niceness managers don't fight over process priorities.
It restarts ananicy-cpp when the game exits.

Requires `gamemoderun` and `game-performance` (missing ones are skipped), and
`sudo` configured to stop/start `ananicy-cpp` without a password (see below).

### Build

```bash
bun install
bun build:gm   # produces the bin/gm single-file binary
```

Install it on your `PATH` alongside `vrr`:

```bash
install -m755 bin/gm ~/.local/bin/gm
```

### Grant passwordless service control

Stopping a system service needs root, and there's no terminal to type a
password into during a Steam launch. Allow just those two commands without a
password by creating a sudoers drop-in (replace `cdlev` with your username):

```sh
# Portable across bash/zsh/fish (fish has no heredocs).
printf '%s\n' 'cdlev ALL=(root) NOPASSWD: /usr/bin/systemctl stop ananicy-cpp, /usr/bin/systemctl start ananicy-cpp' \
  | sudo tee /etc/sudoers.d/ananicy-cpp-gm >/dev/null
sudo chmod 440 /etc/sudoers.d/ananicy-cpp-gm
sudo visudo -cf /etc/sudoers.d/ananicy-cpp-gm   # validate syntax
```

If this isn't set up, `gm` still launches the game — it just logs that it
couldn't pause ananicy-cpp and carries on.

### Use

In the Steam game's **Launch Options**:

```
gm %command%
```

`gm` then:

1. Stops `ananicy-cpp` if it's running.
2. Launches the game as `game-performance gamemoderun %command%`.
3. Waits for the game to exit.
4. Restarts `ananicy-cpp` if it stopped it — even if the game crashes or Steam
   kills it.

Combine it with `vrr` by nesting the wrappers:

```
vrr gm %command%
```

### Configuration

The service defaults to `ananicy-cpp`. Override it with an environment
variable (remember to update the sudoers rule to match):

```
GM_SERVICE=ananicy-cpp.service gm %command%
```
