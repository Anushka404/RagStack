-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- OCR of scanned PDFs runs over several requests; each page's text is kept here so
-- no page is read twice: {"pages": {"1": "..."}, "attempts": {"3": 1}, "model": "..."}.

alter table documents add column if not exists ocr_pages jsonb;
