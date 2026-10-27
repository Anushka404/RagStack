-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Knowledge base: grouping metadata on documents, stored chunk text (for the tree
-- and keyword search), chat titles and the retrieval trace on assistant messages.

alter table documents
  add column if not exists collection text not null default 'General',
  add column if not exists year int,
  add column if not exists tags text[] not null default '{}',
  add column if not exists stats jsonb not null default '{}';

alter table threads add column if not exists title text;
alter table messages add column if not exists trace jsonb;

create table if not exists chunks (
  id text primary key, -- same as the Pinecone vector id: "<document_id>#<chunk_index>"
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  document_id uuid not null references documents on delete cascade,
  chunk_index int not null,
  page_number int,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chunks_document_idx on chunks (document_id, chunk_index);

alter table chunks enable row level security;
drop policy if exists "own chunks" on chunks;
create policy "own chunks" on chunks for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
