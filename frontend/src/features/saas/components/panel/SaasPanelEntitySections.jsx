import {
    CompaniesSection,
    CustomersSection,
    SummarySection,
    UsersSection
} from '../../sections';

export default function SaasPanelEntitySections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const selectedSectionId = context?.selectedSectionId || 'saas_resumen';
    return (
        <>
            <SummarySection context={context} />
            {selectedSectionId !== 'saas_resumen' && (
                <>
                    <CompaniesSection context={context} />
                    <UsersSection context={context} />
                    <CustomersSection context={context} />
                </>
            )}
        </>
    );
}
