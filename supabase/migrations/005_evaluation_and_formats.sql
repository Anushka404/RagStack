-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Retrieval benchmark questions, and the extra upload formats (TXT, Markdown, CSV, DOCX).

create table if not exists eval_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  question text not null,
  -- Pinecone documentId of the document that should answer it, plus the pages (empty = any page).
  expected_document_id text not null,
  expected_pages int[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists eval_cases_user_idx on eval_cases (user_id, created_at);

alter table eval_cases enable row level security;
drop policy if exists "own eval_cases" on eval_cases;
create policy "own eval_cases" on eval_cases for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'documents';
