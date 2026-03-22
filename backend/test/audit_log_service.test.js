const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadAuditServiceFresh() {
    const runtimePath = require.resolve('../config/persistence-runtime');
    const modulePath = require.resolve('../domains/security/services/audit-log.service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../domains/security/services/audit-log.service');
}

test('audit_log_service writes and lists audit rows for tenant in file mode', async () => {
    const prev = {
        SAAS_STORAGE_DRIVER: process.env.SAAS_STORAGE_DRIVER,
        SAAS_TENANT_DATA_DIR: process.env.SAAS_TENANT_DATA_DIR,
        SAAS_AUDIT_FILE_LIMIT: process.env.SAAS_AUDIT_FILE_LIMIT
    };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempDir;
        process.env.SAAS_AUDIT_FILE_LIMIT = '2000';

        const auditService = loadAuditServiceFresh();

        await auditService.writeAuditLog('tenant_acme', {
            userId: 'u_1',
            userEmail: 'owner@acme.com',
            role: 'owner',
            action: 'tenant.settings.updated',
            resourceType: 'tenant_settings',
            resourceId: 'tenant_acme',
            source: 'api',
            payload: { enabledModules: { catalog: true } }
        });

        await auditService.writeAuditLog('tenant_acme', {
            userId: 'u_2',
            userEmail: 'seller@acme.com',
            role: 'seller',
            action: 'message.edited',
            resourceType: 'message',
            resourceId: 'msg_1',
            source: 'socket',
            socketId: 'socket_1',
            payload: { chatId: 'chat_1' }
        });

        const rows = await auditService.listAuditLogs('tenant_acme', { limit: 10, offset: 0 });
        assert.equal(Array.isArray(rows), true);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].action, 'message.edited');
        assert.equal(rows[1].action, 'tenant.settings.updated');
        assert.equal(rows[0].tenantId, 'tenant_acme');
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prev.SAAS_STORAGE_DRIVER;
        process.env.SAAS_TENANT_DATA_DIR = prev.SAAS_TENANT_DATA_DIR;
        process.env.SAAS_AUDIT_FILE_LIMIT = prev.SAAS_AUDIT_FILE_LIMIT;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});


