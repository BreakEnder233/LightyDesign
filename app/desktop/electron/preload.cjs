const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lightyDesign", {
  getDesktopHostInfo: () => ipcRenderer.invoke("desktop-host:info"),
  getDesktopHostHealth: () => ipcRenderer.invoke("desktop-host:health"),
  chooseWorkspaceDirectory: () => ipcRenderer.invoke("workspace:choose-directory"),
});