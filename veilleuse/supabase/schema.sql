-- Veilleuse : base de synchronisation entre les téléphones des parents.
-- À coller une fois dans Supabase → SQL Editor → Run.
--
-- Une ligne = une saisie. Le code famille, envoyé par l'app dans l'en-tête « x-family »,
-- limite chaque téléphone aux lignes de sa famille (Row Level Security).

create table if not exists public.veilleuse_entries (
  id uuid primary key,
  family text not null check (length(family) >= 12),
  at bigint not null,
  tags text[] not null,
  ml integer,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  -- Repère serveur : l'app demande « ce qui a changé depuis ».
  synced_at timestamptz not null default clock_timestamp()
);

create index if not exists veilleuse_entries_family_synced on public.veilleuse_entries (family, synced_at);

-- Code famille transmis par l'app.
create or replace function public.veilleuse_family() returns text
language sql stable as $$
  select coalesce(current_setting('request.headers', true)::json ->> 'x-family', '')
$$;

alter table public.veilleuse_entries enable row level security;

drop policy if exists "famille : lecture" on public.veilleuse_entries;
create policy "famille : lecture" on public.veilleuse_entries
  for select to anon using (family = public.veilleuse_family());

drop policy if exists "famille : ajout" on public.veilleuse_entries;
create policy "famille : ajout" on public.veilleuse_entries
  for insert to anon with check (family = public.veilleuse_family());

drop policy if exists "famille : modification" on public.veilleuse_entries;
create policy "famille : modification" on public.veilleuse_entries
  for update to anon
  using (family = public.veilleuse_family())
  with check (family = public.veilleuse_family());

grant select, insert, update on public.veilleuse_entries to anon;

-- La modification la plus récente gagne, et chaque écriture reçoit un nouveau repère serveur.
create or replace function public.veilleuse_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end
$$;

drop trigger if exists veilleuse_touch on public.veilleuse_entries;
create trigger veilleuse_touch
  before insert or update on public.veilleuse_entries
  for each row execute function public.veilleuse_touch();
