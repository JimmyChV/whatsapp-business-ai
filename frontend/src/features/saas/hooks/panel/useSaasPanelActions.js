import { useCallback, useRef } from 'react';
import { uploadImageAsset } from '../../helpers';

export default function useSaasPanelActions({
    requestJson,
    onOpenWhatsAppOperation,
    operationTenantId = '',
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
    const loaderRef = useRef({
        refreshOverview,
        settingsTenantId,
        loadTenantSettings,
        loadWaModules,
        loadTenantCatalogs,
        loadTenantAiAssistants,
        loadQuickReplyData,
        loadTenantLabels
    });

    loaderRef.current = {
        refreshOverview,
        settingsTenantId,
        loadTenantSettings,
        loadWaModules,
        loadTenantCatalogs,
        loadTenantAiAssistants,
        loadQuickReplyData,
        loadTenantLabels
    };

    const runAction = useCallback(async (_label, action) => {
        const {
            refreshOverview: refreshOverviewFn,
            settingsTenantId: settingsTenantIdValue,
            loadTenantSettings: loadTenantSettingsFn,
            loadWaModules: loadWaModulesFn,
            loadTenantCatalogs: loadTenantCatalogsFn,
            loadTenantAiAssistants: loadTenantAiAssistantsFn,
            loadQuickReplyData: loadQuickReplyDataFn,
            loadTenantLabels: loadTenantLabelsFn
        } = loaderRef.current;

        setError('');
        setBusy(true);
        try {
            await action();
            if (typeof refreshOverviewFn === 'function') {
                await refreshOverviewFn();
            }
            if (settingsTenantIdValue) {
                if (typeof loadTenantSettingsFn === 'function') await loadTenantSettingsFn(settingsTenantIdValue);
                if (typeof loadWaModulesFn === 'function') await loadWaModulesFn(settingsTenantIdValue);
                if (typeof loadTenantCatalogsFn === 'function') await loadTenantCatalogsFn(settingsTenantIdValue);
                if (typeof loadTenantAiAssistantsFn === 'function') await loadTenantAiAssistantsFn(settingsTenantIdValue);
                if (typeof loadQuickReplyDataFn === 'function') await loadQuickReplyDataFn(settingsTenantIdValue);
                if (typeof loadTenantLabelsFn === 'function') await loadTenantLabelsFn(settingsTenantIdValue);
            }
        } catch (err) {
            setError(String(err?.message || err || 'Error inesperado.'));
        } finally {
            setBusy(false);
        }
    }, [setBusy, setError]);

    const handleOpenOperation = useCallback(() => {
        if (typeof onOpenWhatsAppOperation !== 'function') return;
        const cleanTenantId = String(operationTenantId || tenantScopeId || activeTenantId || '').trim();
        onOpenWhatsAppOperation('', { tenantId: cleanTenantId || undefined });
    }, [activeTenantId, onOpenWhatsAppOperation, operationTenantId, tenantScopeId]);

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
