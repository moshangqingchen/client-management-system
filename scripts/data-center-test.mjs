import assert from "node:assert/strict";
import fs from "node:fs";

const mainSource = fs.readFileSync(new URL("../src/electron/main.ts", import.meta.url), "utf8");
const databaseSource = fs.readFileSync(new URL("../src/electron/database.ts", import.meta.url), "utf8");
const preloadSource = fs.readFileSync(new URL("../src/electron/preload.ts", import.meta.url), "utf8");
const rendererSource = fs.readFileSync(new URL("../src/renderer/App.tsx", import.meta.url), "utf8");
const typeSource = fs.readFileSync(new URL("../src/shared/types.ts", import.meta.url), "utf8");

assert.match(rendererSource, /type\s+ActiveView\s*=\s*[^;]*"data"/, "data center should be a first-class app view");
assert.match(rendererSource, /function\s+DataCenterView/, "renderer should include a DataCenterView component");
assert.match(rendererSource, /数据中心/, "renderer should label the data center in Chinese");
assert.match(rendererSource, /exportBackup/, "renderer should expose an export backup action");
assert.match(rendererSource, /导出备份/, "renderer should label the export backup action in Chinese");
assert.match(rendererSource, /openBackupFolder/, "renderer should expose an open latest backup action");
assert.match(rendererSource, /打开最近备份/, "renderer should label the open latest backup action in Chinese");

assert.match(typeSource, /interface\s+StorageInfo[\s\S]*dataRoot/, "storage info should expose the app data root");
assert.match(typeSource, /interface\s+StorageInfo[\s\S]*appVersion/, "storage info should expose the app version");
assert.match(typeSource, /interface\s+StorageInfo[\s\S]*databaseSize/, "storage info should expose database size");
assert.match(typeSource, /interface\s+StorageInfo[\s\S]*filesSize/, "storage info should expose customer file size");
assert.match(typeSource, /interface\s+StorageInfo[\s\S]*fileCount/, "storage info should expose customer file count");
assert.match(typeSource, /interface\s+StorageBackupResult[\s\S]*backupPath/, "backup export should return the created backup path");

assert.match(mainSource, /storage:open-data-root/, "main process should open the app data directory");
assert.match(mainSource, /storage:open-files-root/, "main process should open the customer file directory");
assert.match(mainSource, /storage:reveal-database/, "main process should reveal the database file");
assert.match(mainSource, /storage:export-backup/, "main process should export a backup");
assert.match(mainSource, /storage:open-backup-folder/, "main process should open an exported backup folder");
assert.match(mainSource, /backup-info\.json/, "backup folder opening should verify the backup marker file");
assert.match(databaseSource, /VACUUM INTO/, "database backup should use SQLite VACUUM INTO for a consistent database copy");
assert.match(databaseSource, /getFolderStats/, "database layer should compute customer file folder stats");
assert.match(rendererSource, /数据库大小/, "renderer should show database size");
assert.match(rendererSource, /客户文件大小/, "renderer should show customer file size");
assert.match(rendererSource, /客户文件数量/, "renderer should show customer file count");

assert.match(preloadSource, /openDataRoot/, "preload should expose openDataRoot");
assert.match(preloadSource, /openFilesRoot/, "preload should expose openFilesRoot");
assert.match(preloadSource, /revealDatabase/, "preload should expose revealDatabase");
assert.match(preloadSource, /exportBackup/, "preload should expose exportBackup");
assert.match(preloadSource, /openBackupFolder/, "preload should expose openBackupFolder");

assert.doesNotMatch(mainSource, /storage:restore/, "data center foundation must not add risky restore behavior yet");

console.log("Data center checks passed");
