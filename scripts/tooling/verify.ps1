[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("active")]
    [string]$Role,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedRoot,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedCommonDirectory,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedBranch,
    [string]$ExpectedHead = "",
    [switch]$ContinueExistingChanges,
    [switch]$SkipRemoteLookup,
    [switch]$SkipInstall,
    [string]$EnvironmentNamesFile = "",
    [ValidateSet("", "development", "preview", "staging", "production")]
    [string]$Environment = ""
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptRoot "..\..")).Path
Set-Location $repoRoot

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host "`n== $Name =="
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

Invoke-Step "Repository preflight" {
    $preflightArguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptRoot "preflight.ps1"),
        "-Role", $Role,
        "-Mode", "change",
        "-ExpectedRoot", $ExpectedRoot,
        "-ExpectedCommonDirectory", $ExpectedCommonDirectory,
        "-ExpectedBranch", $ExpectedBranch
    )
    if ($ExpectedHead) {
        $preflightArguments += @("-ExpectedHead", $ExpectedHead)
    }
    if ($ContinueExistingChanges) {
        $preflightArguments += "-ContinueExistingChanges"
    }
    if ($SkipRemoteLookup) {
        $preflightArguments += "-SkipRemoteLookup"
    }
    & powershell @preflightArguments
}

Invoke-Step "Node and npm versions" { & npm.cmd run check:versions }

if (-not $SkipInstall) {
    Invoke-Step "Clean dependency install" { & npm.cmd ci }
}

Invoke-Step "Lint" { & npm.cmd run lint }
Invoke-Step "Tests" { & npm.cmd test }
Invoke-Step "Production build" { & npm.cmd run build }
Invoke-Step "Local Git diff checks" { & npm.cmd run check:diff-local }
Invoke-Step "Repository text, secret, browser-prefix, and function-budget checks" {
    & npm.cmd run check:repository
}

$auditArguments = @("scripts/tooling/environment-key-audit.mjs")
if ($EnvironmentNamesFile) {
    $auditArguments += @("--names-file", $EnvironmentNamesFile)
}
if ($Environment) {
    $auditArguments += @("--environment", $Environment)
}
Invoke-Step "Environment key audit" { & node @auditArguments }
Invoke-Step "Skill governance and MCP documentation" { & npm.cmd run check:governance }

Write-Host "`nPASS complete local verification."
