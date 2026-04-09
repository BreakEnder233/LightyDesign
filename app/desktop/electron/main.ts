import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopHostUrl = process.env.LDD_DESKTOP_HOST_URL ?? "http://127.0.0.1:5000";
const desktopRoot = path.resolve(__dirname, "..", "..");
const defaultRepositoryRoot = path.resolve(desktopRoot, "..", "..");
const repositoryRoot = process.env.LDD_REPOSITORY_ROOT ?? defaultRepositoryRoot;
const packagedDesktopHostDirectoryPath = path.join(process.resourcesPath, "desktop-host");
const deployedDesktopHostDirectoryPath =
  app.isPackaged && fs.existsSync(packagedDesktopHostDirectoryPath)
    ? packagedDesktopHostDirectoryPath
    : path.join(desktopRoot, "desktop-host");
const defaultDesktopHostProjectPath = path.join(
  repositoryRoot,
  "src",
  "LightyDesign.DesktopHost",
  "LightyDesign.DesktopHost.csproj",
);
const defaultDesktopHostDllPath = path.join(
  repositoryRoot,
  "src",
  "LightyDesign.DesktopHost",
  "bin",
  "Debug",
  "net9.0",
  "LightyDesign.DesktopHost.dll",
);

type DesktopHostHealth = {
  ok: boolean;
  url: string;
  status: string;
  application?: string;
  environment?: string;
  version?: string;
  timestamp?: string;
  message?: string;
};

type LightyDesignDesktopPackage = {
  version?: string;
  repository?: string | { type?: string; url?: string };
  homepage?: string;
  lightyDesign?: {
    updates?: {
      githubRepository?: string | null;
      releasesApiUrl?: string | null;
      releasesPageUrl?: string | null;
    };
  };
};

type UpdateConfiguration = {
  currentVersion: string;
  repository: string | null;
  releasesApiUrl: string | null;
  releasesPageUrl: string | null;
};

type AppUpdateInfo = {
  currentVersion: string;
  repository: string | null;
  canCheck: boolean;
  releasesPageUrl: string | null;
};

type AppUpdateCheckResult = {
  status: "available" | "up-to-date" | "unconfigured" | "error";
  currentVersion: string;
  repository: string | null;
  releasesPageUrl: string | null;
  latestVersion?: string;
  releaseName?: string;
  publishedAt?: string;
  downloadUrl?: string | null;
  downloadName?: string | null;
  detail?: string;
};

type AppUpdateDownloadState = {
  status: "idle" | "preparing" | "downloading" | "launching" | "cancelled" | "error";
  currentVersion: string;
  latestVersion: string | null;
  repository: string | null;
  releasesPageUrl: string | null;
  fileName: string | null;
  cachedFilePath: string | null;
  bytesReceived: number;
  totalBytes: number | null;
  progressPercent: number | null;
  detail?: string;
};

let desktopHostProcess: ChildProcessWithoutNullStreams | null = null;
let hasDirtyChanges = false;
let allowWindowClose = false;
let appUpdateDownloadState: AppUpdateDownloadState = {
  status: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  repository: null,
  releasesPageUrl: null,
  fileName: null,
  cachedFilePath: null,
  bytesReceived: 0,
  totalBytes: null,
  progressPercent: null,
};
let appUpdateInstallPromise: Promise<AppUpdateDownloadState> | null = null;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveRendererEntryPath() {
  const candidates = [
    path.resolve(__dirname, "..", "..", "dist", "index.html"),
    path.join(desktopRoot, "dist", "index.html"),
  ];

  return candidates.find((candidate, index) => candidates.indexOf(candidate) === index && fs.existsSync(candidate)) ?? null;
}

