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
