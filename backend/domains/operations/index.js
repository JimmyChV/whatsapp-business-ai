module.exports = {
    messageHistoryService: require('../../message_history_service'),
    conversationOpsService: require('../../conversation_ops_service'),
    assignmentRulesService: require('../../assignment_rules_service'),
    chatAssignmentRouterService: require('../../chat_assignment_router_service'),
    operationsKpiService: require('../../operations_kpi_service'),
    opsTelemetry: require('../../ops_telemetry'),
    registerOperationsHttpRoutes: require('./http-routes').registerOperationsHttpRoutes
};

