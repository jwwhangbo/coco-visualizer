"use client";

import {
  LandPlotIcon,
  SquaresIntersectIcon,
  SquaresUniteIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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

/** Per-tool slider behavior: default position, range, the scalar `param` the
 * slider maps to, plus the value/count labels. Keeps the JSX free of per-kind
 * ternaries now that there are several tools. */
const TOOL_CONFIG: Record<
  CleanupKind,
  {
    defaultT: number;
    min: number;
    max: number;
    param: (t: number) => number;
    valueLabel: (t: number, param: number) => string;
    countLabel: (removed: number, trimmed: number) => string;
  }
> = {
  islands: {
    defaultT: 40,
    min: 0,
    max: 100,
    param: sliderToArea,
    valueLabel: (_t, param) => `${param.toLocaleString()} px²`,
    countLabel: (removed, trimmed) => `${removed} removed · ${trimmed} trimmed`,
  },
  overlaps: {
    defaultT: 80,
    min: 50,
    max: 99,
    param: (t) => t / 100,
    valueLabel: (t) => `${t}%`,
    countLabel: (removed) => `${removed} removed`,
  },
  merge: {
    defaultT: 30,
    min: 5,
    max: 99,
    param: (t) => t / 100,
    valueLabel: (t) => `${t}%`,
    countLabel: (removed, trimmed) =>
      `${trimmed} group(s) · ${removed} absorbed`,
  },
};

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
        label={
          <>
            <HugeiconsIcon icon={LandPlotIcon} />
            Islands
          </>
        }
        title="Remove segmentation islands"
        help="Drop polygon islands smaller than the area below."
        annotations={annotations}
        onPreview={onPreview}
        onApply={onApply}
        onApplyAll={onApplyAll}
      />
      <CleanupTool
        kind="overlaps"
        // label="⧉ Overlaps"
        label={
          <>
            <HugeiconsIcon icon={SquaresIntersectIcon} />
            Overlaps
          </>
        }
        title="Remove overlapping annotations"
        help="Drop an annotation when this share of it sits inside a larger one; the bigger survives."
        annotations={annotations}
        onPreview={onPreview}
        onApply={onApply}
        onApplyAll={onApplyAll}
      />
      <CleanupTool
        kind="merge"
        label={
          <>
            <HugeiconsIcon icon={SquaresUniteIcon} />
            Merge
          </>
        }
        title="Merge overlapping annotations"
        help="Combine same-class segmentations into one when this share of the smaller sits inside another."
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
  label: React.ReactNode;
  title: string;
  help: string;
} & Props) {
  const cfg = TOOL_CONFIG[kind];
  const [open, setOpen] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const [t, setT] = useState(cfg.defaultT);

  const param = cfg.param(t);
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

  const valueLabel = cfg.valueLabel(t, param);

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
            min={cfg.min}
            max={cfg.max}
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
            {cfg.countLabel(removed, trimmed)}
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
