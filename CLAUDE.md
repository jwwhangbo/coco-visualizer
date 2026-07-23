# COCO Overlay Visualizer

A local web UI for overlaying COCO-structured segmentation/bbox annotations on images.
Next.js (App Router) + TypeScript + Tailwind v4 + Radix UI + Zustand, formatted/linted with Biome.

## Conventions

- **Package manager: pnpm.** Use `pnpm` for all installs and scripts (never npm/yarn).
- **Verification standard: typecheck + build only.** No runtime/browser verification is expected.
  Run these to verify a change:
  - `pnpm typecheck` — `tsc --noEmit`
  - `pnpm build` — `next build`
  - `pnpm lint` — `biome check` (optional but preferred)
- UI leans on Radix primitives styled with Tailwind classes.

## Architecture

- `app/api/fs` — list a directory's entries (defaults to `~/`).
- `app/api/annotations` — read + validate COCO JSON (file or folder); auto-detects
  full-COCO (`images[]`+`annotations[]`) vs per-image JSON. Returns normalized labels.
- `app/api/image` — stream a local image file.
- `lib/coco.ts` — server-side COCO normalizer (polygon + bbox; RLE is skipped).
- `lib/store.ts` — Zustand global store: dataset, loaded label sources, view/page/
  selection/visibility/geometry state, plus load/clear actions. `app/page.tsx` handles
  async fetch + toasts and pushes results through the store; components stay presentational.
- `lib/dataset.ts`, `lib/types.ts`, `lib/stem.ts`, `lib/colors.ts` — client-safe helpers/types.
- `components/*` — FileBrowser (Radix ContextMenu), ImageViewer (pan/zoom), GridView,
  OverlaySvg, AnnotationPanel (per-label toggles), Toolbar, and `lib/toast.tsx` (Radix Toast).

Images and labels are matched by basename (stem). Full-COCO matches via `images[].file_name`.

## Annotation editing (delete / save / undo)

Per-image, client-side editing lives in `components/SourceScreen.tsx`:
- **Multi-select** (`selectedIds: Set<string>`) shown by highlight — click / ctrl-click a
  shape on the image, or click / ctrl-click / rubber-band drag (via `dragselect`) in the
  `AnnotationPanel` list. Selection is for choosing what to delete; the per-row visibility
  Switch is independent.
- **Delete** removes annotations from the current view only (a `deleted` set + `undoStack`):
  the panel 🗑 button, the overlay right-click "Delete annotation", or the `Delete`/`Backspace`
  key. **Undo** (Toolbar button or Ctrl-Z) pops the stack.
- **Save** (`POST /api/annotations`, `applyDeletions` in `lib/coco.ts`) rewrites the original
  file(s) **in place**, splicing out deleted annotations and preserving all other fields;
  then re-fetches the affected sources. Confirmed via `components/ConfirmDialog.tsx`.
- The stack is **per-current-image**: leaving to another image or grid prompts if unsaved,
  then clears it. Keyboard shortcuts are gated to the active tab.

## Deferred / not yet implemented

- Editing annotation geometry/category (only deletion is supported).
- RLE-encoded segmentation.
