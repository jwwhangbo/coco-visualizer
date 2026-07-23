# COCO Overlay Visualizer

A local web UI for overlaying COCO-structured segmentation/bbox annotations on images.
Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Zustand, formatted/linted with Biome.

## Conventions

- **Package manager: pnpm.** Use `pnpm` for all installs and scripts (never npm/yarn).
- **Verification standard: typecheck + build only.** No runtime/browser verification is expected.
  Run these to verify a change:
  - `pnpm typecheck` — `tsc --noEmit`
  - `pnpm build` — `next build`
  - `pnpm lint` — `biome check` (optional but preferred)
- UI uses **shadcn/ui** components (`components/ui/*`, radix-mira style, hugeicons icons)
  styled with semantic theme tokens (`bg-background`, `text-muted-foreground`, `border-border`,
  `destructive`, …). Theming is class-based via **next-themes** (`providers/theme-provider.tsx`,
  wired in `app/layout.tsx`, dark default) with a sun/moon toggle in the Toolbar. Add new
  primitives with `pnpm dlx shadcn@latest add <name>`. Avoid hardcoded palette colors.

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
- `components/*` — FileBrowser (shadcn ContextMenu), ImageViewer (pan/zoom), GridView,
  OverlaySvg, AnnotationPanel (per-label toggles), Toolbar, ModeToggle, and `lib/toast.tsx`
  (Sonner-backed `useToast()` wrapper: `.run/.info/.success/.error/.dismiss`).

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
- **Save** (`POST /api/annotations`, `applyChanges` in `lib/coco.ts`) rewrites the original
  file(s) **in place**, splicing out deleted annotations and rewriting trimmed geometry
  (recomputing `bbox`/`area`), preserving all other fields; then re-fetches the affected
  sources. Confirmed via `components/ConfirmDialog.tsx`.
- The edit stack is **per-current-image**: leaving to another image or grid prompts if
  unsaved, then clears it. Keyboard shortcuts are gated to the active tab. The undo stack
  (`undoStack: EditOp[]`) uniformly covers deletions and geometry trims; edits are held as
  `deleted: Set` + `polyOverride: Map<id, polygons>`.

### Cleanup tools (`components/ImageActionBar.tsx`, `lib/geometry.ts`)

An action bar above the image viewer (single view) offers two per-image cleanup tools, each a
popover with a slider that **live-previews** the result on the overlay:
- **Island remover** — drops polygon rings below an absolute pixel-area threshold (log-ish
  slider); an annotation whose rings all fall below is deleted.
- **Overlap remover** — drops an annotation when `intersection / area(smaller) ≥ threshold`
  (containment, area-descending so the **bigger survives**). Uses `polygon-clipping` for exact
  intersection area with a bbox quick-reject.

Each has an **"All images" toggle** (default off): off = commit to the current image
(undoable); on = run across every image in the source and **write straight to disk** (confirmed,
not undoable). Applying to the current image previews/commits via `applyResult`/`applyCleanup`.

## Deferred / not yet implemented

- Editing annotation category, or adding/redrawing geometry (only deletion + island trimming).
- RLE-encoded segmentation.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
