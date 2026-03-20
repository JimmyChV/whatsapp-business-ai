import { useCallback } from 'react';
import { uploadImageAsset } from '../helpers';

export default function useSaasPanelActions({
    requestJson,
    onOpenWhatsAppOperation,
    tenantScopeId = '',
    activeTenantId = '',
    selectedTenantId = '',
    setError,
    setBusy,
    refreshOverview,
    settingsTenantId = '',
    loadTenantSettings,
    loadWaModules,
    loadTenantCatalogs,
    loadTenantAiAssistants,
    loadQuickReplyData,
    loadTenantLabels
} = {}) {
    const runAction = useCallback(async (_label, action) => {
        setError('');
        setBusy(true);
        try {
            await action();
            await refreshOverview();
            if (settingsTenantId) {
                await loadTenantSettings(settingsTenantId);
                await loadWaModules(settingsTenantId);
                await loadTenantCatalogs(settingsTenantId);
                await loadTenantAiAssistants(settingsTenantId);
                await loadQuickReplyData(settingsTenantId);
                await loadTenantLabels(settingsTenantId);
            }
        } catch (err) {
            setError(String(err?.message || err || 'Error inesperado.'));
        } finally {
            setBusy(false);
        }
    }, [
        loadQuickReplyData,
        loadTenantAiAssistants,
        loadTenantCatalogs,
        loadTenantLabels,
        loadTenantSettings,
        loadWaModules,
        refreshOverview,
        setBusy,
        setError,
        settingsTenantId
    ]);

    const handleOpenOperation = useCallback(() => {
        if (typeof onOpenWhatsAppOperation !== 'function') return;
        const cleanTenantId = String(tenantScopeId || activeTenantId || '').trim();
        onOpenWhatsAppOperation('', { tenantId: cleanTenantId || undefined });
    }, [activeTenantId, onOpenWhatsAppOperation, tenantScopeId]);

    const handleFormImageUpload = useCallback(async ({ file, scope, tenantId, onUploaded }) => {
        if (!file) return;
        const cleanTenantId = String(tenantId || tenantScopeId || selectedTenantId || activeTenantId || 'default').trim() || 'default';
        setError('');
        setBusy(true);
        try {
            const publicUrl = await uploadImageAsset({ file, tenantId: cleanTenantId, scope, requestJson });
            if (!publicUrl) {
                throw new Error('No se pudo obtener URL publica del archivo subido.');
            }
            if (typeof onUploaded === 'function') {
                onUploaded(publicUrl);
            }
        } catch (err) {
            setError(String(err?.message || err || 'No se pudo subir la imagen.'));
        } finally {
            setBusy(false);
        }
    }, [activeTenantId, requestJson, selectedTenantId, setBusy, setError, tenantScopeId]);

    return {
        runAction,
        handleOpenOperation,
        handleFormImageUpload
    };
}
