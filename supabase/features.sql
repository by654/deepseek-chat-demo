-- =====================================================================
-- chat-demo：分享协作 / 附件云同步 / 公告 / 反馈 / 审计 / 管理员看板
-- 目标数据库：云端 Supabase（PostgreSQL 15+）
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴整段 → Run
-- 幂等性：可重复执行，不会因为对象已存在而失败
-- 前置：已执行 supabase/user_admin.sql（提供 public.is_admin()）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 扩展
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------
-- 1. 会话分享：只读快照 + 可选访问密码 + 有效期
--    password_hash 由客户端算好 SHA-256（hex）后传入，服务端不接触明文
-- ---------------------------------------------------------------------
create table if not exists public.chat_shares (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  title text not null default '',
  data jsonb not null,
  password_hash text,
  expires_at timestamptz,
  revoked boolean not null default false,
  views bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists chat_shares_owner_idx
  on public.chat_shares (owner_id, created_at desc);

alter table public.chat_shares enable row level security;

drop policy if exists chat_shares_select_own on public.chat_shares;
create policy chat_shares_select_own on public.chat_shares
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists chat_shares_delete_own on public.chat_shares;
create policy chat_shares_delete_own on public.chat_shares
  for delete to authenticated
  using (owner_id = auth.uid());

grant select, delete on public.chat_shares to authenticated;
grant all on public.chat_shares to service_role;

-- 创建分享：登录用户只能以自己的身份创建；带审计
create or replace function public.create_chat_share(
  p_id text,
  p_session_id text,
  p_title text,
  p_data jsonb,
  p_password_hash text default null,
  p_expires_at timestamptz default null
)
returns public.chat_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.chat_shares;
  v_name text;
begin
  if v_uid is null then
    raise exception '未登录，无法创建分享' using errcode = '28000';
  end if;
  if coalesce(btrim(p_id), '') = '' then
    raise exception '分享标识不能为空' using errcode = '22023';
  end if;
  if p_data is null then
    raise exception '分享内容不能为空' using errcode = '22023';
  end if;

  insert into public.chat_shares (
    id, owner_id, session_id, title, data, password_hash, expires_at
  )
  values (
    p_id, v_uid, p_session_id, coalesce(p_title, ''), p_data,
    nullif(btrim(coalesce(p_password_hash, '')), ''), p_expires_at
  )
  returning * into v_row;

  select username into v_name from public.profiles where id = v_uid;
  insert into public.audit_logs (actor_id, actor_name, action, target, detail)
  values (v_uid, coalesce(v_name, ''), 'share.create', p_id, jsonb_build_object('session_id', p_session_id));

  return v_row;
end
$$;

-- 匿名 / 登录用户读取分享：校验撤销、有效期、密码；读取时计数 +1
create or replace function public.get_chat_share(
  p_id text,
  p_password_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.chat_shares;
begin
  select * into v_row
  from public.chat_shares
  where id = p_id;

  if v_row.id is null then
    raise exception '分享不存在或已被删除' using errcode = 'P0002';
  end if;
  if v_row.revoked then
    raise exception '分享已取消' using errcode = 'P0002';
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() then
    raise exception '分享已过期' using errcode = 'P0002';
  end if;
  if coalesce(v_row.password_hash, '') <> ''
     and coalesce(p_password_hash, '') <> v_row.password_hash then
    raise exception '访问密码不正确' using errcode = '42501';
  end if;

  update public.chat_shares
    set views = views + 1
  where id = p_id;

  return jsonb_build_object(
    'id', v_row.id,
    'title', v_row.title,
    'data', v_row.data,
    'created_at', v_row.created_at,
    'expires_at', v_row.expires_at,
    'has_password', coalesce(v_row.password_hash, '') <> ''
  );
end
$$;

-- 我的分享列表
create or replace function public.list_my_shares()
returns table (
  id text,
  session_id text,
  title text,
  views bigint,
  has_password boolean,
  expires_at timestamptz,
  revoked boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id, s.session_id, s.title, s.views,
    coalesce(s.password_hash, '') <> '' as has_password,
    s.expires_at, s.revoked, s.created_at
  from public.chat_shares s
  where s.owner_id = auth.uid()
  order by s.created_at desc;
$$;

-- 撤销自己的分享
create or replace function public.revoke_chat_share(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception '未登录' using errcode = '28000';
  end if;
  update public.chat_shares
    set revoked = true
  where id = p_id and owner_id = v_uid;
  if not found then
    raise exception '分享不存在或无权操作' using errcode = '42501';
  end if;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.audit_logs (actor_id, actor_name, action, target)
  values (v_uid, coalesce(v_name, ''), 'share.revoke', p_id);
end
$$;

grant execute on function public.create_chat_share(text, text, text, jsonb, text, timestamptz) to authenticated;
grant execute on function public.get_chat_share(text, text) to anon, authenticated;
grant execute on function public.list_my_shares() to authenticated;
grant execute on function public.revoke_chat_share(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. 附件原件云同步：私有存储桶 + 按用户目录隔离
--    路径约定：<auth.uid()>/<本地附件 id>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 67108864)
on conflict (id) do update
  set public = false,
      file_size_limit = 67108864;

drop policy if exists chat_attachments_select_own on storage.objects;
create policy chat_attachments_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists chat_attachments_insert_own on storage.objects;
create policy chat_attachments_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists chat_attachments_update_own on storage.objects;
create policy chat_attachments_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists chat_attachments_delete_own on storage.objects;
create policy chat_attachments_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- 3. 站点公告
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',
  level text not null default 'info',
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists announcements_select_active on public.announcements;
create policy announcements_select_active on public.announcements
  for select to authenticated, anon
  using (
    active
    and (expires_at is null or expires_at > now())
  );

drop policy if exists announcements_admin_all on public.announcements;
create policy announcements_admin_all on public.announcements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.announcements to anon, authenticated;
grant all on public.announcements to service_role;

-- 用户端：当前有效公告（最多 5 条）
create or replace function public.list_active_announcements()
returns table (
  id uuid,
  title text,
  body text,
  level text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.title, a.body, a.level, a.created_at, a.expires_at
  from public.announcements a
  where a.active
    and (a.expires_at is null or a.expires_at > now())
  order by a.created_at desc
  limit 5;
$$;

-- 管理员：全部公告
create or replace function public.admin_list_announcements()
returns setof public.announcements
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '仅管理员可访问' using errcode = '42501';
  end if;
  return query select * from public.announcements order by created_at desc;
end
$$;

-- 管理员：新建 / 更新公告（p_id 为空表示新建）
create or replace function public.admin_save_announcement(
  p_id uuid,
  p_title text,
  p_body text,
  p_level text default 'info',
  p_active boolean default true,
  p_expires_at timestamptz default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.announcements;
  v_name text;
begin
  if not public.is_admin(v_uid) then
    raise exception '仅管理员可操作' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception '公告标题不能为空' using errcode = '22023';
  end if;
  if p_level not in ('info', 'warning', 'success') then
    raise exception '公告级别只能是 info / warning / success' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.announcements (title, body, level, active, expires_at)
    values (btrim(p_title), coalesce(p_body, ''), p_level, coalesce(p_active, true), p_expires_at)
    returning * into v_row;
  else
    update public.announcements
      set title = btrim(p_title),
          body = coalesce(p_body, ''),
          level = p_level,
          active = coalesce(p_active, true),
          expires_at = p_expires_at,
          updated_at = now()
    where id = p_id
    returning * into v_row;
    if v_row.id is null then
      raise exception '公告不存在' using errcode = 'P0002';
    end if;
  end if;

  select username into v_name from public.profiles where id = v_uid;
  insert into public.audit_logs (actor_id, actor_name, action, target, detail)
  values (v_uid, coalesce(v_name, ''), 'announcement.save', v_row.id::text,
          jsonb_build_object('title', v_row.title, 'active', v_row.active));

  return v_row;
end
$$;

-- 管理员：删除公告
create or replace function public.admin_delete_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if not public.is_admin(v_uid) then
    raise exception '仅管理员可操作' using errcode = '42501';
  end if;
  delete from public.announcements where id = p_id;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.audit_logs (actor_id, actor_name, action, target)
  values (v_uid, coalesce(v_name, ''), 'announcement.delete', p_id::text);
end
$$;

grant execute on function public.list_active_announcements() to anon, authenticated;
grant execute on function public.admin_list_announcements() to authenticated;
grant execute on function public.admin_save_announcement(uuid, text, text, text, boolean, timestamptz) to authenticated;
grant execute on function public.admin_delete_announcement(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. 用户反馈
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  username text not null default '',
  content text not null,
  contact text not null default '',
  page text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_status_check'
      and conrelid = 'public.feedback'::regclass
  ) then
    alter table public.feedback
      add constraint feedback_status_check check (status in ('open', 'resolved'));
  end if;
end
$$;

alter table public.feedback enable row level security;

drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.feedback to authenticated;
grant all on public.feedback to service_role;

create or replace function public.submit_feedback(
  p_content text,
  p_contact text default '',
  p_page text default ''
)
returns public.feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.feedback;
  v_name text;
begin
  if coalesce(btrim(p_content), '') = '' then
    raise exception '反馈内容不能为空' using errcode = '22023';
  end if;
  if char_length(p_content) > 4000 then
    raise exception '反馈内容最多 4000 字' using errcode = '22023';
  end if;
  if v_uid is not null then
    select username into v_name from public.profiles where id = v_uid;
  end if;
  insert into public.feedback (user_id, username, content, contact, page)
  values (
    v_uid,
    coalesce(v_name, ''),
    btrim(p_content),
    left(coalesce(p_contact, ''), 120),
    left(coalesce(p_page, ''), 300)
  )
  returning * into v_row;
  return v_row;
end
$$;

create or replace function public.admin_list_feedback(p_status text default null)
returns setof public.feedback
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '仅管理员可访问' using errcode = '42501';
  end if;
  return query
    select * from public.feedback
    where p_status is null or p_status = '' or status = p_status
    order by created_at desc
    limit 300;
end
$$;

create or replace function public.admin_set_feedback_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if not public.is_admin(v_uid) then
    raise exception '仅管理员可操作' using errcode = '42501';
  end if;
  if p_status not in ('open', 'resolved') then
    raise exception '状态只能是 open 或 resolved' using errcode = '22023';
  end if;
  update public.feedback
    set status = p_status, updated_at = now()
  where id = p_id;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.audit_logs (actor_id, actor_name, action, target, detail)
  values (v_uid, coalesce(v_name, ''), 'feedback.status', p_id::text, jsonb_build_object('status', p_status));
end
$$;

create or replace function public.admin_delete_feedback(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if not public.is_admin(v_uid) then
    raise exception '仅管理员可操作' using errcode = '42501';
  end if;
  delete from public.feedback where id = p_id;
  select username into v_name from public.profiles where id = v_uid;
  insert into public.audit_logs (actor_id, actor_name, action, target)
  values (v_uid, coalesce(v_name, ''), 'feedback.delete', p_id::text);
end
$$;

grant execute on function public.submit_feedback(text, text, text) to authenticated;
grant execute on function public.admin_list_feedback(text) to authenticated;
grant execute on function public.admin_set_feedback_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_feedback(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. 审计日志（仅管理员可读；写入只发生在 security definer 函数内）
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid,
  actor_name text not null default '',
  action text not null,
  target text not null default '',
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated
  using (public.is_admin());

grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

create or replace function public.admin_list_audit(p_limit int default 200)
returns setof public.audit_logs
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '仅管理员可访问' using errcode = '42501';
  end if;
  return query
    select * from public.audit_logs
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500));
end
$$;

grant execute on function public.admin_list_audit(int) to authenticated;

-- ---------------------------------------------------------------------
-- 6. 管理员看板
-- ---------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_users bigint;
  v_sessions bigint;
  v_shares bigint;
  v_feedback_open bigint;
  v_announcements bigint;
  v_storage bigint;
  v_new_users bigint;
  v_active_users bigint;
begin
  if not public.is_admin(auth.uid()) then
    raise exception '仅管理员可访问' using errcode = '42501';
  end if;

  select count(*) into v_users from public.profiles;
  select count(*) into v_sessions from public.chat_sessions;
  select count(*) into v_shares from public.chat_shares where not revoked;
  select count(*) into v_feedback_open from public.feedback where status = 'open';
  select count(*) into v_announcements from public.announcements
    where active and (expires_at is null or expires_at > now());
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into v_storage
    from storage.objects o where o.bucket_id = 'chat-attachments';
  select count(*) into v_new_users from public.profiles
    where created_at > now() - interval '7 days';
  select count(distinct user_id) into v_active_users from public.chat_sessions
    where updated_at_ms > (extract(epoch from now()) * 1000 - 7 * 24 * 3600 * 1000);

  return jsonb_build_object(
    'users', v_users,
    'sessions', v_sessions,
    'shares', v_shares,
    'feedbackOpen', v_feedback_open,
    'announcements', v_announcements,
    'storageBytes', v_storage,
    'newUsers7d', v_new_users,
    'activeUsers7d', v_active_users
  );
end
$$;

grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 7. 语义检索（预留）：pgvector 表 + 相似度 RPC
--    向量维度 384，对应常见的 all-MiniLM-L6-v2 / bge-small-zh 输出
-- ---------------------------------------------------------------------
create table if not exists public.chat_embeddings (
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id text not null,
  session_id text not null,
  content text not null,
  embedding vector(384) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.chat_embeddings enable row level security;

drop policy if exists chat_embeddings_own on public.chat_embeddings;
create policy chat_embeddings_own on public.chat_embeddings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant all on public.chat_embeddings to authenticated;
grant all on public.chat_embeddings to service_role;

create or replace function public.match_chat_embeddings(
  query_embedding vector(384),
  match_count int default 20
)
returns table (
  session_id text,
  message_id text,
  content text,
  similarity double precision
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.session_id,
    e.message_id,
    e.content,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.chat_embeddings e
  where e.user_id = auth.uid()
  order by e.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 20), 100));
$$;

grant execute on function public.match_chat_embeddings(vector, int) to authenticated;

-- ---------------------------------------------------------------------
-- 8. 刷新 PostgREST schema 缓存
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

-- =====================================================================
-- 执行后可用校验（可单独执行）
--   select public.admin_stats();
--   select * from public.list_active_announcements();
--   select * from storage.buckets where id = 'chat-attachments';
-- =====================================================================
