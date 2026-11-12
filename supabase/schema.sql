create table if not exists public.family_fighter_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default 'Jogador'
    check (char_length(btrim(nickname)) between 1 and 32),
  selected_fighter text not null default 'juraci'
    check (selected_fighter in ('juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi')),
  matches_played integer not null default 0 check (matches_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  updated_at timestamptz not null default now(),
  check (wins + losses + draws = matches_played)
);

create table if not exists public.family_fighter_match_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid not null,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  selected_fighter text not null check (selected_fighter in ('juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi')),
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

-- Migração: projetos criados com a versão antiga só aceitavam Juraci e Carlos.
alter table public.family_fighter_profiles
  drop constraint if exists family_fighter_profiles_selected_fighter_check;
alter table public.family_fighter_profiles
  add constraint family_fighter_profiles_selected_fighter_check
  check (selected_fighter in ('juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi'));
alter table public.family_fighter_match_events
  drop constraint if exists family_fighter_match_events_selected_fighter_check;
alter table public.family_fighter_match_events
  add constraint family_fighter_match_events_selected_fighter_check
  check (selected_fighter in ('juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi'));
alter table public.family_fighter_profiles enable row level security;
alter table public.family_fighter_match_events enable row level security;

revoke all on public.family_fighter_profiles from anon, authenticated;
grant select on public.family_fighter_profiles to authenticated;
revoke all on public.family_fighter_match_events from anon, authenticated;

drop policy if exists "Players can read their own profile"
  on public.family_fighter_profiles;
create policy "Players can read their own profile"
  on public.family_fighter_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.create_family_fighter_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_nickname text;
begin
  profile_nickname := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Jogador'
  );

  insert into public.family_fighter_profiles (user_id, nickname)
  values (new.id, left(profile_nickname, 32))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- O Supabase concede EXECUTE a anon/authenticated por padrão; "from public" não basta.
revoke all on function public.create_family_fighter_profile() from public, anon, authenticated;

create index if not exists family_fighter_match_events_user_created_idx
  on public.family_fighter_match_events (user_id, created_at desc);

drop trigger if exists create_family_fighter_profile
  on auth.users;
create trigger create_family_fighter_profile
  after insert on auth.users
  for each row execute function public.create_family_fighter_profile();

create or replace function public.record_family_fighter_match(
  p_match_id uuid,
  p_outcome text,
  p_selected_fighter text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_match_id is null then
    raise exception 'Match ID is required';
  end if;

  if p_outcome is null or p_outcome not in ('win', 'loss', 'draw') then
    raise exception 'Invalid match outcome';
  end if;

  if p_selected_fighter is null or p_selected_fighter not in ('juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi') then
    raise exception 'Invalid fighter';
  end if;

  -- Limite anti-abuso: no máximo 300 partidas registradas por conta a cada 24 h.
  if (
    select count(*)
    from public.family_fighter_match_events e
    where e.user_id = current_user_id
      and e.created_at > now() - interval '24 hours'
  ) >= 300 then
    raise exception 'Daily match limit reached';
  end if;

  insert into public.family_fighter_match_events (
    user_id,
    match_id,
    outcome,
    selected_fighter
  )
  values (
    current_user_id,
    p_match_id,
    p_outcome,
    p_selected_fighter
  )
  on conflict (user_id, match_id) do nothing;

  if not found then
    return;
  end if;

  insert into public.family_fighter_profiles (
    user_id,
    nickname,
    selected_fighter,
    matches_played,
    wins,
    losses,
    draws
  )
  values (
    current_user_id,
    'Jogador',
    p_selected_fighter,
    1,
    case when p_outcome = 'win' then 1 else 0 end,
    case when p_outcome = 'loss' then 1 else 0 end,
    case when p_outcome = 'draw' then 1 else 0 end
  )
  on conflict (user_id) do update
  set selected_fighter = excluded.selected_fighter,
      matches_played = public.family_fighter_profiles.matches_played + 1,
      wins = public.family_fighter_profiles.wins + excluded.wins,
      losses = public.family_fighter_profiles.losses + excluded.losses,
      draws = public.family_fighter_profiles.draws + excluded.draws,
      updated_at = now();
end;
$$;

revoke all on function public.record_family_fighter_match(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_family_fighter_match(uuid, text, text) to authenticated;

-- Permite ao jogador trocar o próprio apelido (só o dele, validado no servidor).
create or replace function public.set_family_fighter_nickname(p_nickname text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean text := btrim(coalesce(p_nickname, ''));
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 32 then
    raise exception 'Nickname must have 1 to 32 characters';
  end if;
  if clean ~ '[[:cntrl:]<>]' then
    raise exception 'Nickname has invalid characters';
  end if;

  update public.family_fighter_profiles
  set nickname = clean, updated_at = now()
  where user_id = current_user_id;
end;
$$;

revoke all on function public.set_family_fighter_nickname(text) from public, anon, authenticated;
grant execute on function public.set_family_fighter_nickname(text) to authenticated;
