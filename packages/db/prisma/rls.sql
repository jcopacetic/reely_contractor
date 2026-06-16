-- Contractor RLS — BASELINE (user/participant-scoped, no tenant). Applied by apply-rls.ts after migrate.
-- Keys on per-request GUCs set by withUser(): current_setting('app.actor_user') = Clerk user id,
-- current_setting('app.actor') = role (contractor | applicant | platform_admin | system).
-- No ';' inside any statement and no $$ bodies (apply-rls splits on ';'). missing_ok=true → NULL when unset
-- (NULL comparisons are false = deny). Each module session hardens its own policy bodies per the manifest.
-- Convention: admin/system catch-all (FOR ALL) + a self/participant policy. drop-if-exists makes it idempotent.

-- contractor_identity: self read/update; status writes gated at app layer (contractor-identity module)
alter table contractor_identity enable row level security
;
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
;
drop policy if exists inv_admin on invite
;
create policy inv_admin on invite for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;

-- contractor_profile: self read/write; public-safe-subset reads served by the api (system actor)
alter table contractor_profile enable row level security
;
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
;
drop policy if exists cs_admin on contractor_stats
;
create policy cs_admin on contractor_stats for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists cs_read on contractor_stats
;
create policy cs_read on contractor_stats for select using (current_setting('app.actor', true) = 'contractor')
;

-- room: a contractor participant of the room (the provider path runs as system). RLS is a backstop here —
-- the module stores use the bare client + app-layer participant gates as the real boundary.
alter table room enable row level security
;
drop policy if exists room_admin on room
;
create policy room_admin on room for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists room_party on room
;
create policy room_party on room for all using (id in (select room_id from room_participant where kind = 'contractor' and contractor_user_id = current_setting('app.actor_user', true) and left_at is null)) with check (id in (select room_id from room_participant where kind = 'contractor' and contractor_user_id = current_setting('app.actor_user', true) and left_at is null))
;

-- room_participant: members of the same room
alter table room_participant enable row level security
;
drop policy if exists rp_admin on room_participant
;
create policy rp_admin on room_participant for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists rp_party on room_participant
;
create policy rp_party on room_participant for all using (room_id in (select room_id from room_participant where kind = 'contractor' and contractor_user_id = current_setting('app.actor_user', true) and left_at is null)) with check (room_id in (select room_id from room_participant where kind = 'contractor' and contractor_user_id = current_setting('app.actor_user', true) and left_at is null))
;

-- room_message: members of the room
alter table room_message enable row level security
;
drop policy if exists rm_admin on room_message
;
create policy rm_admin on room_message for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists rm_party on room_message
;
create policy rm_party on room_message for all using (room_id in (select room_id from room_participant where kind = 'contractor' and contractor_user_id = current_setting('app.actor_user', true) and left_at is null)) with check (room_id in (select room_id from room_participant where kind = 'contractor' and contractor_user_id = current_setting('app.actor_user', true) and left_at is null))
;

-- room_read: a user's own read cursors
alter table room_read enable row level security
;
drop policy if exists rr_admin on room_read
;
create policy rr_admin on room_read for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists rr_own on room_read
;
create policy rr_own on room_read for all using (user_id = current_setting('app.actor_user', true)) with check (user_id = current_setting('app.actor_user', true))
;

-- notification: recipient reads own; system writes
alter table notification enable row level security
;
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
;
drop policy if exists ae_admin on app_event
;
create policy ae_admin on app_event for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;

-- feature_flag: global flags admin-only; per-user overrides readable by that user
alter table feature_flag enable row level security
;
;
drop policy if exists ff_admin on feature_flag
;
create policy ff_admin on feature_flag for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists ff_self_read on feature_flag
;
create policy ff_self_read on feature_flag for select using (user_id is null or user_id = current_setting('app.actor_user', true))
;

-- listing: owner read/write; any vetted contractor may browse (select); admin/system all
alter table listing enable row level security
;
drop policy if exists li_admin on listing
;
create policy li_admin on listing for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists li_owner on listing
;
create policy li_owner on listing for all using (owner_user_id = current_setting('app.actor_user', true)) with check (owner_user_id = current_setting('app.actor_user', true))
;
drop policy if exists li_browse on listing
;
create policy li_browse on listing for select using (current_setting('app.actor', true) = 'contractor')
;

-- bid: participant (bidder + listing owner) read; bidder writes own; admin/system all
alter table bid enable row level security
;
drop policy if exists bi_admin on bid
;
create policy bi_admin on bid for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists bi_read on bid
;
create policy bi_read on bid for select using (bidder_user_id = current_setting('app.actor_user', true) or listing_id in (select id from listing where owner_user_id = current_setting('app.actor_user', true)))
;
drop policy if exists bi_bidder on bid
;
create policy bi_bidder on bid for all using (bidder_user_id = current_setting('app.actor_user', true)) with check (bidder_user_id = current_setting('app.actor_user', true))
;

-- contract: participant (client + contractor) read/write; admin/system all
alter table contract enable row level security
;
drop policy if exists ct_admin on contract
;
create policy ct_admin on contract for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists ct_party on contract
;
create policy ct_party on contract for all using (current_setting('app.actor_user', true) in (client_user_id, contractor_user_id)) with check (current_setting('app.actor_user', true) in (client_user_id, contractor_user_id))
;

