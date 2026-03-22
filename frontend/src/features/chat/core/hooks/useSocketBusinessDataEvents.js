import { useEffect } from 'react';

export default function useSocketBusinessDataEvents({
    socket,
    normalizeBusinessDataPayload,
    businessDataRequestSeqRef,
    businessDataResponseSeqRef,
    businessDataScopeCacheRef,
    selectedCatalogModuleIdRef,
    selectedCatalogIdRef,
    resolveScopedCatalogSelection,
    setBusinessData,
    setLabelDefinitions,
    normalizeChatLabels,
    setSelectedCatalogModuleId,
    setSelectedCatalogId,
    normalizeCatalogItem,
    businessData,
    setWaCapabilities,
    normalizeQuickRepliesSocketPayload,
    setQuickReplies
}) {
    useEffect(() => {
        socket.on('business_data_labels', (payload = {}) => {
            const labels = Array.isArray(payload?.labels) ? payload.labels : [];
            setLabelDefinitions(normalizeChatLabels(labels));
        });

        socket.on('business_data', (data) => {
            const normalized = normalizeBusinessDataPayload(data);
            const responseSeq = Number(data?.requestSeq || normalized?.requestSeq || 0);
            if (Number.isFinite(responseSeq) && responseSeq > 0) {
                if (responseSeq < (businessDataRequestSeqRef.current || 0)) return;
                businessDataResponseSeqRef.current = responseSeq;
            }

            const scope = (normalized?.catalogMeta?.scope && typeof normalized.catalogMeta.scope === 'object')
                ? normalized.catalogMeta.scope
                : null;
            const scopeModuleId = String(scope?.moduleId || '').trim().toLowerCase();
            const scopeCatalogId = String(scope?.catalogId || '').trim().toUpperCase();
            const scopeCatalogIds = Array.isArray(scope?.catalogIds)
                ? scope.catalogIds.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)
                : [];
            const currentCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
            const currentCatalogId = String(selectedCatalogIdRef.current || '').trim().toUpperCase();
            const hasModuleSelection = Boolean(currentCatalogModuleId);

            if (hasModuleSelection && (!scopeModuleId || scopeModuleId !== currentCatalogModuleId)) {
                return;
            }
            if (scopeCatalogId && currentCatalogId && scopeCatalogId !== currentCatalogId && scopeCatalogIds.includes(currentCatalogId)) {
                return;
            }

            const normalizedBusinessData = {
                ...normalized,
                catalogMeta: normalized?.catalogMeta || { source: 'local', nativeAvailable: false }
            };
            setBusinessData(normalizedBusinessData);

            const cacheModuleId = String(scopeModuleId || currentCatalogModuleId || '').trim().toLowerCase();
            const cacheCatalogId = String(scopeCatalogId || currentCatalogId || '').trim().toUpperCase();
            if (cacheModuleId || cacheCatalogId) {
                businessDataScopeCacheRef.current.set(`${cacheModuleId}|${cacheCatalogId}`, {
                    catalog: Array.isArray(normalizedBusinessData.catalog) ? normalizedBusinessData.catalog : [],
                    catalogMeta: normalizedBusinessData.catalogMeta
                });
            }

            setLabelDefinitions(normalizeChatLabels(normalized.labels));

            if (scopeModuleId && !currentCatalogModuleId) {
                setSelectedCatalogModuleId(scopeModuleId);
            }

            const nextCatalogId = resolveScopedCatalogSelection({
                scopeCatalogId,
                scopeCatalogIds,
                currentCatalogId
            });

            if (nextCatalogId !== currentCatalogId) {
                setSelectedCatalogId(nextCatalogId);
            }
        });

        socket.on('business_data_catalog', (payload) => {
            const scopedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
                ? payload
                : null;
            const responseSeq = Number(scopedPayload?.requestSeq || payload?.requestSeq || 0);
            if (Number.isFinite(responseSeq) && responseSeq > 0) {
                if (responseSeq < (businessDataRequestSeqRef.current || 0)) return;
                businessDataResponseSeqRef.current = responseSeq;
            }

            const scope = scopedPayload?.scope && typeof scopedPayload.scope === 'object'
                ? scopedPayload.scope
                : null;
            const scopeModuleId = String(scope?.moduleId || '').trim().toLowerCase();
            const scopeCatalogId = String(scope?.catalogId || '').trim().toUpperCase();
            const scopeCatalogIds = Array.isArray(scope?.catalogIds)
                ? scope.catalogIds.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)
                : [];
            const activeCatalogModuleId = String(selectedCatalogModuleIdRef.current || '').trim().toLowerCase();
            const activeCatalogId = String(selectedCatalogIdRef.current || '').trim().toUpperCase();

            if (scopeModuleId && activeCatalogModuleId && scopeModuleId !== activeCatalogModuleId) {
                return;
            }
            if (scopeCatalogId && activeCatalogId && scopeCatalogId !== activeCatalogId && scopeCatalogIds.includes(activeCatalogId)) {
                return;
            }

            const rawItems = Array.isArray(scopedPayload?.items)
                ? scopedPayload.items
                : (Array.isArray(payload) ? payload : []);
            const normalizedCatalog = rawItems.map((item, idx) => normalizeCatalogItem(item, idx));
            const normalizedCategories = Array.from(new Set(
                normalizedCatalog
                    .flatMap((item) => (Array.isArray(item?.categories) ? item.categories : []))
                    .map((entry) => String(entry || '').trim())
                    .filter(Boolean)
            )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

            const nextCatalogMeta = {
                ...(businessData?.catalogMeta || { source: 'local', nativeAvailable: false }),
                source: String(scopedPayload?.source || 'local').trim().toLowerCase() || 'local',
                categories: normalizedCategories,
                scope: scope || businessData?.catalogMeta?.scope || null
            };

            setBusinessData((prev) => ({
                ...prev,
                catalog: normalizedCatalog,
                catalogMeta: {
                    ...(prev?.catalogMeta || { source: 'local', nativeAvailable: false }),
                    source: nextCatalogMeta.source,
                    categories: normalizedCategories,
                    scope: scope || prev?.catalogMeta?.scope || null
                }
            }));

            const cacheModuleId = String(scopeModuleId || activeCatalogModuleId || '').trim().toLowerCase();
            const cacheCatalogId = String(scopeCatalogId || activeCatalogId || '').trim().toUpperCase();
            if (cacheModuleId || cacheCatalogId) {
                businessDataScopeCacheRef.current.set(`${cacheModuleId}|${cacheCatalogId}`, {
                    catalog: normalizedCatalog,
                    catalogMeta: nextCatalogMeta
                });
            }

            if (scopeModuleId && !activeCatalogModuleId) {
                setSelectedCatalogModuleId(scopeModuleId);
            }

            const nextCatalogId = resolveScopedCatalogSelection({
                scopeCatalogId,
                scopeCatalogIds,
                currentCatalogId: activeCatalogId
            });

            if (nextCatalogId !== activeCatalogId) {
                setSelectedCatalogId(nextCatalogId);
            }
        });

        socket.on('quick_replies', (payload) => {
            const normalizedQuickReplies = normalizeQuickRepliesSocketPayload(payload || {});
            setWaCapabilities((prev) => ({
                ...prev,
                quickReplies: normalizedQuickReplies.enabled,
                quickRepliesRead: normalizedQuickReplies.enabled,
                quickRepliesWrite: normalizedQuickReplies.enabled && normalizedQuickReplies.writable
            }));
            setQuickReplies(normalizedQuickReplies.items);
        });

        socket.on('quick_reply_error', (msg) => {
            if (msg) alert(msg);
        });

        return () => {
            ['business_data_labels', 'business_data', 'business_data_catalog', 'quick_replies', 'quick_reply_error']
                .forEach((eventName) => socket.off(eventName));
        };
    }, []);
}
