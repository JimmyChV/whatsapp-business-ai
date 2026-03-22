import { useCallback } from 'react';

export default function useAttachmentActions({
  setAttachment,
  setAttachmentPreview,
  setIsDragOver
} = {}) {
  const processFile = useCallback((file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : null;
      if (!base64) return;
      setAttachment({
        data: base64,
        mimetype: file.type || 'application/octet-stream',
        filename: file.name || 'archivo'
      });
      setAttachmentPreview(typeof dataUrl === 'string' ? dataUrl : null);
    };
    reader.readAsDataURL(file);
  }, [setAttachment, setAttachmentPreview]);

  const removeAttachment = useCallback(() => {
    setAttachment(null);
    setAttachmentPreview(null);
  }, [setAttachment, setAttachmentPreview]);

  const handleFileChange = useCallback((event) => {
    const file = event?.target?.files?.[0];
    if (file) processFile(file);
    if (event?.target) event.target.value = '';
  }, [processFile]);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(true);
  }, [setIsDragOver]);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, [setIsDragOver]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event?.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [processFile, setIsDragOver]);

  return {
    processFile,
    removeAttachment,
    handleFileChange,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}
