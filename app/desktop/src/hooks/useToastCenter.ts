import { useEffect, useMemo, useRef, useState } from "react";

import type { ToastNotification } from "../types/desktopApp";

type PushToastInput = Omit<ToastNotification, "id" | "summary" | "timestamp">;

export function useToastCenter() {
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const [selectedErrorToastId, setSelectedErrorToastId] = useState<number | null>(null);
  const [hoveredToastId, setHoveredToastId] = useState<number | null>(null);
  const nextToastIdRef = useRef(1);
  const toastTimerMapRef = useRef<Map<number, number>>(new Map());

  const selectedErrorToast = useMemo(
    () => toastNotifications.find((toast) => toast.id === selectedErrorToastId && toast.canOpenDetail) ?? null,
    [selectedErrorToastId, toastNotifications],
  );

  useEffect(() => {
    const activeToastIds = new Set(toastNotifications.map((toast) => toast.id));

    for (const [toastId, timeoutId] of toastTimerMapRef.current.entries()) {
      if (!activeToastIds.has(toastId) || hoveredToastId === toastId || selectedErrorToastId === toastId) {
        window.clearTimeout(timeoutId);
        toastTimerMapRef.current.delete(toastId);
      }
    }

    toastNotifications.forEach((toast) => {
      if (!toast.durationMs || hoveredToastId === toast.id || selectedErrorToastId === toast.id) {
        return;
      }

      if (toastTimerMapRef.current.has(toast.id)) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.durationMs);

      toastTimerMapRef.current.set(toast.id, timeoutId);
    });
  }, [hoveredToastId, selectedErrorToastId, toastNotifications]);

  useEffect(() => {
    return () => {
      for (const timeoutId of toastTimerMapRef.current.values()) {
        window.clearTimeout(timeoutId);
      }

      toastTimerMapRef.current.clear();
    };
  }, []);

  function pushToastNotification({
    title,
    detail,
    source,
    variant,
    canOpenDetail,
    durationMs,
    action,
  }: PushToastInput) {
    const normalizedDetail = detail?.trim();
    const summarySource = normalizedDetail ?? title;
    const nextToast: ToastNotification = {
      id: nextToastIdRef.current,
      title,
      summary: summarySource.length > 120 ? `${summarySource.slice(0, 117)}...` : summarySource,
      detail: normalizedDetail,
      source,
      variant,
      canOpenDetail,
      durationMs,
      action,
      timestamp: new Date().toLocaleString("zh-CN", { hour12: false }),
    };

    nextToastIdRef.current += 1;
    setToastNotifications((current) => [nextToast, ...current].slice(0, 5));
  }

  function openToastDetail(toastId: number) {
    const targetToast = toastNotifications.find((toast) => toast.id === toastId);
    if (!targetToast?.canOpenDetail) {
      return;
    }

    setSelectedErrorToastId(toastId);
  }

  function dismissToast(toastId: number) {
    const timeoutId = toastTimerMapRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      toastTimerMapRef.current.delete(toastId);
    }

    setToastNotifications((current) => current.filter((toast) => toast.id !== toastId));
    setSelectedErrorToastId((current) => (current === toastId ? null : current));
    setHoveredToastId((current) => (current === toastId ? null : current));
  }

  async function copySelectedErrorDetail() {
    if (!selectedErrorToast?.detail) {
      return { ok: false as const };
    }

    try {
      await navigator.clipboard.writeText(selectedErrorToast.detail);
      return { ok: true as const, title: selectedErrorToast.title };
    } catch (error) {
      return {
        ok: false as const,
        errorMessage: error instanceof Error ? error.message : "剪贴板写入失败。",
      };
    }
  }

  return {
    toastNotifications,
    selectedErrorToast,
    setHoveredToastId,
    setSelectedErrorToastId,
    pushToastNotification,
    openToastDetail,
    dismissToast,
    copySelectedErrorDetail,
  };
}