export default function SaasPanelTenantPicker({
    requiresTenantSelection = false,
    settingsTenantId = '',
    tenantOptions = [],
    busy = false,
    toTenantDisplayName,
    onChangeTenant,
    onClearTenant
}) {
    if (!requiresTenantSelection) return null;

    return (
        <div className="saas-admin-tenant-picker-row">
            <select
                value={settingsTenantId}
                onChange={(event) => {
                    const nextTenantId = String(event.target.value || '').trim();
                    onChangeTenant?.(nextTenantId);
                }}
                disabled={busy}
            >
                <option value="">Seleccionar empresa para trabajar</option>
                {tenantOptions.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{typeof toTenantDisplayName === 'function' ? toTenantDisplayName(tenant) : (tenant?.name || tenant?.id || '')}</option>
                ))}
            </select>
            {settingsTenantId && (
                <button
                    type="button"
                    className="saas-admin-tenant-picker-clear"
                    disabled={busy}
                    onClick={() => onClearTenant?.()}
                >
                    Limpiar seleccion
                </button>
            )}
        </div>
    );
}
