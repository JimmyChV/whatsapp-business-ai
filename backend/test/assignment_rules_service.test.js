const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

function loadAssignmentRulesServiceFresh() {
    const runtimePath = require.resolve('../persistence_runtime');
    const modulePath = require.resolve('../assignment_rules_service');
    delete require.cache[runtimePath];
    delete require.cache[modulePath];
    return require('../assignment_rules_service');
}

test('assignment_rules_service persists rules and resolves effective inheritance (file driver)', async () => {
    const prevDriver = process.env.SAAS_STORAGE_DRIVER;
    const prevDir = process.env.SAAS_TENANT_DATA_DIR;

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'assignment-rules-'));

    try {
        process.env.SAAS_STORAGE_DRIVER = 'file';
        process.env.SAAS_TENANT_DATA_DIR = tempRoot;

        const service = loadAssignmentRulesServiceFresh();

        const empty = await service.listRules('tenant_a');
        assert.deepEqual(empty, []);

        const globalRule = await service.upsertRule('tenant_a', {
            scopeModuleId: '',
            enabled: true,
            mode: 'round_robin',
            allowedRoles: ['seller', 'admin'],
            maxOpenChatsPerUser: 12,
            metadata: { strategy: 'baseline' },
            updatedByUserId: 'owner_lavitat'
        });

        assert.equal(globalRule.scopeModuleId, '');
        assert.equal(globalRule.enabled, true);
        assert.equal(globalRule.mode, 'round_robin');
        assert.deepEqual(globalRule.allowedRoles, ['seller', 'admin']);
        assert.equal(globalRule.maxOpenChatsPerUser, 12);

        const inherited = await service.getEffectiveRule('tenant_a', 'mod_lavitat');
        assert.equal(inherited.inherited, true);
        assert.equal(inherited.rule.scopeModuleId, 'mod_lavitat');
        assert.equal(inherited.rule.mode, 'round_robin');

        const scopedRule = await service.upsertRule('tenant_a', {
            scopeModuleId: 'MOD_LAVITAT',
            enabled: true,
            mode: 'least_load',
            allowedRoles: ['seller'],
            maxOpenChatsPerUser: 5,
            metadata: { strategy: 'module-local' },
            updatedByUserId: 'owner_lavitat'
        });

        assert.equal(scopedRule.scopeModuleId, 'mod_lavitat');
        assert.equal(scopedRule.mode, 'least_load');
        assert.deepEqual(scopedRule.allowedRoles, ['seller']);

        const resolved = await service.getEffectiveRule('tenant_a', 'mod_lavitat');
        assert.equal(resolved.inherited, false);
        assert.equal(resolved.rule.scopeModuleId, 'mod_lavitat');
        assert.equal(resolved.rule.mode, 'least_load');
        assert.equal(resolved.rule.maxOpenChatsPerUser, 5);

        const otherTenant = await service.listRules('tenant_b');
        assert.deepEqual(otherTenant, []);
    } finally {
        process.env.SAAS_STORAGE_DRIVER = prevDriver;
        process.env.SAAS_TENANT_DATA_DIR = prevDir;
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
