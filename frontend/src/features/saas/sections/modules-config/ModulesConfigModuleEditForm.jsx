import React from 'react';
import ImageDropInput from '../../components/panel/ImageDropInput';

const WITHIN_HOURS_MODE_OPTIONS = [
    { value: 'autonomous', label: 'Autonomo (responde solo)' },
    { value: 'review', label: 'Sugerencias (pendiente aprobacion)' },
    { value: 'off', label: 'Desactivado' }
];

const OUTSIDE_HOURS_MODE_OPTIONS = [
    { value: 'autonomous', label: 'Autonomo (responde solo)' },
    { value: 'review', label: 'Sugerencias (pendiente aprobacion)' },
    { value: 'off', label: 'Desactivado' }
];

function clampWaitSeconds(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return 15;
    return Math.max(5, Math.min(300, parsed));
}

export default function ModulesConfigModuleEditForm({
    settingsTenantId,
    busy,
    canEditModules,
    waModuleForm,
    setWaModuleForm,
    CATALOG_MODE_OPTIONS,
    sanitizeAiAssistantCode,
    activeAiAssistantOptions,
    activeCatalogOptions,
    normalizeCatalogIdsList,
    toggleCatalogForModule,
    activeQuickReplyLibraries,
    schedules = [],
    moduleQuickReplyLibraryDraft,
    toggleQuickReplyLibraryForModuleDraft,
    handleFormImageUpload,
    moduleUserPickerId,
    setModuleUserPickerId,
    availableUsersForModulePicker,
    toUserDisplayName,
    toggleAssignedUserForModule,
    assignedModuleUsers,
    waModulePanelMode,
    moduleInDetail,
    saveWaModule,
    openConfigModuleView,
    clearConfigSelection
}) {
    const activeSchedules = Array.isArray(schedules) ? schedules.filter((item) => item?.isActive !== false) : [];
    const selectedSchedule = activeSchedules.find((item) => String(item?.scheduleId || '').trim() === String(waModuleForm.scheduleId || '').trim()) || null;
    const selectedScheduleStatus = selectedSchedule
        ? 'Ahora: segun horario configurado'
        : 'Sin horario asignado';
    const handleModuleSave = () => {
        if (typeof saveWaModule !== 'function') return;
        saveWaModule();
    };

    return (
        <>
            <div className="saas-admin-form-row">
                <input
                    value={waModuleForm.name}
                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Nombre del módulo"
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
                    placeholder="Número (ej: +51999999999)"
                    disabled={!settingsTenantId || busy}
                />
                <select
                    value={waModuleForm.moduleCatalogMode}
                    onChange={(event) => setWaModuleForm((prev) => ({ ...prev, moduleCatalogMode: event.target.value }))}
                    disabled={!settingsTenantId || busy}
                >
                    <option value="inherit">Catálogo: heredar empresa</option>
                    {CATALOG_MODE_OPTIONS.map((mode) => (
                        <option key={`module_catalog_${mode}`} value={mode}>{`Catálogo: ${mode}`}</option>
                    ))}
                </select>
            </div>

            <div className="saas-admin-form-row">
                <div className="saas-admin-field">
                    <label htmlFor="wa-module-ai-assistant">Asistente IA del módulo</label>
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
                <h4>Horario del módulo</h4>
                <div className="saas-admin-form-row">
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-schedule">Horario asignado</label>
                        <select
                            id="wa-module-schedule"
                            value={waModuleForm.scheduleId || ''}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, scheduleId: event.target.value }))}
                            disabled={!settingsTenantId || busy}
                        >
                            <option value="">Sin horario asignado</option>
                            {activeSchedules.map((schedule) => {
                                const scheduleId = String(schedule?.scheduleId || '').trim();
                                if (!scheduleId) return null;
                                return (
                                    <option key={`wa_module_schedule_${scheduleId}`} value={scheduleId}>
                                        {schedule?.name || scheduleId}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-schedule-status">Estado actual</label>
                        <input
                            id="wa-module-schedule-status"
                            value={selectedScheduleStatus}
                            disabled
                        />
                    </div>
                </div>
            </div>

            <div className="saas-admin-related-block">
                <h4>Asistente IA</h4>
                <div className="saas-admin-form-row">
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-ai-name">Nombre del asistente</label>
                        <input
                            id="wa-module-ai-name"
                            value={waModuleForm.aiAssistantName || ''}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiAssistantName: event.target.value }))}
                            placeholder="Patty"
                            disabled={!settingsTenantId || busy}
                        />
                    </div>
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-ai-within-hours">Modo dentro de horario</label>
                        <select
                            id="wa-module-ai-within-hours"
                            value={waModuleForm.aiWithinHoursMode || 'review'}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiWithinHoursMode: event.target.value }))}
                            disabled={!settingsTenantId || busy}
                        >
                            {WITHIN_HOURS_MODE_OPTIONS.map((option) => (
                                <option key={`within_hours_${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="saas-admin-form-row">
                    <label className="saas-admin-module-toggle">
                        <input
                            type="checkbox"
                            checked={waModuleForm.aiEnablePatty !== false}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiEnablePatty: event.target.checked }))}
                            disabled={!settingsTenantId || busy}
                        />
                        <span>Activar sugerencias Patty</span>
                    </label>
                    <label className="saas-admin-module-toggle">
                        <input
                            type="checkbox"
                            checked={waModuleForm.aiEnableCopilot !== false}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiEnableCopilot: event.target.checked }))}
                            disabled={!settingsTenantId || busy}
                        />
                        <span>Activar copiloto interno</span>
                    </label>
                </div>
                <div className="saas-admin-form-row">
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-ai-outside-hours">Modo fuera de horario</label>
                        <select
                            id="wa-module-ai-outside-hours"
                            value={waModuleForm.aiOutsideHoursMode || 'autonomous'}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiOutsideHoursMode: event.target.value }))}
                            disabled={!settingsTenantId || busy}
                        >
                            {OUTSIDE_HOURS_MODE_OPTIONS.map((option) => (
                                <option key={`outside_hours_${option.value}`} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-ai-wait">Segundos antes de intervenir</label>
                        <input
                            id="wa-module-ai-wait"
                            type="number"
                            min="5"
                            max="300"
                            value={waModuleForm.aiWaitSeconds || 15}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, aiWaitSeconds: clampWaitSeconds(event.target.value) }))}
                            disabled={!settingsTenantId || busy}
                        />
                    </div>
                </div>
            </div>

            <div className="saas-admin-related-block">
                <h4>CATÁLOGOS ASIGNADOS AL MÓDULO</h4>
                <small>Selecciona uno o más catálogos activos para este módulo.</small>
                <div className="saas-admin-modules">
                    {activeCatalogOptions.length === 0 && (
                        <div className="saas-admin-empty-inline">No hay catálogos activos. Crea uno en la pestaña Catálogos.</div>
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
                <h4>BIBLIOTECAS DE RESPUESTAS RÁPIDAS</h4>
                <small>Selecciona las bibliotecas específicas para este módulo. Las compartidas aplican siempre.</small>
                <div className="saas-admin-modules">
                    {activeQuickReplyLibraries.length === 0 && (
                        <div className="saas-admin-empty-inline">No hay bibliotecas activas. Crea bibliotecas en la pestaña Respuestas Rápidas.</div>
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
                    <span>Catálogo habilitado</span>
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
                    <span>Respuestas rápidas habilitadas</span>
                </label>
            </div>

            <div className="saas-admin-form-row">
                <ImageDropInput
                    label="Reemplazar imagen del módulo"
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
                    <img src={waModuleForm.imageUrl} alt="Imagen del módulo" className="saas-admin-preview-thumb" />
                </div>
            )}

            <div className="saas-admin-form-row">
                <select
                    value={moduleUserPickerId}
                    onChange={(event) => setModuleUserPickerId(String(event.target.value || '').trim())}
                    disabled={!settingsTenantId || busy || availableUsersForModulePicker.length === 0}
                >
                    <option value="">Seleccionar usuario para el módulo</option>
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
                        <div className="saas-admin-empty-inline">No hay usuarios asignados al módulo.</div>
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
                            <small>Quitar del módulo</small>
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
                            placeholder="ID del número de teléfono en Meta"
                            disabled={!settingsTenantId || busy}
                        />
                    </div>
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-meta-verify-token">META_VERIFY_TOKEN</label>
                        <input
                            id="wa-module-meta-verify-token"
                            value={waModuleForm.cloudVerifyToken}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudVerifyToken: event.target.value }))}
                            placeholder="Token de verificación del webhook"
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
                            placeholder="Versión Graph API (ej: v22.0)"
                            disabled={!settingsTenantId || busy}
                        />
                    </div>
                    <div className="saas-admin-field">
                        <label htmlFor="wa-module-meta-display-phone">META_DISPLAY_PHONE_NUMBER</label>
                        <input
                            id="wa-module-meta-display-phone"
                            value={waModuleForm.cloudDisplayPhoneNumber}
                            onChange={(event) => setWaModuleForm((prev) => ({ ...prev, cloudDisplayPhoneNumber: event.target.value }))}
                            placeholder="Número visible (ej: 519XXXXXXXX)"
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
                                waModuleForm.cloudAppSecretMasked ? 'APP_SECRET: configurado' : 'APP_SECRET: vacío',
                                waModuleForm.cloudSystemUserTokenMasked ? 'SYSTEM_USER_TOKEN: configurado' : 'SYSTEM_USER_TOKEN: vacío'
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
                    onClick={handleModuleSave}
                >
                    {waModulePanelMode === 'create' ? 'Guardar módulo' : 'Actualizar módulo'}
                </button>
                <button
                    type="button"
                    className="saas-btn-cancel"
                    disabled={busy}
                    onClick={() => {
                        if (moduleInDetail?.moduleId) {
                            openConfigModuleView(moduleInDetail.moduleId);
                            return;
                        }
                        clearConfigSelection();
                    }}
                >
                    CANCELAR
                </button>
            </div>
        </>
    );
}