-- contract_item: inherits the parent contract's participant scope; admin/system all
alter table contract_item enable row level security
;
drop policy if exists cti_admin on contract_item
;
create policy cti_admin on contract_item for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists cti_party on contract_item
;
create policy cti_party on contract_item for all using (contract_id in (select id from contract where current_setting('app.actor_user', true) in (client_user_id, contractor_user_id))) with check (contract_id in (select id from contract where current_setting('app.actor_user', true) in (client_user_id, contractor_user_id)))
;

-- time_entry: the contractor (owner) reads/writes own; the contract's client reads + approves (update only);
-- admin/system all. Only approved entries bill (enforced at the app/cycle layer). Defense-in-depth: the api
-- connects as the owner role so app-layer participant scoping in the store is primary.
alter table time_entry enable row level security
;
drop policy if exists te_admin on time_entry
;
create policy te_admin on time_entry for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists te_owner on time_entry
;
create policy te_owner on time_entry for all using (contractor_user_id = current_setting('app.actor_user', true)) with check (contractor_user_id = current_setting('app.actor_user', true))
;
drop policy if exists te_client_read on time_entry
;
create policy te_client_read on time_entry for select using (contract_id in (select id from contract where client_user_id = current_setting('app.actor_user', true)))
;
drop policy if exists te_client_approve on time_entry
;
create policy te_client_approve on time_entry for update using (contract_id in (select id from contract where client_user_id = current_setting('app.actor_user', true))) with check (contract_id in (select id from contract where client_user_id = current_setting('app.actor_user', true)))
;

-- time_activity: contractor owner writes; the contract's client reads (client-sees-always). Backstop; app guards real.
alter table time_activity enable row level security
;
drop policy if exists ta_admin on time_activity
;
create policy ta_admin on time_activity for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists ta_owner on time_activity
;
create policy ta_owner on time_activity for all using (contractor_user_id = current_setting('app.actor_user', true)) with check (contractor_user_id = current_setting('app.actor_user', true))
;
drop policy if exists ta_client_read on time_activity
;
create policy ta_client_read on time_activity for select using (time_entry_id in (select te.id from time_entry te join contract c on c.id = te.contract_id where c.client_user_id = current_setting('app.actor_user', true)))
;

-- extension_token: owner-only (a per-contractor credential)
alter table extension_token enable row level security
;
drop policy if exists et_admin on extension_token
;
create policy et_admin on extension_token for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists et_owner on extension_token
;
create policy et_owner on extension_token for all using (contractor_user_id = current_setting('app.actor_user', true)) with check (contractor_user_id = current_setting('app.actor_user', true))
;

-- payments: participants read; system/worker (webhook + cycle) writes. Backstop — app guards are the real boundary.
alter table stripe_account enable row level security
;
drop policy if exists sa_admin on stripe_account
;
create policy sa_admin on stripe_account for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists sa_owner on stripe_account
;
create policy sa_owner on stripe_account for select using (contractor_user_id = current_setting('app.actor_user', true))
;

alter table billing_cycle enable row level security
;
drop policy if exists bc_admin on billing_cycle
;
create policy bc_admin on billing_cycle for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists bc_party on billing_cycle
;
create policy bc_party on billing_cycle for select using (contract_id in (select id from contract where current_setting('app.actor_user', true) in (client_user_id, contractor_user_id)))
;

alter table charge enable row level security
;
drop policy if exists ch_admin on charge
;
create policy ch_admin on charge for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists ch_party on charge
;
create policy ch_party on charge for select using (current_setting('app.actor_user', true) in (client_user_id, contractor_user_id))
;

alter table payout enable row level security
;
drop policy if exists po_admin on payout
;
create policy po_admin on payout for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists po_owner on payout
;
create policy po_owner on payout for select using (contractor_user_id = current_setting('app.actor_user', true))
;

alter table cycle_dispute enable row level security
;
drop policy if exists cd_admin on cycle_dispute
;
create policy cd_admin on cycle_dispute for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists cd_party on cycle_dispute
;
create policy cd_party on cycle_dispute for all using (billing_cycle_id in (select bc.id from billing_cycle bc join contract c on c.id = bc.contract_id where current_setting('app.actor_user', true) in (c.client_user_id, c.contractor_user_id)))
;

-- client_billing: the client owns their saved-card record; system/admin all. Writes are system/provider-driven
-- (SetupIntent + webhook) via the owner connection; the client may read their own status. Backstop.
alter table client_billing enable row level security
;
drop policy if exists cb_admin on client_billing
;
create policy cb_admin on client_billing for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists cb_owner on client_billing
;
create policy cb_owner on client_billing for select using (client_user_id = current_setting('app.actor_user', true))
;

-- reviews: a contract's participants read/write; the contractor manages their own; system/admin all. Backstop.
alter table contractor_review enable row level security
;
drop policy if exists rv_admin on contractor_review
;
create policy rv_admin on contractor_review for all using (current_setting('app.actor', true) in ('system','platform_admin')) with check (current_setting('app.actor', true) in ('system','platform_admin'))
;
drop policy if exists rv_party on contractor_review
;
create policy rv_party on contractor_review for all using (contract_id in (select id from contract where current_setting('app.actor_user', true) in (client_user_id, contractor_user_id)))
;
