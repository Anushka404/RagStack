// Self-check for the pure RAG pipeline logic. Run: node --experimental-strip-types scripts/check-rag.mts
import assert from "node:assert/strict";
import { collapseRepeats, looksScanned, parseCsv, removeRepeatedLines } from "../lib/pdf/parse.ts";
import { extractCitations, parseClaims } from "../lib/rag/claims.ts";
import { firstHitRank, summarize } from "../lib/rag/evaluate.ts";
import { understandQuery } from "../lib/rag/query-understanding.ts";
import { reciprocalRankFusion } from "../lib/rag/fusion.ts";
import { assembleContext } from "../lib/rag/context.ts";
import type { RetrievedDoc } from "../types/rag.ts";

// Header/footer removal: repeated edge lines go (digits ignored), body text stays.
const pages = [1, 2, 3, 4].map((n) => `Annual Report 2026\n\nBody text number ${n} about waves.\n\nConfidential - Page ${n}`);
const cleaned = removeRepeatedLines(pages);
assert.equal(cleaned.removed, 8);
assert.ok(cleaned.pages.every((p, i) => p.includes(`Body text number ${i + 1}`) && !p.includes("Confidential") && !p.includes("Annual Report")));
assert.equal(removeRepeatedLines(pages.slice(0, 2)).removed, 0, "too few pages to judge");
// OCR of a ruled notebook (real output from the PPS notes): the printed boxes come out
// differently each page, but they are one header; a code page's closing "}" must survive.
const body = (topic: string) => [1, 2, 3, 4, 5, 6].map((n) => `${topic} note line ${n}`).join("\n");
const ocrPages = [
  `DATE [ ] [ ] [ ]\nOperators and expressions\n${body("types")}\nRed Wings\nPAGE`,
  `DATE □ □ □ □\nArithmetic operators\n${body("arith")}\nprintf(a);\n}\nRed Wings PAGE [ ] [ ]`,
  `DATE [ ] [ ] [ ] [ ] [ ]\nRelational operators\n${body("rel")}\nRed Wings PAGE □ □ □`,
  `DATE\nLogical operators\n${body("logic")}\nreturn b;\n}\nRed Wings PAGE [ ]`,
];
const ocrCleaned = removeRepeatedLines(ocrPages);
assert.ok(ocrCleaned.pages.every((p) => !/DATE|Red Wings/.test(p)), "notebook header/footer removed");
assert.ok(ocrCleaned.pages[1].includes("}") && ocrCleaned.pages[3].includes("}"), "closing braces kept");
assert.ok(ocrCleaned.pages[0].includes("Operators and expressions"), "body kept");

// Scan detection (real text layers from the Cloud Computing notes): a tiled watermark is a scan.
assert.equal(looksScanned(""), true);
assert.equal(looksScanned("Multi Atoms Notes"), true);
assert.equal(looksScanned("Multi AtomsMulti AtomsMulti Atoms\nMulti AtomsMulti AtomsMulti Atoms\nMulti AtomsMulti AtomsMulti Atoms"), true);
assert.equal(looksScanned("Cloud enabling technologies are the foundational tools and systems that allow deployment"), false);

// OCR loop on page 46 of the Cloud Computing notes: the dashes collapse, real text and short repeats stay.
assert.equal(collapseRepeats(`<soap : Envelope ${"- ".repeat(900)}`), "<soap : Envelope - - - ");
assert.equal(collapseRepeats("R1 R2\n0 0 0\n1 1 1\n4 -> 0100"), "R1 R2\n0 0 0\n1 1 1\n4 -> 0100");
assert.equal(collapseRepeats("x".repeat(9)), "x".repeat(9), "nine repeats is below the threshold");

// Query understanding: only years and collections that exist count.
const available = { years: [2026, 2027], collections: ["Tsunami archive", "General"] };
assert.deepEqual(understandQuery("Compare 2027 and 2026 wave heights", available), { years: [2026, 2027], compare: true });
assert.deepEqual(understandQuery("What happened in 2026 and 1999?", available), { years: [2026], compare: false });
assert.equal(understandQuery("events in the tsunami archive", available).collection, "Tsunami archive");
assert.equal(understandQuery("general question", available).collection, "General");
assert.deepEqual(understandQuery("peak wave height", available), { years: [], compare: false });