function buildRendererLoadErrorPage(title: string, detail: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(47, 104, 95, 0.28), transparent 42%),
          linear-gradient(180deg, #0d1516 0%, #081011 100%);
        color: #eff7f4;
      }

      main {
        width: min(720px, calc(100vw - 48px));
        padding: 28px 32px;
        border: 1px solid rgba(183, 227, 212, 0.18);
        border-radius: 20px;
        background: rgba(10, 19, 20, 0.9);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }

      p {
        margin: 0 0 16px;
        line-height: 1.6;
        color: rgba(239, 247, 244, 0.82);
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        padding: 16px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.26);
        border: 1px solid rgba(183, 227, 212, 0.1);
        color: #bfe7d8;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>安装版未能正确加载渲染界面。请重新构建安装器，或检查构建产物是否包含 dist/index.html。</p>
      <pre>${escapeHtml(detail)}</pre>
    </main>
  </body>
</html>`;
}

async function showRendererLoadError(mainWindow: BrowserWindow, title: string, detail: string) {
  const errorPage = buildRendererLoadErrorPage(title, detail);
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage)}`);
}

async function loadRenderer(mainWindow: BrowserWindow) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  const rendererEntryPath = resolveRendererEntryPath();
  if (!rendererEntryPath) {
    await showRendererLoadError(
      mainWindow,
      "未找到桌面界面入口文件",
      [
        "Electron 在安装版中没有找到渲染入口文件。",
        "预期位置: dist/index.html",
        `当前主进程目录: ${__dirname}`,
        `desktopRoot: ${desktopRoot}`,
      ].join("\n"),
    );
    return;
  }

  await mainWindow.loadFile(rendererEntryPath);
}

function tryParseGitHubRepository(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const plainMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmedValue);
  if (plainMatch) {
    return `${plainMatch[1]}/${plainMatch[2]}`;
  }

  const urlMatch = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i.exec(trimmedValue);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}`;
  }

  return null;
}

function parseVersionParts(version: string) {
  const normalizedVersion = version.trim().replace(/^v/i, "");
  const [corePart, prereleasePart = ""] = normalizedVersion.split("-", 2);
  const core = corePart
    .split(".")
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));

  while (core.length < 3) {
    core.push(0);
  }

  return {
    core,
    prerelease: prereleasePart,
  };
}

function compareVersions(leftVersion: string, rightVersion: string) {
  const left = parseVersionParts(leftVersion);
  const right = parseVersionParts(rightVersion);

  for (let index = 0; index < Math.max(left.core.length, right.core.length); index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  if (!left.prerelease && !right.prerelease) {
    return 0;
  }

  if (!left.prerelease) {
    return 1;
  }

  if (!right.prerelease) {
    return -1;
  }

  return left.prerelease.localeCompare(right.prerelease, undefined, { numeric: true, sensitivity: "base" });
}

function loadDesktopPackageMetadata() {
  const packageJsonCandidates = [
    path.join(desktopRoot, "package.json"),
    path.join(repositoryRoot, "app", "desktop", "package.json"),
  ];

  for (const candidate of packageJsonCandidates) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      return JSON.parse(fs.readFileSync(candidate, "utf8")) as LightyDesignDesktopPackage;
    } catch (error) {
      console.warn(`[LightyDesign] Failed to read package metadata from ${candidate}.`, error);
    }
  }

  return {} satisfies LightyDesignDesktopPackage;
}

function resolveUpdateConfiguration(): UpdateConfiguration {
  const packageMetadata = loadDesktopPackageMetadata();
  const repositoryFromPackage =
    typeof packageMetadata.repository === "string"
      ? packageMetadata.repository
      : packageMetadata.repository?.url;
  const configuredRepository =
    process.env.LDD_GITHUB_REPOSITORY ?? packageMetadata.lightyDesign?.updates?.githubRepository ?? repositoryFromPackage;
  const repository = tryParseGitHubRepository(configuredRepository);
  const releasesApiUrl =
    process.env.LDD_UPDATE_RELEASES_API_URL ??
    packageMetadata.lightyDesign?.updates?.releasesApiUrl ??
    (repository ? `https://api.github.com/repos/${repository}/releases/latest` : null);
  const releasesPageUrl =
    process.env.LDD_UPDATE_RELEASES_PAGE_URL ??
    packageMetadata.lightyDesign?.updates?.releasesPageUrl ??
    packageMetadata.homepage ??
    (repository ? `https://github.com/${repository}/releases/latest` : null);

  return {
    currentVersion: app.getVersion(),
    repository,
    releasesApiUrl,
    releasesPageUrl,
  };
}

