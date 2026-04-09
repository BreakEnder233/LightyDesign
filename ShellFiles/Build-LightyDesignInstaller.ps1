param(
    [string]$OutputPath = "",
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$Version = "",
    [string]$AssemblyVersion = "",
    [string]$FileVersion = "",
    [string]$InformationalVersion = "",
    [switch]$SkipTests,
    [switch]$SkipFrontendInstall,
    [switch]$CleanOutput = $true,
    [switch]$UseChinaMirror,
    [string]$NpmRegistry = "",
    [string]$ElectronMirror = "",
    [string]$ElectronBuilderBinariesMirror = ""
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$setVersionScriptPath = Join-Path $scriptRoot "Set-LightyDesignVersion.ps1"
$solutionPath = Join-Path $repoRoot "LightyDesign.sln"
$desktopRoot = Join-Path $repoRoot "app\desktop"
$desktopHostProjectPath = Join-Path $repoRoot "src\LightyDesign.DesktopHost\LightyDesign.DesktopHost.csproj"
$builderDesktopHostRoot = Join-Path $desktopRoot "build-resources\desktop-host"
$installerOutputRoot = if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    Join-Path $desktopRoot "dist-installer"
} else {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
}

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "缺少命令: $Name。请先安装它，再重新执行脚本。"
    }
}

