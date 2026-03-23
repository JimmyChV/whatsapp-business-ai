import {
    CatalogSection,
    ModulesConfigSection,
    PlansSection,
    RoleProfilesSection
} from '../../sections';

export default function SaasPanelConfigAndGovernanceSections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const isGeneralConfigSection = context?.isGeneralConfigSection === true;
    const isModulesSection = context?.isModulesSection === true;
    const isCatalogSection = context?.isCatalogSection === true;
    const isRolesSection = context?.isRolesSection === true;
    const isPlansSection = context?.isPlansSection === true;
    return (
        <>
            <ModulesConfigSection context={context} />

            <CatalogSection context={context} />

            <RoleProfilesSection context={context} />

            <PlansSection context={context} />
        </>
    );
}
