import { useCallback, useState } from 'react';
import {
  requestSaasRecovery,
  resetSaasRecovery,
  verifySaasRecovery
} from '../services/saasAuthApi';

export function useSaasRecoveryFlow({
  loginEmail,
  setLoginEmail,
  setLoginPassword,
  setSaasAuthNotice,
  buildApiHeaders
}) {
  const [recoveryStep, setRecoveryStep] = useState('idle');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryResetToken, setRecoveryResetToken] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [recoveryDebugCode, setRecoveryDebugCode] = useState('');

  const resetRecoveryFlow = useCallback(() => {
    setRecoveryStep('idle');
    setRecoveryCode('');
    setRecoveryResetToken('');
    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setRecoveryBusy(false);
    setRecoveryError('');
    setRecoveryNotice('');
    setRecoveryDebugCode('');
    setShowRecoveryPassword(false);
  }, []);

  const openRecoveryFlow = useCallback(() => {
    const emailSeed = String(loginEmail || '').trim().toLowerCase();
    setRecoveryEmail(emailSeed);
    setRecoveryStep('request');
    setRecoveryCode('');
    setRecoveryResetToken('');
    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setRecoveryError('');
    setRecoveryNotice('');
    setRecoveryDebugCode('');
    setSaasAuthNotice('');
  }, [loginEmail, setSaasAuthNotice]);

  const handleRecoveryRequest = useCallback(async (event) => {
    event?.preventDefault();
    const email = String(recoveryEmail || '').trim().toLowerCase();
    if (!email) {
      setRecoveryError('Ingresa tu correo para recuperar acceso.');
      return;
    }

    setRecoveryBusy(true);
    setRecoveryError('');
    setRecoveryNotice('');
    try {
      const payload = await requestSaasRecovery({
        email,
        headers: buildApiHeaders({ includeJson: true })
      });
      setRecoveryNotice(String(payload?.message || 'Si el correo existe, enviaremos un codigo de recuperacion.'));
      setRecoveryDebugCode(String(payload?.debugCode || ''));
      setRecoveryStep('verify');
    } catch (error) {
      setRecoveryError(String(error?.message || 'No se pudo iniciar la recuperacion.'));
    } finally {
      setRecoveryBusy(false);
    }
  }, [buildApiHeaders, recoveryEmail]);

  const handleRecoveryVerify = useCallback(async (event) => {
    event?.preventDefault();
    const email = String(recoveryEmail || '').trim().toLowerCase();
    const code = String(recoveryCode || '').trim();
    if (!email || !code) {
      setRecoveryError('Ingresa correo y codigo de verificacion.');
      return;
    }

    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const payload = await verifySaasRecovery({
        email,
        code,
        headers: buildApiHeaders({ includeJson: true })
      });
      setRecoveryResetToken(String(payload?.resetToken || ''));
      setRecoveryStep('reset');
      setRecoveryNotice('Codigo validado. Ahora crea tu nueva contrasena.');
    } catch (error) {
      setRecoveryError(String(error?.message || 'No se pudo validar el codigo.'));
    } finally {
      setRecoveryBusy(false);
    }
  }, [buildApiHeaders, recoveryCode, recoveryEmail]);

  const handleRecoveryReset = useCallback(async (event) => {
    event?.preventDefault();
    const email = String(recoveryEmail || '').trim().toLowerCase();
    const resetToken = String(recoveryResetToken || '').trim();
    const newPassword = String(recoveryPassword || '');
    if (!email || !resetToken) {
      setRecoveryError('Sesion de recuperacion expirada. Solicita un nuevo codigo.');
      return;
    }
    if (!newPassword || newPassword.length < 10) {
      setRecoveryError('Usa una contrasena segura (minimo 10 caracteres).');
      return;
    }
    if (newPassword !== String(recoveryPasswordConfirm || '')) {
      setRecoveryError('Las contrasenas no coinciden.');
      return;
    }

    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const payload = await resetSaasRecovery({
        email,
        resetToken,
        newPassword,
        headers: buildApiHeaders({ includeJson: true })
      });
      setLoginEmail(email);
      setLoginPassword('');
      resetRecoveryFlow();
      setSaasAuthNotice(String(payload?.message || 'Contrasena actualizada. Inicia sesion con la nueva clave.'));
    } catch (error) {
      setRecoveryError(String(error?.message || 'No se pudo actualizar la contrasena.'));
    } finally {
      setRecoveryBusy(false);
    }
  }, [
    buildApiHeaders,
    recoveryEmail,
    recoveryPassword,
    recoveryPasswordConfirm,
    recoveryResetToken,
    resetRecoveryFlow,
    setLoginEmail,
    setLoginPassword,
    setSaasAuthNotice
  ]);

  return {
    recoveryStep,
    setRecoveryStep,
    recoveryEmail,
    setRecoveryEmail,
    recoveryCode,
    setRecoveryCode,
    recoveryResetToken,
    recoveryPassword,
    setRecoveryPassword,
    recoveryPasswordConfirm,
    setRecoveryPasswordConfirm,
    showRecoveryPassword,
    setShowRecoveryPassword,
    recoveryBusy,
    recoveryError,
    setRecoveryError,
    recoveryNotice,
    recoveryDebugCode,
    resetRecoveryFlow,
    openRecoveryFlow,
    handleRecoveryRequest,
    handleRecoveryVerify,
    handleRecoveryReset
  };
}
