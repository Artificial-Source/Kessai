#Requires -Version 5.1
<#
.SYNOPSIS
  Install the Kessai CLI / MCP binary on Windows (no admin required).

.DESCRIPTION
  Downloads kessai-mcp from GitHub Releases, verifies the adjacent .sha256
  checksum, and installs into a user bin directory. Optionally runs
  `kessai-mcp setup --output PATH` after install.

.PARAMETER Help
  Show help and exit.

.PARAMETER DryRun
  Print planned actions without downloading or installing.

.PARAMETER Version
  Install a specific release version (with or without leading v).

.PARAMETER BinDir
  Install directory. Default: $env:LOCALAPPDATA\Kessai\bin

.PARAMETER McpConfig
  After install, run: kessai-mcp setup --output <path>

.EXAMPLE
  irm https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.ps1 | iex

.EXAMPLE
  .\install-cli.ps1 -Version 0.5.0 -McpConfig .mcp.json
#>

[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$DryRun,
    [string]$Version = "",
    [string]$BinDir = "",
    [string]$McpConfig = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$GitHubRepo = "Artificial-Source/Kessai"
$BinaryName = "kessai-mcp.exe"
$Target = "x86_64-pc-windows-msvc"

# Test-only override. See scripts/test-cli-installer.sh comments.
# When set, archives are fetched from this base instead of GitHub Releases.
$BaseUrlOverride = $env:KESSAI_CLI_INSTALL_BASE_URL

function Get-DefaultBinDir {
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        return (Join-Path $env:LOCALAPPDATA "Kessai\bin")
    }

    # Allows cross-platform PowerShell dry-runs while retaining LOCALAPPDATA on Windows.
    $userHome = [Environment]::GetFolderPath("UserProfile")
    if ([string]::IsNullOrWhiteSpace($userHome)) {
        $userHome = $env:HOME
    }
    if ([string]::IsNullOrWhiteSpace($userHome)) {
        throw "could not determine a user bin directory; pass -BinDir"
    }
    return (Join-Path $userHome ".local/bin")
}

