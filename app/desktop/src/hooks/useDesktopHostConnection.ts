import { useEffect, useState } from "react";

type DesktopBridgeStatus = "loading" | "ready" | "unavailable";

export function useDesktopHostConnection() {
  const [hostInfo, setHostInfo] = useState<DesktopHostInfo | null>(null);
  const [hostHealth, setHostHealth] = useState<DesktopHostHealth | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<DesktopBridgeStatus>("loading");
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const desktopBridge = window.lightyDesign;

    if (!desktopBridge) {
      setBridgeStatus("unavailable");
      setBridgeError(
        "当前运行环境未注入 Electron bridge。请通过 Electron 桌面壳启动应用，而不是只打开 Vite 页面。推荐命令：powershell -ExecutionPolicy Bypass -File .\\ShellFiles\\Bootstrap-LightyDesign.ps1 -RunDesktop",
      );
      return;
    }

    const bridge = desktopBridge;

    async function loadInfo() {
      try {
        const info = await bridge.getDesktopHostInfo();
        if (!disposed) {
          setHostInfo(info);
          setBridgeStatus("ready");
          setBridgeError(null);
        }
      } catch (error) {
        if (!disposed) {
          setBridgeStatus("unavailable");
          setBridgeError(error instanceof Error ? error.message : "读取 Electron bridge 信息失败。");
        }
      }
    }

    async function loadHealth() {
      try {
        const health = await bridge.getDesktopHostHealth();
        if (!disposed) {
          setHostHealth(health);
        }
      } catch (error) {
        if (!disposed) {
          setHostHealth({
            ok: false,
            url: "unknown",
            status: "bridge-error",
            message: error instanceof Error ? error.message : "读取 DesktopHost 健康状态失败。",
          });
        }
      }
    }

    void loadInfo();
    void loadHealth();

    const timer = window.setInterval(() => {
      void loadHealth();
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  return {
    bridgeStatus,
    bridgeError,
    hostInfo,
    hostHealth,
  };
}