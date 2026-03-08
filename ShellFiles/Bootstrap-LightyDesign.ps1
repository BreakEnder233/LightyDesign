param(
    [switch]$SkipDotnet,
    [switch]$SkipFrontend,
    [switch]$RunDesktop
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

Write-Host "LightyDesign 引导脚本" -ForegroundColor Cyan
Write-Host "仓库目录: $repoRoot"

Assert-Command dotnet

if (-not $SkipFrontend) {
    Assert-Command node
    Assert-Command npm
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
            Write-Host "[3/4] 安装 Electron 前端依赖" -ForegroundColor Yellow
            npm install

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
    }
}
finally {
    Pop-Location
}