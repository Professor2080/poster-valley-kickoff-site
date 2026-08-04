[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedBranch,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedSha,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$PreviewUrl,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedVercelProject,

    [string]$ExpectedRepository = 'Professor2080/poster-valley-kickoff-site',
    [string]$DeploymentId = '',
    [string]$BranchAlias = '',

    # Test-only dependency injection. Refused unless PV_PREVIEW_TEST_MODE=1.
    [string]$FixtureDirectory = '',
    [string]$VercelCommandName = 'vercel'
)

$ErrorActionPreference = 'Stop'
$script:FailedGateCount = 0
$script:MaximumVercelFunctions = 12
$script:RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:RequiredPublicRoutes = @('/', '/privacy', '/terms', '/admin')
$script:RequiredAdminApiRoutes = @('/api/admin/authorization', '/api/admin/delivery-status')

function Protect-Text {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) { return '' }
    $text = [string]$Value
    $text = [regex]::Replace($text, '(?i)(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+', '[REDACTED_CONNECTION_STRING]')
    $text = [regex]::Replace($text, '(?i)(--(?:token|protection-bypass)\s+)([^\s]+)', '$1[REDACTED]')
    $text = [regex]::Replace($text, '(?i)(token|password|secret|api[_-]?key|authorization)(\s*[:=]\s*)([^\s,;]+)', '$1$2[REDACTED]')
    $text = [regex]::Replace($text, '(?i)\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|vcp_[A-Za-z0-9_]{12,}|vercel_[A-Za-z0-9_]{12,})\b', '[REDACTED_TOKEN]')
    $text = [regex]::Replace($text, '\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b', '[REDACTED_JWT]')
    $text = [regex]::Replace($text, '(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', '[REDACTED_EMAIL]')
    $text = [regex]::Replace($text, '([?&][^=\s&]+)=([^&\s]+)', '$1=[REDACTED]')
    return $text.Trim()
}

function Add-Gate {
    param(
        [ValidateSet('PASS', 'FAIL', 'SKIP')]
        [string]$Status,
        [string]$Name,
        [string]$Message
    )

    if ($Status -eq 'FAIL') { $script:FailedGateCount += 1 }
    Write-Output ('[{0}] {1} - {2}' -f $Status, $Name, (Protect-Text $Message))
}