function Set-FrontendMirrorEnvironment {
    param(
        [switch]$UseChinaMirror,
        [string]$NpmRegistry,
        [string]$ElectronMirror
    )

    $resolvedNpmRegistry = $NpmRegistry
    $resolvedElectronMirror = $ElectronMirror

    if ($UseChinaMirror) {
        if ([string]::IsNullOrWhiteSpace($resolvedNpmRegistry)) {
            $resolvedNpmRegistry = "https://registry.npmmirror.com/"
        }

        if ([string]::IsNullOrWhiteSpace($resolvedElectronMirror)) {
            $resolvedElectronMirror = "https://npmmirror.com/mirrors/electron/"
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($resolvedNpmRegistry)) {
        $env:npm_config_registry = $resolvedNpmRegistry
        Write-Host "使用 npm 镜像: $resolvedNpmRegistry" -ForegroundColor DarkCyan
    }

    if (-not [string]::IsNullOrWhiteSpace($resolvedElectronMirror)) {
        $env:ELECTRON_MIRROR = $resolvedElectronMirror
        Write-Host "使用 Electron 镜像: $resolvedElectronMirror" -ForegroundColor DarkCyan
    }
}

function Set-InstallerMirrorEnvironment {
    param(
        [switch]$UseChinaMirror,
        [string]$ElectronBuilderBinariesMirror
    )

    $resolvedBuilderMirror = $ElectronBuilderBinariesMirror

    if ($UseChinaMirror -and [string]::IsNullOrWhiteSpace($resolvedBuilderMirror)) {
        $resolvedBuilderMirror = "https://npmmirror.com/mirrors/electron-builder-binaries/"
    }

    if (-not [string]::IsNullOrWhiteSpace($resolvedBuilderMirror)) {
        if (-not $resolvedBuilderMirror.EndsWith("/")) {
            $resolvedBuilderMirror += "/"
        }

        $env:ELECTRON_BUILDER_BINARIES_MIRROR = $resolvedBuilderMirror
        Write-Host "使用 electron-builder 二进制镜像: $resolvedBuilderMirror" -ForegroundColor DarkCyan
    }
}

function Assert-LastExitCode {
    param([string]$CommandDisplayName)

    if ($LASTEXITCODE -ne 0) {
        throw "$CommandDisplayName 执行失败，退出码: $LASTEXITCODE"
    }
}

function Assert-ScriptSucceeded {
    param([string]$CommandDisplayName)

    if (-not $?) {
        throw "$CommandDisplayName 执行失败。"
    }
}

function Get-DotNetVersionArguments {
    $arguments = @()

    if (-not [string]::IsNullOrWhiteSpace($Version)) {
        $arguments += "/p:Version=$Version"
    }

    if (-not [string]::IsNullOrWhiteSpace($AssemblyVersion)) {
        $arguments += "/p:AssemblyVersion=$AssemblyVersion"
    }

    if (-not [string]::IsNullOrWhiteSpace($FileVersion)) {
        $arguments += "/p:FileVersion=$FileVersion"
    }

    if (-not [string]::IsNullOrWhiteSpace($InformationalVersion)) {
        $arguments += "/p:InformationalVersion=$InformationalVersion"
    }

    return ,$arguments
}

Assert-Command dotnet
Assert-Command node
Assert-Command npm

if (-not (Test-Path $setVersionScriptPath)) {
    throw "未找到版本同步脚本: $setVersionScriptPath"
}

Set-FrontendMirrorEnvironment -UseChinaMirror:$UseChinaMirror -NpmRegistry $NpmRegistry -ElectronMirror $ElectronMirror
Set-InstallerMirrorEnvironment -UseChinaMirror:$UseChinaMirror -ElectronBuilderBinariesMirror $ElectronBuilderBinariesMirror

$dotNetVersionArguments = Get-DotNetVersionArguments

Write-Host "LightyDesign 安装器构建脚本" -ForegroundColor Cyan
Write-Host "输出目录: $installerOutputRoot"

if ($CleanOutput -and (Test-Path $installerOutputRoot)) {
    Remove-Item $installerOutputRoot -Recurse -Force
}

Push-Location $repoRoot

try {
    if (-not [string]::IsNullOrWhiteSpace($Version)) {
        Write-Host "[1/7] 同步桌面安装器版本" -ForegroundColor Yellow

        $setVersionArguments = @{ Version = $Version }

        if (-not [string]::IsNullOrWhiteSpace($InformationalVersion)) {
            $setVersionArguments.InformationalVersion = $InformationalVersion
        }

        & $setVersionScriptPath @setVersionArguments
        Assert-ScriptSucceeded "Set-LightyDesignVersion"
    }

    Write-Host "[2/7] 还原解决方案" -ForegroundColor Yellow
    dotnet restore $solutionPath
    Assert-LastExitCode "dotnet restore"

    if (-not $SkipTests) {
        Write-Host "[3/7] 运行测试" -ForegroundColor Yellow
        dotnet test $solutionPath -c $Configuration --no-restore @dotNetVersionArguments
        Assert-LastExitCode "dotnet test"
    }

    Write-Host "[4/7] 发布 DesktopHost 给安装器" -ForegroundColor Yellow
    if (Test-Path $builderDesktopHostRoot) {
        Remove-Item $builderDesktopHostRoot -Recurse -Force
    }

    dotnet publish $desktopHostProjectPath -c $Configuration -r $Runtime --self-contained false -o $builderDesktopHostRoot @dotNetVersionArguments
    Assert-LastExitCode "dotnet publish"

    Push-Location $desktopRoot

    try {
        if (-not $SkipFrontendInstall) {
            Write-Host "[5/7] 安装前端依赖" -ForegroundColor Yellow
            if (Test-Path (Join-Path $desktopRoot "package-lock.json")) {
                npm ci
                Assert-LastExitCode "npm ci"
            }
            else {
                npm install
                Assert-LastExitCode "npm install"
            }
        }

        Write-Host "[6/7] 构建 Electron 前端" -ForegroundColor Yellow
        npm run build
        Assert-LastExitCode "npm run build"

        Write-Host "[7/7] 生成 Windows 安装器" -ForegroundColor Yellow
        npx electron-builder --win nsis --publish never --config.directories.output=$installerOutputRoot
        Assert-LastExitCode "electron-builder"
    }
    finally {
        Pop-Location
    }

    Write-Host "安装器构建完成。" -ForegroundColor Green
}
finally {
    Pop-Location
}