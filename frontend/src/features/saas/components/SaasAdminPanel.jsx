import { useState } from 'react';
import {
    SaasPanelConfigAndGovernanceSections,
    SaasPanelEntitySections,
    SaasPanelFrame,
    SaasPanelNoAccess,
    SaasPanelOpsAndAutomationSections
} from './panel';
import SaasProfileModal from './profile/SaasProfileModal';
import '../saas.css';
import useSaasAdminPanelController from '../hooks/panel/controller/useSaasAdminPanelController';

const GRID_SECTION_IDS = new Set([
    'saas_operacion',
    'saas_campaigns',
    'saas_templates',
    'saas_ia',
    'saas_automations',
    'saas_etiquetas',
    'saas_zonas',
    'saas_global_labels',
    'saas_quick_replies',
    'saas_modulos',
    'saas_commercial_intelligence',
    'saas_reports',
    'saas_config',
    'saas_catalogos',
    'saas_schedules',
    'saas_roles',
    'saas_planes'
]);

export default function SaasAdminPanel(props) {
    const [profileModalSection, setProfileModalSection] = useState(null);
    const {
        isOpen,
        canManageSaas,
        selectedSectionId,
        sharedHeaderProps,
        frameProps,
        profilePanelProps,
        entitySectionsContext,
        opsAndAutomationSectionsContext,
        configAndGovernanceSectionsContext
    } = useSaasAdminPanelController(props);

    if (!isOpen) return null;

    if (!canManageSaas) {
        return <SaasPanelNoAccess {...sharedHeaderProps} />;
    }

    const enhancedFrameProps = {
        ...frameProps,
        onOpenProfile: () => setProfileModalSection('profile'),
        onOpenDevices: () => setProfileModalSection('devices'),
        onLogout: profilePanelProps?.onLogout,
        currentUserEmail: profilePanelProps?.currentUserEmail,
        currentUserTenantLabel: profilePanelProps?.activeTenantLabel
    };

    return (
        <SaasPanelFrame {...enhancedFrameProps}>
            <SaasPanelEntitySections context={entitySectionsContext} />
            {GRID_SECTION_IDS.has(selectedSectionId) && (
                <div className="saas-admin-grid">
                    <SaasPanelOpsAndAutomationSections context={opsAndAutomationSectionsContext} />
                    <SaasPanelConfigAndGovernanceSections context={configAndGovernanceSectionsContext} />
                </div>
            )}
            {profileModalSection ? (
                <SaasProfileModal
                    initialSection={profileModalSection}
                    requestJson={profilePanelProps?.requestJson}
                    onClose={() => setProfileModalSection(null)}
                    onLogoutAllDone={profilePanelProps?.onLogout}
                />
            ) : null}
        </SaasPanelFrame>
    );
}
