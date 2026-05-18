-- =========================================
-- 1️⃣ Enable Extensions
-- =========================================
create extension if not exists "pgcrypto";
create extension if not exists vector;

-- =========================================
-- 2️⃣ Profiles (User Settings + Avoid List)
-- =========================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  skin_type text check (skin_type in ('Oily', 'Dry', 'Combination', 'Sensitive')),
  skin_goals text[] default '{}',
  avoid_list text[] default '{}',
  avatar_url text,
  created_at timestamp default now()
);

alter table public.profiles enable row level security;

create policy "Users manage own profile"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

-- =========================================
-- 3️⃣ Ingredient Dictionary (Knowledge Base)
-- =========================================
create table public.ingredients (
  id serial primary key,
  inci_name text unique not null,
  safety_rating int,
  description text
);

alter table public.ingredients enable row level security;

create policy "Ingredients are viewable by everyone"
on public.ingredients for select
using (true);

-- =========================================
-- 4️⃣ Product Catalog (Global Library)
-- =========================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  product_ingredients text not null,
  pao_months int default 12,
  is_custom boolean not null default false,
  user_id uuid references auth.users(id),
  embedding vector(1536),
  image_url text,
  created_at timestamp default now()
);

-- =========================================
-- 5️⃣ User Shelf (Inventory)
-- =========================================
create table public.user_shelf (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  open_date date,
  created_at timestamp default now()
);

alter table public.user_shelf enable row level security;

create policy "Users manage own shelf"
on public.user_shelf for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =========================================
-- 6️⃣ Skin Logs (Daily Reactions)
-- =========================================
create table public.skin_logs (
  id uuid primary key default gen_random_uuid(),
  shelf_item_id uuid not null references public.user_shelf(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  reaction_status text check (reaction_status in ('OK', 'Irritated', 'Breakout')) not null,
  notes text,
  created_at timestamp default now(),
  unique (shelf_item_id, log_date)
);

grant all on public.skin_logs to postgres, service_role;
grant all on public.skin_logs to authenticated;
grant select on public.skin_logs to anon;

alter table public.skin_logs enable row level security;

create policy "Users manage own skin logs"
on public.skin_logs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =========================================
-- 7️⃣ Auto-create Profile on Signup
-- =========================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Index for fast pgvector similarity search
create index on public.products using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.products enable row level security;

create policy "Products are viewable by everyone"
on public.products for select
using (true);

create policy "Authenticated users can insert products"
on public.products for insert
to authenticated
with check (true);

create policy "Authenticated users can update products"
on public.products for update
to authenticated
using (true);

-- =========================================
-- 8️⃣ Similarity Search Function
-- =========================================
create or replace function match_products(
  query_embedding vector(1536),
  match_count int default 1,
  match_threshold float default 0.5,
  caller_id uuid default null
)
returns table (
  id uuid,
  product_name text,
  product_ingredients text,
  pao_months int,
  is_custom boolean,
  image_url text,
  similarity float
)
language plpgsql volatile
as $$
begin
  set local ivfflat.probes = 100;
  return query
    select
      p.id,
      p.product_name,
      p.product_ingredients,
      p.pao_months,
      p.is_custom,
      p.image_url,
      1 - (p.embedding <=> query_embedding) as similarity
    from products p
    where p.embedding is not null
      and 1 - (p.embedding <=> query_embedding) > match_threshold
      and (not p.is_custom or p.user_id = caller_id)
    order by p.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- =========================================
-- 9️⃣ Storage Policies (Avatars)
-- =========================================
create policy "Avatars are publicly viewable"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
on storage.objects for insert
with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update own avatar"
on storage.objects for update
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
