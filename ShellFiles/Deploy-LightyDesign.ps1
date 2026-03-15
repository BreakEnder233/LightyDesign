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
    [string]$ElectronMirror = ""
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$solutionPath = Join-Path $repoRoot "LightyDesign.sln"
$desktopRoot = Join-Path $repoRoot "app\desktop"
$desktopHostProjectPath = Join-Path $repoRoot "src\LightyDesign.DesktopHost\LightyDesign.DesktopHost.csproj"
$deployRoot = if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    Join-Path $repoRoot "artifacts\deploy\LightyDesign"
} else {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
}
$deployDesktopRoot = Join-Path $deployRoot "desktop"
$deployDesktopHostRoot = Join-Path $deployDesktopRoot "desktop-host"
$sourceElectronRuntimeRoot = Join-Path $desktopRoot "node_modules\electron"

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

function Copy-Directory {
    param(
        [string]$Source,
        [string]$Destination
    )

    if (Test-Path $Destination) {
        Remove-Item $Destination -Recurse -Force
    }

    Copy-Item $Source $Destination -Recurse -Force
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

    return $arguments
}

Assert-Command dotnet
Assert-Command node
Assert-Command npm

Set-FrontendMirrorEnvironment -UseChinaMirror:$UseChinaMirror -NpmRegistry $NpmRegistry -ElectronMirror $ElectronMirror

$dotNetVersionArguments = Get-DotNetVersionArguments

Write-Host "LightyDesign 部署脚本" -ForegroundColor Cyan
Write-Host "输出目录: $deployRoot"

if ($CleanOutput -and (Test-Path $deployRoot)) {
    Remove-Item $deployRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $deployDesktopRoot -Force | Out-Null

Push-Location $repoRoot

try {
    Write-Host "[1/6] 还原解决方案" -ForegroundColor Yellow
    dotnet restore $solutionPath

    if (-not $SkipTests) {
        Write-Host "[2/6] 运行测试" -ForegroundColor Yellow
        dotnet test $solutionPath -c $Configuration --no-restore @dotNetVersionArguments
    }

    Write-Host "[3/6] 发布 DesktopHost" -ForegroundColor Yellow
    dotnet publish $desktopHostProjectPath -c $Configuration -r $Runtime --self-contained false -o $deployDesktopHostRoot @dotNetVersionArguments

    Push-Location $desktopRoot

    try {
        if (-not $SkipFrontendInstall) {
            Write-Host "[4/6] 安装前端依赖" -ForegroundColor Yellow
            if (Test-Path (Join-Path $desktopRoot "package-lock.json")) {
                npm ci
            }
            else {
                npm install
            }
        }
        elseif (-not (Test-Path $sourceElectronRuntimeRoot)) {
            throw "未找到 app/desktop/node_modules/electron。当前使用了 -SkipFrontendInstall，因此请先执行 npm ci 或 Bootstrap-LightyDesign.ps1；大陆网络建议追加 -UseChinaMirror。"
        }

        if (-not (Test-Path $sourceElectronRuntimeRoot)) {
            throw "未找到 app/desktop/node_modules/electron。前端依赖安装可能失败；大陆网络建议追加 -UseChinaMirror。"
        }

        Write-Host "[5/6] 构建桌面前端" -ForegroundColor Yellow
        npm run build
    }
    finally {
        Pop-Location
    }

    Write-Host "[6/6] 生成可运行部署目录" -ForegroundColor Yellow

    Copy-Directory (Join-Path $desktopRoot "dist") (Join-Path $deployDesktopRoot "dist")
    Copy-Directory (Join-Path $desktopRoot "dist-electron") (Join-Path $deployDesktopRoot "dist-electron")
    Copy-Directory $sourceElectronRuntimeRoot (Join-Path $deployDesktopRoot "node_modules\electron")

    $sourcePackage = Get-Content (Join-Path $desktopRoot "package.json") -Raw | ConvertFrom-Json

    $deployPackage = [ordered]@{
        name = "lightydesign-desktop-deploy"
        private = $true
        version = $sourcePackage.version
        type = "module"
        main = "dist-electron/electron/main.js"
    }

    if ($null -ne $sourcePackage.repository) {
        $deployPackage.repository = $sourcePackage.repository
    }

    if ($null -ne $sourcePackage.homepage) {
        $deployPackage.homepage = $sourcePackage.homepage
    }

    if ($null -ne $sourcePackage.lightyDesign) {
        $deployPackage.lightyDesign = $sourcePackage.lightyDesign
    }

    $deployPackageJson = $deployPackage | ConvertTo-Json -Depth 8
    Set-Content -Path (Join-Path $deployDesktopRoot "package.json") -Value $deployPackageJson -Encoding UTF8

    $startScript = @"
param(
    [string]`$DesktopHostUrl = "http://127.0.0.1:5000"
)

`$ErrorActionPreference = "Stop"

`$desktopRoot = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$electronPath = Join-Path `$desktopRoot "node_modules\electron\dist\electron.exe"
`$desktopHostDllPath = Join-Path `$desktopRoot "desktop-host\LightyDesign.DesktopHost.dll"

if (-not (Test-Path `$electronPath)) {
    throw "未找到 Electron 运行时: `$electronPath"
}

if (-not (Test-Path `$desktopHostDllPath)) {
    throw "未找到 DesktopHost 发布产物: `$desktopHostDllPath"
}

`$env:LDD_REPOSITORY_ROOT = `$desktopRoot
`$env:LDD_DESKTOP_HOST_URL = `$DesktopHostUrl
`$env:LDD_DESKTOP_HOST_DLL_PATH = `$desktopHostDllPath
`$env:LDD_DESKTOP_HOST_WORKING_DIRECTORY = Join-Path `$desktopRoot "desktop-host"

& `$electronPath `$desktopRoot
"@
    Set-Content -Path (Join-Path $deployDesktopRoot "Start-LightyDesign.ps1") -Value $startScript -Encoding UTF8

    Write-Host "部署完成。" -ForegroundColor Green
    Write-Host "启动命令:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File $deployDesktopRoot\Start-LightyDesign.ps1"
}
finally {
    Pop-Location
}