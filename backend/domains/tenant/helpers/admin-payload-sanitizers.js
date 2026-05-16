function createTenantAdminPayloadSanitizers({
    accessPolicyService,
    quickReplyLibrariesService,
    tenantLabelService
} = {}) {
    if (!accessPolicyService || !quickReplyLibrariesService || !tenantLabelService) {
        throw new Error('createTenantAdminPayloadSanitizers requires accessPolicyService, quickReplyLibrariesService and tenantLabelService');
    }

    function sanitizeMembershipPayload(memberships = []) {
        const source = Array.isArray(memberships) ? memberships : [];
        const normalized = source
            .map((item) => ({
                tenantId: String(item?.tenantId || item?.tenant || item?.id || '').trim(),
                role: String(item?.role || 'seller').trim().toLowerCase() || 'seller',
                active: item?.active !== false
            }))
            .filter((item) => Boolean(item.tenantId));

        if (!normalized.length) return [];
        const primary = normalized.find((item) => item.active !== false) || normalized[0];
        return [primary];
    }

    function sanitizeObjectPayload(value = {}) {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        return {};
    }

    function sanitizeUrlValue(value = '') {
        const textValue = String(value || '').trim();
        if (!textValue) return null;
        return /^https?:\/\//i.test(textValue) ? textValue : null;
    }

    function sanitizeTenantPayload(payload = {}) {
        const source = sanitizeObjectPayload(payload);
        const patch = {};

        if (Object.prototype.hasOwnProperty.call(source, 'id') || Object.prototype.hasOwnProperty.call(source, 'tenantId')) {
            const id = String(source.id || source.tenantId || '').trim();
            if (id) patch.id = id;
        }
        if (Object.prototype.hasOwnProperty.call(source, 'slug')) patch.slug = String(source.slug || '').trim();
        if (Object.prototype.hasOwnProperty.call(source, 'name')) patch.name = String(source.name || '').trim();
        if (Object.prototype.hasOwnProperty.call(source, 'plan')) patch.plan = String(source.plan || '').trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(source, 'active')) patch.active = source.active !== false;
        if (Object.prototype.hasOwnProperty.call(source, 'logoUrl') || Object.prototype.hasOwnProperty.call(source, 'logo_url')) {
            patch.logoUrl = sanitizeUrlValue(source.logoUrl || source.logo_url);
        }
        if (Object.prototype.hasOwnProperty.call(source, 'coverImageUrl') || Object.prototype.hasOwnProperty.call(source, 'cover_image_url')) {
            patch.coverImageUrl = sanitizeUrlValue(source.coverImageUrl || source.cover_image_url);
        }

        return patch;
    }

    function sanitizeUserPayload(payload = {}, { allowMemberships = true } = {}) {
        const source = sanitizeObjectPayload(payload);
        const patch = {};

        if (Object.prototype.hasOwnProperty.call(source, 'id') || Object.prototype.hasOwnProperty.call(source, 'userId')) {
            const id = String(source.id || source.userId || '').trim();
            if (id) patch.id = id;
        }
        if (Object.prototype.hasOwnProperty.call(source, 'email')) patch.email = String(source.email || '').trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(source, 'name')) patch.name = String(source.name || '').trim();
        if (Object.prototype.hasOwnProperty.call(source, 'password')) patch.password = String(source.password || '');
        if (Object.prototype.hasOwnProperty.call(source, 'active')) patch.active = source.active !== false;
        if (Object.prototype.hasOwnProperty.call(source, 'avatarUrl') || Object.prototype.hasOwnProperty.call(source, 'avatar_url')) {
            patch.avatarUrl = sanitizeUrlValue(source.avatarUrl || source.avatar_url);
        }
        if (Object.prototype.hasOwnProperty.call(source, 'permissionGrants')) {
            patch.permissionGrants = accessPolicyService.normalizePermissionList(source.permissionGrants);
        }
        if (Object.prototype.hasOwnProperty.call(source, 'permissionPacks')) {
            patch.permissionPacks = accessPolicyService.normalizePackList(source.permissionPacks);
        }
        if (Object.prototype.hasOwnProperty.call(source, 'role')) {
            patch.role = accessPolicyService.normalizeRole(source.role || 'seller');
        }
        if (allowMemberships && Object.prototype.hasOwnProperty.call(source, 'memberships')) {
            patch.memberships = sanitizeMembershipPayload(source.memberships);
        }

        return patch;
    }

    function hasOwnerRoleMembership(memberships = []) {
        const source = Array.isArray(memberships) ? memberships : [];
        return source.some((item) => String(item?.role || '').trim().toLowerCase() === 'owner');
    }

    function sanitizeCatalogIdListPayload(value = []) {
        const source = Array.isArray(value) ? value : [];
        const seen = new Set();
        const out = [];
        source.forEach((entry) => {
            const clean = String(entry || '').trim().toUpperCase();
            if (!/^CAT-[A-Z0-9]{4,}$/.test(clean)) return;
            if (seen.has(clean)) return;
            seen.add(clean);
            out.push(clean);
        });
        return out;
    }

    function sanitizeAiAssistantIdPayload(value = '') {
        const clean = String(value || '').trim().toUpperCase();
        if (!clean) return null;
        return /^AIA-[A-Z0-9]{6}$/.test(clean) ? clean : null;
    }

    function sanitizeModuleScheduleIdPayload(value = null) {
        const clean = String(value || '').trim();
        return clean || null;
    }

    function sanitizeModuleAiConfigPayload(value = {}) {
        const source = sanitizeObjectPayload(value);
        const withinHoursMode = ['review', 'off'].includes(String(source.withinHoursMode || '').trim())
            ? String(source.withinHoursMode || '').trim()
            : 'review';
        const outsideHoursMode = ['autonomous', 'review', 'off'].includes(String(source.outsideHoursMode || '').trim())
            ? String(source.outsideHoursMode || '').trim()
            : 'autonomous';
        const parsedWaitSeconds = Number.parseInt(String(source.waitSeconds ?? source.wait_seconds ?? ''), 10);
        const parsedWaitMinutes = Number.parseFloat(String(source.waitMinutes ?? source.wait_minutes ?? ''));
        const waitSeconds = Number.isFinite(parsedWaitSeconds)
            ? Math.max(5, Math.min(300, parsedWaitSeconds))
            : (Number.isFinite(parsedWaitMinutes) && parsedWaitMinutes > 0
                ? Math.max(5, Math.min(300, Math.round(parsedWaitMinutes * 60)))
                : 15);
        return {
            assistantName: String(source.assistantName || '').trim() || 'Patty',
            withinHoursMode,
            outsideHoursMode,
            waitSeconds
        };
    }

    function sanitizeWaModulePayload(payload = {}, { allowModuleId = true } = {}) {
        const source = sanitizeObjectPayload(payload);
        const sourceMetadata = sanitizeObjectPayload(source.metadata);
        const topCloudConfig = sanitizeObjectPayload(source.cloudConfig);
        const nestedCloudConfig = sanitizeObjectPayload(sourceMetadata.cloudConfig);
        const cloudConfig = Object.keys(topCloudConfig).length > 0
            ? { ...nestedCloudConfig, ...topCloudConfig }
            : nestedCloudConfig;

        const metadataModuleSettings = sanitizeObjectPayload(sourceMetadata.moduleSettings);
        const incomingCatalogIds = sanitizeCatalogIdListPayload(
            Array.isArray(source.catalogIds)
                ? source.catalogIds
                : (Array.isArray(metadataModuleSettings.catalogIds) ? metadataModuleSettings.catalogIds : [])
        );
        const incomingAiAssistantId = sanitizeAiAssistantIdPayload(
            source.aiAssistantId
            || source.moduleAiAssistantId
            || metadataModuleSettings.aiAssistantId
        );
        const hasScheduleIdPayload = Object.prototype.hasOwnProperty.call(source, 'scheduleId')
            || Object.prototype.hasOwnProperty.call(sourceMetadata, 'scheduleId');
        const hasAiConfigPayload = Object.prototype.hasOwnProperty.call(source, 'aiConfig')
            || Object.prototype.hasOwnProperty.call(sourceMetadata, 'aiConfig');
        const incomingScheduleId = Object.prototype.hasOwnProperty.call(source, 'scheduleId')
            ? sanitizeModuleScheduleIdPayload(source.scheduleId)
            : sanitizeModuleScheduleIdPayload(sourceMetadata.scheduleId);
        const incomingAiConfig = Object.prototype.hasOwnProperty.call(source, 'aiConfig')
            ? sanitizeModuleAiConfigPayload(source.aiConfig)
            : sanitizeModuleAiConfigPayload(sourceMetadata.aiConfig);

        const base = {
            name: String(source.name || '').trim(),
            phoneNumber: String(source.phoneNumber || source.phone || source.number || '').trim() || null,
            transportMode: String(source.transportMode || source.transport || source.mode || '').trim().toLowerCase() || 'cloud',
            imageUrl: sanitizeUrlValue(source.imageUrl || source.image_url || source.logoUrl || source.logo_url),
            isActive: source.isActive !== false,
            isDefault: source.isDefault === true,
            isSelected: source.isSelected === true,
            assignedUserIds: Array.isArray(source.assignedUserIds)
                ? source.assignedUserIds.map((entry) => String(entry || '').trim()).filter(Boolean)
                : [],
            metadata: {
                ...sourceMetadata,
                ...(hasScheduleIdPayload ? { scheduleId: incomingScheduleId } : {}),
                ...(hasAiConfigPayload ? { aiConfig: incomingAiConfig } : {}),
                moduleSettings: {
                    ...metadataModuleSettings,
                    catalogIds: incomingCatalogIds,
                    aiAssistantId: incomingAiAssistantId
                },
                cloudConfig
            }
        };

        if (allowModuleId) {
            const moduleId = String(source.moduleId || source.id || '').trim();
            if (moduleId) base.moduleId = moduleId;
        }

        return base;
    }

    function sanitizeAiAssistantPayload(payload = {}, { allowAssistantId = true } = {}) {
        const source = sanitizeObjectPayload(payload);
        const base = {
            name: String(source.name || '').trim(),
            description: String(source.description || '').trim() || null,
            provider: String(source.provider || 'openai').trim().toLowerCase() || 'openai',
            model: String(source.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
            systemPrompt: String(source.systemPrompt || '').trim() || null,
            temperature: Math.max(0, Math.min(2, Number(source.temperature ?? 0.7) || 0.7)),
            topP: Math.max(0, Math.min(1, Number(source.topP ?? 1) || 1)),
            maxTokens: Math.max(64, Math.min(4096, Number(source.maxTokens ?? 800) || 800)),
            isActive: source.isActive !== false,
            isDefault: source.isDefault === true
        };

        const openaiApiKey = String(source.openaiApiKey || source.apiKey || '').trim();
        if (openaiApiKey) base.openaiApiKey = openaiApiKey;

        if (allowAssistantId) {
            const assistantId = sanitizeAiAssistantIdPayload(source.assistantId || source.id || '');
            if (assistantId) base.assistantId = assistantId;
        }

        return base;
    }

    function sanitizeQuickReplyLibraryPayload(payload = {}, { allowLibraryId = true } = {}) {
        const source = sanitizeObjectPayload(payload);
        const cleanLibraryId = quickReplyLibrariesService.normalizeLibraryId(source.libraryId || source.id || '');
        const moduleIds = Array.isArray(source.moduleIds)
            ? Array.from(new Set(source.moduleIds.map((entry) => quickReplyLibrariesService.normalizeModuleId(entry)).filter(Boolean)))
            : [];

        const parsedSortOrder = Number.parseInt(String(source.sortOrder ?? ''), 10);
        const sortOrder = Number.isFinite(parsedSortOrder) ? Math.max(1, parsedSortOrder) : 1000;
        const isShared = source.isShared !== false;

        const base = {
            name: String(source.name || source.libraryName || '').trim(),
            description: String(source.description || '').trim() || '',
            isShared,
            isActive: source.isActive !== false,
            sortOrder,
            moduleIds: isShared ? [] : moduleIds
        };

        if (allowLibraryId && cleanLibraryId) base.libraryId = cleanLibraryId;
        return base;
    }

    function normalizeQuickReplyMediaAsset(input = {}) {
        const source = input && typeof input === 'object' ? input : {};
        const url = String(source.url || source.mediaUrl || source.media_url || '').trim();
        if (!url) return null;
        const mimeType = String(source.mimeType || source.mediaMimeType || source.media_mime_type || '').trim().toLowerCase() || null;
        const fileName = String(source.fileName || source.mediaFileName || source.media_file_name || source.filename || '').trim() || null;
        const sizeRaw = Number(source.sizeBytes ?? source.mediaSizeBytes ?? source.media_size_bytes);
        const sizeBytes = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : null;
        return {
            url,
            mimeType,
            fileName,
            sizeBytes
        };
    }

    function normalizeQuickReplyMediaAssets(value = [], fallback = null) {
        const source = Array.isArray(value) ? value : [];
        const seen = new Set();
        const assets = source
            .map((entry) => normalizeQuickReplyMediaAsset(entry))
            .filter(Boolean)
            .filter((entry) => {
                const dedupeKey = `${String(entry.url || '').trim()}|${String(entry.fileName || '').trim()}|${String(entry.mimeType || '').trim()}`;
                if (!dedupeKey || seen.has(dedupeKey)) return false;
                seen.add(dedupeKey);
                return true;
            });
        if (assets.length > 0) return assets;
        const fallbackAsset = normalizeQuickReplyMediaAsset(fallback);
        return fallbackAsset ? [fallbackAsset] : [];
    }

    function sanitizeQuickReplyItemPayload(payload = {}, { allowItemId = true } = {}) {
        const source = sanitizeObjectPayload(payload);
        const cleanItemId = quickReplyLibrariesService.normalizeItemId(source.itemId || source.id || '');
        const cleanLibraryId = quickReplyLibrariesService.normalizeLibraryId(source.libraryId || source.library || quickReplyLibrariesService.DEFAULT_LIBRARY_ID || '');
        const parsedSortOrder = Number.parseInt(String(source.sortOrder ?? ''), 10);
        const sortOrder = Number.isFinite(parsedSortOrder) ? Math.max(1, parsedSortOrder) : 1000;
        const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
            ? source.metadata
            : {};
        const mediaAssets = normalizeQuickReplyMediaAssets(source.mediaAssets || metadata.mediaAssets, {
            url: source.mediaUrl || source.media_url || '',
            mimeType: source.mediaMimeType || source.media_mime_type || '',
            fileName: source.mediaFileName || source.media_file_name || '',
            sizeBytes: source.mediaSizeBytes
        });
        const primaryMedia = mediaAssets[0] || null;

        const base = {
            libraryId: cleanLibraryId,
            label: String(source.label || '').trim(),
            text: String(source.text || source.bodyText || source.body || '').trim(),
            mediaAssets,
            mediaUrl: String(primaryMedia?.url || source.mediaUrl || source.media_url || '').trim() || null,
            mediaMimeType: String(primaryMedia?.mimeType || source.mediaMimeType || source.media_mime_type || '').trim().toLowerCase() || null,
            mediaFileName: String(primaryMedia?.fileName || source.mediaFileName || source.media_file_name || '').trim() || null,
            mediaSizeBytes: Number.isFinite(Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes)) ? Number(primaryMedia?.sizeBytes ?? source.mediaSizeBytes) : null,
            isActive: source.isActive !== false,
            sortOrder
        };

        if (allowItemId && cleanItemId) base.itemId = cleanItemId;
        return base;
    }

    function sanitizeTenantLabelPayload(payload = {}, { allowLabelId = true } = {}) {
        const source = sanitizeObjectPayload(payload);
        const cleanLabelId = tenantLabelService.normalizeLabelId(source.labelId || source.id || '');
        const parsedSortOrder = Number.parseInt(String(source.sortOrder ?? ''), 10);
        const sortOrder = Number.isFinite(parsedSortOrder) ? Math.max(1, parsedSortOrder) : 1000;
        const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
            ? source.metadata
            : {};

        const base = {
            name: String(source.name || source.label || '').trim(),
            description: String(source.description || '').trim(),
            color: tenantLabelService.normalizeColor(source.color || source.hex || ''),
            isActive: source.isActive !== false,
            sortOrder,
            metadata
        };

        if (allowLabelId && cleanLabelId) base.labelId = cleanLabelId;
        return base;
    }

    return {
        sanitizeMembershipPayload,
        sanitizeObjectPayload,
        sanitizeUrlValue,
        sanitizeTenantPayload,
        sanitizeUserPayload,
        hasOwnerRoleMembership,
        sanitizeCatalogIdListPayload,
        sanitizeAiAssistantIdPayload,
        sanitizeWaModulePayload,
        sanitizeAiAssistantPayload,
        sanitizeQuickReplyLibraryPayload,
        normalizeQuickReplyMediaAsset,
        normalizeQuickReplyMediaAssets,
        sanitizeQuickReplyItemPayload,
        sanitizeTenantLabelPayload
    };
}

module.exports = {
    createTenantAdminPayloadSanitizers
};
