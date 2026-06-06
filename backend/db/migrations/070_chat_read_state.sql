-- Commit 1 unread/read rewrite: persist manual unread state in real columns.
ALTER TABLE IF EXISTS tenant_chats
  ADD COLUMN IF NOT EXISTS manually_marked_unread BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS tenant_chats
  ADD COLUMN IF NOT EXISTS manually_marked_unread_at TIMESTAMPTZ NULL;

UPDATE tenant_chats
SET manually_marked_unread = COALESCE(metadata->>'manuallyMarkedUnread', 'false') = 'true',
    manually_marked_unread_at = CASE
      WHEN COALESCE(metadata->>'manuallyMarkedUnreadAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        THEN (metadata->>'manuallyMarkedUnreadAt')::timestamptz
      ELSE manually_marked_unread_at
    END
WHERE metadata ? 'manuallyMarkedUnread'
   OR metadata ? 'manuallyMarkedUnreadAt';

CREATE INDEX IF NOT EXISTS idx_tenant_chats_unread_state
  ON tenant_chats (tenant_id, unread_count, manually_marked_unread, updated_at DESC);
