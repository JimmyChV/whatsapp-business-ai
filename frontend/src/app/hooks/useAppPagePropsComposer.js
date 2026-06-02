import { createElement } from 'react';
import { buildOperationPageProps } from '../helpers/operationPageProps';

export default function useAppPagePropsComposer({
  sessionBlock = {},
  socketBlock = {},
  handlersBlock = {},
  uiStateBlock = {}
} = {}) {
  const operationPageProps = buildOperationPageProps({
    ...sessionBlock,
    ...socketBlock,
    ...handlersBlock,
    ...uiStateBlock
  });

  const loginScreenProps = {
    loginEmail: sessionBlock.loginEmail,
    setLoginEmail: sessionBlock.setLoginEmail,
    loginPassword: sessionBlock.loginPassword,
    setLoginPassword: sessionBlock.setLoginPassword,
    showLoginPassword: sessionBlock.showLoginPassword,
    setShowLoginPassword: sessionBlock.setShowLoginPassword,
    saasAuthBusy: sessionBlock.saasAuthBusy,
    saasAuthError: sessionBlock.saasAuthError,
    saasAuthNotice: sessionBlock.saasAuthNotice,
    recoveryStep: sessionBlock.recoveryStep,
    recoveryBusy: sessionBlock.recoveryBusy,
    recoveryError: sessionBlock.recoveryError,
    recoveryNotice: sessionBlock.recoveryNotice,
    recoveryDebugCode: sessionBlock.recoveryDebugCode,
    recoveryEmail: sessionBlock.recoveryEmail,
    setRecoveryEmail: sessionBlock.setRecoveryEmail,
    recoveryCode: sessionBlock.recoveryCode,
    setRecoveryCode: sessionBlock.setRecoveryCode,
    recoveryPassword: sessionBlock.recoveryPassword,
    setRecoveryPassword: sessionBlock.setRecoveryPassword,
    recoveryPasswordConfirm: sessionBlock.recoveryPasswordConfirm,
    setRecoveryPasswordConfirm: sessionBlock.setRecoveryPasswordConfirm,
    showRecoveryPassword: sessionBlock.showRecoveryPassword,
    setShowRecoveryPassword: sessionBlock.setShowRecoveryPassword,
    handleSaasLogin: sessionBlock.handleSaasLogin,
    deviceAuthStep: sessionBlock.deviceAuthStep,
    pendingDeviceAuth: sessionBlock.pendingDeviceAuth,
    loginRetryRemainingSec: sessionBlock.loginRetryRemainingSec,
    otpCode: sessionBlock.otpCode,
    setOtpCode: sessionBlock.setOtpCode,
    deviceName: sessionBlock.deviceName,
    setDeviceName: sessionBlock.setDeviceName,
    otpResendAvailableAt: sessionBlock.otpResendAvailableAt,
    handleOtpBack: sessionBlock.handleOtpBack,
    handleOtpContinue: sessionBlock.handleOtpContinue,
    handleVerifyDeviceOtp: sessionBlock.handleVerifyDeviceOtp,
    handleResendDeviceOtp: sessionBlock.handleResendDeviceOtp,
    openRecoveryFlow: sessionBlock.openRecoveryFlow,
    handleRecoveryRequest: sessionBlock.handleRecoveryRequest,
    handleRecoveryVerify: sessionBlock.handleRecoveryVerify,
    handleRecoveryReset: sessionBlock.handleRecoveryReset,
    resetRecoveryFlow: sessionBlock.resetRecoveryFlow
  };

  const transportBootstrapProps = {
    selectedModeLabel: uiStateBlock.selectedModeLabel,
    isSwitchingTransport: uiStateBlock.isSwitchingTransport,
    activeTransport: uiStateBlock.activeTransport,
    cloudConfigured: uiStateBlock.cloudConfigured,
    waModuleError: sessionBlock.waModuleError,
    transportError: sessionBlock.transportError
  };
  const SaasPanelComponent = sessionBlock.SaasPanelComponent;

  const normalizedSessionRole = String(sessionBlock.saasSession?.user?.role || '').trim().toLowerCase();
  const normalizedSessionRoleLabel = String(sessionBlock.saasSession?.user?.roleLabel || '').trim().toLowerCase();

  const saasPanelGateNode = SaasPanelComponent
    ? createElement(SaasPanelComponent, {
      isOpen: true,
      onClose: sessionBlock.handleSaasLogout,
      onLogout: sessionBlock.handleSaasLogout,
      socket: socketBlock.socket || null,
      onOpenWhatsAppOperation: handlersBlock.handleOpenWhatsAppOperation,
      buildApiHeaders: sessionBlock.buildApiHeaders,
      refreshCurrentUserPermissions: sessionBlock.refreshCurrentUserPermissions,
      handleSwitchTenant: sessionBlock.handleSwitchTenant,
      activeTenantId: sessionBlock.tenantScopeId,
      canManageSaas: sessionBlock.canManageSaas,
      userRole: sessionBlock.saasUserRole,
      isSuperAdmin: Boolean(
        sessionBlock.saasSession?.user?.isSuperAdmin
        || normalizedSessionRole === 'superadmin'
        || normalizedSessionRoleLabel === 'superadmin'
      ),
      currentUser: sessionBlock.saasSession?.user || null,
      preferredTenantId: sessionBlock.requestedWaTenantFromUrl || '',
      launchSource: sessionBlock.requestedLaunchSource || '',
      initialSection: sessionBlock.requestedWaSectionFromUrl || 'saas_resumen',
      resetKeys: [
        sessionBlock.tenantScopeId,
        sessionBlock.saasSession?.user?.userId,
        sessionBlock.requestedWaTenantFromUrl,
        sessionBlock.requestedLaunchSource
      ]
    })
    : null;

  return {
    operationPageProps,
    loginScreenProps,
    transportBootstrapProps,
    saasPanelGateNode
  };
}
