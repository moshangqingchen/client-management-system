export interface UpdateScriptOptions {
  sourcePath: string;
  targetPath: string;
  targetExePath: string;
  expectedVersion: string;
  logPath: string;
  readyPath: string;
  pidToWait: number;
}

export function createUpdateScript(options: UpdateScriptOptions): string {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$source = ${toPowerShellString(options.sourcePath)}`,
    `$target = ${toPowerShellString(options.targetPath)}`,
    `$exe = ${toPowerShellString(options.targetExePath)}`,
    `$expectedVersion = ${toPowerShellString(options.expectedVersion)}`,
    `$log = ${toPowerShellString(options.logPath)}`,
    `$ready = ${toPowerShellString(options.readyPath)}`,
    `$pidToWait = ${options.pidToWait}`,
    "function Write-UpdateLog([string]$message) {",
    "  Add-Content -LiteralPath $log -Value \"$(Get-Date -Format o) $message\" -Encoding UTF8",
    "}",
    "try {",
    "  Set-Content -LiteralPath $ready -Value $PID -Encoding ASCII",
    "  Write-UpdateLog \"update started source=$source target=$target expected=$expectedVersion\"",
    "  Wait-Process -Id $pidToWait -ErrorAction SilentlyContinue",
    "  Remove-Item -LiteralPath $ready -Force -ErrorAction SilentlyContinue",
    "  $targetPrefix = [System.IO.Path]::GetFullPath($target).TrimEnd('\\') + '\\'",
    "  $deadline = (Get-Date).AddSeconds(30)",
    "  do {",
    "    $blockingProcesses = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {",
    "      try {",
    "        $_.Path -and [System.IO.Path]::GetFullPath($_.Path).StartsWith($targetPrefix, [System.StringComparison]::OrdinalIgnoreCase)",
    "      } catch {",
    "        $false",
    "      }",
    "    })",
    "    if ($blockingProcesses.Count -eq 0) { break }",
    "    Start-Sleep -Milliseconds 500",
    "  } while ((Get-Date) -lt $deadline)",
    "  if ($blockingProcesses.Count -gt 0) {",
    "    throw \"installation files are still in use by process ids: $($blockingProcesses.Id -join ',')\"",
    "  }",
    "  $robocopy = Join-Path $env:SystemRoot 'System32\\robocopy.exe'",
    "  & $robocopy $source $target /E /IS /IT /COPY:DAT /DCOPY:DAT /R:10 /W:1 /NFL /NDL /NJH /NJS /NP",
    "  $copyExitCode = $LASTEXITCODE",
    "  if ($copyExitCode -ge 8) { throw \"robocopy failed with exit code $copyExitCode\" }",
    "  $targetPackage = Join-Path $target 'resources\\app\\package.json'",
    "  $installedVersion = [string]((Get-Content -LiteralPath $targetPackage -Raw -Encoding UTF8 | ConvertFrom-Json).version)",
    "  if ($installedVersion -ne $expectedVersion) {",
    "    throw \"version verification failed: expected $expectedVersion, installed $installedVersion\"",
    "  }",
    "  Write-UpdateLog \"update completed version=$installedVersion robocopy=$copyExitCode\"",
    "  Start-Process -FilePath $exe",
    "  exit 0",
    "} catch {",
    "  Remove-Item -LiteralPath $ready -Force -ErrorAction SilentlyContinue",
    "  Write-UpdateLog \"update failed: $($_ | Out-String)\"",
    "  if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe }",
    "  exit 1",
    "}"
  ].join("\n");

  // Windows PowerShell 5.1 needs a BOM to decode non-ASCII paths correctly.
  return `\uFEFF${script}`;
}

function toPowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
