-- Default settings. The edition is chosen at deployment time and can be changed by
-- an admin; the business profile is what appears on every printed statement.
insert into app_settings (key, value) values
  ('edition', 'classic'),
  ('business_name', 'Kampala Community Savings & Credit'),
  ('business_address', 'Nakawa, Ntinda, Kampala, Uganda'),
  ('business_phone', '+256 755 274 944'),
  ('business_email', 'info@gss-tec.com'),
  ('business_logo_text', 'KCS'),
  ('business_footer_note', 'Balances are calculated from recorded transactions. Please report any difference within 7 days.')
on conflict (key) do nothing;
