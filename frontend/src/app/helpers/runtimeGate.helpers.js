export const APP_RUNTIME_GATES = Object.freeze({
  RUNTIME_BOOTSTRAP: 'runtime_bootstrap',
  AUTH_LOGIN: 'auth_login',
  SOCKET_CONNECTING: 'socket_connecting',
  SAAS_PANEL: 'saas_panel',
  TRANSPORT_PREPARE: 'transport_prepare',
  TRANSPORT_BOOTSTRAP: 'transport_bootstrap',
  MAIN: 'main'
});

export function resolveAppRuntimeGate({
  saasRuntimeLoaded = false,
  saasAuthEnabled = false,
  isSaasAuthenticated = false,
  isConnected = false,
  selectedTransport = '',
  canManageSaas = false,
  forceOperationLaunch = false,
  isClientReady = false
} = {}) {
  if (!saasRuntimeLoaded) return APP_RUNTIME_GATES.RUNTIME_BOOTSTRAP;
  if (saasAuthEnabled && !isSaasAuthenticated) return APP_RUNTIME_GATES.AUTH_LOGIN;
  if (!isConnected) return APP_RUNTIME_GATES.SOCKET_CONNECTING;
  if (!selectedTransport) {
    if (canManageSaas && !forceOperationLaunch) return APP_RUNTIME_GATES.SAAS_PANEL;
    return APP_RUNTIME_GATES.TRANSPORT_PREPARE;
  }
  if (!isClientReady) return APP_RUNTIME_GATES.TRANSPORT_BOOTSTRAP;
  return APP_RUNTIME_GATES.MAIN;
}
