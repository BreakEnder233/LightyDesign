import { useEffect, useRef, useState } from "react";

import type { ToastNotification } from "../workbook-editor/types/desktopApp";

type AppUpdateState = {
  status: "idle" | "checking" | "available" | "up-to-date" | "unconfigured" | "error";
  info: AppUpdateInfo | null;
  result: AppUpdateCheckResult | null;
  downloadState: AppUpdateDownloadState | null;
};

type UseAppUpdatesOptions = {
  bridgeStatus: "loading" | "ready" | "unavailable";
  onToast: (notification: Omit<ToastNotification, "id" | "timestamp">) => void;
};

function buildToastSummary(result: AppUpdateCheckResult) {
  if (result.status === "available") {
    return `当前 ${result.currentVersion}，最新 ${result.latestVersion ?? "unknown"}`;
  }

  if (result.status === "up-to-date") {
    return `当前版本 ${result.currentVersion} 已是最新。`;
  }

  return result.detail ?? "更新检查未完成。";
}

function isDownloadActive(downloadState: AppUpdateDownloadState | null) {
  return downloadState?.status === "preparing" || downloadState?.status === "downloading" || downloadState?.status === "launching";
}

export function useAppUpdates({ bridgeStatus, onToast }: UseAppUpdatesOptions) {
  const [state, setState] = useState<AppUpdateState>({
    status: "idle",
    info: null,
    result: null,
    downloadState: null,
  });
  const notifiedVersionRef = useRef<string | null>(null);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    let disposed = false;

    if (bridgeStatus !== "ready" || !window.lightyDesign) {
      return;
    }

    async function initialize() {
      try {
        const [info, downloadState] = await Promise.all([
          window.lightyDesign?.getAppUpdateInfo(),
          window.lightyDesign?.getAppUpdateDownloadState(),
        ]);

        if (disposed || !info || !downloadState) {
          return;
        }

        setState((currentState) => ({
          ...currentState,
          info,
          downloadState,
          status: info.canCheck ? currentState.status : "unconfigured",
        }));

        if (!info.canCheck) {
          return;
        }

        setState((currentState) => ({ ...currentState, status: "checking" }));
        const result = await window.lightyDesign.checkForAppUpdates();
        if (disposed) {
          return;
        }

        setState((currentState) => ({
          ...currentState,
          result,
          status: result.status,
        }));

        if (result.status === "available" && notifiedVersionRef.current !== result.latestVersion) {
          notifiedVersionRef.current = result.latestVersion ?? null;
          onToastRef.current({
            title: "发现新版本",
            summary: buildToastSummary(result),
            detail: result.detail ?? result.releasesPageUrl ?? "GitHub Releases 中已有更新版本。",
            source: "system",
            variant: "success",
            canOpenDetail: true,
            durationMs: 10000,
            action: result.downloadUrl
              ? {
                  label: "静默安装",
                  kind: "install-update",
                }
              : undefined,
          });
        }
      } catch (error) {
        if (!disposed) {
          setState((currentState) => ({
            ...currentState,
            status: "error",
            result: {
              status: "error",
              currentVersion: currentState.info?.currentVersion ?? "unknown",
              repository: currentState.info?.repository ?? null,
              releasesPageUrl: currentState.info?.releasesPageUrl ?? null,
              detail: error instanceof Error ? error.message : "初始化更新检查失败。",
            },
          }));
        }
      }
    }

    void initialize();

    return () => {
      disposed = true;
    };
  }, [bridgeStatus]);

  useEffect(() => {
    let disposed = false;

    if (bridgeStatus !== "ready" || !window.lightyDesign) {
      return;
    }

    async function syncDownloadState() {
      try {
        const downloadState = await window.lightyDesign?.getAppUpdateDownloadState();
        if (disposed || !downloadState) {
          return;
        }

        setState((currentState) => ({
          ...currentState,
          downloadState,
        }));
      } catch {
        // Ignore transient polling failures and keep the last known state.
      }
    }

    void syncDownloadState();

    if (!isDownloadActive(state.downloadState)) {
      return () => {
        disposed = true;
      };
    }

    const timerId = window.setInterval(() => {
      void syncDownloadState();
    }, 700);

    return () => {
      disposed = true;
      window.clearInterval(timerId);
    };
  }, [bridgeStatus, state.downloadState?.status]);

  async function checkForUpdates(options?: { manual?: boolean }) {
    if (!window.lightyDesign) {
      return null;
    }

    setState((currentState) => ({ ...currentState, status: "checking" }));
    const result = await window.lightyDesign.checkForAppUpdates();

    setState((currentState) => ({
      ...currentState,
      result,
      status: result.status,
    }));

    if (options?.manual) {
      if (result.status === "up-to-date") {
        onToast({
          title: "当前已是最新版本",
          summary: buildToastSummary(result),
          detail: result.releasesPageUrl ?? `当前版本 ${result.currentVersion} 已是最新。`,
          source: "system",
          variant: "success",
          canOpenDetail: false,
          durationMs: 4000,
        });
      }

      if (result.status === "unconfigured" || result.status === "error") {
        onToast({
          title: result.status === "unconfigured" ? "尚未配置更新源" : "检查更新失败",
          summary: buildToastSummary(result),
          detail: result.detail ?? "GitHub Releases 更新检查失败。",
          source: "system",
          variant: "error",
          canOpenDetail: true,
          durationMs: 8000,
          action: result.releasesPageUrl
            ? {
                label: "打开发布页",
                kind: "open-external-url",
                url: result.releasesPageUrl,
              }
            : undefined,
        });
      }
    }

    return result;
  }

  async function installUpdate(options?: { manual?: boolean }) {
    if (!window.lightyDesign) {
      return null;
    }

    setState((currentState) => ({
      ...currentState,
      downloadState: currentState.downloadState ?? {
        status: "preparing",
        currentVersion: currentState.info?.currentVersion ?? currentState.result?.currentVersion ?? "unknown",
        latestVersion: currentState.result?.latestVersion ?? null,
        repository: currentState.info?.repository ?? currentState.result?.repository ?? null,
        releasesPageUrl: currentState.result?.releasesPageUrl ?? currentState.info?.releasesPageUrl ?? null,
        fileName: currentState.result?.downloadName ?? null,
        cachedFilePath: null,
        bytesReceived: 0,
        totalBytes: null,
        progressPercent: null,
        detail: "准备下载安装包。",
      },
    }));

    const downloadState = await window.lightyDesign.downloadAndInstallAppUpdate();

    setState((currentState) => ({
      ...currentState,
      downloadState,
    }));

    if (options?.manual) {
      if (downloadState.status === "cancelled") {
        onToastRef.current({
          title: "已取消更新",
          summary: downloadState.detail ?? "已取消下载安装。",
          detail: downloadState.detail,
          source: "system",
          variant: "success",
          canOpenDetail: Boolean(downloadState.detail),
          durationMs: 4000,
        });
      }

      if (downloadState.status === "error") {
        onToastRef.current({
          title: "下载安装失败",
          summary: downloadState.detail ?? "应用内下载安装失败。",
          detail: downloadState.detail ?? "应用内下载安装失败。",
          source: "system",
          variant: "error",
          canOpenDetail: true,
          durationMs: 8000,
          action: state.result?.releasesPageUrl
            ? {
                label: "打开发布页",
                kind: "open-external-url",
                url: state.result.releasesPageUrl,
              }
            : undefined,
        });
      }

      if (downloadState.status === "launching") {
        onToastRef.current({
          title: "静默安装已启动",
          summary: downloadState.detail ?? "更新安装已切换到后台静默执行。",
          detail: downloadState.detail,
          source: "system",
          variant: "success",
          canOpenDetail: Boolean(downloadState.detail),
          durationMs: 5000,
        });
      }
    }

    return downloadState;
  }

  return {
    updateInfo: state.info,
    updateResult: state.result,
    updateStatus: state.status,
    updateDownloadState: state.downloadState,
    checkForUpdates,
    installUpdate,
  };
}