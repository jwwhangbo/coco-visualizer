/** Basename without extension — the join key for matching images to labels. Pure (no Node). */
export function stem(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}
