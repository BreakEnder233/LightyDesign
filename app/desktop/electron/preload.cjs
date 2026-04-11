const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lightyDesign", {
  getDesktopHostInfo: () => ipcRenderer.invoke("desktop-host:info"),
  getDesktopHostHealth: () => ipcRenderer.invoke("desktop-host:health"),
  getAppUpdateInfo: () => ipcRenderer.invoke("app:update-info"),
  checkForAppUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  getAppUpdateDownloadState: () => ipcRenderer.invoke("app:get-update-download-state"),
  downloadAndInstallAppUpdate: () => ipcRenderer.invoke("app:download-and-install-update"),
  getMcpPreferences: () => ipcRenderer.invoke("app:get-mcp-preferences"),
  setMcpEnabled: (enabled) => ipcRenderer.invoke("app:set-mcp-enabled", Boolean(enabled)),
  saveMcpConfiguration: (configuration) => ipcRenderer.invoke("app:save-mcp-configuration", configuration),
  findAvailableMcpPort: () => ipcRenderer.invoke("app:find-available-mcp-port"),
  getMcpConfigJson: () => ipcRenderer.invoke("app:get-mcp-config-json"),
  setMcpEditorContext: (context) => ipcRenderer.invoke("app:set-mcp-editor-context", context),
  chooseWorkspaceDirectory: () => ipcRenderer.invoke("workspace:choose-directory"),
  setWorkspaceWatchPath: (workspacePath) => ipcRenderer.invoke("workspace:set-watch-path", workspacePath ?? null),
  onWorkspaceFilesChanged: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const wrappedListener = (_event, payload) => listener(payload);
    ipcRenderer.on("workspace:files-changed", wrappedListener);
    return () => {
      ipcRenderer.removeListener("workspace:files-changed", wrappedListener);
    };
  },
  openDirectory: (directoryPath) => ipcRenderer.invoke("shell:open-directory", directoryPath),
  openExternal: (targetUrl) => ipcRenderer.invoke("shell:open-external", targetUrl),
  setHasDirtyChanges: (hasDirtyChanges) => ipcRenderer.send("app:set-dirty-state", Boolean(hasDirtyChanges)),
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
});