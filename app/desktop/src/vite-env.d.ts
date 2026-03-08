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

interface Window {
  lightyDesign: {
    getDesktopHostInfo: () => Promise<DesktopHostInfo>;
    getDesktopHostHealth: () => Promise<DesktopHostHealth>;
    chooseWorkspaceDirectory: () => Promise<string | null>;
  };
}