const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lightyDesign", {
  getDesktopHostInfo: () => ipcRenderer.invoke("desktop-host:info"),
  getDesktopHostHealth: () => ipcRenderer.invoke("desktop-host:health"),
  getAppUpdateInfo: () => ipcRenderer.invoke("app:update-info"),
  checkForAppUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  getAppUpdateDownloadState: () => ipcRenderer.invoke("app:get-update-download-state"),
  downloadAndInstallAppUpdate: () => ipcRenderer.invoke("app:download-and-install-update"),
  chooseWorkspaceDirectory: () => ipcRenderer.invoke("workspace:choose-directory"),
  openDirectory: (directoryPath) => ipcRenderer.invoke("shell:open-directory", directoryPath),
  openExternal: (targetUrl) => ipcRenderer.invoke("shell:open-external", targetUrl),
  setHasDirtyChanges: (hasDirtyChanges) => ipcRenderer.send("app:set-dirty-state", Boolean(hasDirtyChanges)),
});