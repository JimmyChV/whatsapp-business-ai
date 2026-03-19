import React, { useState } from 'react';

import {
    ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL,
    ADMIN_IMAGE_ALLOWED_MIME_TYPES,
    ADMIN_IMAGE_MAX_BYTES,
    formatBytes,
    validateImageFile
} from '../SaasAdminPanel.helpers';

export default function ImageDropInput({
    label = 'Subir imagen',
    disabled = false,
    onFile,
    helpText = `Arrastra una imagen o haz clic para seleccionar (${ADMIN_IMAGE_ALLOWED_EXTENSIONS_LABEL}, max ${formatBytes(ADMIN_IMAGE_MAX_BYTES)}).`
}) {
    const [dragging, setDragging] = useState(false);
    const [localError, setLocalError] = useState('');

    const handleFiles = (fileList) => {
        const file = fileList && fileList[0] ? fileList[0] : null;
        const validationError = validateImageFile(file);
        if (validationError) {
            setLocalError(validationError);
            return;
        }
        setLocalError('');
        if (typeof onFile !== 'function') return;
        onFile(file);
    };

    return (
        <label
            className={`saas-admin-dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
            onDragOver={(event) => {
                if (disabled) return;
                event.preventDefault();
                setDragging(true);
            }}
            onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
            }}
            onDrop={(event) => {
                if (disabled) return;
                event.preventDefault();
                setDragging(false);
                handleFiles(event.dataTransfer?.files || null);
            }}
        >
            <input
                type="file"
                accept={ADMIN_IMAGE_ALLOWED_MIME_TYPES.join(',')}
                disabled={disabled}
                onChange={(event) => handleFiles(event.target.files || null)}
            />
            <strong>{label}</strong>
            <small className={localError ? 'saas-admin-dropzone-error' : ''}>{localError || helpText}</small>
        </label>
    );
}
