import React from 'react';
import ModulesConfigModuleReadView from './ModulesConfigModuleReadView';
import ModulesConfigModuleEditForm from './ModulesConfigModuleEditForm';

export default function ModulesConfigModuleDetailPane({ context = {} }) {
    const {
        settingsTenantId,
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
        runAction,
        requestJson,
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
        moduleQuickReplyLibraryDraft,
        activeQuickReplyLibraries,
        toggleQuickReplyLibraryForModuleDraft,
        moduleUserPickerId,
        setModuleUserPickerId,
        syncQuickReplyLibrariesForModule,
        handleFormImageUpload,
        setWaModulePanelMode,
        setSelectedWaModuleId,
        setSelectedConfigKey,
        openConfigModuleView,
        clearConfigSelection
    } = context;

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

    return (
        <>
            <div className="saas-admin-pane-header">
                <div>
                    <h3>
                        {waModulePanelMode === 'create'
                            ? 'Nuevo modulo WhatsApp'
                            : isModuleEditing
                                ? `Editando modulo: ${moduleInDetail?.name || 'Sin nombre'}`
                                : moduleInDetail?.name || 'Detalle modulo'}
                    </h3>
                    <small>{isModuleEditing ? 'Edicion activa' : 'Vista de solo lectura'}</small>
                </div>
                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                    {!isModuleEditing && moduleInDetail && (
                        <>
                            <button
                                type="button"
                                disabled={busy || !moduleInDetail.isActive}
                                onClick={() => handleOpenOperation()}
                            >
                                Ir a operacion
                            </button>
                            <span style={{ fontSize: '0.72rem', color: '#8eb3c7', alignSelf: 'center' }}>Operacion: seleccion dinamica por chat</span>
                            <button type="button" disabled={busy || !canEditModules} onClick={openConfigModuleEdit}>Editar</button>
                            <button
                                type="button"
                                disabled={busy || !canEditModules}
                                onClick={() => runAction('Estado de modulo actualizado', async () => {
                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules/${encodeURIComponent(moduleInDetail.moduleId)}`, {
                                        method: 'PUT',
                                        body: {
                                            isActive: moduleInDetail.isActive === false,
                                            imageUrl: moduleInDetail.imageUrl || null
                                        }
                                    });
                                })}
                            >
                                {moduleInDetail.isActive ? 'Desactivar' : 'Activar'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {!isModuleEditing && moduleInDetail && (
                <ModulesConfigModuleReadView
                    moduleInDetail={moduleInDetail}
                    assignedLabels={assignedLabels}
                    moduleCatalogLabels={moduleCatalogLabels}
                    moduleAssistantLabel={moduleAssistantLabel}
                    moduleCloudConfig={moduleCloudConfig}
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
                    activeCatalogOptions={activeCatalogOptions}
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
                    runAction={runAction}
                    waModulePanelMode={waModulePanelMode}
                    moduleInDetail={moduleInDetail}
                    requestJson={requestJson}
                    syncQuickReplyLibrariesForModule={syncQuickReplyLibrariesForModule}
                    setWaModulePanelMode={setWaModulePanelMode}
                    setSelectedConfigKey={setSelectedConfigKey}
                    setSelectedWaModuleId={setSelectedWaModuleId}
                    openConfigModuleView={openConfigModuleView}
                    clearConfigSelection={clearConfigSelection}
                />
            )}
        </>
    );
}
