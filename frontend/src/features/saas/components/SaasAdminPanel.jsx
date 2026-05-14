import {
    SaasPanelConfigAndGovernanceSections,
    SaasPanelEntitySections,
    SaasPanelFrame,
    SaasPanelNoAccess,
    SaasPanelOpsAndAutomationSections
} from './panel';
import '../saas.css';
import useSaasAdminPanelController from '../hooks/panel/controller/useSaasAdminPanelController';

const GRID_SECTION_IDS = new Set([
    'saas_operacion',
    'saas_campaigns',
    'saas_templates',
    'saas_ia',
    'saas_automations',
    'saas_etiquetas',
    'saas_global_labels',
    'saas_quick_replies',
    'saas_modulos',
    'saas_config',
    'saas_catalogos',
    'saas_roles',
    'saas_planes'
]);

export default function SaasAdminPanel(props) {
    const {
        isOpen,
        canManageSaas,
        selectedSectionId,
        sharedHeaderProps,
        frameProps,
        entitySectionsContext,
        opsAndAutomationSectionsContext,
        configAndGovernanceSectionsContext
    } = useSaasAdminPanelController(props);

    if (!isOpen) return null;

    if (!canManageSaas) {
        return <SaasPanelNoAccess {...sharedHeaderProps} />;
    }

    return (
        <SaasPanelFrame {...frameProps}>
            <SaasPanelEntitySections context={entitySectionsContext} />
            {GRID_SECTION_IDS.has(selectedSectionId) && (
                <div className="saas-admin-grid">
                    <SaasPanelOpsAndAutomationSections context={opsAndAutomationSectionsContext} />
                    <SaasPanelConfigAndGovernanceSections context={configAndGovernanceSectionsContext} />
                </div>
            )}
        </SaasPanelFrame>
    );
}
