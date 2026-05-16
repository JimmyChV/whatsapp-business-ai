import { useCallback } from 'react';
import {
    normalizeWaModule,
    sanitizeAiAssistantCode,
    resolveQuickReplyLibraryIdsForModule
} from '../../../helpers';

export default function useSaasWaModuleEditor({
    quickReplyLibraries = [],
    emptyWaModuleForm,
    emptyIntegrationsForm,
    emptyTenantCatalogForm,
    emptyCustomerForm,
    emptyAiAssistantForm,
    emptyRoleForm,
    normalizePlanForm,
    setWaModuleForm,
    setTenantIntegrations,
    setTenantCatalogForm,
    setSelectedPlanId,
    setPlanForm,
    setRoleForm,
    setEditingWaModuleId,
    setModuleUserPickerId,
    setModuleQuickReplyLibraryDraft,
    setSelectedCustomerId,
    setCustomerPanelMode,
    setCustomerForm,
    setCustomerSearch,
    setCustomerCsvText,
    setSelectedAiAssistantId,
    setAiAssistantPanelMode,
    setAiAssistantForm,
    setCustomerImportModuleId,
    setSelectedWaModuleId
} = {}) {
    const resetWaModuleForm = useCallback(() => {
        setWaModuleForm(emptyWaModuleForm);
        setTenantIntegrations(emptyIntegrationsForm);
        setTenantCatalogForm(emptyTenantCatalogForm);
        setSelectedPlanId('');
        setPlanForm(normalizePlanForm('starter', {}));
        setRoleForm(emptyRoleForm);
        setEditingWaModuleId('');
        setModuleUserPickerId('');
        setModuleQuickReplyLibraryDraft([]);
        setSelectedCustomerId('');
        setCustomerPanelMode('view');
        setCustomerForm(emptyCustomerForm);
        setCustomerSearch('');
        setCustomerCsvText('');
        setSelectedAiAssistantId('');
        setAiAssistantPanelMode('view');
        setAiAssistantForm({ ...emptyAiAssistantForm });
        setCustomerImportModuleId('');
    }, [
        emptyAiAssistantForm,
        emptyCustomerForm,
        emptyIntegrationsForm,
        emptyRoleForm,
        emptyTenantCatalogForm,
        emptyWaModuleForm,
        normalizePlanForm,
        setAiAssistantForm,
        setAiAssistantPanelMode,
        setCustomerCsvText,
        setCustomerForm,
        setCustomerImportModuleId,
        setCustomerPanelMode,
        setCustomerSearch,
        setEditingWaModuleId,
        setModuleQuickReplyLibraryDraft,
        setModuleUserPickerId,
        setPlanForm,
        setRoleForm,
        setSelectedAiAssistantId,
        setSelectedCustomerId,
        setSelectedPlanId,
        setTenantCatalogForm,
        setTenantIntegrations,
        setWaModuleForm
    ]);

    const openWaModuleEditor = useCallback((moduleItem = null) => {
        const item = normalizeWaModule(moduleItem || {});
        if (!item) {
            resetWaModuleForm();
            return;
        }

        setSelectedWaModuleId(item.moduleId);
        setEditingWaModuleId(item.moduleId);
        const waitSeconds = Number.isFinite(Number(item?.aiConfig?.waitSeconds))
            ? Math.max(5, Math.min(300, Number(item.aiConfig.waitSeconds)))
            : (Number.isFinite(Number(item?.aiConfig?.waitMinutes)) ? Math.max(5, Math.min(300, Number(item.aiConfig.waitMinutes) * 60)) : 15);

        setWaModuleForm({
            moduleId: item.moduleId,
            name: item.name,
            phoneNumber: item.phoneNumber || '',
            transportMode: item.transportMode || 'cloud',
            imageUrl: item.imageUrl || '',
            assignedUserIds: [...(item.assignedUserIds || [])],
            catalogIds: [...(item.catalogIds || [])],
            aiAssistantId: sanitizeAiAssistantCode(item.moduleAiAssistantId || ''),
            scheduleId: item.scheduleId || '',
            aiAssistantName: item?.aiConfig?.assistantName || 'Patty',
            aiWithinHoursMode: item?.aiConfig?.withinHoursMode || 'review',
            aiOutsideHoursMode: item?.aiConfig?.outsideHoursMode || 'autonomous',
            aiWaitSeconds: waitSeconds,
            moduleCatalogMode: item.moduleCatalogMode || 'inherit',
            moduleAiEnabled: item?.moduleFeatureFlags?.aiPro !== false,
            moduleCatalogEnabled: item?.moduleFeatureFlags?.catalog !== false,
            moduleCartEnabled: item?.moduleFeatureFlags?.cart !== false,
            moduleQuickRepliesEnabled: item?.moduleFeatureFlags?.quickReplies !== false,
            cloudAppId: item?.cloudConfig?.appId || '',
            cloudWabaId: item?.cloudConfig?.wabaId || '',
            cloudPhoneNumberId: item?.cloudConfig?.phoneNumberId || '',
            cloudVerifyToken: item?.cloudConfig?.verifyToken || '',
            cloudGraphVersion: item?.cloudConfig?.graphVersion || 'v22.0',
            cloudDisplayPhoneNumber: item?.cloudConfig?.displayPhoneNumber || '',
            cloudBusinessName: item?.cloudConfig?.businessName || '',
            cloudAppSecret: '',
            cloudSystemUserToken: '',
            cloudAppSecretMasked: item?.cloudConfig?.appSecretMasked || '',
            cloudSystemUserTokenMasked: item?.cloudConfig?.systemUserTokenMasked || '',
            cloudEnforceSignature: item?.cloudConfig?.enforceSignature !== false
        });
        setModuleUserPickerId('');
        setModuleQuickReplyLibraryDraft(resolveQuickReplyLibraryIdsForModule(item.moduleId, quickReplyLibraries));
    }, [
        quickReplyLibraries,
        resetWaModuleForm,
        setEditingWaModuleId,
        setModuleQuickReplyLibraryDraft,
        setModuleUserPickerId,
        setSelectedWaModuleId,
        setWaModuleForm
    ]);

    return {
        resetWaModuleForm,
        openWaModuleEditor
    };
}
