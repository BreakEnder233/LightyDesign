export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore invalid JSON payloads and fall back to status-based message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function getDesktopBridge() {
  if (!window.lightyDesign) {
    throw new Error(
      "当前运行环境未注入 Electron bridge。请选择通过 Electron 桌面壳启动应用，例如执行 powershell -ExecutionPolicy Bypass -File .\\ShellFiles\\Bootstrap-LightyDesign.ps1 -RunDesktop。",
    );
  }

  return window.lightyDesign;
}