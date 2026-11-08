-- Self-service profile and password changes.
--
-- `password_changed_at` lets a password change invalidate sessions that were
-- signed in with the old password. Tokens issued before the change carry a
-- `pwd` claim that no longer matches, so they are refused on the next request.
-- Without this, changing a password would leave every other signed-in device
-- with full access until its token expired (12 hours).
alter table users add column if not exists password_changed_at timestamptz;

-- Left null for existing rows on purpose. Null means "never changed", and a
-- token issued while it is null stays valid until it expires, so deploying this
-- does not sign everybody out. The column is stamped only when a password
-- actually changes.
