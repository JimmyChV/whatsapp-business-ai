import React from 'react';

function text(value = '') {
    return String(value ?? '').trim();
}

export default function useTenantAutomations({
    requestJson = null,
    tenantId = '',
    enabled = true,
    autoLoad = true
} = {}) {
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');

    const loadAutomations = React.useCallback(async () => {
        const cleanTenantId = text(tenantId);
        if (!enabled || !cleanTenantId || typeof requestJson !== 'function') {
            setItems([]);
            return [];
        }
        setLoading(true);
        setError('');
        try {
            const response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/automations`);
            const nextItems = Array.isArray(response?.items) ? response.items : [];
            setItems(nextItems);
            return nextItems;
        } catch (err) {
            const message = String(err?.message || err || 'No se pudieron cargar automatizaciones.');
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [enabled, requestJson, tenantId]);

    React.useEffect(() => {
        if (!autoLoad || !enabled) return;
        loadAutomations().catch(() => {});
    }, [autoLoad, enabled, loadAutomations]);

    const createAutomationRule = React.useCallback(async (payload) => {
        const cleanTenantId = text(tenantId);
        if (!cleanTenantId || typeof requestJson !== 'function') throw new Error('Selecciona una empresa.');
        const response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/automations`, {
            method: 'POST',
            body: payload
        });
        const item = response?.item || null;
        if (item) setItems((prev) => [item, ...prev]);
        return item;
    }, [requestJson, tenantId]);

    const updateAutomationRule = React.useCallback(async (ruleId, payload) => {
        const cleanTenantId = text(tenantId);
        const cleanRuleId = text(ruleId);
        if (!cleanTenantId || !cleanRuleId || typeof requestJson !== 'function') throw new Error('Regla invalida.');
        const response = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/automations/${encodeURIComponent(cleanRuleId)}`, {
            method: 'PUT',
            body: payload
        });
        const item = response?.item || null;
        if (item) setItems((prev) => prev.map((entry) => (text(entry?.ruleId) === cleanRuleId ? item : entry)));
        return item;
    }, [requestJson, tenantId]);

    const deleteAutomationRule = React.useCallback(async (ruleId) => {
        const cleanTenantId = text(tenantId);
        const cleanRuleId = text(ruleId);
        if (!cleanTenantId || !cleanRuleId || typeof requestJson !== 'function') throw new Error('Regla invalida.');
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/automations/${encodeURIComponent(cleanRuleId)}`, {
            method: 'DELETE'
        });
        setItems((prev) => prev.filter((entry) => text(entry?.ruleId) !== cleanRuleId));
    }, [requestJson, tenantId]);

    return {
        automationRules: items,
        loadingAutomations: loading,
        automationError: error,
        loadAutomations,
        createAutomationRule,
        updateAutomationRule,
        deleteAutomationRule,
        setAutomationRules: setItems
    };
}
