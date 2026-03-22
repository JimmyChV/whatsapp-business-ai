import { useMemo, useState } from 'react';

import { loadStoredSaasSession } from '../../features/auth/helpers/saasSessionStorage';
import { readWaLaunchParams } from '../../features/chat/core';

export default function useAppSessionTransportState() {
  const [isConnected, setIsConnected] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [isClientReady, setIsClientReady] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState('');
  const [waRuntime, setWaRuntime] = useState({
    requestedTransport: 'idle',
    activeTransport: 'idle',
    cloudConfigured: false,
    cloudReady: false,
    availableTransports: ['cloud']
  });
  const [transportError, setTransportError] = useState('');
  const [isSwitchingTransport, setIsSwitchingTransport] = useState(false);

  const [saasRuntime, setSaasRuntime] = useState({
    loaded: false,
    authEnabled: false,
    tenant: null,
    tenants: [],
    authContext: { enabled: false, isAuthenticated: false, user: null }
  });
  const [saasSession, setSaasSession] = useState(() => loadStoredSaasSession());
  const [saasAuthBusy, setSaasAuthBusy] = useState(false);
  const [saasAuthError, setSaasAuthError] = useState('');
  const [tenantSwitchBusy, setTenantSwitchBusy] = useState(false);
  const [tenantSwitchError, setTenantSwitchError] = useState('');
  const [showSaasAdminPanel, setShowSaasAdminPanel] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [saasAuthNotice, setSaasAuthNotice] = useState('');
  const [forceOperationLaunchBypass, setForceOperationLaunchBypass] = useState(false);

  const waLaunchParams = useMemo(() => readWaLaunchParams(window.location.search || ''), []);
  const forceOperationLaunch = waLaunchParams.forceOperationLaunch && !forceOperationLaunchBypass;
  const requestedWaModuleFromUrl = waLaunchParams.requestedWaModuleId;
  const requestedWaTenantFromUrl = waLaunchParams.requestedWaTenantId;
  const requestedWaSectionFromUrl = waLaunchParams.requestedWaSectionId;
  const requestedLaunchSource = waLaunchParams.requestedLaunchSource;
  const tenantScopeId = String(saasSession?.user?.tenantId || saasRuntime?.tenant?.id || 'default').trim() || 'default';

  return {
    isConnected,
    setIsConnected,
    qrCode,
    setQrCode,
    isClientReady,
    setIsClientReady,
    selectedTransport,
    setSelectedTransport,
    waRuntime,
    setWaRuntime,
    transportError,
    setTransportError,
    isSwitchingTransport,
    setIsSwitchingTransport,
    saasRuntime,
    setSaasRuntime,
    saasSession,
    setSaasSession,
    saasAuthBusy,
    setSaasAuthBusy,
    saasAuthError,
    setSaasAuthError,
    tenantSwitchBusy,
    setTenantSwitchBusy,
    tenantSwitchError,
    setTenantSwitchError,
    showSaasAdminPanel,
    setShowSaasAdminPanel,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    showLoginPassword,
    setShowLoginPassword,
    saasAuthNotice,
    setSaasAuthNotice,
    forceOperationLaunchBypass,
    setForceOperationLaunchBypass,
    waLaunchParams,
    forceOperationLaunch,
    requestedWaModuleFromUrl,
    requestedWaTenantFromUrl,
    requestedWaSectionFromUrl,
    requestedLaunchSource,
    tenantScopeId
  };
}
