/// <reference types="vite/client" />

interface DesktopHostInfo {
  shell: string;
  desktopHostUrl: string;
  repositoryRoot: string;
}

interface DesktopHostHealth {
  ok: boolean;
  url: string;
  status: string;
  application?: string;
  environment?: string;
  version?: string;
  timestamp?: string;
  message?: string;
}

interface AppUpdateInfo {
  currentVersion: string;
  repository: string | null;
  canCheck: boolean;
  releasesPageUrl: string | null;
}

interface AppUpdateCheckResult {
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
}

interface AppUpdateDownloadState {
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
}

interface WindowControlResult {
  ok: boolean;
  isMaximized?: boolean;
  error?: string;
}

interface McpPreferences {
  enabled: boolean;
  preferencesFilePath: string;
  contextFilePath: string;
  desktopHostUrl: string;
  serverHost: string;
  serverPort: number;
  serverPath: string;
  serverUrl: string;
  runtimeStatus: "stopped" | "starting" | "running" | "error";
  lastStartError: string | null;
}

interface Window {
  lightyDesign?: {
    getDesktopHostInfo: () => Promise<DesktopHostInfo>;
    getDesktopHostHealth: () => Promise<DesktopHostHealth>;
    getAppUpdateInfo: () => Promise<AppUpdateInfo>;
    checkForAppUpdates: () => Promise<AppUpdateCheckResult>;
    getAppUpdateDownloadState: () => Promise<AppUpdateDownloadState>;
    downloadAndInstallAppUpdate: () => Promise<AppUpdateDownloadState>;
    getMcpPreferences: () => Promise<McpPreferences>;
    setMcpEnabled: (enabled: boolean) => Promise<McpPreferences>;
    saveMcpConfiguration: (configuration: { port: number; path?: string | null }) => Promise<McpPreferences>;
    findAvailableMcpPort: () => Promise<{ port: number }>;
    getMcpConfigJson: () => Promise<string>;
    setMcpEditorContext: (context: unknown) => Promise<{ ok: boolean; error?: string }>;
    chooseWorkspaceDirectory: () => Promise<string | null>;
    openDirectory: (directoryPath: string) => Promise<{ ok: boolean; error?: string }>;
    openExternal: (targetUrl: string) => Promise<{ ok: boolean; error?: string }>;
    setHasDirtyChanges: (hasDirtyChanges: boolean) => void;
    windowControls?: {
      minimize: () => Promise<WindowControlResult>;
      toggleMaximize: () => Promise<WindowControlResult>;
      close: () => Promise<WindowControlResult>;
    };
  };
}