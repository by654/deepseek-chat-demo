-- =====================================================================
-- chat-demo：用户自助资料管理 + 管理员管理面板
-- 目标数据库：云端 Supabase（PostgreSQL 15+，需在 SQL Editor 中以项目属主身份执行）
-- 执行方式：整段复制到 Supabase 控制台 → SQL Editor → Run
-- 幂等性：脚本可重复执行，不会因为对象已存在而失败
-- 管理员判定：profiles.username = 'by654'
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. public.profiles：账号档案表（1 个 auth 用户对应 1 行）
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  nickname text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is '用户档案：username 取自邮箱 @ 前缀，nickname 允许用户自助修改，status 由管理员切换';
comment on column public.profiles.status is 'active = 正常；disabled = 已禁用';

-- status 取值约束（列已存在时补建，重复执行不会报错）
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_status_check check (status in ('active', 'disabled'));
  end if;
end
$$;

-- 用户名唯一（忽略大小写），用于管理员列表按用户名定位账号
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- ---------------------------------------------------------------------
-- 2. 注册后自动建档：auth.users AFTER INSERT 触发器
--    username 取邮箱 @ 前部分，nickname 默认同名
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(split_part(coalesce(new.email, ''), '@', 1));
  if v_username = '' then
    v_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  begin
    insert into public.profiles (id, username, nickname, status)
    values (new.id, v_username, v_username, 'active')
    on conflict (id) do update
      set username = excluded.username,
          updated_at = now();
  exception
    when unique_violation then
      -- 极端情况下（同前缀的不同邮箱）加后缀避免注册流程被唯一索引阻断
      insert into public.profiles (id, username, nickname, status)
      values (new.id, v_username || '_' || substr(new.id::text, 1, 6), v_username, 'active')
      on conflict (id) do nothing;
  end;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. 历史用户补档：从 auth.users 回填 profiles（幂等）
-- ---------------------------------------------------------------------
insert into public.profiles (id, username, nickname, status)
select
  u.id,
  lower(split_part(coalesce(u.email, ''), '@', 1)),
  lower(split_part(coalesce(u.email, ''), '@', 1)),
  'active'
from auth.users u
where coalesce(u.email, '') <> ''
  and split_part(coalesce(u.email, ''), '@', 1) <> ''
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. is_admin()：管理员判定（security definer，固定 search_path）
-- ---------------------------------------------------------------------
drop function if exists public.is_admin();

create or replace function public.is_admin(p_user_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = coalesce(p_user_id, auth.uid())
      and lower(p.username) = 'by654'
      and p.status = 'active'
  );
$$;

comment on function public.is_admin(uuid) is '管理员判定：profiles.username = by654 且账号为 active；不传参数时按当前登录用户判定';

-- 把 by654 落成管理员档案（缺档案时补建，已有则保持 username 不变）
insert into public.profiles (id, username, nickname, status)
select
  u.id,
  'by654',
  coalesce(nullif(lower(split_part(coalesce(u.email, ''), '@', 1)), ''), 'by654'),
  'active'
from auth.users u
where lower(split_part(coalesce(u.email, ''), '@', 1)) = 'by654'
on conflict (id) do update
  set username = 'by654',
      status = 'active',
      updated_at = now();

-- ---------------------------------------------------------------------
-- 5. 更新守卫：普通用户只能改 nickname（username / status / created_at 一律还原）
-- ---------------------------------------------------------------------
create or replace function public.profiles_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    new.username := old.username;
    new.status := old.status;
    new.created_at := old.created_at;
    new.id := old.id;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.profiles_guard_update();

-- ---------------------------------------------------------------------
-- 6. 行级安全（RLS）
--    普通用户：只能读取/更新自己那行（列级权限只允许 nickname）
--    管理员：可读取全部（写操作走下面的 RPC，避免误改）
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (nickname) on public.profiles to authenticated;
grant all on public.profiles to service_role;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. 用户自助 RPC：set_nickname(p_nickname text)
-- ---------------------------------------------------------------------
create or replace function public.set_nickname(p_nickname text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_row public.profiles;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '未登录，无法修改昵称' using errcode = '28000';
  end if;
  if char_length(v_nickname) = 0 then
    raise exception '昵称不能为空' using errcode = '22023';
  end if;
  if char_length(v_nickname) > 24 then
    raise exception '昵称最多 24 个字符' using errcode = '22023';
  end if;

  -- 历史账号可能还没有档案，这里顺手补建，避免「表里没行 → 改不了昵称」
  insert into public.profiles (id, username, nickname, status)
  select
    u.id,
    lower(split_part(coalesce(u.email, ''), '@', 1)),
    v_nickname,
    'active'
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;

  update public.profiles
    set nickname = v_nickname,
        updated_at = now()
  where id = v_uid
  returning * into v_row;

  if v_row.id is null then
    raise exception '未找到当前用户的档案' using errcode = 'P0002';
  end if;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------
-- 8. 管理员 RPC（security definer，内部统一校验 is_admin）
-- ---------------------------------------------------------------------

-- 8.1 用户列表：邮箱 / 用户名 / 昵称 / 状态 / 注册时间 / 最后登录 / 会话数
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  username text,
  nickname text,
  status text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  session_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '仅管理员可访问' using errcode = '42501';
  end if;

  if to_regclass('public.chat_sessions') is null then
    return query
    select
      p.id,
      u.email::text,
      p.username,
      p.nickname,
      p.status,
      p.created_at,
      u.last_sign_in_at,
      0::bigint as session_count
    from public.profiles p
    left join auth.users u on u.id = p.id
    order by p.created_at asc;
  else
    return query
    select
      p.id,
      u.email::text,
      p.username,
      p.nickname,
      p.status,
      p.created_at,
      u.last_sign_in_at,
      coalesce(c.cnt, 0)::bigint as session_count
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join (
      select cs.user_id, count(*) as cnt
      from public.chat_sessions cs
      group by cs.user_id
    ) c on c.user_id = p.id
    order by p.created_at asc;
  end if;
end
$$;

-- 8.2 启用 / 禁用
create or replace function public.admin_set_status(p_user_id uuid, p_status text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '仅管理员可操作' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception '状态只能是 active 或 disabled' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception '不能修改自己的账号状态' using errcode = '22023';
  end if;

  update public.profiles
    set status = p_status,
        updated_at = now()
  where id = p_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception '用户不存在' using errcode = 'P0002';
  end if;

  return v_row;
end
$$;

-- 8.3 删除用户：会话 + 档案 + 尽量删除 auth 用户
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '仅管理员可操作' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception '不能删除自己的账号' using errcode = '22023';
  end if;

  if to_regclass('public.chat_sessions') is not null then
    delete from public.chat_sessions where user_id = p_user_id;
  end if;

  delete from public.profiles where id = p_user_id;

  -- auth.users 可能被其他业务表引用，删除失败时不影响已完成的会话/档案清理
  begin
    delete from auth.users where id = p_user_id;
  exception
    when others then
      raise warning '删除 auth 用户失败（会话与档案已清理）：%', sqlerrm;
  end;
end
$$;

-- ---------------------------------------------------------------------
-- 9. 执行权限
-- ---------------------------------------------------------------------
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.set_nickname(text) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. 让 PostgREST 立即刷新 schema 缓存（否则新表/RPC 可能 404 一段时间）
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

-- =====================================================================
-- 校验用查询（可单独执行，确认结构与数据）
--   select * from public.profiles order by created_at;
--   select public.is_admin((select id from public.profiles where username = 'by654'));
-- =====================================================================
