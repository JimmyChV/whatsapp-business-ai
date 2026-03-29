import { useContext } from 'react';
import { UiFeedbackContext } from './UiFeedbackProvider';

export default function useUiFeedback() {
  const context = useContext(UiFeedbackContext);

  if (!context) {
    throw new Error('useUiFeedback debe usarse dentro de <UiFeedbackProvider>.');
  }

  return context;
}
