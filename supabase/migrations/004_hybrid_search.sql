-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Keyword (full-text) index over stored chunks, used next to Pinecone's semantic
-- search for hybrid retrieval.

alter table chunks
  add column if not exists fts tsvector generated always as (to_tsvector('english', content)) stored;

create index if not exists chunks_fts_idx on chunks using gin (fts);

-- Ranked keyword matches within the caller's own chunks (security invoker, so RLS applies).
-- Query terms are OR-ed: plainto_tsquery would AND them, and a natural question
-- rarely has every word in one chunk. ts_rank_cd rewards dense, close matches.
create or replace function search_chunks_keyword(
  q text,
  match_count int default 20,
  filter_collection text default null,
  filter_years int[] default null,
  filter_document_ids text[] default null
)
returns table (
  id text, chunk_index int, page_number int, content text, rank real,
  document_id text, file_name text, collection text, year int, tags text[]
)
language sql stable security invoker set search_path = '' as $$
  with query as (
    select replace(plainto_tsquery('english', q)::text, '&', '|')::tsquery as tsq
  )
  select c.id, c.chunk_index, c.page_number, c.content, ts_rank_cd(c.fts, query.tsq) as rank,
         d.document_id, d.file_name, d.collection, d.year, d.tags
  from public.chunks c
  join public.documents d on d.id = c.document_id
  cross join query
  where c.fts @@ query.tsq
    and (filter_collection is null or d.collection = filter_collection)
    and (filter_years is null or d.year = any(filter_years))
    and (filter_document_ids is null or d.document_id = any(filter_document_ids))
  order by rank desc
  limit match_count;
$$;
