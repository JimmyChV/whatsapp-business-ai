import { useCallback, useMemo, useState } from 'react';
import {
  getAdminTenantAssignmentRules,
  updateAdminTenantAssignmentRules,
  triggerAdminAutoAssign,
  getAdminTenantOperationsKpis
} from '../../../services/operations.service';

const DEFAULT_ASSIGNMENT_RULES = {
  enabled: false,
  mode: 'least_load',
  allowedRoles: ['seller'],
  maxOpenChatsPerUser: 0,
  metadata: {}
};

function normalizeAssignmentRulesState(rules = {}) {
  return {
    enabled: rules?.enabled === true,
    mode: String(rules?.mode || 'least_load').trim().toLowerCase() === 'round_robin' ? 'round_robin' : 'least_load',
    allowedRoles: Array.isArray(rules?.allowedRoles)
      ? rules.allowedRoles.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
      : ['seller'],
    maxOpenChatsPerUser: Number.isFinite(Number(rules?.maxOpenChatsPerUser))
      ? Math.max(0, Number(rules.maxOpenChatsPerUser))
      : 0,
    metadata: rules?.metadata && typeof rules.metadata === 'object' ? rules.metadata : {}
  };
}

export default function useOperationsPanelState({
  canViewOperations = false,
  buildApiHeaders
} = {}) {
  const [assignmentRules, setAssignmentRules] = useState({ ...DEFAULT_ASSIGNMENT_RULES });
  const [loadingAssignmentRules, setLoadingAssignmentRules] = useState(false);
  const [operationsKpis, setOperationsKpis] = useState(null);
  const [loadingOperationsKpis, setLoadingOperationsKpis] = useState(false);

  const unassignedCandidates = useMemo(
    () => (Array.isArray(operationsKpis?.topUnassigned) ? operationsKpis.topUnassigned : []),
    [operationsKpis]
  );

  const operationsSnapshot = useMemo(() => ({
    incomingCount: Number(operationsKpis?.incomingCount || 0),
    outgoingCount: Number(operationsKpis?.outgoingCount || 0),
    avgFirstResponseSec: Number(operationsKpis?.avgFirstResponseSec || 0),
    respondedChats: Number(operationsKpis?.respondedChats || 0),
    activeAssignments: Number(operationsKpis?.activeAssignments || 0),
    reassignedChats: Number(operationsKpis?.reassignedChats || 0),
    unassignedChats: Number(operationsKpis?.unassignedChats || 0)
  }), [operationsKpis]);

  const resetOperationsState = useCallback(() => {
    setAssignmentRules({ ...DEFAULT_ASSIGNMENT_RULES });
    setOperationsKpis(null);
  }, []);

  const loadTenantAssignmentRules = useCallback(async (tenantId) => {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId || !canViewOperations) {
      setAssignmentRules({ ...DEFAULT_ASSIGNMENT_RULES });
      return;
    }

    setLoadingAssignmentRules(true);
    try {
      const payload = await getAdminTenantAssignmentRules({
        tenantId: cleanTenantId,
        headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : {}
      });
      setAssignmentRules(normalizeAssignmentRulesState(payload?.rules || {}));
    } catch (error) {
      setAssignmentRules({ ...DEFAULT_ASSIGNMENT_RULES });
      throw error;
    } finally {
      setLoadingAssignmentRules(false);
    }
  }, [canViewOperations, buildApiHeaders]);

  const loadTenantOperationsKpis = useCallback(async (tenantId) => {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId || !canViewOperations) {
      setOperationsKpis(null);
      return;
    }

    setLoadingOperationsKpis(true);
    try {
      const payload = await getAdminTenantOperationsKpis({
        tenantId: cleanTenantId,
        headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : {}
      });
      setOperationsKpis(payload?.kpis && typeof payload.kpis === 'object' ? payload.kpis : null);
    } catch (error) {
      setOperationsKpis(null);
      throw error;
    } finally {
      setLoadingOperationsKpis(false);
    }
  }, [canViewOperations, buildApiHeaders]);

  const saveAssignmentRules = useCallback(async (tenantId) => {
    const cleanTenantId = String(tenantId || '').trim();
    if (!cleanTenantId) throw new Error('Selecciona una empresa para guardar reglas.');

    const payload = {
      enabled: assignmentRules.enabled === true,
      mode: assignmentRules.mode === 'round_robin' ? 'round_robin' : 'least_load',
      allowedRoles: Array.isArray(assignmentRules.allowedRoles)
        ? assignmentRules.allowedRoles.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
        : ['seller'],
      maxOpenChatsPerUser: Number.isFinite(Number(assignmentRules.maxOpenChatsPerUser))
        ? Math.max(0, Number(assignmentRules.maxOpenChatsPerUser))
        : 0,
      metadata: assignmentRules.metadata && typeof assignmentRules.metadata === 'object' ? assignmentRules.metadata : {}
    };

    const response = await updateAdminTenantAssignmentRules({
      tenantId: cleanTenantId,
      body: payload,
      headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : {}
    });
    setAssignmentRules(normalizeAssignmentRulesState(response?.rules || payload));
  }, [assignmentRules, buildApiHeaders]);

  const triggerAutoAssignPreview = useCallback(async (tenantId) => {
    const cleanTenantId = String(tenantId || '').trim();
    const targetChatId = String(unassignedCandidates[0]?.chatId || '').trim();
    if (!cleanTenantId) throw new Error('Selecciona una empresa para ejecutar auto-asignacion.');
    if (!targetChatId) throw new Error('No hay chats candidatos para auto-asignar.');

    const scopeModuleId = String(unassignedCandidates[0]?.scopeModuleId || '').trim().toLowerCase();
    await triggerAdminAutoAssign({
      tenantId: cleanTenantId,
      chatId: targetChatId,
      scopeModuleId,
      reason: 'manual_preview_from_panel',
      headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : {}
    });

    await loadTenantOperationsKpis(cleanTenantId);
  }, [unassignedCandidates, buildApiHeaders, loadTenantOperationsKpis]);

  return {
    assignmentRules,
    setAssignmentRules,
    loadingAssignmentRules,
    operationsKpis,
    loadingOperationsKpis,
    unassignedCandidates,
    operationsSnapshot,
    loadTenantAssignmentRules,
    loadTenantOperationsKpis,
    saveAssignmentRules,
    triggerAutoAssignPreview,
    resetOperationsState
  };
}



