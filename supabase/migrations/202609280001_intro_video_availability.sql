-- Apply before deploying the intro video availability form.
-- All existing lead sources remain valid.
begin;

alter table public.leads drop constraint if exists leads_source_cta;
alter table public.leads add constraint leads_source_cta
  check (source_cta in (
    'hero_preorder', 'final_preorder', 'post_test_feedback', 'intro_video_notify'
  ));

commit;
