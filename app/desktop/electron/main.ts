import { app, BrowserWindow, ipcMain, shell } from "electron";
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
const deployedDesktopHostDirectoryPath = path.join(desktopRoot, "desktop-host");
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

let desktopHostProcess: ChildProcessWithoutNullStreams | null = null;

function resolveDesktopHostLaunch() {
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

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("desktop-host:info", async () => ({
  shell: "electron",
  desktopHostUrl,
  repositoryRoot,
}));

ipcMain.handle("desktop-host:health", async () => fetchDesktopHostHealth());

app.whenReady().then(async () => {
  startDesktopHost();
  await waitForDesktopHostReady(12000);
  createMainWindow();

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
  stopDesktopHost();
});