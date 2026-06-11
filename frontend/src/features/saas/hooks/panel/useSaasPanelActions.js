import { useCallback, useRef } from 'react';
import { uploadImageAsset } from '../../helpers';

export default function useSaasPanelActions({
    requestJson,
    onOpenWhatsAppOperation,
    handleSwitchTenant,
    operationTenantId = '',
    tenantScopeId = '',
    activeTenantId = '',
    selectedTenantId = '',
    setError,
    setBusy,
    refreshOverview
} = {}) {
    const loaderRef = useRef({
        refreshOverview
    });

    loaderRef.current = {
        refreshOverview
    };

    const runAction = useCallback(async (_label, action, { skipRefreshAfter = false } = {}) => {
        const {
            refreshOverview: refreshOverviewFn
        } = loaderRef.current;

        setError('');
        setBusy(true);
        try {
            await action();
            if (!skipRefreshAfter && typeof refreshOverviewFn === 'function') {
                await refreshOverviewFn();
            }
        } catch (err) {
            setError(String(err?.message || err || 'Error inesperado.'));
        } finally {
            setBusy(false);
        }
    }, [setBusy, setError]);

    const handleOpenOperation = useCallback(async () => {
        if (typeof onOpenWhatsAppOperation !== 'function') return;
        const cleanTenantId = String(operationTenantId || tenantScopeId || activeTenantId || '').trim();
        const currentTenantId = String(activeTenantId || tenantScopeId || '').trim();
        if (!cleanTenantId || cleanTenantId === 'default') {
            setError('Default no es un tenant operativo. Selecciona una empresa real.');
            return;
        }

        setError('');
        setBusy(true);
        try {
            if (cleanTenantId !== currentTenantId) {
                if (typeof handleSwitchTenant !== 'function') {
                    throw new Error('No se pudo cambiar de empresa antes de abrir el chat.');
                }
                await handleSwitchTenant(cleanTenantId);
            }
            onOpenWhatsAppOperation('', { tenantId: cleanTenantId });
        } catch (err) {
            setError(String(err?.message || err || 'No tienes acceso a esa empresa.'));
        } finally {
            setBusy(false);
        }
    }, [activeTenantId, handleSwitchTenant, onOpenWhatsAppOperation, operationTenantId, setBusy, setError, tenantScopeId]);

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
