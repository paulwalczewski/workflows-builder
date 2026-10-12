/** React Aria selections are a Set of keys or "all"; normalise to strings. */
export function selectionToStrings(
  keys: "all" | Set<string | number> | Iterable<string | number>,
  all: string[],
): string[] {
  if (keys === "all") return [...all];
  const chosen = new Set([...keys].map(String));
  // Keep the catalogue's order so the stored JSON is stable.
  return all.filter((key) => chosen.has(key));
}