// Reciprocal rank fusion: a chunk found by both searches beats one found by one.
const doc = (id: string, text = `text ${id}`): RetrievedDoc => ({
  id, content: text, score: 0, signals: {},
  metadata: { documentId: "d", fileName: "f.pdf", pageNumber: Number(id.slice(1)) || 1, chunkIndex: Number(id.slice(1)) || 0,
    totalChunks: 0, source: "pdf_upload", uploadedAt: "", textPreview: "", userId: "", collection: "General", year: null, tags: [] },
});
const fused = reciprocalRankFusion([
  [doc("a1"), doc("b2")].map((d, i) => ({ ...d, signals: { denseRank: i + 1 } })),
  [doc("b2"), doc("c3")].map((d, i) => ({ ...d, signals: { keywordRank: i + 1 } })),
]);
assert.deepEqual(fused.map((d) => d.id), ["b2", "a1", "c3"]);
assert.deepEqual(fused[0].signals, { denseRank: 2, keywordRank: 1, rrf: 1 / 62 + 1 / 61 });

// Context builder: near-duplicates and over-budget chunks are dropped, the rest numbered by page.
const long = "wave ".repeat(30);
const ctx = assembleContext([doc("p3", "alpha beta gamma delta"), doc("p1", "alpha beta gamma delta"), doc("p2", long), doc("p4", long + " extra unique words here")], 200);
assert.deepEqual(ctx.used.map((d) => d.id), ["p2", "p3"], "kept chunks are reordered by page");
assert.deepEqual(ctx.dropped.map((d) => [d.doc.id, d.reason]), [["p1", "near-duplicate"], ["p4", "over context budget"]]);
assert.ok(ctx.context.startsWith("[1] f.pdf · page 2\nwave"));

// CSV: quoted commas, escaped quotes, CRLF and blank lines.
assert.deepEqual(parseCsv('year,event,note\r\n2026,PT-0412,"wave, 3.2 m"\n\n2027,PT-0219,"said ""hi"""\n'), [
  ["year", "event", "note"], ["2026", "PT-0412", "wave, 3.2 m"], ["2027", "PT-0219", 'said "hi"'],
]);

// Verification: JSON inside fences/prose is read, bad passage numbers dropped, junk rejected.
assert.deepEqual(
  parseClaims('Sure!\n```json\n{"claims":[{"claim":"Peak was 3.2 m","supported":true,"sources":[1,9]},{"claim":"CEO is X","supported":false,"sources":[]}]}\n```', 3),
  [{ claim: "Peak was 3.2 m", supported: true, sources: [1] }, { claim: "CEO is X", supported: false, sources: [] }]
);
assert.equal(parseClaims("I cannot verify this.", 3), null);
assert.deepEqual(extractCitations("Peak 3.2 m [2]. Lead time 11 min [1][2]. See [7].", 3), [2, 1]);

// Benchmark metrics: rank of first chunk from the expected document/page; hit rate and MRR.
const meta = (documentId: string, pageNumber: number) => ({ metadata: { ...doc("x").metadata, documentId, pageNumber } });
const ranked = [meta("other", 1), meta("doc", 3), meta("doc", 1)];
assert.equal(firstHitRank(ranked, { id: "1", question: "q", expected_document_id: "doc", expected_pages: [1] }), 3);
assert.equal(firstHitRank(ranked, { id: "2", question: "q", expected_document_id: "doc", expected_pages: [] }), 2);
assert.equal(firstHitRank(ranked, { id: "3", question: "q", expected_document_id: "missing", expected_pages: [] }), null);
assert.deepEqual(summarize([1, 2, null, 4], [100, 200, 300, 400]), { hitRate: 0.75, mrr: (1 + 0.5 + 0.25) / 4, avgMs: 250 });

console.log("check-rag: all assertions passed");
