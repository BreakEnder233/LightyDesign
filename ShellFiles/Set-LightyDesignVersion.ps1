param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$InformationalVersion = "",
    [string]$PackageJsonPath = "app\desktop\package.json",
    [string]$MetadataOutputPath = ""
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$resolvedPackageJsonPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $PackageJsonPath))

function Normalize-Version {
    param([string]$Value)

    $normalized = $Value.Trim()
    if ($normalized.StartsWith("v", [System.StringComparison]::OrdinalIgnoreCase)) {
        $normalized = $normalized.Substring(1)
    }

    return $normalized
}

function Assert-VersionFormat {
    param([string]$Value)

    if ($Value -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
        throw "版本号格式无效: $Value。请使用 semver，例如 1.2.3 或 1.2.3-beta.1"
    }
}

function Get-CoreVersionParts {
    param([string]$Value)

    $normalized = $Value
    $hyphenIndex = $normalized.IndexOf('-')
    if ($hyphenIndex -ge 0) {
        $normalized = $normalized.Substring(0, $hyphenIndex)
    }

    $plusIndex = $normalized.IndexOf('+')
    if ($plusIndex -ge 0) {
        $normalized = $normalized.Substring(0, $plusIndex)
    }

    $parts = $normalized.Split('.')
    if ($parts.Length -ne 3) {
        throw "无法解析主版本号: $Value"
    }

    return @(
        [int]$parts[0],
        [int]$parts[1],
        [int]$parts[2]
    )
}

$normalizedVersion = Normalize-Version $Version
Assert-VersionFormat $normalizedVersion

$resolvedInformationalVersion = if ([string]::IsNullOrWhiteSpace($InformationalVersion)) {
    $normalizedVersion
} else {
    $InformationalVersion.Trim()
}

$coreVersionParts = Get-CoreVersionParts $normalizedVersion
$assemblyVersion = "$($coreVersionParts[0]).$($coreVersionParts[1]).$($coreVersionParts[2]).0"
$fileVersion = $assemblyVersion

if (-not (Test-Path $resolvedPackageJsonPath)) {
    throw "未找到 package.json: $resolvedPackageJsonPath"
}

$packageJson = Get-Content $resolvedPackageJsonPath -Raw | ConvertFrom-Json
$packageJson.version = $normalizedVersion
$packageJson | ConvertTo-Json -Depth 20 | Set-Content -Path $resolvedPackageJsonPath -Encoding UTF8

$metadata = [ordered]@{
    version = $normalizedVersion
    informationalVersion = $resolvedInformationalVersion
    assemblyVersion = $assemblyVersion
    fileVersion = $fileVersion
    packageJsonPath = $resolvedPackageJsonPath
}

if (-not [string]::IsNullOrWhiteSpace($MetadataOutputPath)) {
    $resolvedMetadataOutputPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $MetadataOutputPath))
    $metadataDirectory = Split-Path -Parent $resolvedMetadataOutputPath
    if (-not (Test-Path $metadataDirectory)) {
        New-Item -ItemType Directory -Path $metadataDirectory -Force | Out-Null
    }

    $metadata | ConvertTo-Json -Depth 10 | Set-Content -Path $resolvedMetadataOutputPath -Encoding UTF8
}

Write-Host "已应用版本号: $normalizedVersion" -ForegroundColor Green
Write-Host "程序集版本: $assemblyVersion"
Write-Host "文件版本: $fileVersion"
Write-Host "信息版本: $resolvedInformationalVersion"

if ($env:GITHUB_OUTPUT) {
    "version=$normalizedVersion" >> $env:GITHUB_OUTPUT
    "assembly_version=$assemblyVersion" >> $env:GITHUB_OUTPUT
    "file_version=$fileVersion" >> $env:GITHUB_OUTPUT
    "informational_version=$resolvedInformationalVersion" >> $env:GITHUB_OUTPUT
}