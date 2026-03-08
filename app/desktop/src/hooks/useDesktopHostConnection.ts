import { useEffect, useState } from "react";

export function useDesktopHostConnection() {
  const [hostInfo, setHostInfo] = useState<DesktopHostInfo | null>(null);
  const [hostHealth, setHostHealth] = useState<DesktopHostHealth | null>(null);

  useEffect(() => {
    let disposed = false;

    async function loadInfo() {
      const info = await window.lightyDesign.getDesktopHostInfo();
      if (!disposed) {
        setHostInfo(info);
      }
    }

    async function loadHealth() {
      const health = await window.lightyDesign.getDesktopHostHealth();
      if (!disposed) {
        setHostHealth(health);
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
    hostInfo,
    hostHealth,
  };
}