import React from 'react';
import ModulesConfigModuleReadView from './ModulesConfigModuleReadView';
import ModulesConfigModuleEditForm from './ModulesConfigModuleEditForm';

export default function ModulesConfigModuleDetailPane({ context = {} }) {
    const {
        settingsTenantId,
        requestJson,
        isModulesSection,
        waModulePanelMode,
        selectedConfigModule,
        assignedModuleUsers,
        toUserDisplayName,
        usersForSettingsTenant,
        normalizeCatalogIdsList,
        activeCatalogLabelMap,
        sanitizeAiAssistantCode,
        aiAssistantLabelMap,
        handleOpenOperation,
        openConfigModuleEdit,
        toggleWaModuleActive,
        busy,
        canEditModules,
        buildInitials,
        formatDateTimeLabel,
        waModuleForm,
        setWaModuleForm,
        CATALOG_MODE_OPTIONS,
        availableUsersForModulePicker,
        toggleAssignedUserForModule,
        activeCatalogOptions,
        toggleCatalogForModule,
        activeAiAssistantOptions,
        schedules,
        moduleQuickReplyLibraryDraft,
        activeQuickReplyLibraries,
        toggleQuickReplyLibraryForModuleDraft,
        moduleUserPickerId,
        setModuleUserPickerId,
        saveWaModule,
        handleFormImageUpload,
        openConfigModuleView,
        clearConfigSelection
    } = context;

    const [commercialProfiles, setCommercialProfiles] = React.useState([]);

    React.useEffect(() => {
        let cancelled = false;
        async function loadCommercialProfiles() {
            if (!settingsTenantId || !isModulesSection || typeof requestJson !== 'function') {
                setCommercialProfiles([]);
                return;
            }
            try {
                const payload = await requestJson('/api/tenant/commercial-intelligence/profiles', {
                    method: 'GET',
                    tenantIdOverride: settingsTenantId
                });
                if (cancelled) return;
                const profiles = Array.isArray(payload?.profiles)
                    ? payload.profiles
                        .map((profile) => ({
                            profileId: String(profile?.profileId || profile?.profile_id || '').trim(),
                            name: String(profile?.name || '').trim() || 'Perfil comercial',
                            isDefault: profile?.isDefault === true || profile?.is_default === true
                        }))
                        .filter((profile) => profile.profileId)
                    : [];
                setCommercialProfiles(profiles);
            } catch (error) {
                if (!cancelled) {
                    console.warn('[SaaS] commercial profiles unavailable for module form:', error?.message || error);
                    setCommercialProfiles([]);
                }
            }
        }
        loadCommercialProfiles();
        return () => {
            cancelled = true;
        };
    }, [isModulesSection, requestJson, settingsTenantId]);

    if (!(settingsTenantId && isModulesSection && (waModulePanelMode === 'create' || selectedConfigModule))) {
        return null;
    }

    const moduleInDetail = waModulePanelMode === 'create' ? null : selectedConfigModule;
    const isModuleEditing = waModulePanelMode === 'edit' || waModulePanelMode === 'create';
    const assignedLabels = isModuleEditing
        ? assignedModuleUsers.map((user) => toUserDisplayName(user))
        : (moduleInDetail?.assignedUserIds || []).map((userId) => {
            const match = usersForSettingsTenant.find((user) => String(user?.id || '').trim() === String(userId || '').trim());
            return match ? toUserDisplayName(match) : 'Usuario no disponible';
        });
    const moduleCloudConfig = moduleInDetail?.cloudConfig && typeof moduleInDetail.cloudConfig === 'object'
        ? moduleInDetail.cloudConfig
        : {};
    const moduleCatalogIds = normalizeCatalogIdsList(moduleInDetail?.catalogIds || []);
    const moduleCatalogLabels = moduleCatalogIds.map((catalogId) => activeCatalogLabelMap.get(catalogId) || catalogId);
    const moduleAssistantId = sanitizeAiAssistantCode(moduleInDetail?.moduleAiAssistantId || '');
    const moduleAssistantLabel = moduleAssistantId
        ? (aiAssistantLabelMap.get(moduleAssistantId) || moduleAssistantId)
        : 'Asistente principal del tenant';
    const moduleCommercialProfileId = String(moduleInDetail?.aiConfig?.commercialProfileId || '').trim();
    const moduleCommercialProfile = commercialProfiles.find((profile) => profile.profileId === moduleCommercialProfileId) || null;
    const moduleCommercialProfileLabel = moduleCommercialProfileId
        ? (moduleCommercialProfile?.name || moduleCommercialProfileId)
        : 'Perfil comercial por defecto';
    const activeSchedules = Array.isArray(schedules) ? schedules.filter((item) => item?.isActive !== false) : [];
    const selectedSchedule = activeSchedules.find((item) => String(item?.scheduleId || '').trim() === String(moduleInDetail?.scheduleId || '').trim()) || null;

    return (
        <>
            {!isModuleEditing && moduleInDetail && (
                <ModulesConfigModuleReadView
                    moduleInDetail={moduleInDetail}
                    assignedLabels={assignedLabels}
                    moduleCatalogLabels={moduleCatalogLabels}
                    moduleAssistantLabel={moduleAssistantLabel}
                    moduleCommercialProfileLabel={moduleCommercialProfileLabel}
                    moduleCloudConfig={moduleCloudConfig}
                    selectedSchedule={selectedSchedule}
                    buildInitials={buildInitials}
                    formatDateTimeLabel={formatDateTimeLabel}
                />
            )}

            {isModuleEditing && (
                <ModulesConfigModuleEditForm
                    settingsTenantId={settingsTenantId}
                    busy={busy}
                    canEditModules={canEditModules}
                    waModuleForm={waModuleForm}
                    setWaModuleForm={setWaModuleForm}
                    CATALOG_MODE_OPTIONS={CATALOG_MODE_OPTIONS}
                    sanitizeAiAssistantCode={sanitizeAiAssistantCode}
                    activeAiAssistantOptions={activeAiAssistantOptions}
                    schedules={activeSchedules}
                    activeCatalogOptions={activeCatalogOptions}
                    commercialProfiles={commercialProfiles}
                    normalizeCatalogIdsList={normalizeCatalogIdsList}
                    toggleCatalogForModule={toggleCatalogForModule}
                    activeQuickReplyLibraries={activeQuickReplyLibraries}
                    moduleQuickReplyLibraryDraft={moduleQuickReplyLibraryDraft}
                    toggleQuickReplyLibraryForModuleDraft={toggleQuickReplyLibraryForModuleDraft}
                    handleFormImageUpload={handleFormImageUpload}
                    moduleUserPickerId={moduleUserPickerId}
                    setModuleUserPickerId={setModuleUserPickerId}
                    availableUsersForModulePicker={availableUsersForModulePicker}
                    toUserDisplayName={toUserDisplayName}
                    toggleAssignedUserForModule={toggleAssignedUserForModule}
                    assignedModuleUsers={assignedModuleUsers}
                    waModulePanelMode={waModulePanelMode}
                    moduleInDetail={moduleInDetail}
                    saveWaModule={saveWaModule}
                    openConfigModuleView={openConfigModuleView}
                    clearConfigSelection={clearConfigSelection}
                />
            )}
        </>
    );
}
