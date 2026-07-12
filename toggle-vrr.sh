#!/bin/bash

# Target monitor
MONITOR="HDMI-A-1"

# 1. Strip any hidden ANSI color escape codes from the output
# 2. Isolate the text block starting from HDMI-A-1 down to the next monitor output
MONITOR_BLOCK=$(kscreen-doctor -o | sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' | sed -n "/Output:.*$MONITOR/,/Output:/p")

# 3. Use a loose grep check. If "always" is found anywhere on the VRR line, switch to never.
if echo "$MONITOR_BLOCK" | grep -i "Vrr:" | grep -iq "always"; then
    kscreen-doctor output."$MONITOR".vrrpolicy.never
    notify-send "✅ Adaptive Sync: Never" --icon=video-display
else
    kscreen-doctor output."$MONITOR".vrrpolicy.always
    notify-send "✅ Adaptive Sync: Always" --icon=applications-games
fi