function buildUpdateInfo(): AppUpdateInfo {
  const configuration = resolveUpdateConfiguration();

  return {
    currentVersion: configuration.currentVersion,
    repository: configuration.repository,
    canCheck: Boolean(configuration.releasesApiUrl),
    releasesPageUrl: configuration.releasesPageUrl,
  };
}

function buildInitialDownloadState(overrides?: Partial<AppUpdateDownloadState>): AppUpdateDownloadState {
  const configuration = resolveUpdateConfiguration();

  return {
    status: "idle",
    currentVersion: configuration.currentVersion,
    latestVersion: null,
    repository: configuration.repository,
    releasesPageUrl: configuration.releasesPageUrl,
    fileName: null,
    cachedFilePath: null,
    bytesReceived: 0,
    totalBytes: null,
    progressPercent: null,
    ...overrides,
  };
}

function setAppUpdateDownloadState(overrides: Partial<AppUpdateDownloadState>) {
  appUpdateDownloadState = {
    ...appUpdateDownloadState,
    ...overrides,
  };

  return appUpdateDownloadState;
}

function resetAppUpdateDownloadState(overrides?: Partial<AppUpdateDownloadState>) {
  appUpdateDownloadState = buildInitialDownloadState(overrides);
  return appUpdateDownloadState;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[<>:"/\\|?*]+/g, "-");
}

function getSupportedInstallerType(fileName: string | null | undefined) {
  const normalizedFileName = fileName?.toLowerCase() ?? "";

  if (normalizedFileName.endsWith(".exe")) {
    return "exe" as const;
  }

  if (normalizedFileName.endsWith(".msi")) {
    return "msi" as const;
  }

  if (normalizedFileName.endsWith(".appinstaller")) {
    return "appinstaller" as const;
  }

  return null;
}

function isSilentlyInstallableInstallerType(installerType: ReturnType<typeof getSupportedInstallerType>) {
  return installerType === "exe" || installerType === "msi";
}

function resolveUpdateCacheDirectory() {
  const updateCacheDirectory = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(updateCacheDirectory, { recursive: true });
  return updateCacheDirectory;
}

function resolveCurrentInstallDirectory() {
  if (!app.isPackaged) {
    return null;
  }

  return path.dirname(process.execPath);
}

async function confirmInstallWithDirtyChanges() {
  if (!hasDirtyChanges) {
    return true;
  }

  const browserWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const response = await dialog.showMessageBox(browserWindow, {
    type: "warning",
    buttons: ["取消", "继续下载安装"],
    defaultId: 0,
    cancelId: 0,
    title: "存在未保存修改",
    message: "继续更新会关闭当前应用并启动安装器。",
    detail: "检测到尚未保存的修改，继续后这些修改可能丢失。请确认是否继续。",
    noLink: true,
  });

  return response.response === 1;
}

async function downloadUpdateAsset(updateResult: AppUpdateCheckResult) {
  const downloadUrl = updateResult.downloadUrl;
  const latestVersion = updateResult.latestVersion ?? updateResult.releaseName ?? "latest";
  const fileName = sanitizeFileName(updateResult.downloadName ?? `LightyDesign-${latestVersion}-setup.exe`);
  const downloadDirectory = resolveUpdateCacheDirectory();
  const downloadFilePath = path.join(downloadDirectory, `${latestVersion}-${fileName}`);

  setAppUpdateDownloadState({
    status: "preparing",
    latestVersion,
    fileName,
    cachedFilePath: downloadFilePath,
    bytesReceived: 0,
    totalBytes: null,
    progressPercent: null,
    detail: `准备下载 ${fileName}`,
  });

  if (!downloadUrl) {
    throw new Error("当前 Release 未提供可下载的安装器地址。");
  }

  const response = await fetch(downloadUrl, {
    headers: {
      Accept: "application/octet-stream, application/vnd.github+json",
      "User-Agent": "LightyDesign-Desktop",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`下载安装包失败，HTTP ${response.status}。`);
  }

  const totalBytesHeader = response.headers.get("content-length");
  const totalBytes = totalBytesHeader ? Number.parseInt(totalBytesHeader, 10) : Number.NaN;
  const normalizedTotalBytes = Number.isFinite(totalBytes) ? totalBytes : null;
  const reader = response.body.getReader();
  const writeStream = fs.createWriteStream(downloadFilePath);

  try {
    let bytesReceived = 0;

    setAppUpdateDownloadState({
      status: "downloading",
      totalBytes: normalizedTotalBytes,
      detail: `正在下载 ${fileName}`,
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      writeStream.write(Buffer.from(value));
      bytesReceived += value.byteLength;

      const progressPercent = normalizedTotalBytes
        ? Math.min(100, Math.round((bytesReceived / normalizedTotalBytes) * 100))
        : null;

      setAppUpdateDownloadState({
        status: "downloading",
        bytesReceived,
        totalBytes: normalizedTotalBytes,
        progressPercent,
        detail: progressPercent !== null ? `正在下载 ${fileName} (${progressPercent}%)` : `正在下载 ${fileName}`,
      });
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.end(() => resolve());
    });

    return {
      fileName,
      downloadFilePath,
      latestVersion,
    };
  } catch (error) {
    writeStream.destroy();
    if (fs.existsSync(downloadFilePath)) {
      fs.rmSync(downloadFilePath, { force: true });
    }

    throw error;
  }
}

async function launchDownloadedInstaller(downloadFilePath: string) {
  const installerType = getSupportedInstallerType(downloadFilePath);
  const currentInstallDirectory = resolveCurrentInstallDirectory();

  if (installerType === "exe") {
    const installerArguments = ["/S", "--updated"];

    if (currentInstallDirectory) {
      installerArguments.push(`/D=${currentInstallDirectory}`);
    }

    const childProcess = spawn(downloadFilePath, installerArguments, {
      cwd: path.dirname(downloadFilePath),
      detached: true,
      stdio: "ignore",
    });
    childProcess.unref();
    return;
  }

  if (installerType === "msi") {
    const childProcess = spawn("msiexec", ["/i", downloadFilePath, "/qn", "/norestart"], {
      detached: true,
      stdio: "ignore",
    });
    childProcess.unref();
    return;
  }

  if (installerType === "appinstaller") {
    throw new Error("当前 appinstaller 资产暂不支持静默安装，请改用发布页或 exe 安装器更新。");
  }

  throw new Error("当前 Release 资产不是可静默安装的 exe 或 msi 文件。请改用发布页下载。");
}

async function downloadAndInstallAppUpdate(): Promise<AppUpdateDownloadState> {
  if (appUpdateInstallPromise) {
    return appUpdateInstallPromise;
  }

  appUpdateInstallPromise = (async () => {
    const updateResult = await checkForAppUpdates();
    const latestVersion = updateResult.latestVersion ?? null;

    resetAppUpdateDownloadState({
      currentVersion: updateResult.currentVersion,
      latestVersion,
      repository: updateResult.repository,
      releasesPageUrl: updateResult.releasesPageUrl,
      fileName: updateResult.downloadName ?? null,
    });

    if (updateResult.status !== "available") {
      return setAppUpdateDownloadState({
        status: updateResult.status === "up-to-date" ? "cancelled" : "error",
        detail:
          updateResult.status === "up-to-date"
            ? "当前已经是最新版本，无需下载安装。"
            : updateResult.detail ?? "当前没有可下载安装的新版本。",
      });
    }

    const supportedInstallerType = getSupportedInstallerType(updateResult.downloadName ?? null);
    if (!supportedInstallerType || !isSilentlyInstallableInstallerType(supportedInstallerType)) {
      return setAppUpdateDownloadState({
        status: "error",
        latestVersion,
        detail: "当前 Release 缺少可静默安装的 exe 或 msi 资产，无法在应用内直接安装。",
      });
    }

    const confirmed = await confirmInstallWithDirtyChanges();
    if (!confirmed) {
      return setAppUpdateDownloadState({
        status: "cancelled",
        latestVersion,
        detail: "已取消下载安装。",
      });
    }

    try {
      const downloadResult = await downloadUpdateAsset(updateResult);

      setAppUpdateDownloadState({
        status: "launching",
        latestVersion: downloadResult.latestVersion,
        fileName: downloadResult.fileName,
        cachedFilePath: downloadResult.downloadFilePath,
        progressPercent: 100,
        detail: `下载完成，正在静默安装 ${downloadResult.fileName}`,
      });

      await launchDownloadedInstaller(downloadResult.downloadFilePath);

      setTimeout(() => {
        allowWindowClose = true;
        app.quit();
      }, 300);

      return appUpdateDownloadState;
    } catch (error) {
      return setAppUpdateDownloadState({
        status: "error",
        latestVersion,
        detail: error instanceof Error ? error.message : "下载安装包失败。",
      });
    }
  })();

  try {
    return await appUpdateInstallPromise;
  } finally {
    appUpdateInstallPromise = null;
  }
}

async function checkForAppUpdates(): Promise<AppUpdateCheckResult> {
  const configuration = resolveUpdateConfiguration();
  if (!configuration.releasesApiUrl) {
    return {
      status: "unconfigured",
      currentVersion: configuration.currentVersion,
      repository: configuration.repository,
      releasesPageUrl: configuration.releasesPageUrl,
      detail: "当前尚未配置 GitHub Releases 更新源。",
    };
  }

  try {
    const response = await fetch(configuration.releasesApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "LightyDesign-Desktop",
      },
    });

    if (!response.ok) {
      return {
        status: "error",
        currentVersion: configuration.currentVersion,
        repository: configuration.repository,
        releasesPageUrl: configuration.releasesPageUrl,
        detail: `GitHub Releases 返回 ${response.status}。`,
      };
    }

    const payload = (await response.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      body?: string;
      published_at?: string;
      assets?: Array<{
        name?: string;
        browser_download_url?: string;
      }>;
    };

    const latestVersion = (payload.tag_name ?? "").trim();
    if (!latestVersion) {
      return {
        status: "error",
        currentVersion: configuration.currentVersion,
        repository: configuration.repository,
        releasesPageUrl: configuration.releasesPageUrl,
        detail: "GitHub Releases 返回中缺少 tag_name。",
      };
    }

    const assetPriority = [".exe", ".msi", ".appinstaller", ".zip"];
    const downloadableAsset =
      payload.assets
        ?.slice()
        .sort((leftAsset, rightAsset) => {
          const leftName = leftAsset.name?.toLowerCase() ?? "";
          const rightName = rightAsset.name?.toLowerCase() ?? "";
          const leftRank = assetPriority.findIndex((extension) => leftName.endsWith(extension));
          const rightRank = assetPriority.findIndex((extension) => rightName.endsWith(extension));
          const normalizedLeftRank = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
          const normalizedRightRank = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;
          return normalizedLeftRank - normalizedRightRank;
        })?.[0] ?? payload.assets?.[0];
    const downloadUrl = downloadableAsset?.browser_download_url ?? payload.html_url ?? configuration.releasesPageUrl;
    const isUpdateAvailable = compareVersions(latestVersion, configuration.currentVersion) > 0;

    return {
      status: isUpdateAvailable ? "available" : "up-to-date",
      currentVersion: configuration.currentVersion,
      latestVersion,
      releaseName: payload.name ?? latestVersion,
      publishedAt: payload.published_at,
      repository: configuration.repository,
      releasesPageUrl: payload.html_url ?? configuration.releasesPageUrl,
      downloadUrl,
      downloadName: downloadableAsset?.name ?? null,
      detail: payload.body ?? undefined,
    };
  } catch (error) {
    return {
      status: "error",
      currentVersion: configuration.currentVersion,
      repository: configuration.repository,
      releasesPageUrl: configuration.releasesPageUrl,
      detail: error instanceof Error ? error.message : "检查更新失败。",
    };
  }
}

