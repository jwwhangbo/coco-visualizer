"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { buildLabels } from "@/lib/dataset";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import type {
  DatasetImage,
  GeometryMode,
  ImageSource,
  LabelData,
  ViewMode,
} from "@/lib/types";
import { AnnotationPanel } from "./AnnotationPanel";
import { ConfirmDialog } from "./ConfirmDialog";
import { GridView } from "./GridView";
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

  // ---- per-image edit state (deletions not yet saved) ----
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<string[][]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);

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
    () => currentAnns.filter((a) => !deleted.has(a.id)),
    [currentAnns, deleted],
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

  // ---- delete / undo (scoped to the current image) ----
  const deleteIds = useCallback(
    (ids: string[]) => {
      const fresh = ids.filter((id) => !deleted.has(id));
      if (fresh.length === 0) return;
      setDeleted((d) => {
        const next = new Set(d);
        for (const id of fresh) next.add(id);
        return next;
      });
      setUndoStack((u) => [...u, fresh]);
      setSelectedIds(new Set());
    },
    [deleted],
  );
  const deleteSelected = useCallback(() => {
    if (selectedIds.size > 0) deleteIds([...selectedIds]);
  }, [deleteIds, selectedIds]);
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setDeleted((d) => {
      const next = new Set(d);
      for (const id of last) next.delete(id);
      return next;
    });
  }, [undoStack]);

  // Clear all pending edits + selection (called on save and on navigating away).
  const resetEdits = useCallback(() => {
    setDeleted((d) => (d.size ? new Set() : d));
    setUndoStack((u) => (u.length ? [] : u));
    setSelectedIds((s) => (s.size ? new Set() : s));
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
  const doSave = useCallback(async () => {
    const stemName = selectedImage?.stem;
    if (!stemName) return;
    const toDelete = currentAnns.filter((a) => deleted.has(a.id));
    if (toDelete.length === 0) return;
    const deletions = toDelete.map((a) => {
      const suffix = `::${stemName}::${a.displayId}`;
      const sourcePath = a.id.endsWith(suffix)
        ? a.id.slice(0, a.id.length - suffix.length)
        : a.id.split("::")[0];
      return { sourcePath, stem: stemName, annId: a.displayId };
    });
    const toastId = toast.info(`Saving ${deletions.length} deletion(s)…`);
    try {
      const res = await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deletions }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.dismiss(toastId);
      toast.success("Saved to disk");
      // Refresh the affected label sources so the store reflects disk.
      const paths = new Set(deletions.map((d) => d.sourcePath));
      const affected = labelSets.filter((ls) => paths.has(ls.source.path));
      const refreshed = await Promise.all(
        affected.map(async (ls) => ({
          source: ls.source,
          data: await fetchAnnotations(ls.source.path),
        })),
      );
      if (refreshed.length > 0) addLabelSets(refreshed);
      resetEdits();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`Save failed: ${(err as Error).message}`);
    }
  }, [
    selectedImage,
    currentAnns,
    deleted,
    labelSets,
    addLabelSets,
    resetEdits,
    toast,
  ]);

  const requestSave = () => {
    const count = deleted.size;
    if (count === 0) return;
    setDialog({
      title: "Save changes",
      description: `Delete ${count} annotation(s) from the original file(s) on disk? This overwrites the file and can't be undone.`,
      confirmLabel: "Delete & save",
      destructive: true,
      onConfirm: () => {
        void doSave();
      },
    });
  };

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
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              No images in this source
            </div>
          ) : effectiveViewMode === "single" && selectedImage ? (
            <ImageViewer
              image={selectedImage}
              annotations={liveAnns}
              hidden={hidden}
              geometry={geometry}
              selectedIds={selectedIds}
              onSelect={selectAnn}
              onDeleteAnn={(id) => deleteIds([id])}
              onStepImage={stepImageDebounced}
            />
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
