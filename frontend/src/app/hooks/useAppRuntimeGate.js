import { useMemo } from 'react';
import { resolveAppRuntimeGate } from '../helpers/runtimeGate.helpers';

export default function useAppRuntimeGate(input = {}) {
  return useMemo(() => resolveAppRuntimeGate(input), [
    input?.saasRuntimeLoaded,
    input?.saasAuthEnabled,
    input?.isSaasAuthenticated,
    input?.isConnected,
    input?.selectedTransport,
    input?.canManageSaas,
    input?.forceOperationLaunch,
    input?.isClientReady
  ]);
}
