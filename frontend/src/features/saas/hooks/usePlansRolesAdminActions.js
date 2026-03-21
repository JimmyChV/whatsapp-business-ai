import {
    buildRoleFormFromItem,
    normalizeAccessCatalogPayload,
    normalizePlanForm,
    sanitizeRoleCode
} from '../helpers';
import {
    createAccessRoleProfile,
    fetchAccessCatalog,
    fetchSaasPlans,
    updateAccessRoleProfile
} from '../services';

export default function usePlansRolesAdminActions({
    requestJson,
    canManageRoles = false,
    selectedRoleProfile = null,
    selectedRoleKey = '',
    roleForm = {},
    rolePanelMode = 'view',
    selectedPlanId = '',
    planMatrix = {},
    planOptions = [],
    emptyRoleForm = {},
    setLoadingPlans,
    setPlanMatrix,
    setSelectedPlanId,
    setPlanForm,
    setPlanPanelMode,
    setRolePanelMode,
    setLoadingAccessCatalog,
    setAccessCatalog,
    setSelectedRoleKey,
    setRoleForm,
    runAction
} = {}) {
    const loadPlanMatrix = async () => {
        setLoadingPlans(true);
        try {
            const payload = await fetchSaasPlans(requestJson);
            const rows = Array.isArray(payload?.plans) ? payload.plans : [];
            const nextMatrix = {};
            rows.forEach((row) => {
                const planId = String(row?.id || '').trim().toLowerCase();
                if (!planId) return;
                nextMatrix[planId] = row?.limits && typeof row.limits === 'object' ? row.limits : {};
            });
            setPlanMatrix(nextMatrix);
            setSelectedPlanId((prev) => {
                const cleanPrev = String(prev || '').trim().toLowerCase();
                if (cleanPrev && nextMatrix?.[cleanPrev]) return cleanPrev;
                const withData = [...(Array.isArray(planOptions) ? planOptions : []), ...Object.keys(nextMatrix)]
                    .map((entry) => String(entry || '').trim().toLowerCase())
                    .find((entry) => Boolean(entry) && nextMatrix?.[entry]);
                return withData || (Array.isArray(planOptions) && planOptions.length > 0 ? planOptions[0] : '');
            });
        } finally {
            setLoadingPlans(false);
        }
    };

    const loadAccessCatalog = async () => {
        setLoadingAccessCatalog(true);
        try {
            const payload = await fetchAccessCatalog(requestJson);
            setAccessCatalog(normalizeAccessCatalogPayload(payload));
        } catch (_) {
            setAccessCatalog({ roleProfiles: [], permissions: [], packs: [], actor: {} });
        } finally {
            setLoadingAccessCatalog(false);
        }
    };

    const openPlanView = (planId) => {
        const cleanPlanId = String(planId || '').trim().toLowerCase();
        if (!cleanPlanId) return;
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setSelectedPlanId(cleanPlanId);
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
        setPlanPanelMode('view');
        setRolePanelMode('view');
    };

    const openPlanEdit = () => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        if (!cleanPlanId) return;
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
        setPlanPanelMode('edit');
    };

    const cancelPlanEdit = () => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
        setPlanPanelMode('view');
        setRolePanelMode('view');
    };

    const openRoleCreate = () => {
        if (!canManageRoles) return;
        setSelectedRoleKey('');
        setRoleForm(emptyRoleForm);
        setRolePanelMode('create');
    };

    const openRoleView = (roleKey) => {
        const cleanRole = String(roleKey || '').trim().toLowerCase();
        if (!cleanRole) return;
        setSelectedRoleKey(cleanRole);
        setRolePanelMode('view');
    };

    const openRoleEdit = () => {
        if (!selectedRoleProfile || !canManageRoles) return;
        setRoleForm(buildRoleFormFromItem(selectedRoleProfile));
        setRolePanelMode('edit');
    };

    const cancelRoleEdit = () => {
        if (selectedRoleProfile) {
            setRoleForm(buildRoleFormFromItem(selectedRoleProfile));
            setRolePanelMode('view');
            return;
        }
        setRoleForm(emptyRoleForm);
        setRolePanelMode('view');
    };

    const toggleRolePermission = (bucket, permissionKey, enabled) => {
        const cleanBucket = String(bucket || '').trim().toLowerCase();
        const cleanPermission = String(permissionKey || '').trim();
        if (!['required', 'optional', 'blocked'].includes(cleanBucket) || !cleanPermission) return;

        setRoleForm((prev) => {
            const required = new Set(Array.isArray(prev?.required) ? prev.required.map((entry) => String(entry || '').trim()).filter(Boolean) : []);
            const optional = new Set(Array.isArray(prev?.optional) ? prev.optional.map((entry) => String(entry || '').trim()).filter(Boolean) : []);
            const blocked = new Set(Array.isArray(prev?.blocked) ? prev.blocked.map((entry) => String(entry || '').trim()).filter(Boolean) : []);

            required.delete(cleanPermission);
            optional.delete(cleanPermission);
            blocked.delete(cleanPermission);

            if (enabled) {
                if (cleanBucket === 'required') required.add(cleanPermission);
                if (cleanBucket === 'optional') optional.add(cleanPermission);
                if (cleanBucket === 'blocked') blocked.add(cleanPermission);
            }

            return {
                ...prev,
                required: [...required].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
                optional: [...optional].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
                blocked: [...blocked].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
            };
        });
    };

    const saveRoleProfile = () => {
        if (!canManageRoles) return;

        runAction(rolePanelMode === 'create' ? 'Rol creado' : 'Rol actualizado', async () => {
            const cleanRole = sanitizeRoleCode(roleForm?.role || selectedRoleKey);
            if (!cleanRole) {
                throw new Error('El codigo del rol es obligatorio.');
            }

            const required = Array.from(new Set(
                (Array.isArray(roleForm?.required) ? roleForm.required : [])
                    .map((entry) => String(entry || '').trim())
                    .filter(Boolean)
            ));
            const optional = Array.from(new Set(
                (Array.isArray(roleForm?.optional) ? roleForm.optional : [])
                    .map((entry) => String(entry || '').trim())
                    .filter((entry) => Boolean(entry) && !required.includes(entry))
            ));
            const blocked = Array.from(new Set(
                (Array.isArray(roleForm?.blocked) ? roleForm.blocked : [])
                    .map((entry) => String(entry || '').trim())
                    .filter((entry) => Boolean(entry) && !required.includes(entry) && !optional.includes(entry))
            ));

            const body = {
                role: cleanRole,
                label: String(roleForm?.label || cleanRole).trim() || cleanRole,
                required,
                optional,
                blocked,
                active: roleForm?.active !== false
            };

            const payload = rolePanelMode === 'create'
                ? await createAccessRoleProfile(requestJson, body)
                : await updateAccessRoleProfile(requestJson, cleanRole, body);

            const nextCatalog = normalizeAccessCatalogPayload(payload);
            setAccessCatalog(nextCatalog);

            const nextSelectedRole = cleanRole;
            const nextProfile = (Array.isArray(nextCatalog.roleProfiles) ? nextCatalog.roleProfiles : [])
                .find((entry) => String(entry?.role || '').trim().toLowerCase() === nextSelectedRole) || null;

            setSelectedRoleKey(nextSelectedRole);
            setRoleForm(buildRoleFormFromItem(nextProfile));
            setRolePanelMode('view');
        });
    };

    return {
        loadPlanMatrix,
        loadAccessCatalog,
        openPlanView,
        openPlanEdit,
        cancelPlanEdit,
        openRoleCreate,
        openRoleView,
        openRoleEdit,
        cancelRoleEdit,
        toggleRolePermission,
        saveRoleProfile
    };
}
