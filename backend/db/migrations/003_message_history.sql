-- SaaS schema v3: tenant message history
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS tenant_chats (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    display_name TEXT,
    phone TEXT,
    subtitle TEXT,
    unread_count INTEGER NOT NULL DEFAULT 0,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    last_message_id TEXT,
    last_message_at BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_chats_last_message
    ON tenant_chats(tenant_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS tenant_messages (
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    from_me BOOLEAN NOT NULL DEFAULT FALSE,
    sender_id TEXT,
    sender_phone TEXT,
    author_id TEXT,
    body TEXT,
    message_type TEXT,
    timestamp_unix BIGINT,
    ack INTEGER,
    edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at_unix BIGINT,
    has_media BOOLEAN NOT NULL DEFAULT FALSE,
    media_mime TEXT,
    media_filename TEXT,
    media_size_bytes BIGINT,
    quoted_message_id TEXT,
    order_payload JSONB,
    location_payload JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, message_id),
    FOREIGN KEY (tenant_id, chat_id) REFERENCES tenant_chats(tenant_id, chat_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_messages_chat_ts
    ON tenant_messages(tenant_id, chat_id, timestamp_unix DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_messages_sender
    ON tenant_messages(tenant_id, sender_phone, timestamp_unix DESC);
