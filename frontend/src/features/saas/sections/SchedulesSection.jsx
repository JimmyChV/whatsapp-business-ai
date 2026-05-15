import React from 'react';
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
    isActive: true
};

function text(value = '') {
    return String(value ?? '').trim();
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
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
            month: Number(item.month) || 1,
            day: Number(item.day) || 1,
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
        requestJson,
        schedules = [],
        loadingSchedules = false,
        loadSchedules = null,
        createSchedule = null,
        updateSchedule = null,
        deleteSchedule = null,
        canManageSchedules = false
    } = context;

    const isSection = selectedSectionId === 'saas_schedules';
    const [selectedScheduleId, setSelectedScheduleId] = React.useState('');
    const [panelMode, setPanelMode] = React.useState('view');
    const [form, setForm] = React.useState(() => normalizeForm(null));

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

    const openCreate = React.useCallback(() => {
        setForm(normalizeForm(null));
        setSelectedScheduleId('__new_schedule__');
        setPanelMode('create');
    }, []);

    const openView = React.useCallback((scheduleId) => {
        setSelectedScheduleId(text(scheduleId));
        setPanelMode('view');
    }, []);

    const openEdit = React.useCallback(() => {
        setForm(normalizeForm(selectedSchedule));
        setPanelMode('edit');
    }, [selectedSchedule]);

    const close = React.useCallback(() => {
        if (panelMode === 'create' || panelMode === 'edit') {
            setPanelMode('view');
            if (panelMode === 'create') setSelectedScheduleId('');
            return;
        }
        setSelectedScheduleId('');
    }, [panelMode]);

    const saveSchedule = React.useCallback(() => runAction?.(
        panelMode === 'create' ? 'Horario creado' : 'Horario actualizado',
        async () => {
            const payload = {
                name: form.name,
                timezone: form.timezone,
                weeklyHours: form.weeklyHours,
                holidays: form.holidays,
                customDays: form.customDays,
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
        }
    ), [createSchedule, form, panelMode, runAction, selectedSchedule, updateSchedule]);

    const removeSchedule = React.useCallback(() => {
        if (!selectedSchedule?.scheduleId) return;
        runAction?.('Horario eliminado', async () => {
            await deleteSchedule?.(selectedSchedule.scheduleId);
            setSelectedScheduleId('');
            setPanelMode('view');
        });
    }, [deleteSchedule, runAction, selectedSchedule]);

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

    const detailActions = React.useMemo(() => {
        if (!selectedSchedule || panelMode !== 'view') return null;
        return (
            <>
                <button type="button" disabled={busy || !canManageSchedules} onClick={openEdit}>Editar</button>
                <button type="button" disabled={busy || !canManageSchedules} onClick={removeSchedule}>Eliminar</button>
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
            </>
        );
    }, [selectedSchedule]);

    const renderForm = React.useCallback(({ close: requestClose } = {}) => (
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
                    {form.holidays.map((item, index) => (
                        <div key={`schedule_form_holiday_${index}`} className="saas-admin-related-row">
                            <input className="saas-input" type="number" min="1" max="12" value={item.month} disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, holidays: prev.holidays.map((entry, i) => (i === index ? { ...entry, month: event.target.value } : entry)) }))} />
                            <input className="saas-input" type="number" min="1" max="31" value={item.day} disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, holidays: prev.holidays.map((entry, i) => (i === index ? { ...entry, day: event.target.value } : entry)) }))} />
                            <input className="saas-input" value={item.name} placeholder="Nombre" disabled={busy} onChange={(event) => setForm((prev) => ({ ...prev, holidays: prev.holidays.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)) }))} />
                            <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => setForm((prev) => ({ ...prev, holidays: prev.holidays.filter((_, i) => i !== index) }))}>Eliminar</button>
                        </div>
                    ))}
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
            <div className="saas-admin-form-row saas-admin-form-row--actions">
                <button type="button" disabled={busy || !text(form.name)} onClick={saveSchedule}>
                    {panelMode === 'create' ? 'Guardar horario' : 'Actualizar horario'}
                </button>
                <button type="button" className="saas-btn-cancel" disabled={busy} onClick={() => { void requestClose?.(); }}>Cancelar</button>
            </div>
        </>
    ), [busy, form, panelMode, saveSchedule, updateDay]);

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
            loading={loadingSchedules}
            emptyText={tenantScopeLocked ? 'Selecciona una empresa para configurar horarios.' : 'No hay horarios configurados.'}
            searchPlaceholder="Buscar horario por nombre, zona horaria o estado..."
            filters={filters}
            actions={[
                { label: 'Recargar', onClick: () => loadSchedules?.().catch(() => {}), disabled: busy || loadingSchedules || !settingsTenantId },
                { label: 'Nuevo', onClick: openCreate, disabled: busy || !canManageSchedules || !settingsTenantId }
            ]}
            detailTitle={panelMode === 'create' ? 'Nuevo horario' : (selectedSchedule ? selectedSchedule.name : 'Horario')}
            detailSubtitle={panelMode === 'view' ? 'Horario reutilizable para modulos y automatizaciones.' : 'Configura dias laborables, feriados y excepciones.'}
            detailActions={detailActions}
        />
    );
}

export default React.memo(SchedulesSection);
