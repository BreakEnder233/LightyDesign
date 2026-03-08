import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("lightyDesign", {
  getDesktopHostInfo: () => ipcRenderer.invoke("desktop-host:info"),
  getDesktopHostHealth: () => ipcRenderer.invoke("desktop-host:health"),
  chooseWorkspaceDirectory: () => ipcRenderer.invoke("workspace:choose-directory") as Promise<string | null>,
});