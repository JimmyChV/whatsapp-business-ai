export const sanitizeWorkspaceKey = (value = '') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');
  return normalized || 'default';
};

const normalizeWorkspaceMode = (mode = '') =>
  String(mode || '').trim().toLowerCase() === 'operation' ? 'operation' : 'panel';

export const buildWorkspaceUrl = ({
  baseHref = '',
  mode = 'operation',
  tenantId = '',
  moduleId = '',
  source = '',
  section = ''
} = {}) => {
  const currentHref = String(baseHref || '').trim() || window.location.href;
  const nextUrl = new URL(currentHref);
  const cleanTenantId = String(tenantId || '').trim();
  const cleanModuleId = String(moduleId || '').trim().toLowerCase();
  const cleanMode = normalizeWorkspaceMode(mode);
  const cleanSource = String(source || '').trim().toLowerCase();

  if (cleanMode === 'operation') {
    nextUrl.searchParams.set('wa_launch', 'operation');
    if (cleanModuleId) nextUrl.searchParams.set('wa_module', cleanModuleId);
    else nextUrl.searchParams.delete('wa_module');
    nextUrl.searchParams.delete('wa_section');
  } else {
    nextUrl.searchParams.delete('wa_launch');
    nextUrl.searchParams.delete('wa_module');
    const cleanSection = String(section || '').trim().toLowerCase();
    if (cleanSection) nextUrl.searchParams.set('wa_section', cleanSection);
    else nextUrl.searchParams.delete('wa_section');
  }

  if (cleanTenantId) nextUrl.searchParams.set('wa_tenant', cleanTenantId);
  else nextUrl.searchParams.delete('wa_tenant');

  if (cleanSource) nextUrl.searchParams.set('wa_from', cleanSource);
  else nextUrl.searchParams.delete('wa_from');

  return nextUrl;
};

export const isWorkspaceTabAligned = (
  rawHref = '',
  { mode = 'operation', tenantId = '', section = '' } = {}
) => {
  try {
    const current = new URL(String(rawHref || ''));
    const currentMode = String(current.searchParams.get('wa_launch') || '').trim().toLowerCase() === 'operation'
      ? 'operation'
      : 'panel';
    const currentTenant = String(current.searchParams.get('wa_tenant') || '').trim();
    const currentSection = String(current.searchParams.get('wa_section') || '').trim().toLowerCase();
    const expectedMode = normalizeWorkspaceMode(mode);
    const expectedTenant = String(tenantId || '').trim();
    const expectedSection = String(section || '').trim().toLowerCase();

    if (currentMode !== expectedMode) return false;
    if (currentTenant !== expectedTenant) return false;
    if (expectedMode === 'panel' && expectedSection) return currentSection === expectedSection;
    return true;
  } catch (_) {
    return false;
  }
};

export const openOrFocusWorkspaceTab = ({
  mode = 'operation',
  tenantId = '',
  moduleId = '',
  source = '',
  section = ''
} = {}) => {
  const cleanTenantId = String(tenantId || '').trim();
  const cleanMode = normalizeWorkspaceMode(mode);
  const targetUrl = buildWorkspaceUrl({
    mode: cleanMode,
    tenantId: cleanTenantId,
    moduleId,
    source,
    section
  });

  const targetName = cleanMode === 'operation'
    ? `lavitat_chat_${sanitizeWorkspaceKey(cleanTenantId)}`
    : `lavitat_panel_${sanitizeWorkspaceKey(cleanTenantId)}`;

  let targetWindow = null;
  try {
    targetWindow = window.open('', targetName);
  } catch (_) {
    targetWindow = null;
  }

  if (!targetWindow) {
    window.location.assign(targetUrl.toString());
    return;
  }

  let mustNavigate = true;
  try {
    const currentHref = String(targetWindow.location?.href || '').trim();
    if (currentHref && currentHref !== 'about:blank') {
      mustNavigate = !isWorkspaceTabAligned(currentHref, {
        mode: cleanMode,
        tenantId: cleanTenantId,
        section
      });
    }
  } catch (_) {
    mustNavigate = true;
  }

  if (mustNavigate) {
    targetWindow.location.href = targetUrl.toString();
  }
  targetWindow.focus();
};
