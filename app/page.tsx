"use client";

import { FileBrowser } from "@/components/FileBrowser";
import { SourceScreen } from "@/components/SourceScreen";
import { SourceTabs } from "@/components/SourceTabs";
import { imagesFromEntries } from "@/lib/dataset";
import { stem } from "@/lib/stem";
import { useAppStore } from "@/lib/store";
import { ToastProvider, useToast } from "@/lib/toast";
import type { FsEntry, FsListing, LabelData, LabelSource } from "@/lib/types";
import { Navigator } from "@/providers/navigation";

async function fetchAnnotations(path: string): Promise<LabelData> {
  const res = await fetch(`/api/annotations?path=${encodeURIComponent(path)}`);
  if (!res.ok)
    throw new Error((await res.json()).error ?? "Failed to load labels");
  return res.json();
}

async function fetchListing(path: string): Promise<FsListing> {
  const res = await fetch(`/api/fs?path=${encodeURIComponent(path)}`);
  if (!res.ok)
    throw new Error((await res.json()).error ?? "Failed to list directory");
  return res.json();
}

const fileSource = (entry: FsEntry): LabelSource => ({
  path: entry.path,
  name: entry.name,
  kind: "file",
});

const hasLabels = (data: LabelData): boolean =>
  Object.values(data.annotationsByStem).some((anns) => anns.length > 0);

function Workspace() {
  const toast = useToast();
  const sources = useAppStore((s) => s.sources);
  const activeSourceId = useAppStore((s) => s.activeSourceId);
  const addImageSource = useAppStore((s) => s.addImageSource);
  const closeSource = useAppStore((s) => s.closeSource);
  const setActiveSource = useAppStore((s) => s.setActiveSource);
  const addLabelSets = useAppStore((s) => s.addLabelSets);

  // ---- load actions (async fetch + toast; state changes go through the store) ----
  const loadImage = (entry: FsEntry, listing: FsListing) => {
    toast.run(`Loading ${entry.name}…`, async () => {
      addImageSource({
        id: entry.path,
        name: entry.name,
        kind: "image",
        images: imagesFromEntries([entry]),
      });
      const sibling = listing.entries.find(
        (e) => e.type === "json" && stem(e.name) === stem(entry.name),
      );
      if (sibling) {
        const data = await fetchAnnotations(sibling.path);
        if (hasLabels(data))
          addLabelSets([{ source: fileSource(sibling), data }]);
      }
    });
  };

  const loadFolder = (entry: FsEntry) => {
    toast.run(`Loading ${entry.name}…`, async () => {
      const [listing, data] = await Promise.all([
        fetchListing(entry.path),
        fetchAnnotations(entry.path).catch(() => null),
      ]);
      const folderImages = imagesFromEntries(listing.entries);
      if (folderImages.length > 0) {
        addImageSource({
          id: entry.path,
          name: entry.name,
          kind: "folder",
          images: folderImages,
        });
      }
      if (data && hasLabels(data)) {
        addLabelSets([
          {
            source: { path: entry.path, name: entry.name, kind: "folder" },
            data,
          },
        ]);
      }
    });
  };

  const loadLabel = (entry: FsEntry) => {
    toast.run(`Loading ${entry.name}…`, async () => {
      const data = await fetchAnnotations(entry.path);
      addLabelSets([{ source: fileSource(entry), data }]);
    });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <FileBrowser
        onLoadImage={loadImage}
        onLoadFolder={loadFolder}
        onLoadLabel={loadLabel}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {sources.length > 0 && (
          <SourceTabs
            sources={sources}
            activeSourceId={activeSourceId}
            onActivate={setActiveSource}
            onClose={closeSource}
          />
        )}
        {sources.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1">
            <Navigator
              activeId={activeSourceId ?? ""}
              onNavigate={setActiveSource}
            >
              {sources.map((s) => (
                <SourceScreen key={s.id} id={s.id} source={s} />
              ))}
            </Navigator>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <div>
        <p className="mb-1 text-foreground">No data source open</p>
        <p>
          Use the file browser on the left — double-click a folder or image, or
          right-click for load options.
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ToastProvider>
      <Workspace />
    </ToastProvider>
  );
}
