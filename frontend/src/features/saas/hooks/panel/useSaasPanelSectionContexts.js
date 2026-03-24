import buildConfigAndGovernanceSectionContext from './contexts/buildConfigAndGovernanceSectionContext';
import buildEntitySectionContext from './contexts/buildEntitySectionContext';
import buildOpsAndAutomationSectionContext from './contexts/buildOpsAndAutomationSectionContext';

const SECTION_CONTEXT_SOURCE_ORDER = [
    'panelCoreState',
    'saasAccessControl',
    'operationsPanelState',
    'panelLoadingState',
    'tenantScopeState',
    'tenantDataLoaders',
    'panelUserScopeState',
    'panelDerivedData',
    'tenantUsersState',
    'quickReplyAssetsUploadState',
    'quickReplyAdminActions',
    'tenantLabelsAdminActions',
    'catalogAdminActions',
    'aiAssistantsAdminActions',
    'plansRolesActions',
    'tenantsUsersActions',
    'customersAdminActions',
    'panelNavigation',
    'operationAccess',
    'moduleSectionActions',
    'lifecycleState',
    'extras'
];

function hasOwn(source, key) {
    return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function createSectionContextReader(input = {}) {
    const namedSources = SECTION_CONTEXT_SOURCE_ORDER
        .map((sourceKey) => input?.[sourceKey])
        .filter((source) => source && typeof source === 'object');

    return new Proxy({}, {
        get(_target, propName) {
            if (typeof propName !== 'string') return undefined;
            if (hasOwn(input, propName)) return input[propName];
            for (const source of namedSources) {
                if (hasOwn(source, propName)) return source[propName];
            }
            return undefined;
        }
    });
}

export default function useSaasPanelSectionContexts(input = {}) {
    const c = createSectionContextReader(input);

    const entitySectionsContext = buildEntitySectionContext(c);
    const opsAndAutomationSectionsContext = buildOpsAndAutomationSectionContext(c);
    const configAndGovernanceSectionsContext = buildConfigAndGovernanceSectionContext(c);

    return {
        entitySectionsContext,
        opsAndAutomationSectionsContext,
        configAndGovernanceSectionsContext
    };
}
