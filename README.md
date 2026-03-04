# WhatsApp Business Pro - AI Sales Assistant 🚀

Este proyecto es un clon avanzado de WhatsApp Business potenciado con **Inteligencia Artificial (OpenAI)** para optimizar el proceso de ventas. Permite a los negocios gestionar chats, catálogos y cotizaciones de forma profesional y eficiente.

## ✨ Características Principales

- **🤖 Asistente IA OpenAI**: Integración con OpenAI para sugerir respuestas persuasivas, manejar objeciones y recomendar productos basados en el contexto del chat.
- **🛍️ Catálogo conectado**: Prioriza catálogo nativo de WhatsApp, luego WooCommerce y finalmente catálogo local (`catalogo.json`) como fallback.
- **🛒 Sistema de Carrito y Cotización**: Agrega productos al carrito, aplica descuentos y calcula cotizaciones con redondeo comercial a 1 decimal.
- **🎙️ Notas de Voz Nativas**: Grabación y envío de audios en formato `ogg/opus`, 100% compatibles con WhatsApp oficial.
- **🖼️ Interfaz Premium**: Diseño moderno estilo "Glassmorphism" con animaciones fluidas y visualización de fotos de perfil reales.
- **🏷️ Etiquetas de Chat**: Visualización de etiquetas de WhatsApp para organizar a los clientes por estado.

## 🛠️ Tecnologías Utilizadas

- **Frontend**: React.js, Vite, Lucide React (iconos), Socket.io-client.
- **Backend**: Node.js, Express, Socket.io, `whatsapp-web.js` (basado en Puppeteer).
- **IA**: OpenAI API (GPT).
- **Catálogo externo**: WooCommerce REST API.

## 🚀 Instalación y Configuración

### 1. Requisitos Previos
- Node.js instalado.
- Una cuenta de WhatsApp (se recomienda Business).
- Una API Key de OpenAI (puedes obtenerla en [OpenAI Platform](https://platform.openai.com/api-keys)).
- WooCommerce con API REST habilitada (opcional, pero recomendado).

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

# WooCommerce (opcional pero recomendado)
WC_BASE_URL=https://lavitat.pe
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WC_PER_PAGE=100
WC_MAX_PAGES=10
WC_INCLUDE_OUT_OF_STOCK=true
```

> ⚠️ Si expusiste claves de WooCommerce en una captura o chat, **revócalas y genera unas nuevas** antes de usar producción.

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

## 🧮 Regla de redondeo comercial
- El precio final por ítem en cotización se calcula con descuento y se redondea a **1 decimal**.
- El total también se muestra con **1 decimal** para mantener consistencia comercial.

## 📦 Orden de prioridad del catálogo
1. Catálogo nativo de WhatsApp Business.
2. Productos de WooCommerce.
3. Catálogo local (`backend/catalogo.json`).


## 🧰 Solución rápida si no aparece catálogo
Si en consola ves algo como `injecting env (3) from .env`, normalmente solo cargaste 3 variables (por ejemplo OpenAI + PORT) y faltan las de WooCommerce.

Checklist:
1. Verifica que tu `.env` esté en `backend/.env`.
2. Agrega `WC_BASE_URL` (obligatorio para Woo, ejemplo `https://lavitat.pe`).
3. Si usarás API privada, agrega también `WC_CONSUMER_KEY` y `WC_CONSUMER_SECRET`.
4. Reinicia backend después de guardar `.env`.

Nota: aunque no pongas keys, el sistema intenta `wc/store/v1` (endpoint público). Si Woo o plugins bloquean ese endpoint, la app caerá al `catalogo.json` local.

## 🛠️ Solución rápida si la pantalla queda en blanco (frontend)
Si ves errores como `setChatLabelMap is not defined` o `BookOpen is not defined`, normalmente estás corriendo un build viejo o una mezcla de archivos.

Ejecuta **desde la raíz del repo**:

```bash
git fetch origin
git checkout work
git pull --rebase origin work

# limpiar frontend
cd frontend
rm -rf node_modules dist .vite
npm install
npm run dev
```

Si prefieres `main`, usa `git checkout main` y `git pull --rebase origin main`.

En Windows PowerShell, cambia la limpieza por:

```powershell
Remove-Item -Recurse -Force node_modules, dist, .vite
```

## ⚠️ Notas de Seguridad
- El archivo `.wwebjs_auth` contiene tu sesión de WhatsApp. **Nunca lo compartas.**
- Tu `.env` está protegido por el `.gitignore` para no filtrar tus claves de API.

---
Desarrollado con ❤️ para potenciar las ventas digitales.
