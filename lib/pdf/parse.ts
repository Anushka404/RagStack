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

/**
 * Shortens runaway repeats in OCR output ("- - - - …" ×1000 becomes "- - - "): a model can
 * loop on a dashed line until it hits its token cap, and the text before the loop is still good.
 * A 1–4 character unit repeated 10+ times is kept 3 times; shorter runs (truth tables) stay.
 */
export function collapseRepeats(text: string): string {
  return text.replace(/(.{1,4}?)\1{9,}/g, "$1$1$1");
}

/** Distinct words below which a PDF page's text layer is treated as a scan's watermark or title. */
const MIN_DISTINCT_WORDS = 8;

/**
 * True when a page's text layer is too thin to be its content, so the page should be
 * OCR-ed. Counts distinct words rather than characters: scanned notes often carry a
 * tiled watermark ("Multi Atoms" ×12 is 135 characters but 2 words).
 */
export function looksScanned(text: string): boolean {
  return new Set(text.toLowerCase().match(/[a-z]{2,}/g) ?? []).size < MIN_DISTINCT_WORDS;
}

/** Lines near the top or bottom of a page that are checked for header/footer repeats. */
const EDGE_LINES = 3;
/** Lines with fewer letters than this (a lone "}" or "1.") are never treated as headers. */
const MIN_HEADER_LETTERS = 3;

/**
 * Drops running headers and footers: lines among the first/last few of a page that
 * recur on at least half the pages. Only letters are compared, so "Page 3" matches
 * "Page 4", and OCR's varying "DATE [ ] [ ]" / "DATE □ □ □" count as one header.
 * Needs 3+ pages to judge.
 */
export function removeRepeatedLines(pages: string[]): { pages: string[]; removed: number } {
  if (pages.length < 3) return { pages, removed: 0 };
  const norm = (line: string) => line.toLowerCase().replace(/[^a-z]+/g, "");
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
  const repeated = new Set(
    [...pageCount].filter(([k, n]) => n >= minPages && k.length >= MIN_HEADER_LETTERS).map(([k]) => k)
  );

  // OCR sometimes splits a footer ("Red Wings" / "PAGE") that it usually writes as one
  // line, so a piece of a repeated line counts too.
  const isRepeated = (key: string) =>
    key.length >= MIN_HEADER_LETTERS && [...repeated].some((r) => r === key || r.includes(key));

  let removed = 0;
  const cleaned = pages.map((page) => {
    const lines = page.split("\n");
    const edges = edgeIndexes(lines);
    return lines
      .filter((line, i) => {
        const drop = edges.has(i) && isRepeated(norm(line));
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
