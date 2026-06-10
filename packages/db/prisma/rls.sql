-- Contractor RLS — BASELINE (user/participant-scoped, no tenant). Applied by apply-rls.ts after migrate.
-- Keys on per-request GUCs set by withUser(): current_setting('app.actor_user') = Clerk user id,
-- current_setting('app.actor') = role (contractor | applicant | platform_admin | system).
-- No ';' inside any statement and no $$ bodies (apply-rls splits on ';'). missing_ok=true → NULL when unset
-- (NULL comparisons are false = deny). Each module session hardens its own policy bodies per the manifest.
-- Convention: admin/system catch-all (FOR ALL) + a self/participant policy. drop-if-exists makes it idempotent.

-- contractor_identity: self read/update; status writes gated at app layer (contractor-identity module)
alter table contractor_identity enable row level security
;
alter table contractor_identity force row level security
;
drop policy if exists ci_admin on contractor_identity
;
create policy ci_admin on contractor_identity for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists ci_self_read on contractor_identity
;
create policy ci_self_read on contractor_identity for select using (clerk_user_id = current_setting('app.actor_user', true))
;
drop policy if exists ci_self_write on contractor_identity
;
create policy ci_self_write on contractor_identity for insert with check (clerk_user_id = current_setting('app.actor_user', true))
;
drop policy if exists ci_self_update on contractor_identity
;
create policy ci_self_update on contractor_identity for update using (clerk_user_id = current_setting('app.actor_user', true)) with check (clerk_user_id = current_setting('app.actor_user', true))
;

-- application: applicant reads own; admin reads/writes all
alter table application enable row level security
;
alter table application force row level security
;
drop policy if exists app_admin on application
;
create policy app_admin on application for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists app_self_read on application
;
create policy app_self_read on application for select using (clerk_user_id = current_setting('app.actor_user', true))
;
drop policy if exists app_self_insert on application
;
create policy app_self_insert on application for insert with check (clerk_user_id = current_setting('app.actor_user', true))
;

-- invite: admin-managed; redemption read by code happens via system/admin path
alter table invite enable row level security
;
alter table invite force row level security
;
drop policy if exists inv_admin on invite
;
create policy inv_admin on invite for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;

-- contractor_profile: self read/write; public-safe-subset reads served by the api (system actor)
alter table contractor_profile enable row level security
;
alter table contractor_profile force row level security
;
drop policy if exists cp_admin on contractor_profile
;
create policy cp_admin on contractor_profile for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists cp_self_read on contractor_profile
;
create policy cp_self_read on contractor_profile for select using (clerk_user_id = current_setting('app.actor_user', true))
;
drop policy if exists cp_self_insert on contractor_profile
;
create policy cp_self_insert on contractor_profile for insert with check (clerk_user_id = current_setting('app.actor_user', true))
;
drop policy if exists cp_self_update on contractor_profile
;
create policy cp_self_update on contractor_profile for update using (clerk_user_id = current_setting('app.actor_user', true)) with check (clerk_user_id = current_setting('app.actor_user', true))
;

-- skill_category: public/session read; admin write
alter table skill_category enable row level security
;
alter table skill_category force row level security
;
drop policy if exists sc_admin on skill_category
;
create policy sc_admin on skill_category for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists sc_read on skill_category
;
create policy sc_read on skill_category for select using (true)
;

-- onboarding_doc: self only
alter table onboarding_doc enable row level security
;
alter table onboarding_doc force row level security
;
drop policy if exists od_admin on onboarding_doc
;
create policy od_admin on onboarding_doc for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists od_self on onboarding_doc
;
create policy od_self on onboarding_doc for all using (clerk_user_id = current_setting('app.actor_user', true)) with check (clerk_user_id = current_setting('app.actor_user', true))
;

-- post: author writes own; reads by author + (followers/public handled at the read layer). Baseline: author + admin.
alter table post enable row level security
;
alter table post force row level security
;
drop policy if exists post_admin on post
;
create policy post_admin on post for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists post_author on post
;
create policy post_author on post for all using (author_user_id = current_setting('app.actor_user', true)) with check (author_user_id = current_setting('app.actor_user', true))
;
drop policy if exists post_read on post
;
create policy post_read on post for select using (current_setting('app.actor', true) = 'contractor')
;

-- post_media: tied to a post (baseline: contractor read, system/admin write via post author at app layer)
alter table post_media enable row level security
;
alter table post_media force row level security
;
drop policy if exists pm_admin on post_media
;
create policy pm_admin on post_media for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists pm_read on post_media
;
create policy pm_read on post_media for select using (current_setting('app.actor', true) = 'contractor')
;
drop policy if exists pm_author on post_media
;
create policy pm_author on post_media for all using (post_id in (select id from post where author_user_id = current_setting('app.actor_user', true))) with check (post_id in (select id from post where author_user_id = current_setting('app.actor_user', true)))
;

