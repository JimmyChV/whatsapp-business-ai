import React from 'react';
import AutoMessageEditor from '../components/AutoMessageEditor';
import { SaasEntityPage } from '../components/layout';

const DAY_OPTIONS = [
    { key: 'mon', label: 'Lunes' },
    { key: 'tue', label: 'Martes' },
    { key: 'wed', label: 'Miercoles' },
    { key: 'thu', label: 'Jueves' },
    { key: 'fri', label: 'Viernes' },
    { key: 'sat', label: 'Sabado' },
    { key: 'sun', label: 'Domingo' }
];

const TIMEZONE_OPTIONS = [
    'America/Lima',
    'America/New_York',
    'America/Bogota',
    'America/Mexico_City',
    'America/Santiago',
    'America/Los_Angeles',
    'UTC'
];

const MONTH_OPTIONS = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
];

const DEFAULT_WEEKLY_HOURS = {
    mon: [{ start: '09:00', end: '19:00' }],
    tue: [{ start: '09:00', end: '19:00' }],
    wed: [{ start: '09:00', end: '19:00' }],
    thu: [{ start: '09:00', end: '19:00' }],
    fri: [{ start: '09:00', end: '19:00' }],
    sat: [{ start: '09:00', end: '13:00' }],
    sun: []
};

const EMPTY_FORM = {
    name: '',
    timezone: 'America/Lima',
    weeklyHours: DEFAULT_WEEKLY_HOURS,
    holidays: [],
    customDays: [],
    welcomeMessage: '',
    awayMessage: '',
    welcomeEnabled: false,
    awayEnabled: false,
    isActive: true
};
const MAX_AUTO_MESSAGE_LENGTH = 1000;

