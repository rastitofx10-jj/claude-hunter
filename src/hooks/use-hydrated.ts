"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Returns false during SSR & hydration render, true after hydration. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