function Show-Usage {
    @"
Kessai CLI / MCP installer (Windows)

USAGE:
  install-cli.ps1 [-Help] [-DryRun] [-Version VERSION] [-BinDir PATH] [-McpConfig PATH]

OPTIONS:
  -Help             Show this help and exit
  -DryRun           Print planned actions without downloading or installing
  -Version VERSION  Install a specific release (with or without leading v)
  -BinDir PATH      Install directory (default: `$env:LOCALAPPDATA\Kessai\bin)
  -McpConfig PATH   After install, run: kessai-mcp setup --output PATH

EXAMPLES:
  irm https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.ps1 | iex
  .\install-cli.ps1 -Version 0.5.0
  .\install-cli.ps1 -BinDir `$env:USERPROFILE\bin -McpConfig .mcp.json

Supported target:
  x86_64-pc-windows-msvc
"@
}

function Write-Err([string]$Message) {
    Write-Error "error: $Message"
}

function Normalize-Version([string]$Raw) {
    $v = $Raw.Trim()
    if ($v.StartsWith("v") -or $v.StartsWith("V")) {
        $v = $v.Substring(1)
    }
    if ([string]::IsNullOrWhiteSpace($v)) {
        throw "version must not be empty"
    }
    return $v
}

function Get-LatestVersion {
    $apiUrl = "https://api.github.com/repos/$GitHubRepo/releases/latest"
    $headers = @{
        "User-Agent" = "kessai-install-cli"
        "Accept"     = "application/vnd.github+json"
    }
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get
    if (-not $release.tag_name) {
        throw "could not parse latest release tag from GitHub API"
    }
    return (Normalize-Version $release.tag_name)
}

function Get-DownloadUrl([string]$Ver, [string]$ArchiveName) {
    if (-not [string]::IsNullOrWhiteSpace($BaseUrlOverride)) {
        $base = $BaseUrlOverride.TrimEnd("/", "\")
        return "$base/$ArchiveName"
    }
    return "https://github.com/$GitHubRepo/releases/download/v$Ver/$ArchiveName"
}

function Assert-AllowedUrl([string]$Url) {
    if ($Url -match '^https://') {
        return
    }
    if (
        -not [string]::IsNullOrWhiteSpace($BaseUrlOverride) -and (
            $Url -match '^http://127\.0\.0\.1/' -or
            $Url -match '^http://localhost/' -or
            $Url -match '^file://'
        )
    ) {
        return
    }
    throw "refusing non-HTTPS download URL: $Url"
}

function Get-FileSha256Lower([string]$Path) {
    $hash = (Get-FileHash -Path $Path -Algorithm SHA256).Hash
    return $hash.ToLowerInvariant()
}

function Test-Checksum([string]$ArchivePath, [string]$ChecksumPath) {
    if (-not (Test-Path -LiteralPath $ChecksumPath)) {
        throw "checksum file missing: $ChecksumPath"
    }

    $archiveBase = [System.IO.Path]::GetFileName($ArchivePath)
    $line = (Get-Content -LiteralPath $ChecksumPath -TotalCount 1).Trim()
    if ([string]::IsNullOrWhiteSpace($line)) {
        throw "invalid checksum file format: $ChecksumPath"
    }

    $parts = $line -split '\s+', 2
    $expected = $parts[0].ToLowerInvariant()
    if ($expected -notmatch '^[0-9a-f]{64}$') {
        throw "invalid checksum file format: $ChecksumPath"
    }

    if ($parts.Count -gt 1 -and -not [string]::IsNullOrWhiteSpace($parts[1])) {
        $name = $parts[1].Trim().TrimStart('*')
        if ($name -ne $archiveBase) {
            throw "checksum filename mismatch: expected $archiveBase, got $name"
        }
    }

    $actual = Get-FileSha256Lower $ArchivePath
    if ($actual -ne $expected) {
        throw "checksum verification failed for $archiveBase`n  expected: $expected`n  actual:   $actual"
    }
}

function Download-File([string]$Url, [string]$Destination) {
    Assert-AllowedUrl $Url
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
}

function Test-ZipMembers([string]$ArchivePath, [string]$ExpectedTop) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        if ($zip.Entries.Count -lt 1) {
            throw "archive contains no members: $ArchivePath"
        }

        foreach ($entry in $zip.Entries) {
            $name = ($entry.FullName -replace '\\', '/').TrimEnd('/')
            if ([string]::IsNullOrWhiteSpace($name)) {
                continue
            }

            if ($name.StartsWith('/') -or $name.StartsWith('~')) {
                throw "archive contains absolute path member: $($entry.FullName)"
            }

            $segments = $name -split '/'
            if ($segments.Count -lt 1 -or $segments[0] -ne $ExpectedTop) {
                throw "archive member escapes expected top-level directory '${ExpectedTop}': $($entry.FullName)"
            }

            foreach ($segment in $segments) {
                if ([string]::IsNullOrEmpty($segment) -or $segment -eq '.' -or $segment -eq '..') {
                    throw "archive member has illegal path segment: $($entry.FullName)"
                }
            }
        }
    }
    finally {
        $zip.Dispose()
    }
}

# Verify a candidate binary reports the requested release version.
# Must run on the extracted payload before replacing any installed binary.
function Assert-BinaryVersion {
    param(
        [string]$BinPath,
        [string]$Version,
        [string]$Label = "binary"
    )
    $versionOutput = & $BinPath --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed --version check: $BinPath"
    }
    $first = (($versionOutput | Out-String) -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
    if ($null -ne $first) {
        $first = $first.ToString().Trim()
    }
    $expected = "kessai-mcp $Version"
    if ($first -ne $expected) {
        throw "$Label version mismatch: expected '$expected', got '$first'"
    }
    Write-Host "Verified ${Label}: $first"
}

function Ensure-UserPath([string]$Directory) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($null -eq $userPath) {
        $userPath = ""
    }

    $parts = @()
    if (-not [string]::IsNullOrWhiteSpace($userPath)) {
        $parts = $userPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }

    $already = $false
    foreach ($part in $parts) {
        if ($part.TrimEnd('\') -ieq $Directory.TrimEnd('\')) {
            $already = $true
            break
        }
    }

    if (-not $already) {
        $newPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
            $Directory
        }
        else {
            "$userPath;$Directory"
        }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "Added to user PATH: $Directory"
    }

    # Update current process PATH for immediate use.
    $processParts = $env:Path -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $inProcess = $false
    foreach ($part in $processParts) {
        if ($part.TrimEnd('\') -ieq $Directory.TrimEnd('\')) {
            $inProcess = $true
            break
        }
    }
    if (-not $inProcess) {
        $env:Path = "$Directory;$env:Path"
    }
}