function text(value = '') {
    return String(value ?? '').trim();
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function getDaysInMonth(month) {
    const safeMonth = Math.min(12, Math.max(1, Number(month) || 1));
    return new Date(2024, safeMonth, 0).getDate();
}

function getDayOptionsForMonth(month) {
    return Array.from({ length: getDaysInMonth(month) }, (_, index) => index + 1);
}

function normalizeForm(schedule = null) {
    if (!schedule) return { ...EMPTY_FORM, weeklyHours: cloneJson(DEFAULT_WEEKLY_HOURS), holidays: [], customDays: [] };
    return {
        name: text(schedule.name),
        timezone: text(schedule.timezone) || 'America/Lima',
        weeklyHours: DAY_OPTIONS.reduce((acc, day) => {
            const ranges = Array.isArray(schedule.weeklyHours?.[day.key]) ? schedule.weeklyHours[day.key] : [];
            acc[day.key] = ranges.length ? [{ start: text(ranges[0]?.start) || '09:00', end: text(ranges[0]?.end) || '18:00' }] : [];
            return acc;
        }, {}),
        holidays: Array.isArray(schedule.holidays) ? schedule.holidays.map((item) => ({
            month: Math.min(12, Math.max(1, Number(item.month) || 1)),
            day: Math.min(getDaysInMonth(item.month), Math.max(1, Number(item.day) || 1)),
            name: text(item.name)
        })) : [],
        customDays: Array.isArray(schedule.customDays) ? schedule.customDays.map((item) => ({
            date: text(item.date),
            name: text(item.name),
            type: text(item.type) === 'open' ? 'open' : 'closed',
            hours: Array.isArray(item.hours) && item.hours.length
                ? [{ start: text(item.hours[0]?.start) || '09:00', end: text(item.hours[0]?.end) || '18:00' }]
                : [{ start: '09:00', end: '18:00' }]
        })) : [],
        welcomeMessage: text(schedule.welcomeMessage).slice(0, MAX_AUTO_MESSAGE_LENGTH),
        awayMessage: text(schedule.awayMessage).slice(0, MAX_AUTO_MESSAGE_LENGTH),
        welcomeEnabled: schedule.welcomeEnabled === true,
        awayEnabled: schedule.awayEnabled === true,
        isActive: schedule.isActive !== false
    };
}

function formatDayHours(hours = []) {
    const ranges = Array.isArray(hours) ? hours : [];
    if (ranges.length === 0) return 'Cerrado';
    return ranges.map((item) => `${item.start} - ${item.end}`).join(', ');
}

function formatHoliday(item = {}) {
    return `${String(item.day || '').padStart(2, '0')}/${String(item.month || '').padStart(2, '0')} · ${item.name || 'Feriado'}`;
}

function formatCustomDay(item = {}) {
    const type = item.type === 'open' ? `Abierto ${formatDayHours(item.hours)}` : 'Cerrado';
    return `${item.date || '-'} · ${item.name || 'Dia especial'} · ${type}`;
}

function SchedulesSection(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const {
        selectedSectionId,
        settingsTenantId,
        tenantScopeLocked,
        busy,
        runAction,
        runSectionAction,
        requestJson,
        schedules = [],
        loadingSchedules = false,
        loadSchedules = null,
        createSchedule = null,
        updateSchedule = null,
        deleteSchedule = null,
        ensureSectionData = null,
        isLoading = null,
        getError = null,
        getReloadToken = null,
        forceReload = null,
        canManageSchedules = false,
        canViewSchedules = canManageSchedules
    } = context;

    const isSection = selectedSectionId === 'saas_schedules';
    const lazySectionId = 'schedules';
    const sectionReloadToken = typeof getReloadToken === 'function' ? getReloadToken(lazySectionId) : 0;
    const sectionLoading = (typeof isLoading === 'function' && isLoading(lazySectionId)) || loadingSchedules;
    const sectionError = typeof getError === 'function' ? getError(lazySectionId) : '';
    const [selectedScheduleId, setSelectedScheduleId] = React.useState('');
    const [panelMode, setPanelMode] = React.useState('view');
    const [form, setForm] = React.useState(() => normalizeForm(null));
    const [autoMessageModal, setAutoMessageModal] = React.useState(null);

    const selectedSchedule = React.useMemo(
        () => schedules.find((item) => text(item?.scheduleId) === selectedScheduleId) || null,
        [schedules, selectedScheduleId]
    );

    const rows = React.useMemo(() => schedules.map((schedule) => ({
        id: text(schedule.scheduleId),
        name: text(schedule.name) || 'Horario',
        timezone: text(schedule.timezone) || 'America/Lima',
        status: schedule.isActive === false ? 'Inactivo' : 'Activo',
        raw: schedule
    })), [schedules]);

    const columns = React.useMemo(() => [
        { key: 'name', label: 'Nombre', width: '38%', minWidth: '220px', sortable: true },
        { key: 'timezone', label: 'Zona horaria', width: '32%', minWidth: '180px', sortable: true },
        { key: 'status', label: 'Estado', width: '18%', minWidth: '120px', sortable: true }
    ], []);

    const filters = React.useMemo(() => [
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'Activo', label: 'Activo' },
                { value: 'Inactivo', label: 'Inactivo' }
            ]
        }
    ], []);

    React.useEffect(() => {
        if (!isSection) return;
        if (typeof ensureSectionData !== 'function') {
            if (typeof loadSchedules === 'function' && canViewSchedules && settingsTenantId && !tenantScopeLocked) {
                loadSchedules().catch(() => {});
            }
            return;
        }
        void ensureSectionData(
            lazySectionId,
            () => loadSchedules?.(),
            {
                canLoad: Boolean(canViewSchedules && settingsTenantId && !tenantScopeLocked && typeof loadSchedules === 'function'),
                forceReload: sectionReloadToken > 0,
                reloadToken: sectionReloadToken,
                deps: [settingsTenantId]
            }
        );
    }, [canViewSchedules, ensureSectionData, isSection, loadSchedules, sectionReloadToken, settingsTenantId, tenantScopeLocked]);

    const openCreate = React.useCallback(() => {
        if (!canManageSchedules) return;
        setForm(normalizeForm(null));
        setSelectedScheduleId('__new_schedule__');
        setPanelMode('create');
    }, [canManageSchedules]);

    const openView = React.useCallback((scheduleId) => {
        setSelectedScheduleId(text(scheduleId));
        setPanelMode('view');
    }, []);

    const openEdit = React.useCallback(() => {
        if (!canManageSchedules) return;
        setForm(normalizeForm(selectedSchedule));
        setPanelMode('edit');
    }, [canManageSchedules, selectedSchedule]);

    const close = React.useCallback(() => {
        if (panelMode === 'create' || panelMode === 'edit') {
            setPanelMode('view');
            if (panelMode === 'create') setSelectedScheduleId('');
            return;
        }
        setSelectedScheduleId('');
    }, [panelMode]);

    const saveSchedule = React.useCallback(() => {
        const label = panelMode === 'create' ? 'Horario creado' : 'Horario actualizado';
        const action = async () => {
            if (!canManageSchedules) throw new Error('No tienes permiso para modificar horarios.');
            const payload = {
                name: form.name,
                timezone: form.timezone,
                weeklyHours: form.weeklyHours,
                holidays: form.holidays,
                customDays: form.customDays,
                welcomeMessage: text(form.welcomeMessage).slice(0, MAX_AUTO_MESSAGE_LENGTH),
                awayMessage: text(form.awayMessage).slice(0, MAX_AUTO_MESSAGE_LENGTH),
                welcomeEnabled: form.welcomeEnabled === true,
                awayEnabled: form.awayEnabled === true,
                isActive: form.isActive !== false
            };
            if (!text(payload.name)) throw new Error('Ingresa un nombre para el horario.');
            if (panelMode === 'create') {
                const item = await createSchedule?.(payload);
                setSelectedScheduleId(text(item?.scheduleId));
            } else if (selectedSchedule?.scheduleId) {
                await updateSchedule?.(selectedSchedule.scheduleId, payload);
            }
            setPanelMode('view');
        };
        return typeof runSectionAction === 'function'
            ? runSectionAction('save_schedule', action, { successMessage: label })
            : runAction?.(label, action);
    }, [canManageSchedules, createSchedule, form, panelMode, runAction, runSectionAction, selectedSchedule, updateSchedule]);

    const removeSchedule = React.useCallback(() => {
        if (!selectedSchedule?.scheduleId || !canManageSchedules) return;
        const action = async () => {
            await deleteSchedule?.(selectedSchedule.scheduleId);
            setSelectedScheduleId('');
            setPanelMode('view');
        };
        return typeof runSectionAction === 'function'
            ? runSectionAction('delete_schedule', action, { successMessage: 'Horario eliminado' })
            : runAction?.('Horario eliminado', action);
    }, [canManageSchedules, deleteSchedule, runAction, runSectionAction, selectedSchedule]);

    const updateDay = React.useCallback((dayKey, patch = {}) => {
        setForm((prev) => {
            const current = Array.isArray(prev.weeklyHours?.[dayKey]) ? prev.weeklyHours[dayKey] : [];
            const active = Object.prototype.hasOwnProperty.call(patch, 'active') ? patch.active : current.length > 0;
            const range = current[0] || { start: '09:00', end: '18:00' };
            return {
                ...prev,
                weeklyHours: {
                    ...prev.weeklyHours,
                    [dayKey]: active ? [{ ...range, ...patch.hours }] : []
                }
            };
        });
    }, []);

    const updateHoliday = React.useCallback((index, patch = {}) => {
        setForm((prev) => ({
            ...prev,
            holidays: prev.holidays.map((entry, i) => {
                if (i !== index) return entry;
                const next = { ...entry, ...patch };
                const month = Math.min(12, Math.max(1, Number(next.month) || 1));
                const maxDay = getDaysInMonth(month);
                const day = Math.min(maxDay, Math.max(1, Number(next.day) || 1));
                return { ...next, month, day };
            })
        }));
    }, []);

    const openAutoMessageModal = React.useCallback((type) => {
        const cleanType = type === 'away' ? 'away' : 'welcome';
        setAutoMessageModal({
            type: cleanType,
            draft: cleanType === 'away' ? String(form.awayMessage || '') : String(form.welcomeMessage || '')
        });
    }, [form.awayMessage, form.welcomeMessage]);

    const closeAutoMessageModal = React.useCallback(() => {
        setAutoMessageModal(null);
    }, []);

    const saveAutoMessageModal = React.useCallback(() => {
        if (!autoMessageModal) return;
        const draft = String(autoMessageModal.draft || '').slice(0, MAX_AUTO_MESSAGE_LENGTH);
        setForm((prev) => ({
            ...prev,
            [autoMessageModal.type === 'away' ? 'awayMessage' : 'welcomeMessage']: draft
        }));
        setAutoMessageModal(null);
    }, [autoMessageModal]);

    const detailActions = React.useMemo(() => {
        if (!selectedSchedule || panelMode !== 'view' || !canManageSchedules) return null;
        return (
            <>
                <button type="button" disabled={busy} onClick={openEdit}>Editar</button>
                <button type="button" disabled={busy} onClick={removeSchedule}>Eliminar</button>
            </>
        );
    }, [busy, canManageSchedules, openEdit, panelMode, removeSchedule, selectedSchedule]);

    const renderDetail = React.useCallback(() => {
        if (!selectedSchedule) {
            return (
                <div className="saas-admin-empty-state saas-admin-empty-state--detail">
                    <h4>Selecciona un horario</h4>
                    <p>El detalle se mostrara aqui.</p>
                </div>
            );
        }
        return (
            <>
                <div className="saas-admin-detail-grid">
                    <div className="saas-admin-detail-field"><span>NOMBRE</span><strong>{selectedSchedule.name || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ZONA HORARIA</span><strong>{selectedSchedule.timezone || '-'}</strong></div>
                    <div className="saas-admin-detail-field"><span>ESTADO</span><strong>{selectedSchedule.isActive === false ? 'Inactivo' : 'Activo'}</strong></div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Horario semanal</h4>
                    <div className="saas-admin-related-list">
                        {DAY_OPTIONS.map((day) => (
                            <div key={`schedule_day_${day.key}`} className="saas-admin-related-row" role="status">
                                <span>{day.label}</span>
                                <small>{formatDayHours(selectedSchedule.weeklyHours?.[day.key])}</small>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Feriados perpetuos</h4>
                    <div className="saas-admin-related-list">
                        {selectedSchedule.holidays?.length ? selectedSchedule.holidays.map((item, index) => (
                            <div key={`schedule_holiday_${index}`} className="saas-admin-related-row" role="status">
                                <span>{formatHoliday(item)}</span>
                            </div>
                        )) : <div className="saas-admin-empty-inline">Sin feriados configurados.</div>}
                    </div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Dias especiales</h4>
                    <div className="saas-admin-related-list">
                        {selectedSchedule.customDays?.length ? selectedSchedule.customDays.map((item, index) => (
                            <div key={`schedule_custom_${index}`} className="saas-admin-related-row" role="status">
                                <span>{formatCustomDay(item)}</span>
                            </div>
                        )) : <div className="saas-admin-empty-inline">Sin dias especiales configurados.</div>}
                    </div>
                </div>
                <div className="saas-admin-related-block">
                    <h4>Mensajes automaticos</h4>
                    <div className="saas-admin-detail-grid">
                        <div className="saas-admin-detail-field">
                            <span>BIENVENIDA</span>
                            <strong>{selectedSchedule.welcomeEnabled ? 'Activada' : 'Desactivada'}</strong>
                            <small>{selectedSchedule.welcomeMessage || 'Sin mensaje configurado.'}</small>
                        </div>
                        <div className="saas-admin-detail-field">
                            <span>AUSENCIA</span>
                            <strong>{selectedSchedule.awayEnabled ? 'Activada' : 'Desactivada'}</strong>
                            <small>{selectedSchedule.awayMessage || 'Sin mensaje configurado.'}</small>
                        </div>
                    </div>
                </div>
            </>
        );
    }, [selectedSchedule]);

    const renderForm = React.useCallback(({ close: requestClose } = {}) => {
        if (!canManageSchedules) {
            return <div className="saas-admin-empty-inline">No tienes permisos para modificar horarios.</div>;
        }
        return (
        <>
            <div className="saas-admin-form-row">
                <input
                    className="saas-input"
                    value={form.name}
                    placeholder="Nombre del horario"
                    disabled={busy}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
                <select
                    className="saas-input"
                    value={form.timezone}
                    disabled={busy}
                    onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                >
                    {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                </select>
            </div>
            <div className="saas-admin-related-block">
                <h4>Dias de semana</h4>
                <div className="saas-admin-related-list">
                    {DAY_OPTIONS.map((day) => {
                        const ranges = Array.isArray(form.weeklyHours?.[day.key]) ? form.weeklyHours[day.key] : [];
                        const active = ranges.length > 0;
                        const range = ranges[0] || { start: '09:00', end: '18:00' };
                        return (
                            <div key={`schedule_form_day_${day.key}`} className="saas-admin-related-row" role="group" aria-label={day.label}>
                                <label className="saas-admin-module-toggle">
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        disabled={busy}
                                        onChange={(event) => updateDay(day.key, { active: event.target.checked })}
                                    />
                                    <span>{day.label}</span>
                                </label>
                                <input
                                    className="saas-input"
                                    type="time"
                                    value={range.start}
                                    disabled={busy || !active}
                                    onChange={(event) => updateDay(day.key, { active: true, hours: { start: event.target.value } })}
                                />
                                <input
                                    className="saas-input"
                                    type="time"
                                    value={range.end}
                                    disabled={busy || !active}
                                    onChange={(event) => updateDay(day.key, { active: true, hours: { end: event.target.value } })}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="saas-admin-related-block">
                <h4>Feriados perpetuos</h4>
                <div className="saas-admin-related-list">
                    {form.holidays.map((item, index) => {
                        const month = Math.min(12, Math.max(1, Number(item.month) || 1));
                        const day = Math.min(getDaysInMonth(month), Math.max(1, Number(item.day) || 1));
                        return (
                        <div key={`schedule_form_holiday_${index}`} className="saas-admin-related-row">
                            <select
                                className="saas-input"
                                value={month}
                                disabled={busy}
                                aria-label="Mes del feriado"
                                onChange={(event) => updateHoliday(index, { month: Number(event.target.value) })}
                            >
                                {MONTH_OPTIONS.map((option) => (
                                    <option key={`holiday_month_${option.value}`} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <select
                                className="saas-input"
                                value={day}
                                disabled={busy}
                                aria-label="Dia del feriado"
                                onChange={(event) => updateHoliday(index, { day: Number(event.target.value) })}
                            >
                                {getDayOptionsForMonth(month).map((option) => (
                                    <option key={`holiday_day_${month}_${option}`} value={option}>{option}</option>
                                ))}
                            </select>
                            <input className="saas-input" value={item.name} placeholder="Nombre" disabled={busy} onChange={(event) => updateHoliday(index, { name: event.target.value })} />
                            <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => setForm((prev) => ({ ...prev, holidays: prev.holidays.filter((_, i) => i !== index) }))}>Eliminar</button>
                        </div>
                        );
                    })}
                </div>
                <button type="button" disabled={busy} onClick={() => setForm((prev) => ({ ...prev, holidays: [...prev.holidays, { month: 1, day: 1, name: '' }] }))}>Agregar feriado</button>
            </div>
            <div className="saas-admin-related-block">
                <h4>Dias especiales</h4>
                <div className="saas-admin-related-list">
                    {form.customDays.map((item, index) => (
                        <div key={`schedule_form_custom_${index}`} className="saas-admin-related-row">
                            <input className="saas-input" type="date" value={item.date} disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, customDays: prev.customDays.map((entry, i) => (i === index ? { ...entry, date: event.target.value } : entry)) }))} />
                            <input className="saas-input" value={item.name} placeholder="Nombre" disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, customDays: prev.customDays.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)) }))} />
                            <select className="saas-input" value={item.type} disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, customDays: prev.customDays.map((entry, i) => (i === index ? { ...entry, type: event.target.value } : entry)) }))}>
                                <option value="closed">Cerrado</option>
                                <option value="open">Abierto</option>
                            </select>
                            {item.type === 'open' ? (
                                <>
                                    <input className="saas-input" type="time" value={item.hours?.[0]?.start || '09:00'} disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, customDays: prev.customDays.map((entry, i) => (i === index ? { ...entry, hours: [{ ...(entry.hours?.[0] || {}), start: event.target.value }] } : entry)) }))} />
                                    <input className="saas-input" type="time" value={item.hours?.[0]?.end || '18:00'} disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, customDays: prev.customDays.map((entry, i) => (i === index ? { ...entry, hours: [{ ...(entry.hours?.[0] || {}), end: event.target.value }] } : entry)) }))} />
                                </>
                            ) : null}
                            <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => setForm((prev) => ({ ...prev, customDays: prev.customDays.filter((_, i) => i !== index) }))}>Eliminar</button>
                        </div>
                    ))}
                </div>
                <button type="button" disabled={busy} onClick={() => setForm((prev) => ({ ...prev, customDays: [...prev.customDays, { date: '', name: '', type: 'closed', hours: [{ start: '09:00', end: '18:00' }] }] }))}>Agregar dia especial</button>
            </div>
            <div className="saas-admin-related-block">
                <h4>Estado</h4>
                <label className="saas-admin-module-toggle">
                    <input
                        type="checkbox"
                        checked={form.isActive !== false}
                        disabled={busy}
                        onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    <span>Horario activo</span>
                </label>
            </div>
            <div className="saas-admin-related-block">
                <h4>Mensajes automaticos</h4>
                <div className="saas-admin-related-list">
                    <div className="saas-admin-related-row" role="group" aria-label="Mensaje de bienvenida">
                        <label className="saas-admin-module-toggle">
                            <input
                                type="checkbox"
                                checked={form.welcomeEnabled === true}
                                disabled={busy}
                                onChange={(event) => setForm((prev) => ({ ...prev, welcomeEnabled: event.target.checked }))}
                            />
                            <span>Bienvenida</span>
                        </label>
                        <small>{form.welcomeMessage || 'Sin mensaje configurado.'}</small>
                        <button type="button" disabled={busy} onClick={() => openAutoMessageModal('welcome')}>Configurar →</button>
                    </div>
                    <div className="saas-admin-related-row" role="group" aria-label="Mensaje de ausencia">
                        <label className="saas-admin-module-toggle">
                            <input
                                type="checkbox"
                                checked={form.awayEnabled === true}
                                disabled={busy}
                                onChange={(event) => setForm((prev) => ({ ...prev, awayEnabled: event.target.checked }))}
                            />
                            <span>Ausencia</span>
                        </label>
                        <small>{form.awayMessage || 'Sin mensaje configurado.'}</small>
                        <button type="button" disabled={busy} onClick={() => openAutoMessageModal('away')}>Configurar →</button>
                    </div>
                </div>
            </div>
            {autoMessageModal ? (
                <div className="saas-template-builder-modal-overlay" onClick={closeAutoMessageModal}>
                    <div className="saas-template-builder-modal-shell" onClick={(event) => event.stopPropagation()}>
                        <div className="saas-template-builder-modal-panel">
                            <div className="saas-template-builder-modal-panel__body">
                                <section className="saas-admin-related-block saas-admin-related-block--modal-form">
                                    <div className="saas-admin-pane-header saas-admin-pane-header--modal">
                                        <div>
                                            <h4>{autoMessageModal.type === 'away' ? 'Mensaje de ausencia' : 'Mensaje de bienvenida'}</h4>
                                            <small>{autoMessageModal.type === 'away' ? 'Se envia automaticamente fuera del horario de atencion.' : 'Se envia cuando alguien escribe por primera vez durante el horario de atencion.'}</small>
                                        </div>
                                        <button type="button" className="saas-btn-cancel saas-admin-modal-close" disabled={busy} onClick={closeAutoMessageModal}>Cerrar</button>
                                    </div>
                                    <AutoMessageEditor
                                        value={autoMessageModal.draft}
                                        onChange={(value) => setAutoMessageModal((prev) => prev ? ({ ...prev, draft: value.slice(0, MAX_AUTO_MESSAGE_LENGTH) }) : prev)}
                                        disabled={busy}
                                        placeholder={autoMessageModal.type === 'away'
                                            ? 'Gracias por escribirnos. Nuestro horario es de lunes a viernes de 9am a 7pm. Te responderemos a la brevedad...'
                                            : 'Hola, gracias por escribirnos a Lavitat. En breve te atendemos...'}
                                        maxLength={MAX_AUTO_MESSAGE_LENGTH}
                                        showMediaUpload={false}
                                        showPreview={true}
                                        tenantId={settingsTenantId}
                                    />
                                    <small>{text(autoMessageModal.draft).length}/{MAX_AUTO_MESSAGE_LENGTH}</small>
                                    <div className="saas-admin-form-row saas-admin-form-row--actions">
                                        <button type="button" disabled={busy} onClick={saveAutoMessageModal}>Guardar</button>
                                        <button type="button" className="saas-btn-cancel" disabled={busy} onClick={closeAutoMessageModal}>Cancelar</button>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !text(form.name)} onClick={saveSchedule}>
                    {panelMode === 'create' ? 'Guardar horario' : 'Actualizar horario'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>Cancelar</button>
            </div>
        </>
        );
    }, [autoMessageModal, busy, canManageSchedules, closeAutoMessageModal, form, openAutoMessageModal, panelMode, saveAutoMessageModal, saveSchedule, settingsTenantId, updateDay, updateHoliday]);

    if (!isSection) return null;

    return (
        <SaasEntityPage
            id="saas_schedules"
            sectionKey="saas_schedules"
            title="Horarios"
            rows={rows}
            columns={columns}
            selectedId={panelMode === 'create' ? '__new_schedule__' : selectedScheduleId}
            onSelect={(row) => openView(row?.id)}
            onClose={close}
            renderDetail={renderDetail}
            renderForm={renderForm}
            mode={panelMode === 'create' || panelMode === 'edit' ? 'form' : 'detail'}
            dirty={panelMode === 'create' || panelMode === 'edit'}
            requestJson={requestJson}
            loading={sectionLoading}
            emptyText={sectionError || (tenantScopeLocked ? 'Selecciona una empresa para configurar horarios.' : 'No hay horarios configurados.')}
            searchPlaceholder="Buscar horario por nombre, zona horaria o estado..."
            filters={filters}
            actions={[
                { label: sectionError ? 'Reintentar' : 'Recargar', onClick: () => (typeof forceReload === 'function' ? forceReload(lazySectionId) : loadSchedules?.().catch(() => {})), disabled: busy || sectionLoading || !settingsTenantId },
                ...(canManageSchedules ? [{ label: 'Nuevo', onClick: openCreate, disabled: busy || !settingsTenantId }] : [])
            ]}
            detailTitle={panelMode === 'create' ? 'Nuevo horario' : (selectedSchedule ? selectedSchedule.name : 'Horario')}
            detailSubtitle={panelMode === 'view' ? 'Horario reutilizable para modulos y automatizaciones.' : 'Configura dias laborables, feriados y excepciones.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(SchedulesSection);
