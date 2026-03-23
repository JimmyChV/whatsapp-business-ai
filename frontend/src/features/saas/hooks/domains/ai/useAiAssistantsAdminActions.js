import {
    buildAiAssistantFormFromItem,
    buildAiAssistantPayload,
    buildLavitatAssistantPreset,
    normalizeTenantAiAssistantItem,
    sanitizeAiAssistantCode
} from '../../../helpers';
import {
    createTenantAiAssistant,
    fetchTenantAiAssistants,
    setTenantAiAssistantActive,
    setTenantAiAssistantDefault,
    updateTenantAiAssistant
} from '../../../services';

export default function useAiAssistantsAdminActions({
    requestJson,
    settingsTenantId = '',
    canManageAi = false,
    selectedAiAssistant = null,
    selectedAiAssistantId = '',
    aiAssistantForm = {},
    aiAssistantPanelMode = 'view',
    tenantIntegrations = {},
    emptyAiAssistantForm = {},
    setLoadingAiAssistants,
    setTenantAiAssistants,
    setSelectedAiAssistantId,
    setAiAssistantForm,
    setAiAssistantPanelMode,
    runAction
} = {}) {
    const loadTenantAiAssistants = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantAiAssistants([]);
            setSelectedAiAssistantId('');
            setAiAssistantForm({ ...emptyAiAssistantForm });
            setAiAssistantPanelMode('view');
            return;
        }

        setLoadingAiAssistants(true);
        try {
            const payload = await fetchTenantAiAssistants(requestJson, cleanTenantId);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeTenantAiAssistantItem(entry))
                .filter(Boolean);
            const defaultAssistantId = sanitizeAiAssistantCode(payload?.defaultAssistantId || '');
            const normalizedItems = items.map((entry) => {
                if (!defaultAssistantId) return entry;
                return {
                    ...entry,
                    isDefault: entry.assistantId === defaultAssistantId
                };
            });
            setTenantAiAssistants(normalizedItems);
            setSelectedAiAssistantId((prev) => {
                const cleanPrev = sanitizeAiAssistantCode(prev || '');
                if (cleanPrev && normalizedItems.some((entry) => entry.assistantId === cleanPrev)) return cleanPrev;
                return '';
            });
        } finally {
            setLoadingAiAssistants(false);
        }
    };

    const openAiAssistantCreate = () => {
        if (!canManageAi || !settingsTenantId) return;
        setSelectedAiAssistantId('');
        setAiAssistantForm({
            ...emptyAiAssistantForm,
            provider: 'openai',
            model: String(tenantIntegrations?.aiModel || 'gpt-4o-mini').trim() || 'gpt-4o-mini'
        });
        setAiAssistantPanelMode('create');
    };

    const applyLavitatAssistantPreset = () => {
        setAiAssistantForm((prev) => buildLavitatAssistantPreset(prev));
    };

    const openAiAssistantView = (assistantId) => {
        const cleanAssistantId = sanitizeAiAssistantCode(assistantId || '');
        if (!cleanAssistantId) return;
        setSelectedAiAssistantId(cleanAssistantId);
        setAiAssistantPanelMode('view');
    };

    const openAiAssistantEdit = () => {
        if (!selectedAiAssistant) return;
        setAiAssistantForm(buildAiAssistantFormFromItem(selectedAiAssistant));
        setAiAssistantPanelMode('edit');
    };

    const cancelAiAssistantEdit = () => {
        if (selectedAiAssistant) {
            setAiAssistantForm(buildAiAssistantFormFromItem(selectedAiAssistant));
            setAiAssistantPanelMode('view');
            return;
        }
        setAiAssistantForm({ ...emptyAiAssistantForm });
        setAiAssistantPanelMode('view');
    };

    const saveAiAssistant = () => {
        if (!settingsTenantId || !canManageAi) return;

        runAction(aiAssistantPanelMode === 'create' ? 'Asistente IA creado' : 'Asistente IA actualizado', async () => {
            const payload = buildAiAssistantPayload(aiAssistantForm, { allowAssistantId: aiAssistantPanelMode === 'create' });
            if (!String(payload.name || '').trim()) {
                throw new Error('El nombre del asistente IA es obligatorio.');
            }

            let response = null;
            if (aiAssistantPanelMode === 'create') {
                response = await createTenantAiAssistant(requestJson, settingsTenantId, payload);
            } else {
                const cleanAssistantId = sanitizeAiAssistantCode(selectedAiAssistant?.assistantId || aiAssistantForm.assistantId || selectedAiAssistantId);
                if (!cleanAssistantId) throw new Error('Asistente IA invalido para actualizar.');
                response = await updateTenantAiAssistant(requestJson, settingsTenantId, cleanAssistantId, payload);
            }

            await loadTenantAiAssistants(settingsTenantId);
            const returnedId = sanitizeAiAssistantCode(response?.item?.assistantId || '');
            if (returnedId) {
                setSelectedAiAssistantId(returnedId);
            }
            setAiAssistantPanelMode('view');
            setAiAssistantForm((prev) => ({ ...prev, openaiApiKey: '' }));
        });
    };

    const markAiAssistantAsDefault = (assistantId) => {
        const cleanAssistantId = sanitizeAiAssistantCode(assistantId || '');
        if (!settingsTenantId || !cleanAssistantId || !canManageAi) return;

        runAction('Asistente IA principal actualizado', async () => {
            await setTenantAiAssistantDefault(requestJson, settingsTenantId, cleanAssistantId);
            await loadTenantAiAssistants(settingsTenantId);
            setSelectedAiAssistantId(cleanAssistantId);
        });
    };

    const toggleAiAssistantActive = (assistant) => {
        const cleanAssistantId = sanitizeAiAssistantCode(assistant?.assistantId || '');
        if (!settingsTenantId || !cleanAssistantId || !canManageAi) return;
        const isActive = assistant?.isActive !== false;

        runAction('Estado de asistente IA actualizado', async () => {
            await setTenantAiAssistantActive(requestJson, settingsTenantId, cleanAssistantId, !isActive);
            await loadTenantAiAssistants(settingsTenantId);
            setSelectedAiAssistantId(cleanAssistantId);
        });
    };

    return {
        loadTenantAiAssistants,
        openAiAssistantCreate,
        applyLavitatAssistantPreset,
        openAiAssistantView,
        openAiAssistantEdit,
        cancelAiAssistantEdit,
        saveAiAssistant,
        markAiAssistantAsDefault,
        toggleAiAssistantActive
    };
}
