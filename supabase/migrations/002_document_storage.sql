-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Adds background ingestion status to documents and a private Storage bucket for PDFs.

alter table documents
  add column if not exists status text not null default 'ready'
    check (status in ('uploading', 'parsing', 'embedding', 'ready', 'failed')),
  add column if not exists error text,
  add column if not exists storage_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists processed_chunks int not null default 0;

-- Private bucket; files live at {user_id}/{document_row_id}.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- Users can only touch files inside their own {user_id}/ folder.
create policy "own pdfs select" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own pdfs insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own pdfs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
