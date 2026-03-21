import { useMemo } from 'react';
import { sanitizeMemberships } from '../helpers';

export default function useSaasTenantUsers({
    overviewUsers = [],
    settingsTenantId = '',
    waModuleForm = {},
    toUserDisplayName
} = {}) {
    const usersByTenant = useMemo(() => {
        const map = new Map();
        (overviewUsers || []).forEach((user) => {
            sanitizeMemberships(user?.memberships || []).forEach((membership) => {
                const tenantId = String(membership?.tenantId || '').trim();
                if (!tenantId) return;
                const bucket = map.get(tenantId) || [];
                bucket.push({
                    ...user,
                    membershipRole: membership.role,
                    membershipActive: membership.active !== false
                });
                map.set(tenantId, bucket);
            });
        });
        return map;
    }, [overviewUsers]);

    const usersForSettingsTenant = useMemo(() => {
        const cleanTenantId = String(settingsTenantId || '').trim();
        if (!cleanTenantId) return [];
        return [...(usersByTenant.get(cleanTenantId) || [])]
            .sort((left, right) => toUserDisplayName(left).localeCompare(toUserDisplayName(right), 'es', { sensitivity: 'base' }));
    }, [settingsTenantId, usersByTenant, toUserDisplayName]);

    const assignedModuleUsers = useMemo(() => {
        const assignedIds = new Set((Array.isArray(waModuleForm?.assignedUserIds) ? waModuleForm.assignedUserIds : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean));
        return usersForSettingsTenant.filter((user) => assignedIds.has(String(user?.id || '').trim()));
    }, [usersForSettingsTenant, waModuleForm?.assignedUserIds]);

    const availableUsersForModulePicker = useMemo(() => {
        const assignedIds = new Set((Array.isArray(waModuleForm?.assignedUserIds) ? waModuleForm.assignedUserIds : [])
            .map((entry) => String(entry || '').trim())
            .filter(Boolean));
        return usersForSettingsTenant.filter((user) => !assignedIds.has(String(user?.id || '').trim()));
    }, [usersForSettingsTenant, waModuleForm?.assignedUserIds]);

    return {
        usersByTenant,
        usersForSettingsTenant,
        assignedModuleUsers,
        availableUsersForModulePicker
    };
}

