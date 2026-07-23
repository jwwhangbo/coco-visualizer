"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { buildLabels } from "@/lib/dataset";
import {
  type CleanupKind,
  type CleanupResult,
  runCleanup,
} from "@/lib/geometry";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import type {
  DatasetImage,
  GeometryMode,
  ImageSource,
  LabelData,
  NormalizedAnnotation,
  ViewMode,
} from "@/lib/types";
import { AnnotationPanel } from "./AnnotationPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { GridView } from "./GridView";
import { ImageActionBar } from "./ImageActionBar";
import { ImageViewer } from "./ImageViewer";
import { Toolbar } from "./Toolbar";

// Step at most one image per this window (ms), on the leading edge.
const IMAGE_WHEEL_COOLDOWN = 100;

async function fetchAnnotations(path: string): Promise<LabelData> {
  const res = await fetch(`/api/annotations?path=${encodeURIComponent(path)}`);
  if (!res.ok)
    throw new Error((await res.json()).error ?? "Failed to load labels");
  return res.json();
}

interface DialogState {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/** One undoable edit: annotations removed + polygon overrides changed (with
 * their previous value so undo can restore them). */
interface EditOp {
  deleted: string[];
  polyBefore: { id: string; prev: number[][] | null }[];
}

/** Recover the source file/folder path from a namespaced annotation id
 * (`${sourcePath}::${stem}::${displayId}`). */
function sourcePathOf(annId: string, stem: string, displayId: string): string {
  const suffix = `::${stem}::${displayId}`;
  return annId.endsWith(suffix)
    ? annId.slice(0, annId.length - suffix.length)
    : annId.split("::")[0];
}

/**
 * One open data source (tab). Owns all per-tab view state locally: selected
 * image, view mode, page, annotation selection/visibility, geometry, plus the
 * per-image delete/undo stack. Labels are read from the shared store and
 * matched to this tab's images by stem.
 *
 * `id` is required so <Navigator> recognizes this element as a screen; it is
 * read off the element, not used inside.
 */
export function SourceScreen({ source }: { id: string; source: ImageSource }) {
  const images = source.images;
  const gridEnabled = source.kind !== "image";

  // ---- per-tab local state ----
  const [selectedPath, setSelectedPath] = useState<string | null>(
    images[0]?.path ?? null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [geometry, setGeometry] = useState<GeometryMode>("both");

  // ---- per-image edit state (deletions + geometry trims not yet saved) ----
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [polyOverride, setPolyOverride] = useState<Map<string, number[][]>>(
    new Map(),
  );
  const [undoStack, setUndoStack] = useState<EditOp[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // Transient overlay preview while a cleanup slider is open (null = show live).
  const [previewAnns, setPreviewAnns] = useState<NormalizedAnnotation[] | null>(
    null,
  );

  // ---- shared (global) labels + store ----
  const labelSets = useAppStore((s) => s.labelSets);
  const removeLabelSource = useAppStore((s) => s.removeLabelSource);
  const addLabelSets = useAppStore((s) => s.addLabelSets);
  const activeSourceId = useAppStore((s) => s.activeSourceId);
  const isActive = activeSourceId === source.id;
  const toast = useToast();

  const labels = useMemo(() => buildLabels(labelSets), [labelSets]);
  const labelSources = useMemo(
    () => labelSets.map((ls) => ls.source),
    [labelSets],
  );

  const effectiveViewMode: ViewMode = gridEnabled ? viewMode : "single";
  const selectedImage =
    images.find((i) => i.path === selectedPath) ?? images[0] ?? null;
  const currentAnns = selectedImage
    ? (labels.annotationsByStem[selectedImage.stem] ?? [])
    : [];
  const liveAnns = useMemo(
    () =>
      currentAnns
        .filter((a) => !deleted.has(a.id))
        .map((a) => {
          const p = polyOverride.get(a.id);
          return p ? { ...a, polygons: p } : a;
        }),
    [currentAnns, deleted, polyOverride],
  );
  const dirty = undoStack.length > 0;

  const pageCount = Math.max(1, Math.ceil(images.length / pageSize));
  const pageImages = useMemo(
    () => images.slice((page - 1) * pageSize, page * pageSize),
    [images, page, pageSize],
  );

  // ---- selection ----
  const selectAnn = useCallback((id: string, additive: boolean) => {
    setSelectedIds((s) => {
      if (!additive) return new Set([id]);
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectIds = useCallback(
    (ids: string[]) => setSelectedIds(new Set(ids)),
    [],
  );

  // ---- delete / cleanup / undo (scoped to the current image) ----
  const deleteIds = useCallback(
    (ids: string[]) => {
      const fresh = ids.filter((id) => !deleted.has(id));
      if (fresh.length === 0) return;
      setDeleted((d) => {
        const next = new Set(d);
        for (const id of fresh) next.add(id);
        return next;
      });
      setUndoStack((u) => [...u, { deleted: fresh, polyBefore: [] }]);
      setSelectedIds(new Set());
    },
    [deleted],
  );
  const deleteSelected = useCallback(() => {
    if (selectedIds.size > 0) deleteIds([...selectedIds]);
  }, [deleteIds, selectedIds]);

  // Apply a cleanup result to the CURRENT image as one undoable op.
  const applyCleanup = useCallback(
    (result: CleanupResult) => {
      if (result.removedIds.length === 0 && result.trimmed.length === 0) return;
      const polyBefore = result.trimmed.map((t) => ({
        id: t.id,
        prev: polyOverride.get(t.id) ?? null,
      }));
      setPolyOverride((m) => {
        const next = new Map(m);
        for (const t of result.trimmed) next.set(t.id, t.polygons);
        return next;
      });
      setDeleted((d) => {
        const next = new Set(d);
        for (const id of result.removedIds) next.add(id);
        return next;
      });
      setUndoStack((u) => [...u, { deleted: result.removedIds, polyBefore }]);
      setSelectedIds(new Set());
      setPreviewAnns(null);
    },
    [polyOverride],
  );

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const op = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    if (op.deleted.length > 0)
      setDeleted((d) => {
        const next = new Set(d);
        for (const id of op.deleted) next.delete(id);
        return next;
      });
    if (op.polyBefore.length > 0)
      setPolyOverride((m) => {
        const next = new Map(m);
        for (const { id, prev } of op.polyBefore) {
          if (prev === null) next.delete(id);
          else next.set(id, prev);
        }
        return next;
      });
  }, [undoStack]);

  // Clear all pending edits + selection (called on save and on navigating away).
  const resetEdits = useCallback(() => {
    setDeleted((d) => (d.size ? new Set() : d));
    setPolyOverride((m) => (m.size ? new Map() : m));
    setUndoStack((u) => (u.length ? [] : u));
    setSelectedIds((s) => (s.size ? new Set() : s));
    setPreviewAnns(null);
  }, []);

  // ---- navigation guard: prompt when leaving with unsaved deletions (req #7),
  // otherwise reset the per-image stack (req #8). ----
  const guardLeave = useCallback(
    (action: () => void) => {
      if (undoStack.length > 0) {
        setDialog({
          title: "Unsaved changes",
          description:
            "You have deleted annotations that aren't saved. Discard them and continue?",
          confirmLabel: "Discard & continue",
          destructive: true,
          onConfirm: () => {
            resetEdits();
            action();
          },
        });
      } else {
        resetEdits();
        action();
      }
    },
    [undoStack.length, resetEdits],
  );

  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), pageCount));

  const stepImage = useCallback(
    (delta: number) => {
      if (images.length === 0) return;
      const idx = images.findIndex((i) => i.path === selectedPath);
      const base = idx === -1 ? 0 : idx;
      const next = Math.min(Math.max(0, base + delta), images.length - 1);
      if (images[next].path !== selectedPath)
        guardLeave(() => setSelectedPath(images[next].path));
    },
    [images, selectedPath, guardLeave],
  );
  const stepImageDebounced = useDebouncedCallback(
    stepImage,
    IMAGE_WHEEL_COOLDOWN,
    { leading: true, trailing: false },
  );

  const requestViewMode = (mode: ViewMode) => {
    if (mode === effectiveViewMode) return;
    guardLeave(() => setViewMode(mode));
  };
  const openImage = (image: DatasetImage) => {
    guardLeave(() => {
      setSelectedPath(image.path);
      setViewMode("single");
    });
  };

  const toggleAnn = (id: string, visible: boolean) =>
    setHidden((h) => ({ ...h, [id]: !visible }));
  const setAllAnns = (visible: boolean) =>
    setHidden((h) => {
      const next = { ...h };
      for (const a of liveAnns) next[a.id] = !visible;
      return next;
    });

  // ---- save (in place) ----
  // Re-fetch the given source paths so the store reflects what's now on disk.
  const refreshSources = useCallback(
    async (paths: Set<string>) => {
      const affected = labelSets.filter((ls) => paths.has(ls.source.path));
      const refreshed = await Promise.all(
        affected.map(async (ls) => ({
          source: ls.source,
          data: await fetchAnnotations(ls.source.path),
        })),
      );
      if (refreshed.length > 0) addLabelSets(refreshed);
    },
    [labelSets, addLabelSets],
  );

  const doSave = useCallback(async () => {
    const stemName = selectedImage?.stem;
    if (!stemName) return;
    const deletions = currentAnns
      .filter((a) => deleted.has(a.id))
      .map((a) => ({
        sourcePath: sourcePathOf(a.id, stemName, a.displayId),
        stem: stemName,
        annId: a.displayId,
      }));
    const edits = currentAnns
      .filter((a) => !deleted.has(a.id) && polyOverride.has(a.id))
      .map((a) => ({
        sourcePath: sourcePathOf(a.id, stemName, a.displayId),
        stem: stemName,
        annId: a.displayId,
        polygons: polyOverride.get(a.id) as number[][],
      }));
    if (deletions.length === 0 && edits.length === 0) return;
    const toastId = toast.info(
      `Saving ${deletions.length + edits.length} change(s)…`,
    );
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletions, edits }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.dismiss(toastId);
      toast.success("Saved to disk");
      await refreshSources(
        new Set([...deletions, ...edits].map((c) => c.sourcePath)),
      );
      resetEdits();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`Save failed: ${(err as Error).message}`);
    }
  }, [
    selectedImage,
    currentAnns,
    deleted,
    polyOverride,
    refreshSources,
    resetEdits,
    toast,
  ]);

  const requestSave = () => {
    const dels = deleted.size;
    const edits = [...polyOverride.keys()].filter(
      (id) => !deleted.has(id),
    ).length;
    if (dels === 0 && edits === 0) return;
    setDialog({
      title: "Save changes",
      description: `Write ${dels} deletion(s) and ${edits} geometry edit(s) to the original file(s) on disk? This overwrites the file and can't be undone.`,
      confirmLabel: "Save to disk",
      destructive: true,
      onConfirm: () => {
        void doSave();
      },
    });
  };

  // ---- apply a cleanup to EVERY image in the source, writing straight to disk ----
  const applyCleanupAll = useCallback(
    async (kind: CleanupKind, param: number) => {
      const deletions: {
        sourcePath: string;
        stem: string;
        annId: string;
      }[] = [];
      const edits: {
        sourcePath: string;
        stem: string;
        annId: string;
        polygons: number[][];
      }[] = [];
      for (const img of images) {
        const anns = labels.annotationsByStem[img.stem] ?? [];
        if (anns.length === 0) continue;
        const result = runCleanup(kind, anns, param);
        const byId = new Map(anns.map((a) => [a.id, a]));
        for (const id of result.removedIds) {
          const a = byId.get(id);
          if (a)
            deletions.push({
              sourcePath: sourcePathOf(a.id, img.stem, a.displayId),
              stem: img.stem,
              annId: a.displayId,
            });
        }
        for (const t of result.trimmed) {
          const a = byId.get(t.id);
          if (a)
            edits.push({
              sourcePath: sourcePathOf(a.id, img.stem, a.displayId),
              stem: img.stem,
              annId: a.displayId,
              polygons: t.polygons,
            });
        }
      }
      if (deletions.length === 0 && edits.length === 0) {
        toast.success("Nothing matched across the source");
        return;
      }
      const toastId = toast.info(
        `Applying to ${images.length} image(s): ${deletions.length} removed, ${edits.length} trimmed…`,
      );
      try {
        const res = await fetch("/api/annotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deletions, edits }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
        toast.dismiss(toastId);
        toast.success("Applied to all images & saved");
        await refreshSources(
          new Set([...deletions, ...edits].map((c) => c.sourcePath)),
        );
        resetEdits();
      } catch (err) {
        toast.dismiss(toastId);
        toast.error(`Apply-all failed: ${(err as Error).message}`);
      }
    },
    [images, labels, refreshSources, resetEdits, toast],
  );

  const requestApplyAll = useCallback(
    (kind: CleanupKind, param: number) => {
      setDialog({
        title: "Apply to all images",
        description: `Run ${
          kind === "islands" ? "island removal" : "overlap removal"
        } on all ${images.length} image(s) and write the changes to disk? This can't be undone${
          dirty ? " and discards your current unsaved edits" : ""
        }.`,
        confirmLabel: "Apply & save",
        destructive: true,
        onConfirm: () => {
          void applyCleanupAll(kind, param);
        },
      });
    },
    [images.length, dirty, applyCleanupAll],
  );

  // ---- keyboard: Delete / Ctrl-Z, only for the active tab ----
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, deleteSelected, undo]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          viewMode={effectiveViewMode}
          onViewMode={requestViewMode}
          gridEnabled={gridEnabled}
          imageCount={images.length}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPage={goToPage}
          onPageSize={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          canUndo={dirty}
          onUndo={undo}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          {images.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No images in this source
            </div>
          ) : effectiveViewMode === "single" && selectedImage ? (
            <>
              <ImageActionBar
                key={selectedImage.path}
                annotations={liveAnns}
                onPreview={setPreviewAnns}
                onApply={applyCleanup}
                onApplyAll={requestApplyAll}
              />
              <ImageViewer
                image={selectedImage}
                annotations={previewAnns ?? liveAnns}
                hidden={hidden}
                geometry={geometry}
                selectedIds={selectedIds}
                onSelect={selectAnn}
                onDeleteAnn={(id) => deleteIds([id])}
                onStepImage={stepImageDebounced}
              />
            </>
          ) : (
            <GridView
              images={pageImages}
              annotationsByStem={labels.annotationsByStem}
              hidden={hidden}
              geometry={geometry}
              page={page}
              pageCount={pageCount}
              onPage={goToPage}
              onOpen={openImage}
            />
          )}
        </div>
      </div>

      <AnnotationPanel
        annotations={liveAnns}
        hidden={hidden}
        geometry={geometry}
        labelSources={labelSources}
        onGeometry={setGeometry}
        onRemoveSource={removeLabelSource}
        onToggle={toggleAnn}
        onSetAll={setAllAnns}
        selectedIds={selectedIds}
        onSelect={selectAnn}
        onSelectIds={selectIds}
        onDelete={(id) => deleteIds([id])}
        onSave={requestSave}
        dirty={dirty}
      />

      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.title ?? ""}
        description={dialog?.description ?? ""}
        confirmLabel={dialog?.confirmLabel ?? "OK"}
        destructive={dialog?.destructive}
        onConfirm={() => {
          dialog?.onConfirm();
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
