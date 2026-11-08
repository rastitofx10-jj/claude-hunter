import { create } from "zustand";
import { persist } from "zustand/middleware";

type TabKey = "search" | "watchlist" | "sweep" | "history" | "genesis" | "mission" | "live";

interface HunterState {
  token: string;
  activeTab: TabKey;
  setToken: (t: string) => void;
  setActiveTab: (t: TabKey) => void;
}

export const useHunterStore = create<HunterState>()(
  persist(
    (set) => ({
      token: "",
      activeTab: "search",
      setToken: (token) => set({ token }),
      setActiveTab: (activeTab) => set({ activeTab }),
    }),
    { name: "claude-hunter-v1" }
  )
);