-- follow: follower owns the edge; followee + contractors may read
alter table follow enable row level security
;
alter table follow force row level security
;
drop policy if exists fol_admin on follow
;
create policy fol_admin on follow for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists fol_read on follow
;
create policy fol_read on follow for select using (current_setting('app.actor', true) = 'contractor')
;
drop policy if exists fol_self on follow
;
create policy fol_self on follow for all using (follower_user_id = current_setting('app.actor_user', true)) with check (follower_user_id = current_setting('app.actor_user', true))
;

-- reaction: one per (user, post); owner writes; contractors read
alter table reaction enable row level security
;
alter table reaction force row level security
;
drop policy if exists re_admin on reaction
;
create policy re_admin on reaction for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists re_read on reaction
;
create policy re_read on reaction for select using (current_setting('app.actor', true) = 'contractor')
;
drop policy if exists re_self on reaction
;
create policy re_self on reaction for all using (user_id = current_setting('app.actor_user', true)) with check (user_id = current_setting('app.actor_user', true))
;

-- comment: author writes own; contractors read
alter table comment enable row level security
;
alter table comment force row level security
;
drop policy if exists co_admin on comment
;
create policy co_admin on comment for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists co_read on comment
;
create policy co_read on comment for select using (current_setting('app.actor', true) = 'contractor')
;
drop policy if exists co_self on comment
;
create policy co_self on comment for all using (user_id = current_setting('app.actor_user', true)) with check (user_id = current_setting('app.actor_user', true))
;

-- achievement: definitions readable by session; admin/system write
alter table achievement enable row level security
;
alter table achievement force row level security
;
drop policy if exists ach_admin on achievement
;
create policy ach_admin on achievement for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists ach_read on achievement
;
create policy ach_read on achievement for select using (true)
;

-- achievement_award: user reads own; system writes
alter table achievement_award enable row level security
;
alter table achievement_award force row level security
;
drop policy if exists aw_admin on achievement_award
;
create policy aw_admin on achievement_award for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists aw_read on achievement_award
;
create policy aw_read on achievement_award for select using (user_id = current_setting('app.actor_user', true) or current_setting('app.actor', true) = 'contractor')
;

-- contractor_stats: user reads own; contractors read (for profile display); system writes
alter table contractor_stats enable row level security
;
alter table contractor_stats force row level security
;
drop policy if exists cs_admin on contractor_stats
;
create policy cs_admin on contractor_stats for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists cs_read on contractor_stats
;
create policy cs_read on contractor_stats for select using (current_setting('app.actor', true) = 'contractor')
;

-- dm_thread: the two participants only
alter table dm_thread enable row level security
;
alter table dm_thread force row level security
;
drop policy if exists dt_admin on dm_thread
;
create policy dt_admin on dm_thread for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists dt_party on dm_thread
;
create policy dt_party on dm_thread for all using (current_setting('app.actor_user', true) in (user_a_user_id, user_b_user_id)) with check (current_setting('app.actor_user', true) in (user_a_user_id, user_b_user_id))
;

-- dm_message: thread participants only
alter table dm_message enable row level security
;
alter table dm_message force row level security
;
drop policy if exists dm_admin on dm_message
;
create policy dm_admin on dm_message for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists dm_party on dm_message
;
create policy dm_party on dm_message for all using (thread_id in (select id from dm_thread where current_setting('app.actor_user', true) in (user_a_user_id, user_b_user_id))) with check (thread_id in (select id from dm_thread where current_setting('app.actor_user', true) in (user_a_user_id, user_b_user_id)))
;

-- notification: recipient reads own; system writes
alter table notification enable row level security
;
alter table notification force row level security
;
drop policy if exists no_admin on notification
;
create policy no_admin on notification for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists no_self_read on notification
;
create policy no_self_read on notification for select using (user_id = current_setting('app.actor_user', true))
;
drop policy if exists no_self_update on notification
;
create policy no_self_update on notification for update using (user_id = current_setting('app.actor_user', true)) with check (user_id = current_setting('app.actor_user', true))
;

-- app_event: append-only; system writes; admin reads
alter table app_event enable row level security
;
alter table app_event force row level security
;
drop policy if exists ae_admin on app_event
;
create policy ae_admin on app_event for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;

-- feature_flag: global flags admin-only; per-user overrides readable by that user
alter table feature_flag enable row level security
;
alter table feature_flag force row level security
;
drop policy if exists ff_admin on feature_flag
;
create policy ff_admin on feature_flag for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists ff_self_read on feature_flag
;
create policy ff_self_read on feature_flag for select using (user_id is null or user_id = current_setting('app.actor_user', true))
;
