create table public.resume_versions (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (length(title) between 1 and 80),
  draft jsonb not null check (octet_length(draft::text) <= 250000),
  updated_at timestamptz not null default now(),
  primary key (user_id, title)
);

alter table public.resume_versions enable row level security;
revoke all on public.resume_versions from anon, authenticated;
grant select, insert, update, delete on public.resume_versions to authenticated;
create policy "Manage own resume versions" on public.resume_versions
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer text not null unique
);

create table public.application_grants (
  source text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  remaining integer not null,
  allowance integer not null check (allowance in (1, 15)),
  expires_at timestamptz,
  subscription_id text,
  revoked boolean not null default false,
  check (remaining between 0 and allowance)
);

create index application_grants_owner on public.application_grants(user_id, expires_at);

create table public.application_uses (
  id uuid primary key default gen_random_uuid(),
  grant_source text not null references public.application_grants(source) on delete cascade,
  refunded boolean not null default false
);

alter table public.billing_customers enable row level security;
alter table public.application_grants enable row level security;
alter table public.application_uses enable row level security;
revoke all on public.billing_customers, public.application_grants, public.application_uses from anon, authenticated;
grant select, insert, update, delete on public.billing_customers, public.application_grants, public.application_uses to service_role;

create function public.reserve_application_credit(account_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  selected_source text;
  reservation uuid;
begin
  select source into selected_source
  from public.application_grants
  where user_id = account_id and remaining > 0 and not revoked
    and (expires_at is null or expires_at > now())
  order by expires_at asc nulls last, source
  limit 1 for update;

  if selected_source is null then
    return null;
  end if;

  update public.application_grants set remaining = remaining - 1 where source = selected_source;
  insert into public.application_uses (grant_source) values (selected_source) returning id into reservation;
  return reservation;
end;
$$;

create function public.refund_application_credit(reservation_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  selected_source text;
begin
  update public.application_uses set refunded = true
  where id = reservation_id and not refunded
  returning grant_source into selected_source;

  update public.application_grants set remaining = remaining + 1 where source = selected_source;
end;
$$;

revoke execute on function public.reserve_application_credit(uuid), public.refund_application_credit(uuid) from public, anon, authenticated;
grant execute on function public.reserve_application_credit(uuid), public.refund_application_credit(uuid) to service_role;
