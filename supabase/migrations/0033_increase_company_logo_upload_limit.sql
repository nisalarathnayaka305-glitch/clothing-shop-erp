-- 0033_increase_company_logo_upload_limit
alter table public.company_settings
drop constraint if exists company_settings_logo_size;
alter table public.company_settings
add constraint company_settings_logo_size check (length(logo_data_url) <= 2800000);
