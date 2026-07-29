[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("reference", "active", "archive")]
    [string]$Role,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedRoot,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedCommonDirectory,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedBranch,
    [string]$ExpectedHead = "",
    [ValidateSet("change", "inspect")]
    [string]$Mode = "change",
    [switch]$ContinueExistingChanges,
    [switch]$SkipRemoteLookup
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$arguments = @(
    (Join-Path $scriptRoot "preflight.mjs"),
    "--role", $Role,
    "--mode", $Mode,
    "--expected-root", $ExpectedRoot,
    "--expected-common-directory", $ExpectedCommonDirectory,
    "--expected-branch", $ExpectedBranch
)

if ($ExpectedHead) {
    $arguments += @("--expected-head", $ExpectedHead)
}
if ($ContinueExistingChanges) {
    $arguments += "--continue-existing-changes"
}
if ($SkipRemoteLookup) {
    $arguments += "--skip-remote-lookup"
}
& node @arguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
