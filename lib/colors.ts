/**
 * Deterministic category id -> color so a category keeps the same color across
 * sessions and views. Uses the golden-angle to spread hues evenly.
 */
export function colorForCategory(id: number): string {
  const hue = Math.abs(id * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 85% 55%)`;
}
