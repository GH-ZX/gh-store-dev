-- Migration 20261011100000: Admin MFA requirement setting
-- Allows the store owner to require TOTP 2FA for all administrative accounts.

alter table public.store_settings
  add column if not exists admin_mfa_required boolean not null default false;

comment on column public.store_settings.admin_mfa_required is
  'When true, administrators must enroll and verify TOTP 2FA before accessing dashboard operations.';
