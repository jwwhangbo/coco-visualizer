import { create } from "zustand";
import type { LabelSet } from "./dataset";
import type { DatasetImage, ImageSource } from "./types";

interface NewSource {
  id: string;
  name: string;
  kind: "image" | "folder";
  images: DatasetImage[];
}

/**
 * Global store — ONLY state shared across tabs: the open sources (tabs), which
 * one is active, and the loaded label sets. Per-tab view state (selected image,
 * view mode, page, annotation selection/visibility, geometry) lives locally in
 * each <SourceScreen>.
 */
interface AppState {
  sources: ImageSource[];
  activeSourceId: string | null;
  labelSets: LabelSet[];

  addImageSource: (source: NewSource) => void;
  closeSource: (id: string) => void;
  setActiveSource: (id: string) => void;

  addLabelSets: (sets: LabelSet[]) => void;
  removeLabelSource: (path: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sources: [],
  activeSourceId: null,
  labelSets: [],

  addImageSource: ({ id, name, kind, images }) =>
    set((s) => {
      const source: ImageSource = { id, name, kind, images };
      const exists = s.sources.some((x) => x.id === id);
      const sources = exists
        ? s.sources.map((x) => (x.id === id ? source : x))
        : [...s.sources, source];
      return { sources, activeSourceId: id };
    }),

  closeSource: (id) =>
    set((s) => {
      const sources = s.sources.filter((x) => x.id !== id);
      const activeSourceId =
        s.activeSourceId === id
          ? (sources[sources.length - 1]?.id ?? null)
          : s.activeSourceId;
      return { sources, activeSourceId };
    }),

  setActiveSource: (activeSourceId) => set({ activeSourceId }),

  addLabelSets: (sets) =>
    set((s) => {
      const byPath = new Map(s.labelSets.map((ls) => [ls.source.path, ls]));
      for (const ls of sets) byPath.set(ls.source.path, ls);
      return { labelSets: [...byPath.values()] };
    }),

  removeLabelSource: (path) =>
    set((s) => ({
      labelSets: s.labelSets.filter((ls) => ls.source.path !== path),
    })),
}));
