import { useEffect, useState } from "react";

const workbookGroups = [
  { name: "Item", tables: 2, state: "Ready" },
  { name: "Level", tables: 2, state: "Draft" },
  { name: "Quest", tables: 0, state: "Empty" },
];

const actionCards = [
  {
    title: "工作区扫描",
    description: "读取工作簿目录、识别 txt 与 header 文件，并生成编辑器导航树。",
  },
  {
    title: "表头编辑",
    description: "独立维护 FieldName、DisplayName、Type 等语义行，避免直接改表格头。",
  },
  {
    title: "C# 导出",
    description: "对接 .NET 生成器，输出 LDD 类型、索引器与初始化代码。",
  },
];

type DesktopHostInfo = {
  shell: string;
  desktopHostUrl: string;
  repositoryRoot: string;
};

type DesktopHostHealth = {
  ok: boolean;
  url: string;
  status: string;
  application?: string;
  environment?: string;
  version?: string;
  timestamp?: string;
  message?: string;
};

function App() {
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

  const hostStatusLabel = hostHealth?.ok ? "Connected" : "Starting";
  const hostStatusClassName = hostHealth?.ok ? "status-pill is-ok" : "status-pill";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>LightyDesign</h1>
          <p className="sidebar-copy">
            面向策划表协议的桌面编辑器壳。当前前端已接入 Electron，可继续连接 .NET DesktopHost。
          </p>
        </div>

        <div className="sidebar-panel">
          <div className="panel-header">
            <span>工作簿</span>
            <span>{workbookGroups.length}</span>
          </div>
          <div className="workbook-list">
            {workbookGroups.map((workbook) => (
              <div className="workbook-item" key={workbook.name}>
                <div>
                  <strong>{workbook.name}</strong>
                  <span>{workbook.tables} tables</span>
                </div>
                <em>{workbook.state}</em>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <section className="hero-card">
          <div>
            <p className="eyebrow">Desktop Shell</p>
            <h2>Electron 现已自动拉起 DesktopHost，并轮询本地 API 健康状态。</h2>
            <p className="hero-copy">
              这个前端骨架使用 Vite + React 作为渲染层，Electron 主进程负责窗口生命周期与 .NET 宿主进程拉起，预加载层通过安全桥接把宿主状态送到前端。
            </p>
          </div>

          <div className="hero-metrics">
            <div>
              <span>Renderer</span>
              <strong>React + Vite</strong>
            </div>
            <div>
              <span>Host Bridge</span>
              <strong>{hostInfo?.desktopHostUrl ?? "Loading..."}</strong>
            </div>
            <div>
              <span>Runtime</span>
              <strong>{hostInfo?.shell ?? "Loading..."}</strong>
            </div>
            <div>
              <span>Host Status</span>
              <strong className={hostStatusClassName}>{hostStatusLabel}</strong>
            </div>
          </div>
        </section>

        <section className="content-grid">
          <div className="content-card accent-card">
            <p className="eyebrow">Next Connections</p>
            <h3>建议优先打通的后续能力</h3>
            <ul>
              <li>读取工作区 config.json 与 headers.json</li>
              <li>拉取工作簿树并绑定标签页状态</li>
              <li>触发 .NET 生成器导出 C# 数据代码</li>
            </ul>
          </div>

          <div className="content-card">
            <p className="eyebrow">DesktopHost</p>
            <div className="host-card">
              <div className="host-card-row">
                <span>状态</span>
                <strong>{hostHealth?.status ?? "checking"}</strong>
              </div>
              <div className="host-card-row">
                <span>应用</span>
                <strong>{hostHealth?.application ?? "LightyDesign.DesktopHost"}</strong>
              </div>
              <div className="host-card-row">
                <span>环境</span>
                <strong>{hostHealth?.environment ?? "Unknown"}</strong>
              </div>
              <div className="host-card-row">
                <span>版本</span>
                <strong>{hostHealth?.version ?? "Unknown"}</strong>
              </div>
              <p className="host-card-note">
                {hostHealth?.ok
                  ? `仓库根目录: ${hostInfo?.repositoryRoot ?? "loading"}`
                  : hostHealth?.message ?? "正在等待 DesktopHost 完成启动。"}
              </p>
            </div>

            <p className="eyebrow action-title">Actions</p>
            <div className="action-stack">
              {actionCards.map((card) => (
                <article key={card.title} className="action-card">
                  <strong>{card.title}</strong>
                  <p>{card.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;