function resolveDesktopHostLaunch() {
  const packagedDesktopHostDllPath = path.join(deployedDesktopHostDirectoryPath, "LightyDesign.DesktopHost.dll");
  if (fs.existsSync(packagedDesktopHostDllPath)) {
    return {
      command: "dotnet",
      args: [packagedDesktopHostDllPath, "--urls", desktopHostUrl],
      cwd: process.env.LDD_DESKTOP_HOST_WORKING_DIRECTORY ?? path.dirname(packagedDesktopHostDllPath),
    };
  }

  const desktopHostProjectPath = process.env.LDD_DESKTOP_HOST_PROJECT_PATH ?? defaultDesktopHostProjectPath;
  if (fs.existsSync(desktopHostProjectPath)) {
    return {
      command: "dotnet",
      args: [
        "run",
        "--project",
        desktopHostProjectPath,
        "--no-launch-profile",
        "--urls",
        desktopHostUrl,
      ],
      cwd: repositoryRoot,
    };
  }

  const desktopHostDllCandidates = [
    process.env.LDD_DESKTOP_HOST_DLL_PATH,
    path.join(deployedDesktopHostDirectoryPath, "LightyDesign.DesktopHost.dll"),
    defaultDesktopHostDllPath,
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  const desktopHostDllPath = desktopHostDllCandidates.find((candidate) => fs.existsSync(candidate));
  if (desktopHostDllPath) {
    return {
      command: "dotnet",
      args: [desktopHostDllPath, "--urls", desktopHostUrl],
      cwd: process.env.LDD_DESKTOP_HOST_WORKING_DIRECTORY ?? path.dirname(desktopHostDllPath),
    };
  }

  return null;
}

function startDesktopHost() {
  if (desktopHostProcess) {
    return;
  }

  const launchOptions = resolveDesktopHostLaunch();
  if (!launchOptions) {
    console.warn("[LightyDesign] DesktopHost project or build output was not found.");
    return;
  }

  desktopHostProcess = spawn(launchOptions.command, launchOptions.args, {
    cwd: launchOptions.cwd,
    env: {
      ...process.env,
      ASPNETCORE_URLS: desktopHostUrl,
      LDD_DESKTOP_HOST_URL: desktopHostUrl,
    },
    stdio: "pipe",
  });

  desktopHostProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[DesktopHost] ${chunk}`);
  });

  desktopHostProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[DesktopHost] ${chunk}`);
  });

  desktopHostProcess.on("exit", (code, signal) => {
    console.log(`[LightyDesign] DesktopHost exited with code ${code ?? "null"}, signal ${signal ?? "none"}.`);
    desktopHostProcess = null;
  });
}

