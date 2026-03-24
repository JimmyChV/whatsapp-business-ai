import {
    buildLabelFormFromItem,
    buildTenantLabelPayload,
    normalizeTenantLabelItem
} from '../../../helpers';
import {
    createTenantLabel,
    deactivateTenantLabel as deactivateTenantLabelRequest,
    fetchTenantLabels,
    updateTenantLabel
} from '../../../services';

export default function useTenantLabelsActions({
    requestJson,
    settingsTenantId = '',
    selectedTenantLabel = null,
    selectedLabelId = '',
    labelForm = {},
    labelPanelMode = 'view',
    emptyLabelForm = {},
    defaultLabelColors = [],
    setTenantLabels,
    setSelectedLabelId,
    setLabelForm,
    setLabelPanelMode,
    setLoadingLabels
} = {}) {
    const loadTenantLabels = async (tenantId) => {
        const cleanTenantId = String(tenantId || '').trim();
        if (!cleanTenantId) {
            setTenantLabels([]);
            setSelectedLabelId('');
            setLabelForm({ ...emptyLabelForm });
            setLabelPanelMode('view');
            return;
        }

        setLoadingLabels(true);
        try {
            const payload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels?includeInactive=true`);
            const items = (Array.isArray(payload?.items) ? payload.items : [])
                .map((entry) => normalizeTenantLabelItem(entry))
                .filter(Boolean)
                .sort((left, right) => {
                    const delta = Number(left?.sortOrder || 100) - Number(right?.sortOrder || 100);
                    if (delta !== 0) return delta;
                    return String(left?.name || '').localeCompare(String(right?.name || ''), 'es', { sensitivity: 'base' });
                });

            setTenantLabels(items);
            setSelectedLabelId((prev) => {
                const cleanPrev = String(prev || '').trim().toUpperCase();
                if (cleanPrev && items.some((entry) => entry.labelId === cleanPrev)) return cleanPrev;
                return String(items[0]?.labelId || '').trim().toUpperCase();
            });
        } finally {
            setLoadingLabels(false);
        }
    };

    const openTenantLabelCreate = () => {
        setLabelForm({
            ...emptyLabelForm,
            color: Array.isArray(defaultLabelColors) && defaultLabelColors.length ? defaultLabelColors[0] : '#22d3ee',
            sortOrder: '100',
            isActive: true
        });
        setLabelPanelMode('create');
    };

    const openTenantLabelEdit = () => {
        if (!selectedTenantLabel) return;
        setLabelForm(buildLabelFormFromItem(selectedTenantLabel));
        setLabelPanelMode('edit');
    };

    const cancelTenantLabelEdit = () => {
        if (selectedTenantLabel) {
            setLabelForm(buildLabelFormFromItem(selectedTenantLabel));
        } else {
            setLabelForm({ ...emptyLabelForm });
        }
        setLabelPanelMode('view');
    };

    const toggleModuleInLabelForm = (moduleId) => {
        const cleanModuleId = String(moduleId || '').trim().toLowerCase();
        if (!cleanModuleId) return;
        setLabelForm((prev) => {
            const current = Array.isArray(prev?.moduleIds) ? prev.moduleIds : [];
            const exists = current.includes(cleanModuleId);
            return {
                ...prev,
                moduleIds: exists
                    ? current.filter((entry) => entry !== cleanModuleId)
                    : [...current, cleanModuleId]
            };
        });
    };

    const saveTenantLabel = async () => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        if (!cleanTenantId) throw new Error('Selecciona una empresa para gestionar etiquetas.');
        const payload = buildTenantLabelPayload(labelForm, { allowLabelId: labelPanelMode === 'create' });
        if (!String(payload.name || '').trim()) throw new Error('Nombre de etiqueta requerido.');

        if (labelPanelMode === 'create') {
            const created = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels`, {
                method: 'POST',
                body: payload
            });
            const createdId = String(created?.item?.labelId || '').trim().toUpperCase();
            await loadTenantLabels(cleanTenantId);
            if (createdId) setSelectedLabelId(createdId);
            setLabelPanelMode('view');
            return;
        }

        const cleanLabelId = String(labelForm?.labelId || selectedLabelId || '').trim().toUpperCase();
        if (!cleanLabelId) throw new Error('Selecciona una etiqueta para actualizar.');

        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels/${encodeURIComponent(cleanLabelId)}`, {
            method: 'PUT',
            body: payload
        });
        await loadTenantLabels(cleanTenantId);
        setSelectedLabelId(cleanLabelId);
        setLabelPanelMode('view');
    };

    const deactivateTenantLabel = async (labelId) => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        const cleanLabelId = String(labelId || '').trim().toUpperCase();
        if (!cleanTenantId || !cleanLabelId) return;
        await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(cleanTenantId)}/labels/${encodeURIComponent(cleanLabelId)}/deactivate`, {
            method: 'POST'
        });
        await loadTenantLabels(cleanTenantId);
    };

    return {
        loadTenantLabels,
        openTenantLabelCreate,
        openTenantLabelEdit,
        cancelTenantLabelEdit,
        toggleModuleInLabelForm,
        saveTenantLabel,
        deactivateTenantLabel
    };
}

