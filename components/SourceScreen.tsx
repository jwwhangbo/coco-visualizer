"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { buildLabels } from "@/lib/dataset";
import type { CleanupKind, CleanupResult } from "@/lib/geometry";
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
  const [gridZoom, setGridZoom] = useState(100);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedImagePaths, setSelectedImagePaths] = useState<Set<string>>(
    new Set(),
  );
  const [exporting, setExporting] = useState(false);
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
  // 1-based position of the current image within the source (0 when none).
  const imageIndex = selectedImage
    ? images.findIndex((i) => i.path === selectedImage.path) + 1
    : 0;
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

  const goToPage = useCallback(
    (p: number) => {
      setPage(Math.min(Math.max(1, p), pageCount));
    },
    [pageCount],
  );

  const updateGridSelection = useCallback(
    (selectedOnPage: string[], pagePaths: string[]) => {
      setSelectedImagePaths((current) => {
        const next = new Set(current);
        for (const path of pagePaths) next.delete(path);
        for (const path of selectedOnPage) next.add(path);
        return next;
      });
    },
    [],
  );

  // A plain click toggles only the clicked image, leaving the rest of the
  // selection intact (so clicking a selected image — even one of many —
  // deselects just that image). Empty-space clicks clear the whole selection.
  const onGridImageClick = useCallback((path: string | null) => {
    setSelectedImagePaths((current) => {
      if (!path) return new Set();
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const exportSelected = useCallback(async () => {
    const selected = images.filter((image) =>
      selectedImagePaths.has(image.path),
    );
    if (selected.length === 0 || exporting) return;
    setExporting(true);
    const toastId = toast.info(
      `Preparing ${selected.length} image(s) on the server…`,
    );
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: selected,
          sources: labelSets.map((set) => set.source.path),
        }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error ?? "Could not queue export",
        );
      const { jobId } = (await response.json()) as { jobId: string };
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const statusResponse = await fetch(
          `/api/export?jobId=${encodeURIComponent(jobId)}`,
        );
        if (!statusResponse.ok)
          throw new Error(
            (await statusResponse.json()).error ?? "Could not check export",
          );
        const { job } = await statusResponse.json();
        if (job.state === "failed")
          throw new Error(job.error ?? "Export failed");
        if (job.state === "completed") {
          const link = document.createElement("a");
          link.href = `/api/export?jobId=${encodeURIComponent(jobId)}&download=1`;
          link.click();
          toast.dismiss(toastId);
          toast.success(
            `Exported ${job.result.imageCount} image(s) and ${job.result.annotationCount} annotation(s)`,
          );
          break;
        }
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [images, selectedImagePaths, exporting, labelSets, toast]);

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

  // ---- apply a cleanup to EVERY image in the source ----
  // Enqueued as a background job; the worker does the geometry + disk writes
  // server-side and the global <JobsButton> reports progress and refreshes the
  // store when it finishes.
  const applyCleanupAll = useCallback(
    async (kind: CleanupKind, param: number) => {
      // Which label sources actually feed this tab's images.
      const sources = new Set<string>();
      for (const img of images) {
        for (const a of labels.annotationsByStem[img.stem] ?? [])
          sources.add(sourcePathOf(a.id, img.stem, a.displayId));
      }
      if (sources.size === 0) {
        toast.success("No labels loaded for this source");
        return;
      }
      // The confirm already warned that unsaved edits are discarded.
      resetEdits();
      try {
        const res = await fetch("/api/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: [...sources],
            stems: images.map((i) => i.stem),
            kind,
            param,
          }),
        });
        if (!res.ok)
          throw new Error((await res.json()).error ?? "Failed to queue job");
        toast.success("Cleanup queued — track it under Jobs");
      } catch (err) {
        toast.error(`Could not queue cleanup: ${(err as Error).message}`);
      }
    },
    [images, labels, resetEdits, toast],
  );

  const requestApplyAll = useCallback(
    (kind: CleanupKind, param: number) => {
      setDialog({
        title: "Apply to all images",
        description: `Run ${
          kind === "islands"
            ? "island removal"
            : kind === "merge"
              ? "annotation merge"
              : "overlap removal"
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
      } else if (
        effectiveViewMode === "grid" &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        goToPage(page + (e.key === "ArrowRight" ? 1 : -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, deleteSelected, undo, effectiveViewMode, page, goToPage]);

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
          gridZoom={gridZoom}
          onGridZoom={setGridZoom}
          canUndo={dirty}
          onUndo={undo}
          selectedImageCount={selectedImagePaths.size}
          onClearImageSelection={() => setSelectedImagePaths(new Set())}
          onExport={() => void exportSelected()}
          exporting={exporting}
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
                imageIndex={imageIndex}
                imageCount={images.length}
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
              zoom={gridZoom}
              onOpen={openImage}
              selectedPaths={selectedImagePaths}
              onSelectionChange={updateGridSelection}
              onImageClick={onGridImageClick}
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
