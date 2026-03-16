create table if not exists public.family_spaces (
  family_slug text primary key,
  family_secret text not null,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.family_spaces enable row level security;

revoke all on public.family_spaces from anon, authenticated, public;

create or replace function public.create_family_space(initial_state jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_slug text;
  generated_secret text;
begin
  generated_slug := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  generated_secret := md5(random()::text || clock_timestamp()::text || generated_slug);

  insert into public.family_spaces (family_slug, family_secret, state)
  values (generated_slug, generated_secret, coalesce(initial_state, '{}'::jsonb));

  return jsonb_build_object(
    'family_slug', generated_slug,
    'family_secret', generated_secret,
    'state', coalesce(initial_state, '{}'::jsonb),
    'updated_at', timezone('utc', now())
  );
end;
$$;

create or replace function public.get_family_space(p_family_slug text, p_family_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'family_slug', family_slug,
    'state', state,
    'updated_at', updated_at
  )
  into result
  from public.family_spaces
  where family_slug = p_family_slug
    and family_secret = p_family_secret
  limit 1;

  if result is null then
    raise exception 'invalid family credentials';
  end if;

  return result;
end;
$$;

create or replace function public.save_family_space(p_family_slug text, p_family_secret text, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  update public.family_spaces
  set state = coalesce(p_state, '{}'::jsonb),
      updated_at = timezone('utc', now())
  where family_slug = p_family_slug
    and family_secret = p_family_secret;

  if not found then
    raise exception 'invalid family credentials';
  end if;

  select jsonb_build_object(
    'family_slug', family_slug,
    'state', state,
    'updated_at', updated_at
  )
  into result
  from public.family_spaces
  where family_slug = p_family_slug;

  return result;
end;
$$;

grant execute on function public.create_family_space(jsonb) to anon, authenticated;
grant execute on function public.get_family_space(text, text) to anon, authenticated;
grant execute on function public.save_family_space(text, text, jsonb) to anon, authenticated;
