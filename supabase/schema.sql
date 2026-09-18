-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Row Level Security limits every row to the logged-in user who owns it.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  document_id text not null,
  file_name text not null,
  chunk_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists threads (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  document_id uuid references documents on delete set null,
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
  created_at timestamptz not null default now()
);

create table if not exists thread_entities (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null references threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  entity text not null,
  created_at timestamptz not null default now()
);

create index if not exists threads_user_updated_idx on threads (user_id, updated_at desc);
create index if not exists messages_thread_created_idx on messages (thread_id, created_at);
create index if not exists thread_entities_thread_idx on thread_entities (thread_id, created_at desc);
create index if not exists documents_user_idx on documents (user_id, created_at desc);

alter table documents enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table thread_entities enable row level security;

create policy "own documents" on documents for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own threads" on threads for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own messages" on messages for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own thread_entities" on thread_entities for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
