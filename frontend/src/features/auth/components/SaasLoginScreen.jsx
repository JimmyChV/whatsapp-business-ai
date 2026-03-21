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
      <div className='login-ambient' aria-hidden='true' />
      <form onSubmit={handleSaasLogin} className='saas-login-card fade-in'>
        <div className='saas-login-head'>
          <span className='saas-login-kicker'>Control plane</span>
          <div className='saas-login-title'>Acceso seguro</div>
          <p>Inicia sesion con usuario y contrasena. La empresa se asigna automaticamente segun tus permisos.</p>
        </div>

        <label className='saas-login-field'>
          <span>Usuario o correo</span>
          <input
            type='text'
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            autoComplete='username'
            placeholder='usuario@empresa.com o user_id'
            disabled={saasAuthBusy || recoveryBusy}
          />
        </label>

        <label className='saas-login-field'>
          <span>Contrasena</span>
          <div className='saas-login-password-wrap'>
            <input
              type={showLoginPassword ? 'text' : 'password'}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete='current-password'
              placeholder='********'
              disabled={saasAuthBusy || recoveryBusy}
            />
            <button
              type='button'
              className='saas-login-visibility'
              onClick={() => setShowLoginPassword((prev) => !prev)}
              disabled={saasAuthBusy || recoveryBusy}
              aria-label={showLoginPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
            >
              {showLoginPassword ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </label>

        {saasAuthError && (
          <div className='saas-login-error'>
            {saasAuthError}
          </div>
        )}
        {saasAuthNotice && (
          <div className='saas-login-notice'>
            {saasAuthNotice}
          </div>
        )}

        {recoveryStep === 'idle' ? (
          <>
            <button
              type='submit'
              disabled={saasAuthBusy || recoveryBusy}
              className='saas-login-submit'
            >
              {saasAuthBusy ? 'Ingresando...' : 'Iniciar sesion'}
            </button>
            <button
              type='button'
              className='saas-login-link'
              onClick={openRecoveryFlow}
              disabled={saasAuthBusy || recoveryBusy}
            >
              Olvide mi contrasena
            </button>
          </>
        ) : (
          <div className='saas-recovery-box'>
            <div className='saas-recovery-head'>
              <strong>Recuperar acceso</strong>
              <small>Paso seguro en 2 etapas con codigo por correo.</small>
            </div>

            {recoveryNotice && <div className='saas-login-notice'>{recoveryNotice}</div>}
            {recoveryError && <div className='saas-login-error'>{recoveryError}</div>}

            {recoveryStep === 'request' && (
              <div className='saas-recovery-form'>
                <label className='saas-login-field'>
                  <span>Correo</span>
                  <input
                    type='email'
                    value={recoveryEmail}
                    onChange={(event) => setRecoveryEmail(event.target.value)}
                    placeholder='usuario@empresa.com'
                    autoComplete='email'
                    disabled={recoveryBusy}
                  />
                </label>
                <button
                  type='button'
                  disabled={recoveryBusy}
                  className='saas-login-submit'
                  onClick={handleRecoveryRequest}
                >
                  {recoveryBusy ? 'Enviando...' : 'Enviar codigo'}
                </button>
              </div>
            )}

            {recoveryStep === 'verify' && (
              <div className='saas-recovery-form'>
                <label className='saas-login-field'>
                  <span>Correo</span>
                  <input type='email' value={recoveryEmail} disabled />
                </label>
                <label className='saas-login-field'>
                  <span>Codigo de verificacion</span>
                  <input
                    type='text'
                    value={recoveryCode}
                    onChange={(event) => setRecoveryCode(event.target.value)}
                    placeholder='000000'
                    autoComplete='one-time-code'
                    disabled={recoveryBusy}
                  />
                </label>
                <button
                  type='button'
                  disabled={recoveryBusy}
                  className='saas-login-submit'
                  onClick={handleRecoveryVerify}
                >
                  {recoveryBusy ? 'Validando...' : 'Validar codigo'}
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
                <label className='saas-login-field'>
                  <span>Nueva contrasena</span>
                  <input
                    type={showRecoveryPassword ? 'text' : 'password'}
                    value={recoveryPassword}
                    onChange={(event) => setRecoveryPassword(event.target.value)}
                    placeholder='Minimo 10 caracteres, mayuscula, numero y simbolo'
                    autoComplete='new-password'
                    disabled={recoveryBusy}
                  />
                </label>
                <label className='saas-login-field'>
                  <span>Confirmar contrasena</span>
                  <input
                    type={showRecoveryPassword ? 'text' : 'password'}
                    value={recoveryPasswordConfirm}
                    onChange={(event) => setRecoveryPasswordConfirm(event.target.value)}
                    placeholder='Repite la nueva contrasena'
                    autoComplete='new-password'
                    disabled={recoveryBusy}
                  />
                </label>
                <label className='saas-login-check'>
                  <input
                    type='checkbox'
                    checked={showRecoveryPassword}
                    onChange={(event) => setShowRecoveryPassword(event.target.checked)}
                    disabled={recoveryBusy}
                  />
                  <span>Mostrar contrasena</span>
                </label>
                <button
                  type='button'
                  disabled={recoveryBusy}
                  className='saas-login-submit'
                  onClick={handleRecoveryReset}
                >
                  {recoveryBusy ? 'Actualizando...' : 'Actualizar contrasena'}
                </button>
              </div>
            )}

            <button
              type='button'
              className='saas-login-link'
              onClick={resetRecoveryFlow}
              disabled={recoveryBusy}
            >
              Volver al inicio de sesion
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default SaasLoginScreen;
