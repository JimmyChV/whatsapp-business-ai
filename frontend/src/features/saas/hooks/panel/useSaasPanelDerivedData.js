import { useMemo } from 'react';
import {
    normalizeQuickReplyMediaAssets,
    normalizeTenantLabelItem,
    normalizeTenantCatalogItem,
    normalizeTenantAiAssistantItem
} from '../../helpers';

function resolveCustomerId(value = null) {
    if (!value || typeof value !== 'object') return '';
    return String(value.customerId || value.customer_id || value.id || '').trim();
}

export default function useSaasPanelDerivedData({
    customerSearch = '',
    customers = [],
    selectedCustomerId = '',
    waModules = [],
    selectedWaModuleId = '',
    quickReplyModuleFilterId = '',
    quickReplyLibraries = [],
    selectedQuickReplyLibraryId = '',
    quickReplyItems = [],
    selectedQuickReplyItemId = '',
    quickReplyItemForm = {},
    quickReplyLibrarySearch = '',
    quickReplyItemSearch = '',
    tenantLabels = [],
    selectedLabelId = '',
    labelSearch = '',
    tenantOptions = [],
    settingsTenantId = '',
    planMatrix = {},
    quickReplyDefaultMaxUploadMb = 50,
    quickReplyDefaultStorageMb = 4096,
    selectedConfigKey = '',
    waModuleForm = {},
    tenantCatalogs = [],
    selectedCatalogId = '',
    tenantCatalogProducts = [],
    selectedCatalogProductId = '',
    tenantAiAssistants = [],
    selectedAiAssistantId = '',
    selectedPlanId = '',
    planOptions = [],
} = {}) {
    const filteredCustomers = useMemo(() => {
        const query = String(customerSearch || '').trim().toLowerCase();
        const sorted = [...(Array.isArray(customers) ? customers : [])].sort((a, b) =>
            String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''))
        );
        if (!query) return sorted;
        return sorted.filter((item) => {
            const profile = item?.profile && typeof item.profile === 'object' ? item.profile : {};
            const haystack = [
                resolveCustomerId(item),
                item?.contactName,
                item?.phoneE164,
                item?.phoneAlt,
                item?.email,
                item?.moduleId,
                profile?.firstNames,
                profile?.lastNamePaternal,
                profile?.lastNameMaternal,
                profile?.documentNumber
            ].map((entry) => String(entry || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }, [customers, customerSearch]);

    const selectedCustomer = useMemo(
        () => {
            const cleanSelectedId = String(selectedCustomerId || '').trim();
            if (!cleanSelectedId) return null;
            return (Array.isArray(customers) ? customers : [])
                .find((item) => resolveCustomerId(item) === cleanSelectedId) || null;
        },
        [customers, selectedCustomerId]
    );

    const selectedWaModule = useMemo(
        () => (waModules || []).find((item) => String(item?.moduleId || '') === String(selectedWaModuleId || '')) || null,
        [waModules, selectedWaModuleId]
    );

    const quickReplyScopeModuleId = useMemo(
        () => String(quickReplyModuleFilterId || '').trim().toLowerCase(),
        [quickReplyModuleFilterId]
    );

    const quickReplyLibrariesByScope = useMemo(() => {
        if (!quickReplyScopeModuleId) return Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [];
        return (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
            .filter((entry) => entry.isShared || (Array.isArray(entry.moduleIds) && entry.moduleIds.includes(quickReplyScopeModuleId)));
    }, [quickReplyLibraries, quickReplyScopeModuleId]);

    const selectedQuickReplyLibrary = useMemo(
        () => quickReplyLibraries.find((entry) => String(entry?.libraryId || '').trim().toUpperCase() === String(selectedQuickReplyLibraryId || '').trim().toUpperCase()) || null,
        [quickReplyLibraries, selectedQuickReplyLibraryId]
    );

    const quickReplyItemsForSelectedLibrary = useMemo(() => {
        const cleanLibraryId = String(selectedQuickReplyLibrary?.libraryId || '').trim().toUpperCase();
        if (!cleanLibraryId) return [];
        return (Array.isArray(quickReplyItems) ? quickReplyItems : [])
            .filter((entry) => String(entry?.libraryId || '').trim().toUpperCase() === cleanLibraryId)
            .sort((left, right) => String(left?.label || '').localeCompare(String(right?.label || ''), 'es', { sensitivity: 'base' }));
    }, [quickReplyItems, selectedQuickReplyLibrary]);

    const selectedQuickReplyItem = useMemo(
        () => quickReplyItemsForSelectedLibrary.find((entry) => String(entry?.itemId || '').trim().toUpperCase() === String(selectedQuickReplyItemId || '').trim().toUpperCase()) || null,
        [quickReplyItemsForSelectedLibrary, selectedQuickReplyItemId]
    );

    const selectedQuickReplyItemMediaAssets = useMemo(
        () => normalizeQuickReplyMediaAssets(selectedQuickReplyItem?.mediaAssets, {
            url: selectedQuickReplyItem?.mediaUrl || '',
            mimeType: selectedQuickReplyItem?.mediaMimeType || '',
            fileName: selectedQuickReplyItem?.mediaFileName || '',
            sizeBytes: selectedQuickReplyItem?.mediaSizeBytes
        }),
        [selectedQuickReplyItem]
    );

    const quickReplyItemFormAssets = useMemo(
        () => normalizeQuickReplyMediaAssets(quickReplyItemForm?.mediaAssets, {
            url: quickReplyItemForm?.mediaUrl || '',
            mimeType: quickReplyItemForm?.mediaMimeType || '',
            fileName: quickReplyItemForm?.mediaFileName || '',
            sizeBytes: quickReplyItemForm?.mediaSizeBytes
        }),
        [quickReplyItemForm?.mediaAssets, quickReplyItemForm?.mediaUrl, quickReplyItemForm?.mediaMimeType, quickReplyItemForm?.mediaFileName, quickReplyItemForm?.mediaSizeBytes]
    );

    const visibleQuickReplyLibraries = useMemo(() => {
        const query = String(quickReplyLibrarySearch || '').trim().toLowerCase();
        const source = Array.isArray(quickReplyLibrariesByScope) ? quickReplyLibrariesByScope : [];
        const sorted = [...source].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' }));
        if (!query) return sorted;
        return sorted.filter((entry) => {
            const haystack = [
                entry?.libraryId,
                entry?.name,
                entry?.description,
                entry?.isShared ? 'compartida' : 'modulo'
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }, [quickReplyLibrariesByScope, quickReplyLibrarySearch]);

    const visibleQuickReplyItemsForSelectedLibrary = useMemo(() => {
        const query = String(quickReplyItemSearch || '').trim().toLowerCase();
        const source = Array.isArray(quickReplyItemsForSelectedLibrary) ? quickReplyItemsForSelectedLibrary : [];
        if (!query) return source;
        return source.filter((entry) => {
            const haystack = [
                entry?.itemId,
                entry?.label,
                entry?.text,
                entry?.mediaFileName,
                entry?.mediaMimeType
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            return haystack.includes(query);
        });
    }, [quickReplyItemsForSelectedLibrary, quickReplyItemSearch]);

    const tenantLabelItems = useMemo(() => {
        return [...(Array.isArray(tenantLabels) ? tenantLabels : [])]
            .map((entry) => normalizeTenantLabelItem(entry))
            .filter(Boolean)
            .sort((left, right) => {
                const delta = Number(left?.sortOrder || 100) - Number(right?.sortOrder || 100);
                if (delta !== 0) return delta;
                return String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' });
            });
    }, [tenantLabels]);

    const selectedTenantLabel = useMemo(
        () => tenantLabelItems.find((entry) => String(entry?.labelId || '').trim().toUpperCase() === String(selectedLabelId || '').trim().toUpperCase()) || null,
        [tenantLabelItems, selectedLabelId]
    );

    const visibleTenantLabels = useMemo(() => {
        const query = String(labelSearch || '').trim().toLowerCase();
        if (!query) return tenantLabelItems;
        return tenantLabelItems.filter((entry) => {
            const haystack = [entry?.labelId, entry?.name, entry?.description]
                .map((value) => String(value || '').toLowerCase())
                .join(' ');
            return haystack.includes(query);
        });
    }, [tenantLabelItems, labelSearch]);

    const selectedSettingsTenant = useMemo(
        () => tenantOptions.find((tenant) => String(tenant?.id || '').trim() === String(settingsTenantId || '').trim()) || null,
        [tenantOptions, settingsTenantId]
    );

    const quickReplyTenantPlanId = useMemo(() => {
        const clean = String(selectedSettingsTenant?.plan || 'starter').trim().toLowerCase();
        return clean || 'starter';
    }, [selectedSettingsTenant]);

    const quickReplyUploadMaxMb = useMemo(() => {
        const fromPlan = Number(planMatrix?.[quickReplyTenantPlanId]?.quickReplyMaxUploadMb);
        if (Number.isFinite(fromPlan) && fromPlan > 0) return Math.max(1, Math.min(1024, Math.floor(fromPlan)));
        return quickReplyDefaultMaxUploadMb;
    }, [planMatrix, quickReplyTenantPlanId, quickReplyDefaultMaxUploadMb]);

    const quickReplyStorageQuotaMb = useMemo(() => {
        const fromPlan = Number(planMatrix?.[quickReplyTenantPlanId]?.quickReplyStorageQuotaMb);
        if (Number.isFinite(fromPlan) && fromPlan > 0) return Math.max(10, Math.min(200000, Math.floor(fromPlan)));
        return quickReplyDefaultStorageMb;
    }, [planMatrix, quickReplyTenantPlanId, quickReplyDefaultStorageMb]);

    const quickReplyUploadMaxBytes = useMemo(() => quickReplyUploadMaxMb * 1024 * 1024, [quickReplyUploadMaxMb]);

    const selectedConfigModule = useMemo(() => {
        if (!String(selectedConfigKey || '').startsWith('wa_module:')) return null;
        const moduleId = String(selectedConfigKey || '').slice('wa_module:'.length).trim();
        if (!moduleId) return null;
        return waModules.find((item) => String(item?.moduleId || '').trim() === moduleId) || null;
    }, [selectedConfigKey, waModules]);

    const activeQuickReplyLibraries = useMemo(() => {
        return (Array.isArray(quickReplyLibraries) ? quickReplyLibraries : [])
            .filter((entry) => entry?.isActive !== false)
            .sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' }));
    }, [quickReplyLibraries]);

    const moduleQuickReplySourceModuleId = useMemo(
        () => String(waModuleForm?.moduleId || selectedConfigModule?.moduleId || '').trim().toLowerCase(),
        [waModuleForm?.moduleId, selectedConfigModule?.moduleId]
    );

    const moduleQuickReplyAssignedLibraries = useMemo(() => {
        if (!moduleQuickReplySourceModuleId) return [];
        return activeQuickReplyLibraries.filter((library) => (
            library.isShared === true
            || (Array.isArray(library.moduleIds) && library.moduleIds.includes(moduleQuickReplySourceModuleId))
        ));
    }, [activeQuickReplyLibraries, moduleQuickReplySourceModuleId]);

    const moduleQuickReplyAssignedLibraryIds = useMemo(
        () => new Set(moduleQuickReplyAssignedLibraries.map((entry) => String(entry?.libraryId || '').trim().toUpperCase()).filter(Boolean)),
        [moduleQuickReplyAssignedLibraries]
    );

    const tenantCatalogItems = useMemo(() => {
        return [...(Array.isArray(tenantCatalogs) ? tenantCatalogs : [])]
            .map((entry) => normalizeTenantCatalogItem(entry))
            .filter(Boolean)
            .sort((a, b) => String(a?.name || a?.catalogId || '').localeCompare(String(b?.name || b?.catalogId || ''), 'es', { sensitivity: 'base' }));
    }, [tenantCatalogs]);

    const selectedTenantCatalog = useMemo(
        () => tenantCatalogItems.find((entry) => String(entry?.catalogId || '').trim().toUpperCase() === String(selectedCatalogId || '').trim().toUpperCase()) || null,
        [tenantCatalogItems, selectedCatalogId]
    );

    const selectedCatalogProduct = useMemo(
        () => (Array.isArray(tenantCatalogProducts) ? tenantCatalogProducts : []).find((item) => String(item?.productId || '').trim() === String(selectedCatalogProductId || '').trim()) || null,
        [tenantCatalogProducts, selectedCatalogProductId]
    );

    const activeCatalogOptions = useMemo(
        () => tenantCatalogItems.filter((entry) => entry?.isActive !== false),
        [tenantCatalogItems]
    );

    const activeCatalogLabelMap = useMemo(() => {
        const map = new Map();
        activeCatalogOptions.forEach((entry) => {
            const key = String(entry?.catalogId || '').trim().toUpperCase();
            if (!key) return;
            map.set(key, String(entry?.name || key).trim() || key);
        });
        return map;
    }, [activeCatalogOptions]);

    const tenantAiAssistantItems = useMemo(() => {
        return [...(Array.isArray(tenantAiAssistants) ? tenantAiAssistants : [])]
            .map((entry) => normalizeTenantAiAssistantItem(entry))
            .filter(Boolean)
            .sort((a, b) => String(a?.name || a?.assistantId || '').localeCompare(String(b?.name || b?.assistantId || ''), 'es', { sensitivity: 'base' }));
    }, [tenantAiAssistants]);

    const activeAiAssistantOptions = useMemo(
        () => tenantAiAssistantItems.filter((entry) => entry?.isActive !== false),
        [tenantAiAssistantItems]
    );

    const selectedAiAssistant = useMemo(
        () => tenantAiAssistantItems.find((entry) => String(entry?.assistantId || '').trim().toUpperCase() === String(selectedAiAssistantId || '').trim().toUpperCase()) || null,
        [tenantAiAssistantItems, selectedAiAssistantId]
    );

    const defaultAiAssistantId = useMemo(() => {
        const explicit = tenantAiAssistantItems.find((entry) => entry.isDefault === true && entry.isActive !== false);
        if (explicit?.assistantId) return explicit.assistantId;
        return activeAiAssistantOptions[0]?.assistantId || '';
    }, [tenantAiAssistantItems, activeAiAssistantOptions]);

    const aiAssistantLabelMap = useMemo(() => {
        const map = new Map();
        tenantAiAssistantItems.forEach((entry) => {
            const key = String(entry?.assistantId || '').trim().toUpperCase();
            if (!key) return;
            map.set(key, String(entry?.name || key).trim() || key);
        });
        return map;
    }, [tenantAiAssistantItems]);

    const planIds = useMemo(() => {
        const keys = Object.keys(planMatrix || {}).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
        const merged = Array.from(new Set([...(Array.isArray(planOptions) ? planOptions : []), ...keys]));
        return merged;
    }, [planMatrix, planOptions]);

    const selectedPlan = useMemo(() => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        if (!cleanPlanId) return null;
        return {
            id: cleanPlanId,
            limits: planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object'
                ? planMatrix[cleanPlanId]
                : null
        };
    }, [planMatrix, selectedPlanId]);



    return {
        filteredCustomers,
        selectedCustomer,
        selectedWaModule,
        quickReplyScopeModuleId,
        quickReplyLibrariesByScope,
        selectedQuickReplyLibrary,
        quickReplyItemsForSelectedLibrary,
        selectedQuickReplyItem,
        selectedQuickReplyItemMediaAssets,
        quickReplyItemFormAssets,
        visibleQuickReplyLibraries,
        visibleQuickReplyItemsForSelectedLibrary,
        tenantLabelItems,
        selectedTenantLabel,
        visibleTenantLabels,
        selectedSettingsTenant,
        quickReplyTenantPlanId,
        quickReplyUploadMaxMb,
        quickReplyStorageQuotaMb,
        quickReplyUploadMaxBytes,
        selectedConfigModule,
        activeQuickReplyLibraries,
        moduleQuickReplySourceModuleId,
        moduleQuickReplyAssignedLibraries,
        moduleQuickReplyAssignedLibraryIds,
        tenantCatalogItems,
        selectedTenantCatalog,
        selectedCatalogProduct,
        activeCatalogOptions,
        activeCatalogLabelMap,
        tenantAiAssistantItems,
        activeAiAssistantOptions,
        selectedAiAssistant,
        defaultAiAssistantId,
        aiAssistantLabelMap,
        planIds,
        selectedPlan
    };
}




