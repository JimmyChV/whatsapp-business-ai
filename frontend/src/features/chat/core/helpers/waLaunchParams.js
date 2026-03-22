export function readWaLaunchParams(search = '') {
  try {
    const params = new URLSearchParams(search || '');
    const launch = String(params.get('wa_launch') || '').trim().toLowerCase() === 'operation';
    const moduleId = String(params.get('wa_module') || '').trim().toLowerCase();
    const tenantId = String(params.get('wa_tenant') || '').trim();
    const sectionId = String(params.get('wa_section') || '').trim().toLowerCase();
    const source = String(params.get('wa_from') || '').trim().toLowerCase();
    return {
      forceOperationLaunch: launch,
      requestedWaModuleId: moduleId || '',
      requestedWaTenantId: tenantId || '',
      requestedWaSectionId: sectionId || '',
      requestedLaunchSource: source || ''
    };
  } catch (_) {
    return {
      forceOperationLaunch: false,
      requestedWaModuleId: '',
      requestedWaTenantId: '',
      requestedWaSectionId: '',
      requestedLaunchSource: ''
    };
  }
}
