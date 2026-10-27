/** "1 chunk", "4 chunks". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}
