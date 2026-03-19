import React from 'react';

function ModulesConfigSection({
    isGeneralConfigSection,
    isModulesSection,
    settingsTenantId,
    toTenantDisplayName,
    tenantOptions,
    busy,
    canEditModules,
    openConfigModuleCreate,
    openConfigSettingsView,
    clearConfigSelection,
    tenantSettings,
    MODULE_KEYS,
    waModules,
    selectedConfigKey,
    openConfigModuleView,
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
    setTenantSettingsPanelMode,
    loadTenantSettings,
    setBusy,
    setError,
    loadingSettings,
    tenantSettingsPanelMode,
    setTenantSettings,
    CATALOG_MODE_OPTIONS,
    formatDateTimeLabel,
    buildInitials,
    waModuleForm,
    setWaModuleForm,
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
    ImageDropInput,
    canEditTenantSettings,
    setWaModulePanelMode,
    setSelectedWaModuleId,
    setSelectedConfigKey
}) {
    if (!(isGeneralConfigSection || isModulesSection)) {
        return null;
    }

    return (
                    <section id={isModulesSection ? 'saas_modulos' : 'saas_config'} className="saas-admin-card saas-admin-card--full">
                        <div className="saas-admin-master-detail">
                            <aside className="saas-admin-master-pane">
                                <div className="saas-admin-pane-header">
                                    <h3>{isModulesSection ? 'Modulos' : 'Configuracion general'}</h3>
                                    <small>
                                        {settingsTenantId
                                            ? `Empresa: ${toTenantDisplayName(tenantOptions.find((tenant) => tenant.id === settingsTenantId) || {})}`
                                            : 'Selecciona una empresa para administrar su panel.'}
                                    </small>
                                </div>

                                <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                    {isModulesSection && (
                                        <button type="button" disabled={busy || !settingsTenantId || !canEditModules} onClick={openConfigModuleCreate}>
                                            Nuevo modulo
                                        </button>
                                    )}
                                    {isGeneralConfigSection && (
                                        <button type="button" disabled={busy || !settingsTenantId} onClick={openConfigSettingsView}>
                                            Abrir configuracion general
                                        </button>
                                    )}
                                    <button type="button" disabled={busy} onClick={clearConfigSelection}>
                                        Deseleccionar
                                    </button>
                                </div>

                                <div className="saas-admin-list saas-admin-list--compact">
                                    {!settingsTenantId && (
                                        <div className="saas-admin-empty-state">
                                            <h4>Sin empresa seleccionada</h4>
                                            <p>Elige una empresa para ver su configuracion.</p>
                                        </div>
                                    )}

                                    {settingsTenantId && isGeneralConfigSection && (
                                        <button
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedConfigKey === 'tenant_settings' ? 'active' : ''}`.trim()}
                                            onClick={openConfigSettingsView}
                                        >
                                            <strong>Perfil de empresa</strong>
                                            <small>Catalogo: {tenantSettings.catalogMode}</small>
                                            <small>Modulos habilitados: {MODULE_KEYS.filter((entry) => tenantSettings?.enabledModules?.[entry.key] !== false).length}/{MODULE_KEYS.length}</small>
                                        </button>
                                    )}

                                    {settingsTenantId && isModulesSection && waModules.length === 0 && (
                                        <div className="saas-admin-empty-inline">Sin modulos WhatsApp configurados.</div>
                                    )}

                                    {settingsTenantId && isModulesSection && waModules.map((moduleItem) => (
                                        <button
                                            key={moduleItem.moduleId}
                                            type="button"
                                            className={`saas-admin-list-item saas-admin-list-item--button ${selectedConfigKey === `wa_module:${moduleItem.moduleId}` ? 'active' : ''}`.trim()}
                                            onClick={() => openConfigModuleView(moduleItem.moduleId)}
                                        >
                                            <strong>{moduleItem.name || 'Modulo sin nombre'}</strong>
                                            <small>Cloud API | {moduleItem.isActive ? 'activo' : 'inactivo'}</small>
                                            <small>{moduleItem.phoneNumber ? `Numero: ${moduleItem.phoneNumber}` : 'Numero sin configurar'}</small>
                                        </button>
                                    ))}
                                </div>
                            </aside>

                            <div className="saas-admin-detail-pane">
                                {!settingsTenantId && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>{isModulesSection ? 'Modulos por empresa' : 'Configuracion por empresa'}</h4>
                                        <p>Selecciona una empresa en el panel izquierdo para ver el detalle.</p>
                                    </div>
                                )}

                                {settingsTenantId && !selectedConfigKey && (isGeneralConfigSection || (isModulesSection && waModulePanelMode !== 'create')) && (
                                    <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                                        <h4>Sin elemento seleccionado</h4>
                                        <p>{isModulesSection ? 'Selecciona un modulo WhatsApp para ver su detalle.' : 'Selecciona el perfil de empresa para ver su detalle.'}</p>
                                    </div>
                                )}

                                {settingsTenantId && isGeneralConfigSection && selectedConfigKey === 'tenant_settings' && (
                                    <>
                                        <div className="saas-admin-pane-header">
                                            <div>
                                                <h3>Perfil de empresa</h3>
                                                <small>{tenantSettingsPanelMode === 'edit' ? 'Edicion activa' : 'Vista de solo lectura'}</small>
                                            </div>
                                            <div className="saas-admin-list-actions saas-admin-list-actions--row">
                                                {false && (
                                                    <button type="button" disabled={busy || loadingSettings || !canEditTenantSettings} onClick={openConfigSettingsEdit}>
                                                        Editar
                                                    </button>
                                                )}
                                                {false && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            disabled={busy || loadingSettings}
                                                            onClick={() => runAction('Configuracion de tenant guardada', async () => {
                                                                await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/settings`, {
                                                                    method: 'PUT',
                                                                    body: {
                                                                        catalogMode: tenantSettings.catalogMode,
                                                                        enabledModules: tenantSettings.enabledModules
                                                                    }
                                                                });
                                                                setTenantSettingsPanelMode('view');
                                                            })}
                                                        >
                                                            Guardar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy || loadingSettings}
                                                            onClick={async () => {
                                                                try {
                                                                    setBusy(true);
                                                                    await loadTenantSettings(settingsTenantId);
                                                                    setTenantSettingsPanelMode('view');
                                                                } catch (err) {
                                                                    setError(String(err?.message || err || 'No se pudo recargar la configuracion.'));
                                                                } finally {
                                                                    setBusy(false);
                                                                }
                                                            }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {tenantSettingsPanelMode === 'view' && (
                                            <>
                                                <div className="saas-admin-detail-grid">
                                                    <div className="saas-admin-detail-field"><span>Catalogo</span><strong>{tenantSettings.catalogMode}</strong></div>
                                                    <div className="saas-admin-detail-field"><span>Modulos habilitados</span><strong>{MODULE_KEYS.filter((entry) => tenantSettings?.enabledModules?.[entry.key] !== false).length}</strong></div>
                                                </div>
                                                <div className="saas-admin-related-block">
                                                    <h4>Estado funcional</h4>
                                                    <div className="saas-admin-related-list">
                                                        {MODULE_KEYS.map((entry) => (
                                                            <div key={`cfg_enabled_${entry.key}`} className="saas-admin-related-row" role="status">
                                                                <span>{entry.label}</span>
                                                                <small>{tenantSettings?.enabledModules?.[entry.key] !== false ? 'Habilitado' : 'Deshabilitado'}</small>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {false && (
                                                    <>
                                                <div className="saas-admin-form-row">
                                                    <select
                                                        value={tenantSettings.catalogMode}
                                                        onChange={(event) => setTenantSettings((prev) => ({ ...prev, catalogMode: event.target.value }))}
                                                        disabled={!settingsTenantId || loadingSettings || busy}
                                                    >
                                                        {CATALOG_MODE_OPTIONS.map((mode) => (
                                                            <option key={mode} value={mode}>{mode}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="saas-admin-modules">
                                                    {MODULE_KEYS.map((moduleEntry) => (
                                                        <label key={`cfg_enabled_${moduleEntry.key}`} className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={tenantSettings?.enabledModules?.[moduleEntry.key] !== false}
                                                                disabled={!settingsTenantId || loadingSettings || busy}
                                                                onChange={(event) => setTenantSettings((prev) => ({
                                                                    ...prev,
                                                                    enabledModules: {
                                                                        ...(prev?.enabledModules || {}),
                                                                        [moduleEntry.key]: event.target.checked
                                                                    }
                                                                }))}
                                                            />
                                                            <span>{moduleEntry.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}

                                {settingsTenantId && isModulesSection && (waModulePanelMode === 'create' || selectedConfigModule) && (() => {
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
                                                <>
                                                    <div className="saas-admin-hero">
                                                        <div className="saas-admin-hero-media">
                                                            {moduleInDetail.imageUrl
                                                                ? <img src={moduleInDetail.imageUrl} alt={moduleInDetail.name || 'Modulo'} className="saas-admin-hero-image" />
                                                                : <div className="saas-admin-hero-placeholder">{buildInitials(moduleInDetail.name || moduleInDetail.moduleId)}</div>}
                                                        </div>
                                                        <div className="saas-admin-hero-content">
                                                            <h4>{moduleInDetail.name || 'Modulo sin nombre'}</h4>
                                                            <p>{moduleInDetail.phoneNumber || 'Sin numero vinculado'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="saas-admin-detail-grid">
                                                        <div className="saas-admin-detail-field"><span>Codigo</span><strong>{moduleInDetail?.moduleId || '-'}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Transporte</span><strong>Cloud API</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Telefono</span><strong>{moduleInDetail.phoneNumber || 'Sin numero'}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Estado</span><strong>{moduleInDetail.isActive ? 'Activo' : 'Inactivo'}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Usuarios asignados</span><strong>{assignedLabels.length}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Catalogos asignados</span><strong>{moduleCatalogLabels.length}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Asistente IA</span><strong>{moduleAssistantLabel}</strong></div>
                                                        <div className="saas-admin-detail-field"><span>Actualizado</span><strong>{formatDateTimeLabel(moduleInDetail.updatedAt)}</strong></div>
                                                    </div>

                                                    {moduleInDetail.imageUrl && (
                                                        <div className="saas-admin-preview-strip">
                                                            <img src={moduleInDetail.imageUrl} alt={moduleInDetail.name || 'Modulo'} className="saas-admin-preview-thumb" />
                                                        </div>
                                                    )}

                                                    <div className="saas-admin-related-block">
                                                        <h4>Usuarios del modulo</h4>
                                                        <div className="saas-admin-related-list">
                                                            {assignedLabels.length === 0 && <div className="saas-admin-empty-inline">Sin usuarios asignados.</div>}
                                                            {assignedLabels.map((label, index) => (
                                                                <div key={`assigned_label_${index}`} className="saas-admin-related-row" role="status">
                                                                    <span>{label}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Catalogos del modulo</h4>
                                                        <div className="saas-admin-related-list">
                                                            {moduleCatalogLabels.length === 0 && <div className="saas-admin-empty-inline">Sin catalogos asignados.</div>}
                                                            {moduleCatalogLabels.map((label, index) => (
                                                                <div key={`module_catalog_label_${index}`} className="saas-admin-related-row" role="status">
                                                                    <span>{label}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Configuracion Meta Cloud</h4>
                                                        <div className="saas-admin-detail-grid">
                                                            <div className="saas-admin-detail-field"><span>META_APP_ID</span><strong>{moduleCloudConfig.appId || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_WABA_ID</span><strong>{moduleCloudConfig.wabaId || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_WABA_PHONE_NUMBER_ID</span><strong>{moduleCloudConfig.phoneNumberId || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_VERIFY_TOKEN</span><strong>{moduleCloudConfig.verifyToken || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_GRAPH_VERSION</span><strong>{moduleCloudConfig.graphVersion || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_DISPLAY_PHONE_NUMBER</span><strong>{moduleCloudConfig.displayPhoneNumber || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_BUSINESS_NAME</span><strong>{moduleCloudConfig.businessName || '-'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_ENFORCE_SIGNATURE</span><strong>{moduleCloudConfig.enforceSignature === false ? 'false' : 'true'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_APP_SECRET</span><strong>{moduleCloudConfig.appSecretMasked || 'No configurado'}</strong></div>
                                                            <div className="saas-admin-detail-field"><span>META_SYSTEM_USER_TOKEN</span><strong>{moduleCloudConfig.systemUserTokenMasked || 'No configurado'}</strong></div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            {isModuleEditing && (
                                                <>
                                                    <div className="saas-admin-form-row">
                                                        <input
                                                            value={waModuleForm.name}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, name: event.target.value }))}
                                                            placeholder="Nombre del modulo"
                                                            disabled={!settingsTenantId || busy}
                                                        />
                                                        <select
                                                            value={waModuleForm.transportMode}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, transportMode: event.target.value }))}
                                                            disabled={!settingsTenantId || busy || !canEditModules}
                                                        >
                                                            <option value="cloud">Cloud API</option>
                                                        </select>
                                                    </div>

                                                    <div className="saas-admin-form-row">
                                                        <input
                                                            value={waModuleForm.phoneNumber}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                                                            placeholder="Numero (ej: +51999999999)"
                                                            disabled={!settingsTenantId || busy}
                                                        />
                                                        <select
                                                            value={waModuleForm.moduleCatalogMode}
                                                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleCatalogMode: event.target.value }))}
                                                            disabled={!settingsTenantId || busy}
                                                        >
                                                            <option value="inherit">Catalogo: heredar empresa</option>
                                                            {CATALOG_MODE_OPTIONS.map((mode) => (
                                                                <option key={`module_catalog_${mode}`} value={mode}>{`Catalogo: ${mode}`}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="saas-admin-form-row">
                                                        <div className="saas-admin-field">
                                                            <label htmlFor="wa-module-ai-assistant">Asistente IA del modulo</label>
                                                            <select
                                                                id="wa-module-ai-assistant"
                                                                value={waModuleForm.aiAssistantId}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiAssistantId: sanitizeAiAssistantCode(event.target.value || '') }))}
                                                                disabled={!settingsTenantId || busy}
                                                            >
                                                                <option value="">Usar asistente principal del tenant</option>
                                                                {activeAiAssistantOptions.map((assistant) => (
                                                                    <option key={`wa_module_ai_${assistant.assistantId}`} value={assistant.assistantId}>
                                                                        {assistant.name || assistant.assistantId}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Catalogos asignados al modulo</h4>
                                                        <small>Selecciona uno o mas catalogos activos para este modulo.</small>
                                                        <div className="saas-admin-modules">
                                                            {activeCatalogOptions.length === 0 && (
                                                                <div className="saas-admin-empty-inline">No hay catalogos activos. Crea uno en la pestana Catalogos.</div>
                                                            )}
                                                            {activeCatalogOptions.map((catalogItem) => {
                                                                const catalogId = String(catalogItem?.catalogId || '').trim().toUpperCase();
                                                                const checked = normalizeCatalogIdsList(waModuleForm.catalogIds || []).includes(catalogId);
                                                                return (
                                                                    <label key={`module_catalog_${catalogId}`} className="saas-admin-module-toggle">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={() => toggleCatalogForModule(catalogId)}
                                                                            disabled={!settingsTenantId || busy}
                                                                        />
                                                                        <span>{catalogItem?.name || catalogId}</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Bibliotecas de respuestas rapidas</h4>
                                                        <small>Selecciona las bibliotecas especificas para este modulo. Las compartidas aplican siempre.</small>
                                                        <div className="saas-admin-modules">
                                                            {activeQuickReplyLibraries.length === 0 && (
                                                                <div className="saas-admin-empty-inline">No hay bibliotecas activas. Crea bibliotecas en la pestana Respuestas rapidas.</div>
                                                            )}
                                                            {activeQuickReplyLibraries.map((library) => {
                                                                const libraryId = String(library?.libraryId || '').trim().toUpperCase();
                                                                if (!libraryId) return null;
                                                                const isShared = library?.isShared === true;
                                                                const checked = isShared ? true : moduleQuickReplyLibraryDraft.includes(libraryId);
                                                                return (
                                                                    <label key={`module_qr_library_${libraryId}`} className="saas-admin-module-toggle">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={() => !isShared && toggleQuickReplyLibraryForModuleDraft(libraryId)}
                                                                            disabled={!settingsTenantId || busy || isShared}
                                                                        />
                                                                        <span>
                                                                            {library?.name || libraryId}
                                                                            {isShared ? ' (compartida, aplica a todos)' : ''}
                                                                        </span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-modules">
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleAiEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleAiEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>IA habilitada</span>
                                                        </label>
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleCatalogEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleCatalogEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>Catalogo habilitado</span>
                                                        </label>
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleCartEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleCartEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>Carrito habilitado</span>
                                                        </label>
                                                        <label className="saas-admin-module-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={waModuleForm.moduleQuickRepliesEnabled !== false}
                                                                onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleQuickRepliesEnabled: event.target.checked }))}
                                                                disabled={!settingsTenantId || busy}
                                                            />
                                                            <span>Respuestas rapidas habilitadas</span>
                                                        </label>
                                                    </div>

                                                    <div className="saas-admin-form-row">
                                                        <ImageDropInput
                                                            label="Reemplazar imagen del modulo"
                                                            disabled={busy}
                                                            onFile={(file) => handleFormImageUpload({
                                                                file,
                                                                scope: 'wa_module_image',
                                                                tenantId: settingsTenantId,
                                                                onUploaded: (url) => setWaModuleForm((prev) => ({ ...prev, imageUrl: url }))
                                                            })}
                                                        />
                                                    </div>

                                                    {waModuleForm.imageUrl && (
                                                        <div className="saas-admin-preview-strip">
                                                            <img src={waModuleForm.imageUrl} alt="Imagen modulo" className="saas-admin-preview-thumb" />
                                                        </div>
                                                    )}

                                                    <div className="saas-admin-form-row">
                                                        <select
                                                            value={moduleUserPickerId}
                                                            onChange={(event) => setModuleUserPickerId(String(event.target.value || '').trim())}
                                                            disabled={!settingsTenantId || busy || availableUsersForModulePicker.length === 0}
                                                        >
                                                            <option value="">Seleccionar usuario para el modulo</option>
                                                            {availableUsersForModulePicker.map((user) => (
                                                                <option key={`wa_module_user_picker_${user.id}`} value={user.id}>{toUserDisplayName(user)}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            disabled={busy || !moduleUserPickerId}
                                                            onClick={() => toggleAssignedUserForModule(moduleUserPickerId)}
                                                        >
                                                            Agregar usuario
                                                        </button>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Usuarios asignados</h4>
                                                        <div className="saas-admin-related-list">
                                                            {assignedModuleUsers.length === 0 && (
                                                                <div className="saas-admin-empty-inline">No hay usuarios asignados al modulo.</div>
                                                            )}
                                                            {assignedModuleUsers.map((user) => (
                                                                <button
                                                                    key={`assigned_user_${user.id}`}
                                                                    type="button"
                                                                    className="saas-admin-related-row"
                                                                    onClick={() => toggleAssignedUserForModule(user.id)}
                                                                    disabled={busy}
                                                                >
                                                                    <span>{toUserDisplayName(user)}</span>
                                                                    <small>Quitar del modulo</small>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-related-block">
                                                        <h4>Credenciales Meta Cloud</h4>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-app-id">META_APP_ID</label>
                                                                <input
                                                                    id="wa-module-meta-app-id"
                                                                    value={waModuleForm.cloudAppId}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudAppId: event.target.value }))}
                                                                    placeholder="ID de la app de Meta"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-waba-id">META_WABA_ID</label>
                                                                <input
                                                                    id="wa-module-meta-waba-id"
                                                                    value={waModuleForm.cloudWabaId}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudWabaId: event.target.value }))}
                                                                    placeholder="ID de la cuenta WABA"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-phone-id">META_WABA_PHONE_NUMBER_ID</label>
                                                                <input
                                                                    id="wa-module-meta-phone-id"
                                                                    value={waModuleForm.cloudPhoneNumberId}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudPhoneNumberId: event.target.value }))}
                                                                    placeholder="ID del numero de telefono en Meta"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-verify-token">META_VERIFY_TOKEN</label>
                                                                <input
                                                                    id="wa-module-meta-verify-token"
                                                                    value={waModuleForm.cloudVerifyToken}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudVerifyToken: event.target.value }))}
                                                                    placeholder="Token de verificacion del webhook"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-graph-version">META_GRAPH_VERSION</label>
                                                                <input
                                                                    id="wa-module-meta-graph-version"
                                                                    value={waModuleForm.cloudGraphVersion}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudGraphVersion: event.target.value }))}
                                                                    placeholder="Version Graph API (ej: v22.0)"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-display-phone">META_DISPLAY_PHONE_NUMBER</label>
                                                                <input
                                                                    id="wa-module-meta-display-phone"
                                                                    value={waModuleForm.cloudDisplayPhoneNumber}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudDisplayPhoneNumber: event.target.value }))}
                                                                    placeholder="Numero visible (ej: 519XXXXXXXX)"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-business-name">META_BUSINESS_NAME</label>
                                                                <input
                                                                    id="wa-module-meta-business-name"
                                                                    value={waModuleForm.cloudBusinessName}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudBusinessName: event.target.value }))}
                                                                    placeholder="Nombre comercial mostrado"
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-app-secret">META_APP_SECRET</label>
                                                                <input
                                                                    id="wa-module-meta-app-secret"
                                                                    type="password"
                                                                    value={waModuleForm.cloudAppSecret}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudAppSecret: event.target.value }))}
                                                                    placeholder={waModuleForm.cloudAppSecretMasked || 'Secreto de la app (opcional para actualizar)'}
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-form-row">
                                                            <div className="saas-admin-field">
                                                                <label htmlFor="wa-module-meta-system-user-token">META_SYSTEM_USER_TOKEN</label>
                                                                <input
                                                                    id="wa-module-meta-system-user-token"
                                                                    type="password"
                                                                    value={waModuleForm.cloudSystemUserToken}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudSystemUserToken: event.target.value }))}
                                                                    placeholder={waModuleForm.cloudSystemUserTokenMasked || 'Token de usuario del sistema (opcional para actualizar)'}
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                            </div>
                                                            <div className="saas-admin-field">
                                                                <label>Estado actual de secretos</label>
                                                                <input
                                                                    value={[
                                                                        waModuleForm.cloudAppSecretMasked ? 'APP_SECRET: configurado' : 'APP_SECRET: vacio',
                                                                        waModuleForm.cloudSystemUserTokenMasked ? 'SYSTEM_USER_TOKEN: configurado' : 'SYSTEM_USER_TOKEN: vacio'
                                                                    ].join(' | ')}
                                                                    disabled
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="saas-admin-modules">
                                                            <label className="saas-admin-module-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={waModuleForm.cloudEnforceSignature !== false}
                                                                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudEnforceSignature: event.target.checked }))}
                                                                    disabled={!settingsTenantId || busy}
                                                                />
                                                                <span>META_ENFORCE_SIGNATURE (validar firma X-Hub-Signature-256)</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div className="saas-admin-form-row saas-admin-form-row--actions">
                                                        <button
                                                            type="button"
                                                            disabled={busy || !settingsTenantId || !waModuleForm.name.trim() || !canEditModules}
                                                            onClick={() => runAction(waModulePanelMode === 'create' ? 'Modulo WA creado' : 'Modulo WA actualizado', async () => {
                                                                const existingMetadata = moduleInDetail?.metadata && typeof moduleInDetail.metadata === 'object'
                                                                    ? moduleInDetail.metadata
                                                                    : {};
                                                                const existingCloudConfig = existingMetadata?.cloudConfig && typeof existingMetadata.cloudConfig === 'object'
                                                                    ? existingMetadata.cloudConfig
                                                                    : {};
                                                                const payload = {
                                                                    name: waModuleForm.name,
                                                                    phoneNumber: waModuleForm.phoneNumber,
                                                                    transportMode: 'cloud',
                                                                    imageUrl: waModuleForm.imageUrl || null,
                                                                    assignedUserIds: (Array.isArray(waModuleForm.assignedUserIds) ? waModuleForm.assignedUserIds : [])
                                                                        .map((entry) => String(entry || '').trim())
                                                                        .filter(Boolean),
                                                                    catalogIds: (Array.isArray(waModuleForm.catalogIds) ? waModuleForm.catalogIds : [])
                                                                        .map((entry) => String(entry || '').trim().toUpperCase())
                                                                        .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry)),
                                                                    metadata: {
                                                                        ...existingMetadata,
                                                                        moduleSettings: {
                                                                            catalogMode: waModuleForm.moduleCatalogMode || 'inherit',
                                                                            catalogIds: (Array.isArray(waModuleForm.catalogIds) ? waModuleForm.catalogIds : [])
                                                                                .map((entry) => String(entry || '').trim().toUpperCase())
                                                                                .filter((entry) => /^CAT-[A-Z0-9]{4,}$/.test(entry)),
                                                                            aiAssistantId: sanitizeAiAssistantCode(waModuleForm.aiAssistantId || '') || null,
                                                                            enabledModules: {
                                                                                aiPro: waModuleForm.moduleAiEnabled !== false,
                                                                                catalog: waModuleForm.moduleCatalogEnabled !== false,
                                                                                cart: waModuleForm.moduleCartEnabled !== false,
                                                                                quickReplies: waModuleForm.moduleQuickRepliesEnabled !== false
                                                                            }
                                                                        },
                                                                        cloudConfig: {
                                                                            ...existingCloudConfig,
                                                                            appId: waModuleForm.cloudAppId || undefined,
                                                                            wabaId: waModuleForm.cloudWabaId || undefined,
                                                                            phoneNumberId: waModuleForm.cloudPhoneNumberId || undefined,
                                                                            verifyToken: waModuleForm.cloudVerifyToken || undefined,
                                                                            graphVersion: waModuleForm.cloudGraphVersion || undefined,
                                                                            displayPhoneNumber: waModuleForm.cloudDisplayPhoneNumber || undefined,
                                                                            businessName: waModuleForm.cloudBusinessName || undefined,
                                                                            appSecret: waModuleForm.cloudAppSecret || undefined,
                                                                            systemUserToken: waModuleForm.cloudSystemUserToken || undefined,
                                                                            enforceSignature: waModuleForm.cloudEnforceSignature !== false
                                                                        }
                                                                    }
                                                                };
                                                                const quickReplyLibraryIds = Array.from(new Set(
                                                                    (Array.isArray(moduleQuickReplyLibraryDraft) ? moduleQuickReplyLibraryDraft : [])
                                                                        .map((entry) => String(entry || '').trim().toUpperCase())
                                                                        .filter(Boolean)
                                                                ));

                                                                if (waModulePanelMode === 'edit' && moduleInDetail?.moduleId) {
                                                                    await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules/${encodeURIComponent(moduleInDetail.moduleId)}`, {
                                                                        method: 'PUT',
                                                                        body: payload
                                                                    });
                                                                    await syncQuickReplyLibrariesForModule(moduleInDetail.moduleId, quickReplyLibraryIds);
                                                                    setWaModulePanelMode('view');
                                                                    setSelectedConfigKey(`wa_module:${moduleInDetail.moduleId}`);
                                                                    return;
                                                                }

                                                                const createPayload = await requestJson(`/api/admin/saas/tenants/${encodeURIComponent(settingsTenantId)}/wa-modules`, {
                                                                    method: 'POST',
                                                                    body: payload
                                                                });
                                                                const createdModuleId = String(createPayload?.item?.moduleId || '').trim();
                                                                if (createdModuleId) {
                                                                    await syncQuickReplyLibrariesForModule(createdModuleId, quickReplyLibraryIds);
                                                                    setSelectedWaModuleId(createdModuleId);
                                                                    setSelectedConfigKey(`wa_module:${createdModuleId}`);
                                                                }
                                                                setWaModulePanelMode('view');
                                                            })}
                                                        >
                                                            {waModulePanelMode === 'create' ? 'Guardar modulo' : 'Actualizar modulo'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                if (moduleInDetail?.moduleId) {
                                                                    openConfigModuleView(moduleInDetail.moduleId);
                                                                    return;
                                                                }
                                                                clearConfigSelection();
                                                            }}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}                            </div>
                        </div>

                    </section>
    );
}

export default React.memo(ModulesConfigSection);
