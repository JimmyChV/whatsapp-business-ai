export default function useSaasOperationsController(input = {}) {
    const {
        operationsPanelState = {},
        operationAccess = null,
        assignmentRoleOptions = []
    } = input;

    const operationsState = {
        assignmentRules: operationsPanelState.assignmentRules,
        setAssignmentRules: operationsPanelState.setAssignmentRules,
        loadingAssignmentRules: operationsPanelState.loadingAssignmentRules,
        operationsKpis: operationsPanelState.operationsKpis,
        loadingOperationsKpis: operationsPanelState.loadingOperationsKpis
    };

    const operationsDerived = {
        unassignedCandidates: operationsPanelState.unassignedCandidates,
        operationsSnapshot: operationsPanelState.operationsSnapshot,
        operationAccess
    };

    const operationsActions = {
        loadTenantAssignmentRules: operationsPanelState.loadTenantAssignmentRules,
        loadTenantOperationsKpis: operationsPanelState.loadTenantOperationsKpis,
        saveAssignmentRules: operationsPanelState.saveAssignmentRules,
        triggerAutoAssignPreview: operationsPanelState.triggerAutoAssignPreview,
        resetOperationsState: operationsPanelState.resetOperationsState
    };

    return {
        operationsState,
        operationsDerived,
        operationsActions,
        assignmentRoleOptions
    };
}
