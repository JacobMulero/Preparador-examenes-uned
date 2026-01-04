# Plan: App de Examenes con Claude Headless

## Resumen
Aplicacion web React + Node.js que presenta preguntas de examen de los archivos Markdown y usa Claude en modo headless para resolver y explicar las respuestas.

## Estado: ✅ IMPLEMENTADO

Fecha de finalizacion: 2026-01-04

---

## Arquitectura Final

```
exam-app/
├── src/                           # Frontend React
│   ├── questions/                 # Dominio: Preguntas
│   │   ├── QuestionCard.jsx      ✅
│   │   ├── QuestionList.jsx      ✅
│   │   ├── TopicSelector.jsx     ✅
│   │   └── *.css
│   │
│   ├── solving/                   # Dominio: Resolver con Claude
│   │   ├── AnswerPanel.jsx       ✅
│   │   ├── SolveButton.jsx       ✅
│   │   └── *.css
│   │
│   ├── progress/                  # Dominio: Estadisticas/Progreso
│   │   ├── StatsPanel.jsx        ✅
│   │   ├── ProgressBar.jsx       ✅
│   │   ├── ReviewMode.jsx        ✅
│   │   └── *.css
│   │
│   ├── shared/                    # Compartido
│   │   ├── api.js                ✅ (con transformadores de datos)
│   │   ├── Layout.jsx            ✅
│   │   └── Layout.css
│   │
│   ├── App.jsx                   ✅
│   ├── main.jsx                  ✅
│   └── index.css                 ✅
│
├── server/                        # Backend Express
│   ├── index.js                  ✅ Entry point (puerto 3001)
│   ├── routes.js                 ✅ Monta todas las rutas
│   ├── database.js               ✅ SQLite con better-sqlite3
│   ├── questionParser.js         ✅ Parsea Markdown → objetos
│   ├── claudeService.js          ✅ Claude Agent SDK
│   ├── routes/
│   │   ├── questions.js          ✅
│   │   ├── solving.js            ✅
│   │   └── stats.js              ✅
│   └── db/
│       ├── schema.sql            ✅
│       └── exam.db               ✅ (generado automaticamente)
│
├── tests/
│   └── integration.test.js       ✅ 9/9 tests passing
│
├── data/                          ✅ Symlink → ../Preguntas/
├── package.json                  ✅
├── vite.config.js                ✅
├── index.html                    ✅
└── README.md                     ✅
```

---

## Checklist de Implementacion

### Fase 1: Setup del Proyecto ✅
- [x] Crear estructura de carpetas `exam-app/`
- [x] Inicializar `package.json` con dependencias
- [x] Configurar Vite para React
- [x] Configurar Express basico
- [x] Crear symlink `data/` → `../Preguntas/`

### Fase 2: Base de Datos ✅
- [x] Crear `server/db/schema.sql`
- [x] Implementar `server/database.js` con better-sqlite3
- [x] Verificar que se crea `exam.db` al arrancar

### Fase 3: Parser de Preguntas ✅
- [x] Implementar `server/questionParser.js`
- [x] Parsear formato: `## Pregunta X (Pagina Y)`
- [x] Extraer opciones a), b), c), d)
- [x] Manejar "Enunciado 1/2" compartidos
- [x] Insertar preguntas en SQLite
- [x] Parsea 446 preguntas en 8 temas correctamente

### Fase 4: API de Preguntas ✅
- [x] `GET /api/topics` - listar temas
- [x] `GET /api/questions/:topic` - todas las preguntas
- [x] `GET /api/questions/:topic/random` - pregunta aleatoria
- [x] `GET /api/questions/:topic/next` - siguiente no respondida

### Fase 5: Integracion Claude ✅
- [x] Implementar `server/claudeService.js` con Agent SDK
- [x] Prompt con formato JSON de respuesta
- [x] `POST /api/solve` endpoint
- [x] Cache de respuestas en SQLite
- [x] Probado con preguntas reales

### Fase 6: Sistema de Progreso ✅
- [x] `POST /api/attempts` - registrar intento
- [x] `GET /api/stats` - estadisticas globales
- [x] `GET /api/stats/:topic` - stats por tema
- [x] `GET /api/progress/failed` - preguntas falladas

### Fase 7: Frontend - Componentes Base ✅
- [x] `src/shared/Layout.jsx` - estructura general
- [x] `src/shared/api.js` - cliente axios con transformadores
- [x] `src/questions/TopicSelector.jsx`
- [x] `src/questions/QuestionCard.jsx` con react-markdown
- [x] `src/questions/QuestionList.jsx`

### Fase 8: Frontend - Resolver y Stats ✅
- [x] `src/solving/SolveButton.jsx`
- [x] `src/solving/AnswerPanel.jsx`
- [x] `src/progress/StatsPanel.jsx`
- [x] `src/progress/ProgressBar.jsx`

### Fase 9: Frontend - Navegacion ✅
- [x] `src/progress/ReviewMode.jsx`
- [x] Navegacion entre preguntas
- [x] Atajos de teclado (flechas, a/b/c/d, Enter)

### Fase 10: Polish ✅
- [x] Estilos CSS
- [x] Manejo de errores y loading states
- [x] Scripts npm: `dev`, `server`, `client`
- [x] README.md con instrucciones completas
- [x] Tests de integracion (9/9 passing)

---

## Dependencias Finales

**Server:**
- express, cors
- better-sqlite3
- @anthropic-ai/claude-agent-sdk
- zod

**Frontend:**
- react, react-dom
- react-markdown
- react-router-dom
- axios

**Dev:**
- vite
- @vitejs/plugin-react
- concurrently

---

## Comandos

```bash
# Instalar
npm install

# Desarrollo (backend + frontend)
npm run dev

# Solo backend (puerto 3001)
npm run server

# Solo frontend (puerto 5173)
npm run client

# Tests
node tests/integration.test.js
```

---

## Notas Tecnicas

### Transformacion de Datos

El `api.js` del frontend transforma los datos del backend:

| Backend | Frontend |
|---------|----------|
| `topic.topic` | `topic.id` |
| `topic.question_count` | `topic.questionCount` |
| `q.question_number` | `q.number` |
| `q.shared_statement` | `q.statement` |
| `q.content` | `q.text` |
| `q.options.a` | `q.optionA` |
| `solution.answer` | `solution.correctAnswer` |

### Claude Agent SDK

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: buildPrompt(questionText),
  options: { maxTurns: 1 }
});

for await (const message of response) {
  if (message.type === 'assistant') {
    // Extraer texto de content blocks
  }
}
```

### Cache de Soluciones

Las respuestas se guardan en `solutions_cache` para:
- No repetir llamadas a Claude
- Respuestas instantaneas
- Reducir costos
