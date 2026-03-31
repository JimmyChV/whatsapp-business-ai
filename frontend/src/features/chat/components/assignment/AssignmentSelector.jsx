import React, { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../../../../config/runtime';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();
const normalizeText = (value = '') => String(value || '').trim();

const ASSIGNABLE_ROLES = new Set(['seller', 'admin', 'owner']);
const MANAGER_ROLES = new Set(['owner', 'admin']);

const resolveDisplayName = (user = {}) => {
  const name = normalizeText(user?.name || user?.fullName || user?.displayName || '');
  if (name) return name;
  return normalizeText(user?.email || user?.userId || 'Usuario');
};

const resolveTenantRole = (user = {}, tenantId = '') => {
  const cleanTenantId = normalizeText(tenantId);
  const memberships = Array.isArray(user?.memberships) ? user.memberships : [];
  const membership = memberships.find((entry) =>
    normalizeText(entry?.tenantId) === cleanTenantId && entry?.active !== false
  );
  return normalizeRole(membership?.role || user?.role || 'seller') || 'seller';
};

const toBaseChatId = (value = '') => normalizeText(String(value || '').split('::mod::')[0] || '');

export default function AssignmentSelector({
  activeTenantId = '',
  chatId = '',
  scopeModuleId = '',
  buildApiHeaders,
  currentUserRole = ''
}) {
  const { notify } = useUiFeedback();
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const cleanTenantId = normalizeText(activeTenantId);
  const cleanRole = normalizeRole(currentUserRole);
  const cleanScopeModuleId = normalizeText(scopeModuleId).toLowerCase();
  const baseChatId = toBaseChatId(chatId);
  const canManageAssignments = MANAGER_ROLES.has(cleanRole);

  useEffect(() => {
    if (!canManageAssignments || !cleanTenantId) {
      setUsers([]);
      setSelectedUserId('');
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        setIsLoadingUsers(true);
        const headers = typeof buildApiHeaders === 'function'
          ? buildApiHeaders({ includeJson: true })
          : { 'Content-Type': 'application/json' };
        const response = await fetch(`${API_URL}/api/admin/saas/users?tenantId=${encodeURIComponent(cleanTenantId)}`, {
          method: 'GET',
          headers
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(String(payload?.error || 'No se pudo cargar la lista de usuarias.'));
        }
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const scopedUsers = items
          .filter((user) => {
            const userId = normalizeText(user?.userId || user?.id || '');
            if (!userId) return false;
            const role = resolveTenantRole(user, cleanTenantId);
            return ASSIGNABLE_ROLES.has(role);
          })
          .map((user) => {
            const userId = normalizeText(user?.userId || user?.id || '');
            const tenantRole = resolveTenantRole(user, cleanTenantId);
            return {
              userId,
              label: resolveDisplayName(user),
              role: tenantRole
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));

        if (cancelled) return;
        setUsers(scopedUsers);
      } catch (error) {
        if (cancelled) return;
        notify({
          type: 'error',
          message: String(error?.message || 'No se pudo cargar la lista de usuarias.')
        });
      } finally {
        if (!cancelled) setIsLoadingUsers(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [canManageAssignments, cleanTenantId, buildApiHeaders, notify]);

  const options = useMemo(() => users.map((entry) => ({
    value: entry.userId,
    label: `${entry.label} (${entry.role})`
  })), [users]);

  const handleAssign = async (event) => {
    const nextUserId = normalizeText(event?.target?.value || '');
    setSelectedUserId(nextUserId);
    if (!nextUserId || !cleanTenantId || !baseChatId) return;

    try {
      setIsAssigning(true);
      const headers = typeof buildApiHeaders === 'function'
        ? buildApiHeaders({ includeJson: true })
        : { 'Content-Type': 'application/json' };
      const response = await fetch(`${API_URL}/api/tenant/chats/${encodeURIComponent(baseChatId)}/assignment`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          assigneeUserId: nextUserId,
          scopeModuleId: cleanScopeModuleId || undefined,
          assignmentReason: 'manual_assign'
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'No se pudo asignar el chat.'));
      }
      notify({
        type: 'info',
        message: 'Chat asignado correctamente.'
      });
    } catch (error) {
      notify({
        type: 'error',
        message: String(error?.message || 'No se pudo asignar el chat.')
      });
    } finally {
      setIsAssigning(false);
    }
  };

  if (!canManageAssignments) return null;

  return (
    <label className="assignment-selector" onClick={(event) => event.stopPropagation()}>
      <span className="assignment-selector-label">Asignar</span>
      <select
        className="assignment-selector-select"
        value={selectedUserId}
        onChange={handleAssign}
        disabled={isLoadingUsers || isAssigning || options.length === 0}
        title="Asignar chat"
      >
        <option value="">
          {isLoadingUsers ? 'Cargando...' : 'Selecciona usuaria'}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
