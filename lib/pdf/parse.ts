/**
 * Parses CSV (RFC 4180: quoted fields, "" escapes, commas and newlines inside quotes).
 * Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

/** Lines near the top or bottom of a page that are checked for header/footer repeats. */
const EDGE_LINES = 3;

/**
 * Drops running headers and footers: lines among the first/last few of a page that
 * recur on at least half the pages. Digits are ignored when comparing, so
 * "Page 3" and "Page 4" count as the same footer. Needs 3+ pages to judge.
 */
export function removeRepeatedLines(pages: string[]): { pages: string[]; removed: number } {
  if (pages.length < 3) return { pages, removed: 0 };
  const norm = (line: string) => line.trim().toLowerCase().replace(/\d+/g, "#");
  const edgeIndexes = (lines: string[]) => {
    const filled = lines.flatMap((l, i) => (l.trim() ? [i] : []));
    // On short pages the top and bottom windows would overlap the body; cap each at a third.
    const n = Math.min(EDGE_LINES, Math.floor(filled.length / 3));
    return new Set(n ? [...filled.slice(0, n), ...filled.slice(-n)] : []);
  };

  const pageCount = new Map<string, number>();
  for (const page of pages) {
    const lines = page.split("\n");
    const seen = new Set([...edgeIndexes(lines)].map((i) => norm(lines[i])));
    seen.forEach((k) => pageCount.set(k, (pageCount.get(k) ?? 0) + 1));
  }
  const minPages = Math.ceil(pages.length / 2);
  const repeated = new Set([...pageCount].filter(([, n]) => n >= minPages).map(([k]) => k));

  let removed = 0;
  const cleaned = pages.map((page) => {
    const lines = page.split("\n");
    const edges = edgeIndexes(lines);
    return lines
      .filter((line, i) => {
        const drop = edges.has(i) && repeated.has(norm(line));
        if (drop) removed++;
        return !drop;
      })
      .join("\n");
  });
  return { pages: cleaned, removed };
}

/**
 * Cleans extracted PDF text before chunking.
 * - Collapses excessive whitespace
 * - Normalizes repeated line breaks
 * - Removes broken single-character line fragments
 * - Preserves headings
 */
export function cleanPDFText(text: string): string {
  return text
    // Normalize Windows line endings
    .replace(/\r\n/g, "\n")
    // Remove lines that are just a single character (common PDF artifact)
    .replace(/^\s*\S\s*$/gm, "")
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\n{3,}/g, "\n\n")
    // Collapse runs of spaces/tabs into a single space (preserve newlines)
    .replace(/[ \t]+/g, " ")
    // Remove leading/trailing whitespace from each line
    .replace(/^ +| +$/gm, "")
    .trim();
}
