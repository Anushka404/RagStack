-- Run once in Supabase for a NEW project: SQL Editor -> New query -> paste -> Run.
-- (An existing project instead runs the files in supabase/migrations/ it hasn't run yet.)
-- Row Level Security limits every row to the logged-in user who owns it.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  document_id text not null,
  file_name text not null,
  chunk_count int not null default 0,
  status text not null default 'ready'
    check (status in ('uploading', 'parsing', 'embedding', 'ready', 'failed')),
  error text,
  storage_path text,
  file_size_bytes bigint,
  processed_chunks int not null default 0,
  -- Grouping metadata: what retrieval can be filtered by.
  collection text not null default 'General',
  year int,
  tags text[] not null default '{}',
  stats jsonb not null default '{}', -- ingestion facts: pages, characters, removed lines, model
  ocr_pages jsonb, -- OCR text per scanned page, cached across processing requests
  created_at timestamptz not null default now()
);

create table if not exists threads (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  document_id uuid references documents on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null references threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources text, -- JSON string of SourceRef[]
  trace jsonb,  -- retrieval trace and claim check of an assistant answer
  created_at timestamptz not null default now()
);

create table if not exists thread_entities (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null references threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  entity text not null,
  created_at timestamptz not null default now()
);

-- Chunk text next to its Pinecone vector (same id), for the knowledge-base tree and keyword search.
create table if not exists chunks (
  id text primary key, -- "<document_id>#<chunk_index>"
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  document_id uuid not null references documents on delete cascade,
  chunk_index int not null,
  page_number int,
  content text not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);

-- Retrieval benchmark questions.
create table if not exists eval_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  question text not null,
  expected_document_id text not null, -- Pinecone documentId
  expected_pages int[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists threads_user_updated_idx on threads (user_id, updated_at desc);
create index if not exists messages_thread_created_idx on messages (thread_id, created_at);
create index if not exists thread_entities_thread_idx on thread_entities (thread_id, created_at desc);
create index if not exists documents_user_idx on documents (user_id, created_at desc);
create index if not exists chunks_document_idx on chunks (document_id, chunk_index);
create index if not exists chunks_fts_idx on chunks using gin (fts);
create index if not exists eval_cases_user_idx on eval_cases (user_id, created_at);

alter table documents enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table thread_entities enable row level security;
alter table chunks enable row level security;
alter table eval_cases enable row level security;

create policy "own documents" on documents for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own threads" on threads for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own messages" on messages for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own thread_entities" on thread_entities for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own chunks" on chunks for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own eval_cases" on eval_cases for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Keyword search for hybrid retrieval: ranked full-text matches within the caller's
-- own chunks (security invoker, so RLS applies). Terms are OR-ed so partial matches rank.
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

-- Private Storage bucket for uploads ({user_id}/{document_row_id}.{ext})
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array[
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

create policy "own pdfs select" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own pdfs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own pdfs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
