# WhatsApp Business Pro - AI Sales Assistant 🚀

Este proyecto es un clon avanzado de WhatsApp Business potenciado con **Inteligencia Artificial (OpenAI)** para optimizar el proceso de ventas. Permite a los negocios gestionar chats, catálogos y cotizaciones de forma profesional y eficiente.

## ✨ Características Principales

- **🤖 Asistente IA OpenAI**: Integración con OpenAI para sugerir respuestas persuasivas, manejar objeciones y recomendar productos basados en el contexto del chat.
- **📦 Gestión de Catálogo**: Soporte para catálogos nativos de WhatsApp Business y gestión manual de productos (Título, Precio, Descripción, Imagen).
- **🛒 Sistema de Carrito y Cotización**: Agrega productos al carrito, aplica descuentos (por ítem o globales) y envía cotizaciones detalladas con un solo clic.
- **🎙️ Notas de Voz Nativas**: Grabación y envío de audios en formato `ogg/opus`, 100% compatibles con WhatsApp oficial.
- **🖼️ Interfaz Premium**: Diseño moderno estilo "Glassmorphism" con animaciones fluidas y visualización de fotos de perfil reales.
- **🏷️ Etiquetas de Chat**: Visualización de etiquetas de WhatsApp para organizar a los clientes por estado.

## 🛠️ Tecnologías Utilizadas

- **Frontend**: React.js, Vite, Lucide React (iconos), Socket.io-client.
- **Backend**: Node.js, Express, Socket.io, `whatsapp-web.js` (basado en Puppeteer).
- **IA**: OpenAI API (GPT).

## 🚀 Instalación y Configuración

### 1. Requisitos Previos
- Node.js instalado.
- Una cuenta de WhatsApp (se recomienda Business).
- Una API Key de OpenAI (puedes obtenerla en [OpenAI Platform](https://platform.openai.com/api-keys)).

### 2. Clonar y Configurar
```bash
git clone https://github.com/TU_USUARIO/TU_REPOSITORIO.git
cd TU_REPOSITORIO
```

### 3. Configurar Backend
```bash
cd backend
npm install
```
Crea un archivo `.env` en la carpeta `backend` con:
```env
OPENAI_API_KEY=tu_clave_openai
OPENAI_MODEL=gpt-4o-mini
PORT=3001
```

### 4. Configurar Frontend
```bash
cd ../frontend
npm install
npm run dev
```

### 5. Iniciar Servidor
En una terminal aparte:
```bash
cd backend
node server.js
```

### 6. Vincular WhatsApp
Escanea el código QR que aparecerá en la aplicación web para iniciar la sesión.

## ⚠️ Notas de Seguridad
- El archivo `.wwebjs_auth` contiene tu sesión de WhatsApp. **Nunca lo compartas.**
- Tu `.env` está protegido por el `.gitignore` para no filtrar tus claves de API.

---
Desarrollado con ❤️ para potenciar las ventas digitales.
