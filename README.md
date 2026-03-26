# repotemporal

Colección de herramientas para automatización de quizzes en **AWS Academy** y un laboratorio de reconocimiento facial con **Amazon Rekognition**.

---

## 📁 Mapa del repositorio

```
repotemporal/
│
├── README.md                          ← este archivo
│
├── ── Bots de automatización ──
│
├── bot-V3.js                          ← Monitor: intercepta respuestas de red y muestra
│                                        preguntas/respuestas en consola (sin auto-clic)
├── bot-V4.js                          ← Bot completo: auto-login, auto-clic y guarda
│                                        datos de slides en slides-dump/
├── bot-V5.js                          ← Bot reactivo: polling cada 1 s, busca iframes
│                                        recursivamente y registra respuestas en
│                                        formulario_respuestas.txt
├── bot-Aws.js                         ← Versión de depuración: prueba 3 estrategias de
│                                        detección de respuestas (útil para diagnosticar)
├── Bot-For-AWS.py                     ← Bot Python (Playwright): loop hasta 70 %,
│                                        memoria persistente en quiz_memory.json,
│                                        soporte opcional para Claude (Anthropic API)
├── bots.py                            ← Script Python para ejecutar en consola del
│                                        navegador; usa sessionStorage como memoria
│
├── ── Datos de slides capturados ──
│
├── slides-dump/                       ← 24 archivos .js/.json con datos crudos de
│   ├── *.js                             slides Articulate extraídos de AWS Academy
│   └── *.json                         ← versiones formateadas con preguntas y respuestas
│
├── 5XyRWz5JEJp.js                     ← Ejemplo de slide (copia en raíz para pruebas)
├── 6Y4qMoSWUxV.js                     ← Ejemplo de slide (copia en raíz para pruebas)
│
├── ── Pruebas y lógica ──
│
├── test-logic.js                      ← Prueba el parseo de JSON y detección de
│                                        respuestas sin abrir el navegador
├── test-v2.js                         ← Versión mejorada de test-logic con mejor
│                                        manejo de errores y secuencias de escape
│
├── ── Laboratorio de reconocimiento facial ──
│
├── 05-facedetection.ipynb             ← Notebook para el alumno: 8 pasos con
│                                        Amazon Rekognition (boto3 + PIL + matplotlib)
├── 05-facedetection-soluciones.ipynb  ← Notebook con soluciones completas
├── 05-facedetection-explicacion.md    ← Guía detallada de 537 líneas: conceptos,
│                                        código comentado, casos de uso y FAQ
├── mum.jpg                            ← Imagen base para indexar en Rekognition
├── target.jpg                         ← Imagen objetivo para búsqueda de coincidencias
│
├── ── Documentación y volcados HTML ──
│
├── conversacion-1-con-claude.txt      ← Transcripción de conversación sobre estrategia
│                                        de automatización
├── Resumen de otra conversacion de claude.txt  ← Resumen de sesión adicional con Claude
├── formulario_respuestas.txt          ← Log de respuestas generado por bot-V5
├── Codigo pagina de grades.txt        ← Volcado HTML de la página de calificaciones
│                                        de AWS Academy (Ctrl+U)
├── html-curso-aws-ctrl-shift-i.txt    ← HTML del inspector DevTools del curso
├── CtrlU-paginaCurso.txt              ← HTML fuente de la página principal del curso
│
└── ── Dependencias Node.js ──
│
├── package.json                       ← Dependencia: puppeteer ^24.4.0
└── package-lock.json                  ← Versiones bloqueadas
```

---

## 🚀 Inicio rápido

### Requisitos

```bash
# Node.js
npm install

# Python
pip install playwright anthropic
playwright install chromium
```

### Ejecutar un bot

```bash
# Bot V4 (automatización completa con Puppeteer)
node bot-V4.js

# Bot Python (loop automático hasta pasar el quiz)
python Bot-For-AWS.py

# Probar lógica de detección sin abrir navegador
node test-logic.js
```

---

## 📦 Componentes principales

| Archivo | Lenguaje | Descripción |
|---------|----------|-------------|
| `bot-V4.js` | JS | Bot más completo: login automático + auto-clic + guarda slides |
| `bot-V5.js` | JS | Versión reactiva con polling y registro de respuestas |
| `Bot-For-AWS.py` | Python | Bot con reintentos, memoria JSON y soporte de IA |
| `05-facedetection.ipynb` | Python | Lab de Amazon Rekognition (alumno) |
| `slides-dump/` | JSON/JS | Banco de preguntas y respuestas capturadas |

---

## ⚠️ Aviso

Las credenciales de acceso **no deben** escribirse directamente en el código.  
Usa variables de entorno o un archivo `.env` (no incluido en el repositorio).
