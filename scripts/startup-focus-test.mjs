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

console.log("Startup focus checks passed");
