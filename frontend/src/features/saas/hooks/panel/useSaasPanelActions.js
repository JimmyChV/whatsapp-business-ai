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
    refreshOverview
} = {}) {
    const loaderRef = useRef({
        refreshOverview
    });

    loaderRef.current = {
        refreshOverview
    };

    const runAction = useCallback(async (_label, action) => {
        const {
            refreshOverview: refreshOverviewFn
        } = loaderRef.current;

        setError('');
        setBusy(true);
        try {
            await action();
            if (typeof refreshOverviewFn === 'function') {
                await refreshOverviewFn();
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
