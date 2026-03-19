module.exports = {
    authService: require('../../auth_service'),
    authRecoveryService: require('../../auth_recovery_service'),
    accessPolicyService: require('./access-policy.service'),
    planLimitsService: require('../../plan_limits_service'),
    planLimitsStoreService: require('../../plan_limits_store_service'),
    auditLogService: require('../../audit_log_service')
};
