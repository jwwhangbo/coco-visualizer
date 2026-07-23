"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  applyResult,
  type CleanupKind,
  type CleanupResult,
  runCleanup,
} from "@/lib/geometry";
import type { NormalizedAnnotation } from "@/lib/types";

interface Props {
  /** Current image's live annotations — drives the preview and count. */
  annotations: NormalizedAnnotation[];
  /** Push a preview annotation list to the overlay (null = show live). */
  onPreview: (anns: NormalizedAnnotation[] | null) => void;
  /** Commit a cleanup to the current image (undoable). */
  onApply: (result: CleanupResult) => void;
  /** Request applying a cleanup to every image in the source (writes to disk). */
  onApplyAll: (kind: CleanupKind, param: number) => void;
}

/** Largest island area the slider reaches (px²); the scale is exponential so
 * most of the travel covers the small areas islands actually have. */
const ISLAND_MAX_AREA = 5000;
const sliderToArea = (t: number) =>
  Math.round(Math.exp((t / 100) * Math.log(ISLAND_MAX_AREA)));

/** Bar above the image viewer holding per-image cleanup tools. */
export function ImageActionBar({
  annotations,
  onPreview,
  onApply,
  onApplyAll,
}: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1.5">
      <span className="text-xs text-muted-foreground">Cleanup</span>
      <CleanupTool
        kind="islands"
        label="◍ Islands"
        title="Remove segmentation islands"
        help="Drop polygon islands smaller than the area below."
        annotations={annotations}
        onPreview={onPreview}
        onApply={onApply}
        onApplyAll={onApplyAll}
      />
      <CleanupTool
        kind="overlaps"
        label="⧉ Overlaps"
        title="Remove overlapping annotations"
        help="Drop an annotation when this share of it sits inside a larger one; the bigger survives."
        annotations={annotations}
        onPreview={onPreview}
        onApply={onApply}
        onApplyAll={onApplyAll}
      />
    </div>
  );
}

function CleanupTool({
  kind,
  label,
  title,
  help,
  annotations,
  onPreview,
  onApply,
  onApplyAll,
}: {
  kind: CleanupKind;
  label: string;
  title: string;
  help: string;
} & Props) {
  const [open, setOpen] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const [t, setT] = useState(kind === "islands" ? 40 : 80);

  const param = kind === "islands" ? sliderToArea(t) : t / 100;
  const result = useMemo(
    () => runCleanup(kind, annotations, param),
    [kind, annotations, param],
  );
  const removed = result.removedIds.length;
  const trimmed = result.trimmed.length;

  // Live-preview the result on the overlay while the popover is open.
  useEffect(() => {
    if (open) onPreview(applyResult(annotations, result));
  }, [open, annotations, result, onPreview]);
  // Always drop the preview when this tool unmounts (e.g. image change).
  useEffect(() => () => onPreview(null), [onPreview]);

  const closePreview = () => {
    setOpen(false);
    onPreview(null);
  };
  const doApply = () => {
    if (applyAll) onApplyAll(kind, param);
    else onApply(result);
    closePreview();
  };

  const valueLabel =
    kind === "islands" ? `${param.toLocaleString()} px²` : `${t}%`;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onPreview(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="text-xs font-medium text-foreground">{title}</div>
        <p className="mt-1 text-[11px] text-muted-foreground">{help}</p>

        <div className="mt-3 flex items-center gap-3">
          <Slider
            className="flex-1"
            min={kind === "islands" ? 0 : 50}
            max={kind === "islands" ? 100 : 99}
            step={1}
            value={[t]}
            onValueChange={(v) => setT(v[0])}
          />
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
            {valueLabel}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              aria-label="Apply to all images in the source"
              checked={applyAll}
              onCheckedChange={setApplyAll}
            />
            All images
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {kind === "islands"
              ? `${removed} removed · ${trimmed} trimmed`
              : `${removed} removed`}
            <span className="ml-1">(this image)</span>
          </span>
        </div>

        <Button
          type="button"
          className="mt-3 w-full"
          variant={applyAll ? "destructive" : "default"}
          disabled={!applyAll && removed + trimmed === 0}
          onClick={doApply}
        >
          {applyAll ? "Apply to all & save" : "Apply"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
