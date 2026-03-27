import {
    SaasPanelConfigAndGovernanceSections,
    SaasPanelEntitySections,
    SaasPanelFrame,
    SaasPanelNoAccess,
    SaasPanelOpsAndAutomationSections
} from './panel';
import '../saas.css';
import useSaasAdminPanelController from '../hooks/panel/controller/useSaasAdminPanelController';

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
            {selectedSectionId !== 'saas_resumen' && (
                <div className="saas-admin-grid">
                    <SaasPanelOpsAndAutomationSections context={opsAndAutomationSectionsContext} />
                    <SaasPanelConfigAndGovernanceSections context={configAndGovernanceSectionsContext} />
                </div>
            )}
        </SaasPanelFrame>
    );
}
