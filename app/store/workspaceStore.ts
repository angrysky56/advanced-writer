"use client";

import { create } from "zustand";

/**
 * Single source of truth for workspace data shared across the Studio (and,
 * later, the remade dashboard). Every view subscribes here instead of fetching
 * on its own, so one edit / tool-run / job-completion refreshes all panels at
 * once. A single job poller lives here too: when a background job finishes, the
 * store pulls fresh workspace content automatically.
 */
export interface WorkspaceState {
  stories: any[];
  activeId: string;
  version: string;
  arc: any[];
  jobs: any[];
  loading: boolean;
  /** internal: signature of finished jobs, used to detect new completions. */
  _jobsSig: string;

  loadWorkspace: (version?: string) => Promise<void>;
  loadArc: (storyId: string) => Promise<void>;
  init: () => Promise<void>;
  setActiveId: (id: string) => void;
  setVersion: (v: string) => void;
  refresh: () => Promise<void>;
  pollJobs: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

// Module-level so the poll interval is shared by every mounted consumer and
// reference-counted (it stops only when the last consumer unmounts).
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollers = 0;
const POLL_MS = 4000;

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  stories: [],
  activeId: "",
  version: "v1",
  arc: [],
  jobs: [],
  loading: false,
  _jobsSig: "",

  loadWorkspace: async (version) => {
    const v = version ?? get().version;
    set({ loading: true });
    try {
      const d = await fetch(`/api/workspace?version=${v}`).then((r) =>
        r.json(),
      );
      const stories = Array.isArray(d.stories) ? d.stories : [];
      // Keep the current selection if it still exists; else fall back to first.
      const cur = get().activeId;
      const activeId =
        cur && stories.some((s: any) => s.id === cur)
          ? cur
          : stories[0]?.id || "";
      set({ stories, version: v, activeId });

      // If the caller didn't ask for a specific version, jump to the active
      // story's MOST RECENT draft so the Studio shows (and publishes) the
      // latest work by default instead of v1.
      if (version === undefined) {
        const story = stories.find((s: any) => s.id === activeId);
        const vers: string[] = story?.availableVersions || [];
        const latest = vers.length ? vers[vers.length - 1] : v;
        if (latest && latest !== v) {
          await get().loadWorkspace(latest);
        }
      }
    } catch {
      /* ignore — keep prior state */
    } finally {
      set({ loading: false });
    }
  },

  loadArc: async (storyId) => {
    if (!storyId) {
      set({ arc: [] });
      return;
    }
    try {
      const d = await fetch(
        `/api/arc?story_id=${encodeURIComponent(storyId)}`,
      ).then((r) => r.json());
      set({ arc: Array.isArray(d.characters) ? d.characters : [] });
    } catch {
      set({ arc: [] });
    }
  },

  init: async () => {
    await get().loadWorkspace(); // no version → defaults to latest
    await get().loadArc(get().activeId);
  },

  setActiveId: (id) => {
    if (!id || id === get().activeId) return;
    // Switching story reloads its data and defaults to its most recent version.
    set({ activeId: id, version: "v1" });
    get().loadWorkspace(); // no version → jumps to latest for this story
    get().loadArc(id);
  },

  setVersion: (v) => {
    if (v === get().version) return;
    set({ version: v });
    get().loadWorkspace(v);
  },

  refresh: async () => {
    await get().loadWorkspace(get().version);
    await get().loadArc(get().activeId);
  },

  pollJobs: async () => {
    try {
      const d = await fetch("/api/jobs").then((r) => r.json());
      const jobs = Array.isArray(d?.jobs) ? d.jobs : [];
      const sig = jobs
        .filter(
          (j: any) => j.status === "completed" || j.status === "failed",
        )
        .map((j: any) => `${j.id}:${j.status}`)
        .sort()
        .join("|");
      const prev = get()._jobsSig;
      set({ jobs, _jobsSig: sig });
      // A job finished since the last poll → pull fresh content into all views.
      // (Skip the very first poll, when prev is empty, to avoid a load-time
      // refresh storm.)
      if (prev && sig !== prev) {
        get().refresh();
      }
    } catch {
      /* ignore */
    }
  },

  startPolling: () => {
    pollers += 1;
    if (pollTimer) return;
    get().pollJobs();
    pollTimer = setInterval(() => get().pollJobs(), POLL_MS);
  },

  stopPolling: () => {
    pollers = Math.max(0, pollers - 1);
    if (pollers === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
}));