function Install-Binary([string]$SourceBin, [string]$DestDir) {
    if (-not (Test-Path -LiteralPath $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $destBin = Join-Path $DestDir $BinaryName
    $tempBin = Join-Path $DestDir (".{0}.{1}.tmp" -f $BinaryName, [guid]::NewGuid().ToString("N"))
    try {
        Copy-Item -LiteralPath $SourceBin -Destination $tempBin -Force
        Move-Item -LiteralPath $tempBin -Destination $destBin -Force
    }
    finally {
        if (Test-Path -LiteralPath $tempBin) {
            Remove-Item -LiteralPath $tempBin -Force -ErrorAction SilentlyContinue
        }
    }
    return $destBin
}

function Invoke-Setup([string]$InstalledBin, [string]$ConfigPath) {
    Write-Host "Configuring MCP project file: $ConfigPath"
    & $InstalledBin setup --output $ConfigPath
    if ($LASTEXITCODE -ne 0) {
        throw "kessai-mcp setup failed with exit code $LASTEXITCODE"
    }
}

try {
    if ($Help) {
        Write-Output (Show-Usage)
        exit 0
    }

    if ([string]::IsNullOrWhiteSpace($BinDir)) {
        $BinDir = Get-DefaultBinDir
    }

    if (-not [string]::IsNullOrWhiteSpace($Version)) {
        $Version = Normalize-Version $Version
    }
    else {
        $Version = Get-LatestVersion
    }

    $archiveName = "kessai-mcp-$Version-$Target.zip"
    $archiveUrl = Get-DownloadUrl -Ver $Version -ArchiveName $archiveName
    $checksumUrl = "$archiveUrl.sha256"

    Write-Host "Kessai CLI installer"
    Write-Host "  version : $Version"
    Write-Host "  target  : $Target"
    Write-Host "  bin-dir : $BinDir"
    Write-Host "  archive : $archiveName"

    if ($DryRun) {
        Write-Host "[dry-run] would download: $archiveUrl"
        Write-Host "[dry-run] would verify:   $checksumUrl"
        Write-Host "[dry-run] would install:  $(Join-Path $BinDir $BinaryName)"
        if (-not [string]::IsNullOrWhiteSpace($McpConfig)) {
            Write-Host "[dry-run] would run:      $(Join-Path $BinDir $BinaryName) setup --output $McpConfig"
        }
        exit 0
    }

    $tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("kessai-cli-install-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    try {
        $archivePath = Join-Path $tmpRoot $archiveName
        $checksumPath = Join-Path $tmpRoot "$archiveName.sha256"
        $extractDir = Join-Path $tmpRoot "extract"
        New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

        $packageTop = "kessai-mcp-$Version-$Target"

        Write-Host "Downloading $archiveName..."
        Download-File -Url $archiveUrl -Destination $archivePath
        Download-File -Url $checksumUrl -Destination $checksumPath
        Test-Checksum -ArchivePath $archivePath -ChecksumPath $checksumPath
        Test-ZipMembers -ArchivePath $archivePath -ExpectedTop $packageTop

        Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDir -Force

        # Require the exact release layout controlled by packaging.
        $sourceBin = Join-Path $extractDir (Join-Path $packageTop $BinaryName)
        if (-not (Test-Path -LiteralPath $sourceBin)) {
            throw "expected binary missing at release layout path: $packageTop\$BinaryName"
        }
        $item = Get-Item -LiteralPath $sourceBin -Force
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "refusing reparse point/symlink at expected binary path: $packageTop\$BinaryName"
        }
        if ($item.PSIsContainer) {
            throw "expected binary path is a directory: $packageTop\$BinaryName"
        }

        # Validate the extracted payload before touching the destination install.
        Assert-BinaryVersion -BinPath $sourceBin -Version $Version -Label "extracted binary"

        $installedBin = Install-Binary -SourceBin $sourceBin -DestDir $BinDir
        Write-Host "Installed $installedBin"
        # Confirm the installed path still reports the requested version.
        Assert-BinaryVersion -BinPath $installedBin -Version $Version -Label "installed binary"

        Ensure-UserPath -Directory $BinDir

        if (-not [string]::IsNullOrWhiteSpace($McpConfig)) {
            Invoke-Setup -InstalledBin $installedBin -ConfigPath $McpConfig
        }

        Write-Host ""
        Write-Host "Done. Try: kessai-mcp --help"
        if ([string]::IsNullOrWhiteSpace($McpConfig)) {
            Write-Host "Optional MCP setup: kessai-mcp setup"
        }
    }
    finally {
        if (Test-Path -LiteralPath $tmpRoot) {
            Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
catch {
    Write-Err $_.Exception.Message
    exit 1
}
