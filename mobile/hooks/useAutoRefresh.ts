/**
 * hooks/useAutoRefresh.ts
 *
 * Reusable hook for auto-refreshing data:
 * 1. Foreground detection — refresh when app comes back to foreground
 * 2. Interval polling — refresh every N seconds
 *
 * Usage:
 *   useAutoRefresh(loadData, { interval: 60000 });
 */

import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";

interface UseAutoRefreshOptions {
  interval?: number;       // polling interval in ms (default: 60000 = 60s)
  enabled?: boolean;       // enable/disable (default: true)
  onForeground?: boolean;  // refresh on foreground (default: true)
}

export function useAutoRefresh(
  refreshFn: () => void | Promise<void>,
  options: UseAutoRefreshOptions = {},
) {
  const {
    interval    = 60_000,
    enabled     = true,
    onForeground = true,
  } = options;

  const appState   = useRef<AppStateStatus>(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef  = useRef(refreshFn);

  // Always keep latest refreshFn reference
  useEffect(() => {
    refreshRef.current = refreshFn;
  }, [refreshFn]);

  // Foreground detection
  useEffect(() => {
    if (!enabled || !onForeground) return;

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        // App came to foreground — refresh
        refreshRef.current();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [enabled, onForeground]);

  // Interval polling
  useEffect(() => {
    if (!enabled || !interval) return;

    intervalRef.current = setInterval(() => {
      // Only poll when app is active
      if (AppState.currentState === "active") {
        refreshRef.current();
      }
    }, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, interval]);
}