function Resolve-ApplicationShim {
    param([string]$Name)

    $hasDirectory = $Name.IndexOfAny(@([char]'\', [char]'/')) -ge 0
    if ($hasDirectory -or [IO.Path]::GetExtension($Name)) {
        $candidateNames = @($Name)
        if (-not [IO.Path]::GetExtension($Name)) {
            $candidateNames = @("$Name.cmd", "$Name.exe", "$Name.com")
        }
        foreach ($candidateName in $candidateNames) {
            if (Test-Path -LiteralPath $candidateName -PathType Leaf) {
                $extension = [IO.Path]::GetExtension($candidateName).ToLowerInvariant()
                if ($extension -notin @('.cmd', '.exe', '.com')) {
                    throw "Only application shims (.cmd, .exe or .com) are allowed for '$Name'."
                }
                return (Resolve-Path -LiteralPath $candidateName).Path
            }
        }
        throw "Application command '$Name' was not found."
    }

    $names = if ($env:OS -eq 'Windows_NT') {
        @("$Name.cmd", "$Name.exe", "$Name.com")
    } else {
        @($Name)
    }
    foreach ($candidateName in $names) {
        $command = Get-Command $candidateName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command) { return $command.Source }
    }
    throw "Application command '$Name' was not found."
}

function Invoke-External {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 wraps ordinary native stderr as NativeCommandError. Capture it and
        # judge the native process only by its exit code; callers still parse stdout fail-closed.
        $ErrorActionPreference = 'Continue'
        $output = @(& $FilePath @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $text = ($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $safe = Protect-Text $text
        if (-not $safe) { $safe = "command exited with code $exitCode" }
        throw $safe
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = $text }
}

function ConvertFrom-CommandJson {
    param([string]$Text)

    $trimmed = $Text.Trim()
    try { return $trimmed | ConvertFrom-Json } catch {}

    $first = $trimmed.IndexOf('{')
    $last = $trimmed.LastIndexOf('}')
    if ($first -ge 0 -and $last -gt $first) {
        try { return $trimmed.Substring($first, $last - $first + 1) | ConvertFrom-Json } catch {}
    }
    throw 'The Vercel CLI did not return valid JSON.'
}

function Get-PropertyValue {
    param([object]$Object, [string[]]$Paths)

    foreach ($path in $Paths) {
        $current = $Object
        $found = $true
        foreach ($segment in $path.Split('.')) {
            if ($null -eq $current) { $found = $false; break }
            $property = $current.PSObject.Properties[$segment]
            if ($null -eq $property) { $found = $false; break }
            $current = $property.Value
        }
        if ($found -and $null -ne $current -and [string]$current -ne '') { return $current }
    }
    return $null
}

function Normalize-HostName {
    param([string]$Value)
    if (-not $Value) { return '' }
    $candidate = $Value.Trim().TrimEnd('/')
    if ($candidate -notmatch '^https?://') { $candidate = "https://$candidate" }
    try { return ([uri]$candidate).Host.ToLowerInvariant() } catch { return '' }
}

function Normalize-RepositorySlug {
    param([string]$Value)
    if (-not $Value) { return '' }
    $slug = $Value.Trim().TrimEnd('/')
    $slug = $slug -replace '\.git$', ''
    $slug = $slug -replace '^git@github\.com:', ''
    $slug = $slug -replace '^ssh://git@github\.com/', ''
    $slug = $slug -replace '^https?://github\.com/', ''
    return $slug.ToLowerInvariant()
}

function Read-RepositoryState {
    if ($FixtureDirectory) {
        if ($env:PV_PREVIEW_TEST_MODE -ne '1') {
            throw 'FixtureDirectory is available only when PV_PREVIEW_TEST_MODE=1.'
        }
        $fixturePath = Join-Path $FixtureDirectory 'repository.json'
        if (-not (Test-Path -LiteralPath $fixturePath -PathType Leaf)) {
            throw 'The test repository fixture is missing.'
        }
        return Get-Content -LiteralPath $fixturePath -Raw | ConvertFrom-Json
    }

    $git = Resolve-ApplicationShim 'git'
    $root = (Invoke-External $git @('-C', $script:RepositoryRoot, 'rev-parse', '--show-toplevel')).Output.Trim()
    $branch = (Invoke-External $git @('-C', $script:RepositoryRoot, 'branch', '--show-current')).Output.Trim()
    $head = (Invoke-External $git @('-C', $script:RepositoryRoot, 'rev-parse', 'HEAD')).Output.Trim()
    $origin = (Invoke-External $git @('-C', $script:RepositoryRoot, 'remote', 'get-url', 'origin')).Output.Trim()
    $status = (Invoke-External $git @('-C', $script:RepositoryRoot, 'status', '--porcelain=v1', '-uall')).Output.Trim()
    $remoteResult = Invoke-External $git @('ls-remote', '--exit-code', 'origin', "refs/heads/$ExpectedBranch") -AllowFailure
    $remoteSha = ''
    if ($remoteResult.ExitCode -eq 0 -and $remoteResult.Output -match '^([0-9a-fA-F]{40})\s') {
        $remoteSha = $Matches[1]
    }
    return [pscustomobject]@{
        root = $root
        branch = $branch
        head = $head
        origin = $origin
        remoteSha = $remoteSha
        clean = -not [bool]$status
    }
}

function Get-DeploymentFunctionNames {
    param([object]$Deployment)

    $names = @()
    $value = Get-PropertyValue $Deployment @('functions', 'resources.functions', 'deployment.functions', 'build.functions')
    if ($null -ne $value) {
        if ($value -is [Collections.IDictionary] -or $value -is [pscustomobject]) {
            $names += @($value.PSObject.Properties.Name)
        } else {
            foreach ($entry in @($value)) {
                if ($entry -is [string]) { $names += $entry; continue }
                $name = Get-PropertyValue $entry @('name', 'path', 'src', 'source')
                if ($name) { $names += [string]$name }
            }
        }
    }
    foreach ($build in @($Deployment.builds)) {
        foreach ($output in @($build.output)) {
            if ([string]$output.type -eq 'lambda') {
                $path = Get-PropertyValue $output @('path', 'name', 'src', 'source')
                if ($path) { $names += [string]$path }
            }
        }
    }
    return @($names | Sort-Object -Unique)
}

function Invoke-VercelJson {
    param([string]$VercelPath, [string]$Target)
    $result = Invoke-External $VercelPath @(
        'inspect', $Target, '--format=json', '--no-color', '--non-interactive', '--cwd', $script:RepositoryRoot
    )
    return ConvertFrom-CommandJson $result.Output
}

function Get-VercelSourceDeployment {
    param(
        [string]$VercelPath,
        [string]$DeploymentIdValue,
        [string]$DeploymentUrlValue
    )

    $result = Invoke-External $VercelPath @(
        'list', $ExpectedVercelProject, '--meta', "githubCommitSha=$ExpectedSha", '--limit', '100',
        '--format=json', '--no-color', '--non-interactive', '--cwd', $script:RepositoryRoot
    )
    $payload = ConvertFrom-CommandJson $result.Output
    $matches = @($payload.deployments | Where-Object {
        ([string]$_.id -eq $DeploymentIdValue) -and
        ((Normalize-HostName ([string]$_.url)) -eq (Normalize-HostName $DeploymentUrlValue))
    })
    if ($matches.Count -ne 1) {
        throw 'The exact deployment was not found once in the SHA-filtered project metadata.'
    }
    return $matches[0]
}

function Invoke-RouteStatus {
    param([string]$VercelPath, [string]$Route)

    $result = Invoke-External $VercelPath @(
        'curl', $Route, '--deployment', $PreviewUrl, '--no-color', '--non-interactive', '--cwd', $script:RepositoryRoot,
        '--', '--silent', '--show-error', '--output', 'NUL', '--write-out', '%{http_code}', '--request', 'GET', '--max-time', '30'
    )
    $matches = [regex]::Matches($result.Output, '(?<!\d)([1-5]\d{2})(?!\d)')
    if ($matches.Count -eq 0) { throw "No HTTP status was returned for route '$Route'." }
    return [int]$matches[$matches.Count - 1].Groups[1].Value
}

try {
    if ($env:PV_PREVIEW_TEST_MODE -ne '1' -and ($FixtureDirectory -or $VercelCommandName -ne 'vercel')) {
        throw 'Test dependency injection is prohibited outside PV_PREVIEW_TEST_MODE.'
    }
    if ($ExpectedVercelProject -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$') {
        throw 'ExpectedVercelProject is not a safe explicit project slug.'
    }
    if ($ExpectedBranch -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$' -or
        $ExpectedBranch.Contains('..') -or $ExpectedBranch.Contains('@{') -or
        $ExpectedBranch.EndsWith('/') -or $ExpectedBranch.EndsWith('.')) {
        throw 'ExpectedBranch is not a safe Git branch name.'
    }
    if ($ExpectedBranch -eq 'main') { throw 'ExpectedBranch must identify a non-Production feature branch.' }
    $ExpectedSha = $ExpectedSha.ToLowerInvariant()
    if ($DeploymentId -and $DeploymentId -notmatch '^dpl_[A-Za-z0-9]+$') {
        throw 'DeploymentId is not a valid explicit Vercel deployment ID.'
    }
    $previewUri = [uri]$PreviewUrl
    if ($previewUri.Scheme -ne 'https' -or -not $previewUri.Host.EndsWith('.vercel.app')) {
        throw 'PreviewUrl must be an explicit HTTPS vercel.app URL.'
    }
    if ($previewUri.Query -or $previewUri.Fragment -or $previewUri.UserInfo) {
        throw 'PreviewUrl must not contain credentials, query parameters or a fragment.'
    }
    if ($BranchAlias) {
        $aliasCandidate = if ($BranchAlias -match '^https?://') { $BranchAlias } else { "https://$BranchAlias" }
        $aliasUri = [uri]$aliasCandidate
        if ($aliasUri.Scheme -ne 'https' -or -not $aliasUri.Host.EndsWith('.vercel.app') -or
            $aliasUri.Query -or $aliasUri.Fragment -or $aliasUri.UserInfo -or $aliasUri.AbsolutePath -ne '/') {
            throw 'BranchAlias must be a bare HTTPS vercel.app hostname without path, credentials, query or fragment.'
        }
        $BranchAlias = $aliasUri.Host.ToLowerInvariant()
    }
    Add-Gate PASS 'explicit candidate input' 'branch, full SHA and Preview URL are explicit'
} catch {
    Add-Gate FAIL 'explicit candidate input' $_.Exception.Message
    exit 2
}

try {
    $repository = Read-RepositoryState
    $expectedRoot = [IO.Path]::GetFullPath($script:RepositoryRoot).TrimEnd('\', '/')
    $actualRoot = [IO.Path]::GetFullPath([string]$repository.root).TrimEnd('\', '/')
    if ($actualRoot -ne $expectedRoot) { throw 'Repository root does not match the script repository.' }
    if ([string]$repository.branch -ne $ExpectedBranch) { throw 'Local branch does not match ExpectedBranch.' }
    if ([string]$repository.head -ne $ExpectedSha) { throw 'Local HEAD does not match ExpectedSha.' }
    if (-not [bool]$repository.clean) { throw 'The candidate worktree is not clean.' }
    if ((Normalize-RepositorySlug ([string]$repository.origin)) -ne (Normalize-RepositorySlug $ExpectedRepository)) {
        throw 'The origin repository identity does not match ExpectedRepository.'
    }
    if ([string]$repository.remoteSha -ne $ExpectedSha) { throw 'The remote feature branch does not resolve to ExpectedSha.' }
    Add-Gate PASS 'repository candidate' 'repository, clean worktree, branch, local HEAD and remote branch match'
} catch {
    Add-Gate FAIL 'repository candidate' $_.Exception.Message
}

$vercelPath = $null
try {
    $vercelPath = Resolve-ApplicationShim $VercelCommandName
    Add-Gate PASS 'Vercel CLI application shim' ([IO.Path]::GetFileName($vercelPath))
} catch {
    Add-Gate FAIL 'Vercel CLI application shim' $_.Exception.Message
}

$deployment = $null
if ($null -ne $vercelPath) {
    try {
        $deployment = Invoke-VercelJson $vercelPath $PreviewUrl
        Add-Gate PASS 'deployment inspection' 'explicit deployment metadata is available'
    } catch {
        Add-Gate FAIL 'deployment inspection' $_.Exception.Message
    }
} else {
    Add-Gate FAIL 'deployment inspection' 'required Vercel CLI inspection is not executable'
}

if ($null -ne $deployment) {
    $actualId = [string](Get-PropertyValue $deployment @('id', 'deploymentId', 'deployment.id'))
    $actualProject = [string](Get-PropertyValue $deployment @('name', 'project', 'projectName', 'deployment.name'))
    $actualState = ([string](Get-PropertyValue $deployment @('state', 'readyState', 'status', 'deployment.state'))).ToUpperInvariant()
    $actualTarget = ([string](Get-PropertyValue $deployment @('target', 'environment', 'deployment.target'))).ToLowerInvariant()
    $actualUrl = [string](Get-PropertyValue $deployment @('url', 'deployment.url'))

    $sourceDeployment = $null
    try {
        $sourceDeployment = Get-VercelSourceDeployment $vercelPath $actualId $actualUrl
        Add-Gate PASS 'deployment source metadata' 'exact ID and URL occur once in SHA-filtered project metadata'
    } catch {
        Add-Gate FAIL 'deployment source metadata' $_.Exception.Message
    }
    $actualSha = [string](Get-PropertyValue $sourceDeployment @('meta.githubCommitSha', 'gitSource.sha', 'source.sha'))
    $actualBranch = [string](Get-PropertyValue $sourceDeployment @('meta.githubCommitRef', 'gitSource.ref', 'source.ref'))
    $actualRepo = [string](Get-PropertyValue $sourceDeployment @('meta.githubCommitRepo', 'meta.githubRepo', 'meta.githubRepoName', 'gitSource.repo', 'source.repo'))

    if ($actualProject -eq $ExpectedVercelProject) {
        Add-Gate PASS 'Vercel project identity' 'deployment project matches ExpectedVercelProject'
    } else { Add-Gate FAIL 'Vercel project identity' 'deployment project does not match ExpectedVercelProject' }

    if ($DeploymentId) {
        if ($actualId -eq $DeploymentId) { Add-Gate PASS 'deployment id' 'deployment id matches' }
        else { Add-Gate FAIL 'deployment id' 'deployment id does not match' }
    } else { Add-Gate SKIP 'deployment id' 'optional DeploymentId was not supplied' }

    if ($actualState -eq 'READY') { Add-Gate PASS 'deployment readiness' 'state is READY' }
    else { Add-Gate FAIL 'deployment readiness' "state is '$actualState', not READY" }

    if ($actualTarget -eq 'production') {
        Add-Gate FAIL 'Preview environment' 'Production is never an accepted verification target'
    } elseif ($actualTarget -in @('', 'preview')) {
        Add-Gate PASS 'Preview environment' 'deployment is a Preview target and not Production'
    } else {
        Add-Gate FAIL 'Preview environment' "unexpected deployment target '$actualTarget'"
    }

    if ($actualSha -eq $ExpectedSha) { Add-Gate PASS 'deployment SHA' 'deployment SHA matches ExpectedSha' }
    else { Add-Gate FAIL 'deployment SHA' 'deployment SHA does not match ExpectedSha' }

    if ($actualBranch -eq $ExpectedBranch) { Add-Gate PASS 'deployment branch' 'deployment branch matches ExpectedBranch' }
    else { Add-Gate FAIL 'deployment branch' 'deployment branch does not match ExpectedBranch' }

    $repoCandidates = @()
    if ($actualRepo) { $repoCandidates += (Normalize-RepositorySlug $actualRepo) }
    $owner = [string](Get-PropertyValue $sourceDeployment @('meta.githubCommitOrg', 'meta.githubOrg', 'gitSource.org', 'source.org'))
    if ($owner -and $actualRepo) { $repoCandidates += (Normalize-RepositorySlug "$owner/$actualRepo") }
    if ($repoCandidates -contains (Normalize-RepositorySlug $ExpectedRepository)) {
        Add-Gate PASS 'deployment repository' 'deployment source repository matches ExpectedRepository'
    } else { Add-Gate FAIL 'deployment repository' 'deployment source repository does not match ExpectedRepository' }

    if ((Normalize-HostName $actualUrl) -eq (Normalize-HostName $PreviewUrl)) {
        Add-Gate PASS 'deployment URL' 'explicit URL is the deployment URL'
    } else {
        Add-Gate FAIL 'deployment URL' 'explicit PreviewUrl is not the immutable deployment URL'
    }

    $functionNames = @(Get-DeploymentFunctionNames $deployment)
    if ($functionNames.Count -eq 0) {
        Add-Gate FAIL 'deployed function budget' 'deployment metadata does not expose an auditable function list'
    } elseif ($functionNames.Count -le $script:MaximumVercelFunctions) {
        Add-Gate PASS 'deployed function budget' ("{0} of {1} functions" -f $functionNames.Count, $script:MaximumVercelFunctions)
    } else {
        Add-Gate FAIL 'deployed function budget' ("{0} exceeds maximum {1}" -f $functionNames.Count, $script:MaximumVercelFunctions)
    }

    if ($BranchAlias) {
        try {
            $aliasDeployment = Invoke-VercelJson $vercelPath $BranchAlias
            $aliasId = [string](Get-PropertyValue $aliasDeployment @('id', 'deploymentId', 'deployment.id'))
            $aliasUrl = [string](Get-PropertyValue $aliasDeployment @('url', 'deployment.url'))
            if (($actualId -and $aliasId -eq $actualId) -or ((Normalize-HostName $aliasUrl) -eq (Normalize-HostName $actualUrl))) {
                Add-Gate PASS 'branch alias target' 'branch alias resolves to the exact deployment'
            } else { Add-Gate FAIL 'branch alias target' 'branch alias resolves to another deployment' }
        } catch {
            Add-Gate FAIL 'branch alias target' $_.Exception.Message
        }
    } else { Add-Gate SKIP 'branch alias target' 'optional BranchAlias was not supplied' }

    foreach ($route in $script:RequiredPublicRoutes) {
        try {
            $status = Invoke-RouteStatus $vercelPath $route
            if ($status -ge 200 -and $status -lt 400) {
                Add-Gate PASS "public route $route" "HTTP $status"
            } else { Add-Gate FAIL "public route $route" "HTTP $status" }
        } catch { Add-Gate FAIL "public route $route" $_.Exception.Message }
    }

    foreach ($route in $script:RequiredAdminApiRoutes) {
        try {
            $status = Invoke-RouteStatus $vercelPath $route
            if ($status -in @(401, 403)) {
                Add-Gate PASS "safe admin API $route" "unauthenticated GET rejected with HTTP $status"
            } else { Add-Gate FAIL "safe admin API $route" "expected safe 401/403 response, received HTTP $status" }
        } catch { Add-Gate FAIL "safe admin API $route" $_.Exception.Message }
    }
} else {
    Add-Gate FAIL 'deployment contract' 'required deployment gates are not executable'
}

if ($script:FailedGateCount -gt 0) {
    Write-Output "PREVIEW VERIFICATION FAIL ($script:FailedGateCount failed gate(s))"
    exit 1
}

Write-Output 'PREVIEW VERIFICATION PASS'
exit 0
