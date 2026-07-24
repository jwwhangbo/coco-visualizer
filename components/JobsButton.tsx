"use client";

import { Task01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import type { LabelData } from "@/lib/types";

type JobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "unknown";

interface JobView {
  id: string;
  kind: string;
  param: number;
  state: JobState;
  progress: { done: number; total: number } | null;
  result: { removed: number; edited: number; total: number } | null;
  error: string | null;
  timestamp: number;
  finishedOn: number | null;
  sourceCount: number;
  stemCount: number;
}

const POLL_MS = 2000;

const STATE_LABEL: Record<JobState, string> = {
  active: "Running",
  waiting: "Queued",
  delayed: "Delayed",
  completed: "Done",
  failed: "Failed",
  unknown: "Unknown",
};

const STATE_VARIANT: Record<
  JobState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  waiting: "secondary",
  delayed: "secondary",
  completed: "outline",
  failed: "destructive",
  unknown: "outline",
};

async function fetchAnnotations(path: string): Promise<LabelData> {
  const res = await fetch(`/api/annotations?path=${encodeURIComponent(path)}`);
  if (!res.ok)
    throw new Error((await res.json()).error ?? "Failed to load labels");
  return res.json();
}

function relTime(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/**
 * Global jobs center: polls the cleanup queue, shows queued/active/failed jobs
 * with live progress, and refreshes the affected label sources when a job
 * finishes so overlays reflect what's now on disk.
 */
export function JobsButton() {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [open, setOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const labelSets = useAppStore((s) => s.labelSets);
  const addLabelSets = useAppStore((s) => s.addLabelSets);
  const toast = useToast();

  // Terminal jobs we've already reacted to, so we refresh/notify exactly once.
  const seenTerminal = useRef<Set<string>>(new Set());
  // Keep the latest store values without restarting the poll loop.
  const labelSetsRef = useRef(labelSets);
  labelSetsRef.current = labelSets;

  const onJobFinished = useCallback(
    async (job: JobView) => {
      if (job.state === "failed") {
        toast.error(`Cleanup failed: ${job.error ?? "unknown error"}`);
        return;
      }
      const r = job.result;
      toast.success(
        r
          ? `Cleanup done — ${r.removed} removed, ${r.edited} trimmed`
          : "Cleanup done",
      );
      // Re-read every loaded source; cheap locally and avoids threading the
      // job's source paths through the view model.
      try {
        const refreshed = await Promise.all(
          labelSetsRef.current.map(async (ls) => ({
            source: ls.source,
            data: await fetchAnnotations(ls.source.path),
          })),
        );
        if (refreshed.length > 0) addLabelSets(refreshed);
      } catch {
        /* a source may have been removed meanwhile — ignore */
      }
    },
    [addLabelSets, toast],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch("/api/cleanup");
        if (res.ok) {
          const { jobs: next } = (await res.json()) as { jobs: JobView[] };
          if (!cancelled) {
            setUnavailable(false);
            setJobs(next);
            for (const j of next) {
              if (
                (j.state === "completed" || j.state === "failed") &&
                !seenTerminal.current.has(j.id)
              ) {
                seenTerminal.current.add(j.id);
                void onJobFinished(j);
              }
            }
          }
        } else if (!cancelled) {
          setUnavailable(true);
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onJobFinished]);

  const pending = jobs.filter(
    (j) =>
      j.state === "active" || j.state === "waiting" || j.state === "delayed",
  ).length;
  const failed = jobs.filter((j) => j.state === "failed").length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Background jobs"
          aria-label="Background jobs"
        >
          <HugeiconsIcon icon={Task01Icon} strokeWidth={2} />
          Jobs
          {pending > 0 && <Badge variant="default">{pending}</Badge>}
          {pending === 0 && failed > 0 && (
            <Badge variant="destructive">{failed}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-medium">
          Background jobs
        </div>
        <ScrollArea className="max-h-80">
          {unavailable && (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">
              Queue unavailable — is Redis running? (<code>REDIS_URL</code>)
            </p>
          )}
          {!unavailable && jobs.length === 0 && (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">
              No jobs yet.
            </p>
          )}
          <ul>
            {jobs.map((job) => {
              const pct = job.progress?.total
                ? Math.round((job.progress.done / job.progress.total) * 100)
                : 0;
              return (
                <li
                  key={job.id}
                  className="border-b border-border/60 px-3 py-2 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {job.kind === "islands"
                        ? `Remove islands < ${job.param.toLocaleString()} px²`
                        : `Remove overlaps ≥ ${Math.round(job.param * 100)}%`}
                    </span>
                    <Badge variant={STATE_VARIANT[job.state]}>
                      {STATE_LABEL[job.state]}
                    </Badge>
                  </div>

                  {job.state === "active" && job.progress && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={pct} className="flex-1" />
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {job.progress.done}/{job.progress.total}
                      </span>
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {job.stemCount} image(s) · {job.sourceCount} source(s)
                    </span>
                    <span>{relTime(job.finishedOn ?? job.timestamp)}</span>
                  </div>

                  {job.state === "completed" && job.result && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {job.result.removed} removed · {job.result.edited} trimmed
                    </p>
                  )}
                  {job.state === "failed" && job.error && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-destructive">
                      {job.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
