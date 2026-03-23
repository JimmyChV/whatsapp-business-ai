import SaasLoginScreen from '../../features/auth/components/SaasLoginScreen';
import { StatusScreen, TransportBootstrapScreen } from '../../features/chat/components';
import { APP_RUNTIME_GATES } from '../helpers/runtimeGate.helpers';

export default function AppRuntimeGate({
  gateMode = APP_RUNTIME_GATES.MAIN,
  loginProps = {},
  saasPanelNode = null,
  transportBootstrapProps = {}
} = {}) {
  if (gateMode === APP_RUNTIME_GATES.RUNTIME_BOOTSTRAP) {
    return <StatusScreen message='Inicializando plataforma SaaS...' />;
  }

  if (gateMode === APP_RUNTIME_GATES.AUTH_LOGIN) {
    return <SaasLoginScreen {...loginProps} />;
  }

  if (gateMode === APP_RUNTIME_GATES.SOCKET_CONNECTING) {
    return <StatusScreen message='Conectando con el servidor...' />;
  }

  if (gateMode === APP_RUNTIME_GATES.SAAS_PANEL) {
    return saasPanelNode;
  }

  if (gateMode === APP_RUNTIME_GATES.TRANSPORT_PREPARE) {
    return (
      <div className="login-screen">
        <div style={{ textAlign: 'center', maxWidth: '520px', width: '100%' }}>
          <div className="loader" style={{ margin: '0 auto 14px' }} />
          <p style={{ color: '#9eb2bf', fontSize: '0.9rem', margin: 0 }}>
            Preparando operacion WhatsApp Cloud API...
          </p>
        </div>
      </div>
    );
  }

  if (gateMode === APP_RUNTIME_GATES.TRANSPORT_BOOTSTRAP) {
    return <TransportBootstrapScreen {...transportBootstrapProps} />;
  }

  return null;
}
