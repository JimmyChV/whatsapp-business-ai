const { queryPostgres } = require('../../persistence_runtime');

let schemaReady = false;
let schemaPromise = null;

async function ensureConversationOpsSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_conversation_events (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                event_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                scope_module_id TEXT NOT NULL DEFAULT '',
                customer_id TEXT NULL,
                actor_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
                actor_role TEXT NULL,
                event_type TEXT NOT NULL,
                event_source TEXT NOT NULL DEFAULT 'system',
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, event_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_conversation_events_chat
            ON tenant_conversation_events(tenant_id, chat_id, scope_module_id, created_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_conversation_events_type
            ON tenant_conversation_events(tenant_id, event_type, created_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_conversation_events_actor
            ON tenant_conversation_events(tenant_id, actor_user_id, created_at DESC)
        `);

        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_chat_assignments (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                chat_id TEXT NOT NULL,
                scope_module_id TEXT NOT NULL DEFAULT '',
                assignee_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
                assignee_role TEXT NULL,
                assigned_by_user_id TEXT NULL REFERENCES users(user_id) ON DELETE SET NULL,
                assignment_mode TEXT NOT NULL DEFAULT 'manual',
                assignment_reason TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, chat_id, scope_module_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_chat_assignments_assignee
            ON tenant_chat_assignments(tenant_id, assignee_user_id, updated_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_chat_assignments_status
            ON tenant_chat_assignments(tenant_id, status, updated_at DESC)
        `);

        await queryPostgres(`
            CREATE TABLE IF NOT EXISTS tenant_chat_assignment_events (
                tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
                assignment_event_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                scope_module_id TEXT NOT NULL DEFAULT '',
                previous_assignee_user_id TEXT NULL,
                next_assignee_user_id TEXT NULL,
                next_assignee_role TEXT NULL,
                assigned_by_user_id TEXT NULL,
                assignment_mode TEXT NOT NULL DEFAULT 'manual',
                assignment_reason TEXT NULL,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (tenant_id, assignment_event_id)
            )
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_chat_assignment_events_chat
            ON tenant_chat_assignment_events(tenant_id, chat_id, scope_module_id, created_at DESC)
        `);
        await queryPostgres(`
            CREATE INDEX IF NOT EXISTS idx_tenant_chat_assignment_events_assignee
            ON tenant_chat_assignment_events(tenant_id, next_assignee_user_id, created_at DESC)
        `);

        schemaReady = true;
        schemaPromise = null;
    })();

    return schemaPromise;
}

module.exports = {
    ensureConversationOpsSchema
};
