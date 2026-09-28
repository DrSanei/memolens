-- Apply to the production Supabase project before publishing the Careers form.
-- Keep the existing lead sources while adding a separate Careers source.
begin;

alter table public.leads drop constraint if exists leads_source_cta;
alter table public.leads add constraint leads_source_cta
  check (source_cta in (
    'hero_preorder', 'final_preorder', 'post_test_feedback',
    'intro_video_notify', 'careers_interest'
  ));

alter table public.leads drop constraint if exists leads_role_interest;
alter table public.leads add constraint leads_role_interest
  check (role_interest in (
    'Family caregiver', 'Professional caregiver', 'Healthcare professional',
    'Researcher', 'Potential partner', 'Other',
    'Family member', 'Caregiver', 'Doctor or clinician',
    'Potential teammate', 'Investor or partner'
  ));

commit;
