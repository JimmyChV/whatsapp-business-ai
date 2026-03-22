import { useCallback } from 'react';

import { openOrFocusWorkspaceTab } from '../helpers/workspaceTabs.helpers';

export default function useWorkspaceNavigation({
  tenantScopeId = '',
  setShowSaasAdminPanel
} = {}) {
  const openWhatsAppOperation = useCallback((moduleId = '', options = {}) => {
    const preferredModuleId = String(moduleId || '').trim();
    const targetTenantId = String(options?.tenantId || tenantScopeId || '').trim();
    if (!targetTenantId) return;

    setShowSaasAdminPanel?.(false);
    openOrFocusWorkspaceTab({
      mode: 'operation',
      tenantId: targetTenantId,
      moduleId: preferredModuleId,
      source: 'panel'
    });
  }, [setShowSaasAdminPanel, tenantScopeId]);

  const openSaasAdminWorkspace = useCallback((options = {}) => {
    const targetTenantId = String(options?.tenantId || tenantScopeId || '').trim();
    const targetSectionId = String(options?.section || '').trim().toLowerCase();
    if (!targetTenantId) return;

    setShowSaasAdminPanel?.(false);
    openOrFocusWorkspaceTab({
      mode: 'panel',
      tenantId: targetTenantId,
      source: 'chat',
      section: targetSectionId
    });
  }, [setShowSaasAdminPanel, tenantScopeId]);

  return {
    openWhatsAppOperation,
    openSaasAdminWorkspace
  };
}
