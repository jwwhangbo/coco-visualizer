"use client";

import React, {
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type Params = Record<string, unknown>;

type NavContextValue = {
  activeId: string;
  params: Params;
  navigate: (id: string, params?: Params) => void;
};

const NavContext = createContext<NavContextValue | null>(null);

// Any element carrying a string `id` prop qualifies as a screen.
type ScreenElement = ReactElement<{ id: string }>;

function isScreen(node: React.ReactNode): node is ScreenElement {
  return (
    React.isValidElement(node) &&
    typeof (node.props as { id?: unknown }).id === "string"
  );
}

export function Navigator({
  activeId: controlledId,
  onNavigate,
  initialId,
  children,
}: {
  /** Controlled: pass your own current id. Omit for uncontrolled (internal state). */
  activeId?: string;
  /** Called on navigate(id, params). Pass a useState setter directly, or any handler. */
  onNavigate?: (id: string, params?: Params) => void;
  /** Uncontrolled only: seeds the internal active id. */
  initialId?: string;
  children: React.ReactNode;
}) {
  const screens = React.Children.toArray(children).filter(isScreen);

  const isControlled = controlledId !== undefined;

  const [internalId, setInternalId] = useState(
    initialId ?? screens[0]?.props.id,
  );
  const [params, setParams] = useState<Params>({});

  const activeId = isControlled ? controlledId : internalId;

  // Track which screens have been visited. A screen isn't mounted until it's
  // first activated; after that it stays mounted (hidden) to preserve state.
  const mountedIds = useRef<Set<string>>(new Set()).current;
  if (activeId) mountedIds.add(activeId);

  const navigate = useCallback(
    (id: string, next: Params = {}) => {
      if (!isControlled) setInternalId(id); // uncontrolled: update our own state
      setParams(next); // params tracked internally in both modes
      onNavigate?.(id, next); // notify parent (controlled state lives here)
    },
    [isControlled, onNavigate],
  );

  const value = useMemo<NavContextValue>(
    () => ({ activeId, params, navigate }),
    [activeId, params, navigate],
  );

  // Render only visited screens; hide the inactive ones so their state,
  // scroll, and inputs persist across navigation. `hidden` = `display: none`.
  return (
    <NavContext.Provider value={value}>
      {screens
        .filter((screen) => mountedIds.has(screen.props.id))
        .map((screen) => (
          <div key={screen.props.id} hidden={screen.props.id !== activeId}>
            {screen}
          </div>
        ))}
    </NavContext.Provider>
  );
}

export function useNavigate() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNavigate must be used within <Navigator>");
  return ctx.navigate;
}

export function useRoute() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useRoute must be used within <Navigator>");
  return { id: ctx.activeId, params: ctx.params };
}
