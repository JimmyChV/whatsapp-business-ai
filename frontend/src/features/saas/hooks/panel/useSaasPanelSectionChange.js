import { useCallback } from 'react';

export default function useSaasPanelSectionChange({
    isSectionEnabled,
    setSelectedTenantId,
    setTenantPanelMode,
    setSelectedUserId,
    setUserPanelMode,
    setMembershipDraft,
    setSelectedRoleKey,
    setRolePanelMode,
    setRoleForm,
    emptyRoleForm,
    setSelectedCustomerId,
    setCustomerPanelMode,
    setSelectedAiAssistantId,
    setAiAssistantPanelMode,
    setAiAssistantForm,
    emptyAiAssistantForm,
    setSelectedLabelId,
    setLabelPanelMode,
    setLabelForm,
    emptyLabelForm,
    setSelectedQuickReplyLibraryId,
    setSelectedQuickReplyItemId,
    setQuickReplyModuleFilterId,
    setQuickReplyLibraryPanelMode,
    setQuickReplyItemPanelMode,
    setQuickReplyLibraryForm,
    emptyQuickReplyLibraryForm,
    setQuickReplyItemForm,
    emptyQuickReplyItemForm,
    clearConfigSelection,
    setCurrentSection
} = {}) {
    return useCallback((sectionId) => {
        const next = String(sectionId || '').trim();
        if (!next) return;
        if (typeof isSectionEnabled === 'function' && !isSectionEnabled(next)) return;

        if (next === 'saas_empresas') {
            setSelectedTenantId('');
            setTenantPanelMode('view');
        }

        if (next === 'saas_usuarios') {
            setSelectedUserId('');
            setUserPanelMode('view');
            setMembershipDraft([]);
        }

        if (next === 'saas_roles') {
            setSelectedRoleKey('');
            setRolePanelMode('view');
            setRoleForm(emptyRoleForm);
        }

        if (next === 'saas_clientes') {
            setSelectedCustomerId('');
            setCustomerPanelMode('view');
        }

        if (next === 'saas_ia') {
            setSelectedAiAssistantId('');
            setAiAssistantPanelMode('view');
            setAiAssistantForm({ ...emptyAiAssistantForm });
        }

        if (next === 'saas_etiquetas') {
            setSelectedLabelId('');
            setLabelPanelMode('view');
            setLabelForm({ ...emptyLabelForm });
        }

        if (next === 'saas_quick_replies') {
            setSelectedQuickReplyLibraryId('');
            setSelectedQuickReplyItemId('');
            setQuickReplyModuleFilterId('');
            setQuickReplyLibraryPanelMode('view');
            setQuickReplyItemPanelMode('view');
            setQuickReplyLibraryForm({ ...emptyQuickReplyLibraryForm });
            setQuickReplyItemForm({ ...emptyQuickReplyItemForm });
        }

        if (next === 'saas_config' || next === 'saas_modulos') {
            clearConfigSelection();
        }

        setCurrentSection(next);
    }, [
        clearConfigSelection,
        emptyAiAssistantForm,
        emptyLabelForm,
        emptyQuickReplyItemForm,
        emptyQuickReplyLibraryForm,
        emptyRoleForm,
        isSectionEnabled,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setCurrentSection,
        setCustomerPanelMode,
        setLabelForm,
        setLabelPanelMode,
        setMembershipDraft,
        setQuickReplyItemForm,
        setQuickReplyItemPanelMode,
        setQuickReplyLibraryForm,
        setQuickReplyLibraryPanelMode,
        setQuickReplyModuleFilterId,
        setRoleForm,
        setRolePanelMode,
        setSelectedAiAssistantId,
        setSelectedCustomerId,
        setSelectedLabelId,
        setSelectedQuickReplyItemId,
        setSelectedQuickReplyLibraryId,
        setSelectedRoleKey,
        setSelectedTenantId,
        setSelectedUserId,
        setTenantPanelMode,
        setUserPanelMode
    ]);
}
