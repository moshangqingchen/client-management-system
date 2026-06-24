import assert from "node:assert/strict";
import fs from "node:fs";

const mainSource = fs.readFileSync(new URL("../src/electron/main.ts", import.meta.url), "utf8");

assert.match(
  mainSource,
  /function\s+showMainWindow\s*\([^)]*forceForeground/,
  "showMainWindow should accept a forceForeground option for explicit relaunch/focus requests"
);

assert.match(
  mainSource,
  /setAlwaysOnTop\s*\(\s*true/,
  "forced relaunch focus should briefly lift the window above other apps"
);

assert.match(
  mainSource,
  /flashFrame\s*\(\s*true/,
  "forced relaunch focus should flash the taskbar button when Windows blocks foreground focus"
);

assert.match(
  mainSource,
  /second-instance[^;\n]+forceForeground:\s*true/s,
  "second-instance should use forced foreground behavior"
);

assert.match(
  mainSource,
  /show:\s*false/,
  "main window should stay hidden until the renderer has painted"
);

assert.match(
  mainSource,
  /paintWhenInitiallyHidden:\s*true/,
  "hidden startup window should still paint before ready-to-show"
);

assert.match(
  mainSource,
  /backgroundColor:\s*initialWindowBackgroundColor/,
  "startup window should use the light renderer background instead of a black native background"
);

console.log("Startup focus checks passed");
