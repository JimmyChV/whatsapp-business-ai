-- Cleanup audit logs accidentally written under the synthetic default tenant.
-- Superadmin actions executed without an operational tenant are global events,
-- not data belonging to another company.

UPDATE audit_logs
SET tenant_id = NULL
WHERE tenant_id = 'default'
  AND user_id IN (
    SELECT user_id
    FROM users
    WHERE metadata->>'isSuperAdmin' = 'true'
       OR user_id IN (
         SELECT user_id
         FROM memberships
         WHERE role = 'owner'
       )
  );

DELETE FROM audit_logs
WHERE tenant_id = 'default'
  AND action NOT IN (
    'auth.login.success',
    'auth.login.failed',
    'auth.logout',
    'auth.device.approved',
    'auth.device.revoked'
  );
