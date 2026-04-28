#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });

const readline = require('readline');
const { Pool } = require('pg');

const TENANT_ID = 'tenant_cleaning';

const DELETE_PLAN = [
    { table: 'tenant_campaign_events', scoped: true },
    { table: 'tenant_campaign_queue', scoped: true },
    { table: 'tenant_campaign_recipients', scoped: true },
    { table: 'tenant_campaigns', scoped: true },
    { table: 'tenant_quotes', scoped: true },
    { table: 'tenant_conversation_events', scoped: true },
    { table: 'tenant_chat_commercial_status', scoped: true },
    { table: 'tenant_chat_assignment_events', scoped: true },
    { table: 'tenant_chat_assignments', scoped: true },
    { table: 'tenant_chat_labels', scoped: true },
    { table: 'tenant_chat_origins', scoped: true },
    { table: 'tenant_channel_events', scoped: true },
    { table: 'tenant_messages', scoped: true },
    { table: 'tenant_chats', scoped: true },
    { table: 'tenant_customer_labels', scoped: true },
    { table: 'tenant_customer_consents', scoped: true },
    { table: 'tenant_customer_identities', scoped: true },
    { table: 'tenant_customer_import_errors', scoped: true },
    { table: 'tenant_customer_import_runs', scoped: true },
    { table: 'tenant_customer_module_contexts', scoped: true },
    { table: 'tenant_customer_addresses', scoped: true },
    { table: 'tenant_customers', scoped: true },
    { table: 'tenant_ai_chat_history', scoped: true },
    { table: 'audit_logs', scoped: false },
    { table: 'auth_sessions', scoped: false }
];

function toConfig() {
    return {
        connectionString: String(process.env.DATABASE_URL || '').trim() || undefined,
        host: String(process.env.PGHOST || '').trim() || undefined,
        port: Number.parseInt(String(process.env.PGPORT || '').trim(), 10) || undefined,
        user: String(process.env.PGUSER || '').trim() || undefined,
        password: String(process.env.PGPASSWORD || '').trim() || undefined,
        database: String(process.env.PGDATABASE || '').trim() || undefined,
        ssl: String(process.env.PGSSL || '').trim().toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined
    };
}

async function askConfirmation() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const answer = await new Promise((resolve) => {
        rl.question('¿Confirmar borrado completo? (escribe SI) ', resolve);
    });
    rl.close();
    return String(answer || '').trim();
}

async function countRows(client, step) {
    if (step.scoped) {
        const result = await client.query(`SELECT COUNT(*)::bigint AS total FROM ${step.table} WHERE tenant_id = $1`, [TENANT_ID]);
        return Number(result.rows?.[0]?.total || 0);
    }
    const result = await client.query(`SELECT COUNT(*)::bigint AS total FROM ${step.table}`);
    return Number(result.rows?.[0]?.total || 0);
}

async function deleteRows(client, step) {
    if (step.scoped) {
        const result = await client.query(`DELETE FROM ${step.table} WHERE tenant_id = $1`, [TENANT_ID]);
        return Number(result.rowCount || 0);
    }
    const result = await client.query(`DELETE FROM ${step.table}`);
    return Number(result.rowCount || 0);
}

async function main() {
    const pool = new Pool(toConfig());
    const client = await pool.connect();
    try {
        console.log(`Tenant objetivo: ${TENANT_ID}`);
        console.log('Conteos actuales:');
        for (const step of DELETE_PLAN) {
            const total = await countRows(client, step);
            console.log(`- ${step.table}: ${total}`);
        }

        const answer = await askConfirmation();
        if (answer !== 'SI') {
            console.log('Abortado: no se confirmo el borrado.');
            return;
        }

        await client.query('BEGIN');
        console.log('Borrando filas...');
        for (const step of DELETE_PLAN) {
            const deleted = await deleteRows(client, step);
            console.log(`- ${step.table}: ${deleted} fila(s) borradas`);
        }
        await client.query('COMMIT');
        console.log('Borrado completado.');
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {
            // ignore rollback error
        }
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
});
