import React, { useState } from 'react';
import { Paperclip, Smile, Send, Mic, Bot, Sparkles, X, ShoppingBag, ShoppingCart } from 'lucide-react';

const ChatInput = ({
    inputText,
    setInputText,
    onSendMessage,
    onKeyDown,
    onFileClick,
    attachment,
    attachmentPreview,
    removeAttachment,
    isAiLoading,
    onRequestAiSuggestion,
    aiPrompt,
    setAiPrompt,
    isRecording,
    recordingTime,
    startRecording,
    stopRecording
}) => {
    const [showCommands, setShowCommands] = useState(false);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setInputText(val);
        if (val.startsWith('/')) {
            setShowCommands(true);
        } else {
            setShowCommands(false);
        }
    };

    const selectCommand = (cmd) => {
        if (cmd === '/ayudar') {
            onRequestAiSuggestion();
        } else if (cmd === '/vender') {
            setInputText('/vender ');
        }
        setShowCommands(false);
    };

    return (
        <div className="chat-input-area" style={{ position: 'relative' }}>
            {/* AI Command Popover */}
            {showCommands && (
                <div className="ai-commands-popover" style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '10px',
                    background: '#233138',
                    borderRadius: '8px',
                    padding: '8px 0',
                    width: '260px',
                    boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
                    marginBottom: '10px',
                    zIndex: 100
                }}>
                    <div style={{ padding: '5px 15px', color: '#00a884', fontSize: '0.75rem', fontWeight: 600 }}>COMANDOS IA</div>
                    <div className="cmd-item" onClick={() => selectCommand('/ayudar')} style={{ padding: '8px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Sparkles size={16} color="var(--ai-accent)" />
                        <div style={{ fontSize: '0.9rem' }}>
                            <div>/ayudar</div>
                            <div style={{ fontSize: '0.75rem', color: '#8696a0' }}>Genera respuesta inteligente</div>
                        </div>
                    </div>
                    <div className="cmd-item" onClick={() => selectCommand('/vender')} style={{ padding: '8px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ShoppingCart size={16} color="var(--primary-green)" />
                        <div style={{ fontSize: '0.9rem' }}>
                            <div>/vender [prod]</div>
                            <div style={{ fontSize: '0.75rem', color: '#8696a0' }}>Busca y cotiza producto</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Attachment Preview Overlay */}
            {attachment && (
                <div className="attachment-preview" style={{ bottom: '70px', right: '15px' }}>
                    <button className="attachment-close" onClick={removeAttachment}>
                        <X size={14} />
                    </button>
                    {attachmentPreview !== 'document' ? (
                        <img src={attachmentPreview} alt="Preview" />
                    ) : (
                        <div style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.8rem' }}>
                            📄 {attachment.filename}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: '15px', padding: '0 5px' }}>
                <Smile size={26} color="#8696a0" style={{ cursor: 'pointer' }} />
                <button className="btn-icon" onClick={onFileClick} style={{ color: '#8696a0' }}>
                    <Paperclip size={26} />
                </button>
            </div>

            <div className="input-container" style={{ margin: '0 5px' }}>
                <textarea
                    className="message-input"
                    placeholder="Escribe un mensaje o usa / comandos de IA"
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={onKeyDown}
                    rows={1}
                    style={{ padding: '4px 0', minHeight: '24px' }}
                />
            </div>

            <div style={{ display: 'flex', gap: '15px', padding: '0 10px', alignItems: 'center' }}>
                {inputText.trim() || attachment ? (
                    <button className="send-button" onClick={onSendMessage} style={{ background: 'none', color: '#00a884' }}>
                        <Send size={26} />
                    </button>
                ) : (
                    <button
                        className={`send-button ${isRecording ? 'pulse' : ''}`}
                        style={{ background: 'none', color: isRecording ? '#da3633' : '#8696a0' }}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                    >
                        {isRecording ? <span style={{ fontSize: '10px', fontWeight: 600 }}>{recordingTime}s</span> : <Mic size={26} />}
                    </button>
                )}
            </div>

            {/* Mini AI Trigger */}
            {!inputText && !attachment && (
                <div
                    onClick={onRequestAiSuggestion}
                    style={{
                        position: 'absolute',
                        right: '70px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                        color: isAiLoading ? 'var(--ai-accent)' : '#8696a0',
                        animation: isAiLoading ? 'spin 2s linear infinite' : 'none'
                    }}
                    title="Sugerencia IA"
                >
                    <Bot size={20} />
                </div>
            )}
        </div>
    );
};

export default ChatInput;
