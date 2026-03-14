const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lightyDesign", {
  getDesktopHostInfo: () => ipcRenderer.invoke("desktop-host:info"),
  getDesktopHostHealth: () => ipcRenderer.invoke("desktop-host:health"),
  chooseWorkspaceDirectory: () => ipcRenderer.invoke("workspace:choose-directory"),
  openDirectory: (directoryPath) => ipcRenderer.invoke("shell:open-directory", directoryPath),
  setHasDirtyChanges: (hasDirtyChanges) => ipcRenderer.send("app:set-dirty-state", Boolean(hasDirtyChanges)),
});