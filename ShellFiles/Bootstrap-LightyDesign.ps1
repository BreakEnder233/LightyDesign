param(
    [switch]$SkipDotnet,
    [switch]$SkipFrontend,
    [switch]$RunDesktop,
    [switch]$UseChinaMirror,
    [string]$NpmRegistry = "",
    [string]$ElectronMirror = ""
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$desktopRoot = Join-Path $repoRoot "app\desktop"
$solutionPath = Join-Path $repoRoot "LightyDesign.sln"

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
        $env:npm_config_electron_mirror = $resolvedElectronMirror
        Write-Host "使用 Electron 镜像: $resolvedElectronMirror" -ForegroundColor DarkCyan
    }
}

function Test-FrontendDependenciesReady {
    param([string]$DesktopRoot)

    $requiredPaths = @(
        (Join-Path $DesktopRoot "node_modules\.bin\vite.cmd"),
        (Join-Path $DesktopRoot "node_modules\.bin\concurrently.cmd"),
        (Join-Path $DesktopRoot "node_modules\.bin\tsc.cmd"),
        (Join-Path $DesktopRoot "node_modules\electron\dist\electron.exe")
    )

    foreach ($path in $requiredPaths) {
        if (-not (Test-Path $path)) {
            return $false
        }
    }

    return $true
}

Write-Host "LightyDesign 引导脚本" -ForegroundColor Cyan
Write-Host "仓库目录: $repoRoot"

Assert-Command dotnet

if (-not $SkipFrontend) {
    Assert-Command node
    Assert-Command npm
    Set-FrontendMirrorEnvironment -UseChinaMirror:$UseChinaMirror -NpmRegistry $NpmRegistry -ElectronMirror $ElectronMirror
}

Push-Location $repoRoot

try {
    if (-not $SkipDotnet) {
        Write-Host "[1/4] 还原 .NET 解决方案" -ForegroundColor Yellow
        dotnet restore $solutionPath

        Write-Host "[2/4] 构建 .NET 解决方案" -ForegroundColor Yellow
        dotnet build $solutionPath
    }

    if (-not $SkipFrontend) {
        Push-Location $desktopRoot

        try {
            if (Test-FrontendDependenciesReady -DesktopRoot $desktopRoot) {
                Write-Host "[3/4] 检测到现有 Electron 前端依赖，跳过重装" -ForegroundColor DarkYellow
            }
            else {
                Write-Host "[3/4] 安装 Electron 前端依赖" -ForegroundColor Yellow
                if (Test-Path (Join-Path $desktopRoot "package-lock.json")) {
                    npm ci
                }
                else {
                    npm install
                }
            }

            Write-Host "[4/4] 构建 Electron 前端" -ForegroundColor Yellow
            npm run build

            if ($RunDesktop) {
                Write-Host "启动 Electron 开发模式" -ForegroundColor Green
                npm run dev
            }
        }
        finally {
            Pop-Location
        }
    }

    if (-not $RunDesktop) {
        Write-Host "全部步骤完成。" -ForegroundColor Green
        Write-Host "下一步可以执行："
        Write-Host "  cd app\desktop"
        Write-Host "  npm run dev"
        Write-Host "或生成发布目录："
        Write-Host "  powershell -ExecutionPolicy Bypass -File .\ShellFiles\Deploy-LightyDesign.ps1"
        Write-Host "大陆网络可追加：-UseChinaMirror"
    }
}
finally {
    Pop-Location
}