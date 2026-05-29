import '../auth.css';
import { Check, Eye, EyeOff, Lock, Mail } from 'lucide-react';

function SaasLoginScreen({
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  showLoginPassword,
  setShowLoginPassword,
  saasAuthBusy,
  saasAuthError,
  saasAuthNotice,
  recoveryStep,
  recoveryBusy,
  recoveryError,
  recoveryNotice,
  recoveryDebugCode,
  recoveryEmail,
  setRecoveryEmail,
  recoveryCode,
  setRecoveryCode,
  recoveryPassword,
  setRecoveryPassword,
  recoveryPasswordConfirm,
  setRecoveryPasswordConfirm,
  showRecoveryPassword,
  setShowRecoveryPassword,
  handleSaasLogin,
  openRecoveryFlow,
  handleRecoveryRequest,
  handleRecoveryVerify,
  handleRecoveryReset,
  resetRecoveryFlow
}) {
  return (
    <div className='login-screen login-screen--saas'>
      <div className='saas-login-shell fade-in'>
        <aside className='saas-login-brand-panel'>
          <div className='saas-login-brand-mark' aria-hidden='true'>
            <Check size={20} strokeWidth={3} />
          </div>
          <div className='saas-login-brand-copy'>
            <h1>Gestión de WhatsApp para tu empresa</h1>
            <p>Atiende, cotiza y vende desde un solo lugar.</p>
          </div>
          <ul className='saas-login-feature-list'>
            <li>Atención multi-agente en tiempo real</li>
            <li>IA comercial</li>
            <li>Campañas masivas por bloques</li>
            <li>Cotizaciones y catálogo integrado</li>
            <li>Cobertura logística en el chat</li>
          </ul>
          <div className='saas-login-brand-footer'>© 2026 · Panel de control</div>
        </aside>

        <section className='saas-login-form-panel'>
          <form onSubmit={handleSaasLogin} className='saas-login-card'>
            <div className='saas-login-head saas-login-head--split'>
              <div className='saas-login-title'>Bienvenido de nuevo</div>
              <p>Tu empresa se asigna automáticamente según tus permisos.</p>
            </div>

            {recoveryStep === 'idle' ? (
              <>
                <label className='saas-login-field saas-login-field--split'>
                  <span>Usuario o correo</span>
                  <div className='saas-login-input-shell'>
                    <span className='saas-login-input-icon' aria-hidden='true'><Mail size={16} /></span>
                    <input
                      type='text'
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      autoComplete='username'
                      placeholder='tu@empresa.com'
                      disabled={saasAuthBusy || recoveryBusy}
                    />
                  </div>
                </label>

                <label className='saas-login-field saas-login-field--split'>
                  <span>Contraseña</span>
                  <div className='saas-login-password-wrap saas-login-input-shell'>
                    <span className='saas-login-input-icon' aria-hidden='true'><Lock size={16} /></span>
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete='current-password'
                      placeholder='••••••••'
                      disabled={saasAuthBusy || recoveryBusy}
                    />
                    <button
                      type='button'
                      className='saas-login-visibility saas-login-visibility--icon'
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      disabled={saasAuthBusy || recoveryBusy}
                      aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      title={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      <span>{showLoginPassword ? 'Ocultar' : 'Ver'}</span>
                    </button>
                  </div>
                </label>

                <div className='saas-login-inline-actions'>
                  <button
                    type='button'
                    className='saas-login-link saas-login-link--inline'
                    onClick={openRecoveryFlow}
                    disabled={saasAuthBusy || recoveryBusy}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                {saasAuthError && <div className='saas-login-error'>{saasAuthError}</div>}
                {saasAuthNotice && <div className='saas-login-notice'>{saasAuthNotice}</div>}

                <button
                  type='submit'
                  disabled={saasAuthBusy || recoveryBusy}
                  className='saas-login-submit saas-login-submit--split'
                >
                  {saasAuthBusy ? 'Ingresando...' : 'Ingresar'}
                </button>

                <div className='saas-login-legal'>
                  Al ingresar aceptas los términos de uso de la plataforma.
                </div>
              </>
            ) : (
              <div className='saas-recovery-box saas-recovery-box--split'>
                <div className='saas-recovery-head'>
                  <strong>Recuperar acceso</strong>
                  <small>Paso seguro en 2 etapas con código por correo.</small>
                </div>

                {recoveryNotice && <div className='saas-login-notice'>{recoveryNotice}</div>}
                {recoveryError && <div className='saas-login-error'>{recoveryError}</div>}

                {recoveryStep === 'request' && (
                  <div className='saas-recovery-form'>
                    <label className='saas-login-field saas-login-field--split'>
                      <span>Correo</span>
                      <div className='saas-login-input-shell'>
                        <span className='saas-login-input-icon' aria-hidden='true'><Mail size={16} /></span>
                        <input
                          type='email'
                          value={recoveryEmail}
                          onChange={(event) => setRecoveryEmail(event.target.value)}
                          placeholder='usuario@empresa.com'
                          autoComplete='email'
                          disabled={recoveryBusy}
                        />
                      </div>
                    </label>
                    <button
                      type='button'
                      disabled={recoveryBusy}
                      className='saas-login-submit saas-login-submit--split'
                      onClick={handleRecoveryRequest}
                    >
                      {recoveryBusy ? 'Enviando...' : 'Enviar código'}
                    </button>
                  </div>
                )}

                {recoveryStep === 'verify' && (
                  <div className='saas-recovery-form'>
                    <label className='saas-login-field saas-login-field--split'>
                      <span>Correo</span>
                      <div className='saas-login-input-shell'>
                        <span className='saas-login-input-icon' aria-hidden='true'><Mail size={16} /></span>
                        <input type='email' value={recoveryEmail} disabled />
                      </div>
                    </label>
                    <label className='saas-login-field saas-login-field--split'>
                      <span>Código de verificación</span>
                      <div className='saas-login-input-shell'>
                        <input
                          type='text'
                          value={recoveryCode}
                          onChange={(event) => setRecoveryCode(event.target.value)}
                          placeholder='000000'
                          autoComplete='one-time-code'
                          disabled={recoveryBusy}
                        />
                      </div>
                    </label>
                    <button
                      type='button'
                      disabled={recoveryBusy}
                      className='saas-login-submit saas-login-submit--split'
                      onClick={handleRecoveryVerify}
                    >
                      {recoveryBusy ? 'Validando...' : 'Validar código'}
                    </button>
                    {recoveryDebugCode && (
                      <div className='saas-login-debug'>
                        Codigo debug (solo entorno local): <strong>{recoveryDebugCode}</strong>
                      </div>
                    )}
                  </div>
                )}

                {recoveryStep === 'reset' && (
                  <div className='saas-recovery-form'>
                    <label className='saas-login-field saas-login-field--split'>
                      <span>Nueva contraseña</span>
                      <div className='saas-login-password-wrap saas-login-input-shell'>
                        <span className='saas-login-input-icon' aria-hidden='true'><Lock size={16} /></span>
                        <input
                          type={showRecoveryPassword ? 'text' : 'password'}
                          value={recoveryPassword}
                          onChange={(event) => setRecoveryPassword(event.target.value)}
                          placeholder='Mínimo 10 caracteres, mayúscula, número y símbolo'
                          autoComplete='new-password'
                          disabled={recoveryBusy}
                        />
                      </div>
                    </label>
                    <label className='saas-login-field saas-login-field--split'>
                      <span>Confirmar contraseña</span>
                      <div className='saas-login-password-wrap saas-login-input-shell'>
                        <span className='saas-login-input-icon' aria-hidden='true'><Lock size={16} /></span>
                        <input
                          type={showRecoveryPassword ? 'text' : 'password'}
                          value={recoveryPasswordConfirm}
                          onChange={(event) => setRecoveryPasswordConfirm(event.target.value)}
                          placeholder='Repite la nueva contraseña'
                          autoComplete='new-password'
                          disabled={recoveryBusy}
                        />
                        <button
                          type='button'
                          className='saas-login-visibility saas-login-visibility--icon'
                          onClick={() => setShowRecoveryPassword((prev) => !prev)}
                          disabled={recoveryBusy}
                          aria-label={showRecoveryPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          title={showRecoveryPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                          {showRecoveryPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          <span>{showRecoveryPassword ? 'Ocultar' : 'Ver'}</span>
                        </button>
                      </div>
                    </label>
                    <button
                      type='button'
                      disabled={recoveryBusy}
                      className='saas-login-submit saas-login-submit--split'
                      onClick={handleRecoveryReset}
                    >
                      {recoveryBusy ? 'Actualizando...' : 'Actualizar contraseña'}
                    </button>
                  </div>
                )}

                <button
                  type='button'
                  className='saas-login-link saas-login-link--inline'
                  onClick={resetRecoveryFlow}
                  disabled={recoveryBusy}
                >
                  Volver al inicio de sesión
                </button>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}

export default SaasLoginScreen;
