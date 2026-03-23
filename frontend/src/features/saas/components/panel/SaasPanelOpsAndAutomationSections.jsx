import {
    AiAssistantsSection,
    OperationsSection,
    QuickRepliesSection,
    TenantLabelsSection
} from '../../sections';

export default function SaasPanelOpsAndAutomationSections(props = {}) {
    const context = props.context && typeof props.context === 'object' ? props.context : props;
    const isOperationsSection = context?.isOperationsSection === true;
    const isLabelsSection = context?.isLabelsSection === true;
    const isQuickRepliesSection = context?.isQuickRepliesSection === true;
    return (
        <>
            {isOperationsSection && (
                <OperationsSection context={context} />
            )}

            <AiAssistantsSection context={context} />

            {isLabelsSection && (
                <TenantLabelsSection context={context} />
            )}

            {isQuickRepliesSection && (
                <QuickRepliesSection context={context} />
            )}
        </>
    );
}