function stopDesktopHost() {
  if (!desktopHostProcess) {
    return;
  }

  desktopHostProcess.kill();
  desktopHostProcess = null;
}

async function fetchDesktopHostHealth(): Promise<DesktopHostHealth> {
  try {
    const response = await fetch(`${desktopHostUrl}/api/health`);
    if (!response.ok) {
      return {
        ok: false,
        url: desktopHostUrl,
        status: "http-error",
        message: `DesktopHost returned ${response.status}.`,
      };
    }

    const payload = (await response.json()) as {
      application: string;
      environment: string;
      status: string;
      timestamp: string;
      version: string;
    };

    return {
      ok: true,
      url: desktopHostUrl,
      status: payload.status,
      application: payload.application,
      environment: payload.environment,
      timestamp: payload.timestamp,
      version: payload.version,
    };
  } catch (error) {
    return {
      ok: false,
      url: desktopHostUrl,
      status: "unreachable",
      message: error instanceof Error ? error.message : "DesktopHost is not reachable.",
    };
  }
}

async function waitForDesktopHostReady(timeoutMs: number) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const health = await fetchDesktopHostHealth();
    if (health.ok) {
      return health;
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return null;
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#0d1516",
    title: "LightyDesign",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  let hasLoadedFallbackPage = false;

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || hasLoadedFallbackPage || errorCode === -3) {
      return;
    }

    hasLoadedFallbackPage = true;
    void showRendererLoadError(
      mainWindow,
      "桌面界面加载失败",
      [`URL: ${validatedUrl}`, `错误码: ${errorCode}`, `错误信息: ${errorDescription}`].join("\n"),
    );
  });

  void loadRenderer(mainWindow).catch((error) => {
    if (hasLoadedFallbackPage) {
      return;
    }

    hasLoadedFallbackPage = true;
    void showRendererLoadError(
      mainWindow,
      "桌面界面初始化失败",
      error instanceof Error ? error.stack ?? error.message : "未知错误",
    );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (allowWindowClose || !hasDirtyChanges) {
      return;
    }

    event.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["取消", "仍然关闭"],
      defaultId: 0,
      cancelId: 0,
      title: "存在未保存修改",
      message: "当前存在未保存修改。",
      detail: "如果现在关闭窗口，未保存的 Sheet 更改将会丢失。",
      noLink: true,
    });

    if (choice === 1) {
      allowWindowClose = true;
      mainWindow.close();
    }
  });

  mainWindow.on("closed", () => {
    allowWindowClose = false;
    hasDirtyChanges = false;
  });
}

ipcMain.handle("desktop-host:info", async () => ({
  shell: "electron",
  desktopHostUrl,
  repositoryRoot,
}));

ipcMain.handle("app:update-info", async () => buildUpdateInfo());

ipcMain.handle("app:check-for-updates", async () => checkForAppUpdates());

ipcMain.handle("app:get-update-download-state", async () => appUpdateDownloadState);

ipcMain.handle("app:download-and-install-update", async () => downloadAndInstallAppUpdate());

ipcMain.handle("desktop-host:health", async () => fetchDesktopHostHealth());

ipcMain.handle("workspace:choose-directory", async () => {
  const browserWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(browserWindow, {
    title: "选择 LightyDesign 工作区目录",
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("shell:open-directory", async (_event, directoryPath: string) => {
  if (typeof directoryPath !== "string" || directoryPath.trim().length === 0) {
    return { ok: false, error: "directoryPath is required." };
  }

  const openResult = await shell.openPath(directoryPath);
  if (openResult) {
    return { ok: false, error: openResult };
  }

  return { ok: true };
});

ipcMain.handle("shell:open-external", async (_event, targetUrl: string) => {
  if (typeof targetUrl !== "string" || targetUrl.trim().length === 0) {
    return { ok: false, error: "url is required." };
  }

  try {
    await shell.openExternal(targetUrl);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `无法打开链接: ${targetUrl}`,
    };
  }
});

ipcMain.on("app:set-dirty-state", (_event, nextHasDirtyChanges: boolean) => {
  hasDirtyChanges = nextHasDirtyChanges;
});

app.whenReady().then(async () => {
  startDesktopHost();
  createMainWindow();
  void waitForDesktopHostReady(12000).then((health) => {
    if (health?.ok) {
      console.log(`[LightyDesign] DesktopHost is ready at ${health.url}.`);
      return;
    }

    console.warn("[LightyDesign] DesktopHost was not ready within 12 seconds. The UI will continue polling in the background.");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopDesktopHost();
    app.quit();
  }
});

app.on("before-quit", () => {
  allowWindowClose = true;
  stopDesktopHost();
});