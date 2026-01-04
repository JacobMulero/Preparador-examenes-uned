# Exam App - Bases de Datos Avanzadas

Aplicacion web para practicar preguntas de examen de Bases de Datos Avanzadas, con resolucion automatica usando Claude AI.

## Caracteristicas

- **Preguntas por temas**: Organizado en 7 temas + preguntas mixtas
- **Resolucion con IA**: Claude analiza y explica cada respuesta
- **Seguimiento de progreso**: Estadisticas de aciertos/fallos en SQLite
- **Modo offline**: Las respuestas se cachean para no repetir consultas
- **Navegacion por teclado**: Flechas para navegar, a/b/c/d para responder

## Arquitectura

```
exam-app/
├── server/                    # Backend Express
│   ├── index.js              # Entry point (puerto 3001)
│   ├── routes.js             # Monta todas las rutas
│   ├── database.js           # SQLite con better-sqlite3
│   ├── questionParser.js     # Parsea Markdown → objetos
│   ├── claudeService.js      # Integracion Claude Agent SDK
│   ├── routes/
│   │   ├── questions.js      # GET /api/topics, /api/questions/:topic
│   │   ├── solving.js        # POST /api/solve
│   │   └── stats.js          # GET /api/stats, POST /api/attempts
│   └── db/
│       ├── schema.sql        # Esquema SQLite
│       └── exam.db           # Base de datos (generada)
│
├── src/                       # Frontend React
│   ├── main.jsx              # Entry point
│   ├── App.jsx               # Router principal
│   ├── index.css             # Estilos globales
│   ├── shared/
│   │   ├── api.js            # Cliente API con transformadores
│   │   └── Layout.jsx        # Layout principal
│   ├── questions/
│   │   ├── TopicSelector.jsx # Selector de temas
│   │   ├── QuestionList.jsx  # Lista de preguntas
│   │   └── QuestionCard.jsx  # Tarjeta de pregunta
│   ├── solving/
│   │   ├── SolveButton.jsx   # Boton comprobar
│   │   └── AnswerPanel.jsx   # Panel de respuesta
│   └── progress/
│       ├── StatsPanel.jsx    # Panel estadisticas
│       ├── ProgressBar.jsx   # Barra de progreso
│       └── ReviewMode.jsx    # Modo repaso
│
├── data/                      # Symlink → ../Preguntas/
├── tests/
│   └── integration.test.js   # Tests de integracion
├── package.json
├── vite.config.js
└── index.html
```

## Requisitos

- **Node.js** >= 18.0.0
- **Claude CLI** instalado y autenticado (`claude --version`)
- Los archivos de preguntas en `../Preguntas/`

## Instalacion

```bash
# Desde el directorio exam-app/
npm install

# Verificar que Claude CLI funciona
claude -p "hola" --max-turns 1
```

## Uso

### Desarrollo (Backend + Frontend)

```bash
npm run dev
```

Esto arranca:
- Backend en http://localhost:3001
- Frontend en http://localhost:5173

### Solo Backend

```bash
npm run server
```

### Solo Frontend

```bash
npm run client
```

### Tests de Integracion

```bash
# Con el servidor corriendo
node tests/integration.test.js
```

## API Endpoints

### Preguntas

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/topics` | Lista todos los temas disponibles |
| GET | `/api/questions/:topic` | Todas las preguntas de un tema |
| GET | `/api/questions/:topic/random` | Pregunta aleatoria (prioriza no respondidas) |
| GET | `/api/questions/:topic/next` | Siguiente pregunta no respondida |
| GET | `/api/question/:id` | Pregunta especifica por ID |

### Resolucion

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/solve` | Resuelve pregunta con Claude |
| GET | `/api/solve/:questionId` | Obtiene solucion cacheada |
| DELETE | `/api/solve/:questionId` | Elimina solucion del cache |

**POST /api/solve Body:**
```json
{
  "questionId": "tema1_pregunta1",
  "questionText": "Texto completo de la pregunta con opciones"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "answer": "b",
    "explanation": "Explicacion detallada...",
    "wrongOptions": {
      "a": "Por que A es incorrecta...",
      "c": "Por que C es incorrecta...",
      "d": "Por que D es incorrecta..."
    }
  },
  "cached": false
}
```

### Progreso y Estadisticas

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/stats` | Estadisticas globales |
| GET | `/api/stats/:topic` | Estadisticas por tema |
| POST | `/api/attempts` | Registra intento del usuario |
| GET | `/api/progress/failed` | Lista preguntas falladas |
| GET | `/api/progress/unanswered` | Lista preguntas sin responder |

**POST /api/attempts Body:**
```json
{
  "questionId": "tema1_pregunta1",
  "userAnswer": "a",
  "correctAnswer": "b",
  "isCorrect": false,
  "explanation": "..."
}
```

## Base de Datos

### Tablas

**questions**
```sql
CREATE TABLE questions (
  id TEXT PRIMARY KEY,           -- "tema1_pregunta5"
  topic TEXT NOT NULL,           -- "Tema1"
  question_number INTEGER,
  shared_statement TEXT,         -- Enunciado compartido
  content TEXT NOT NULL,         -- Texto de la pregunta
  options TEXT NOT NULL,         -- JSON: {a, b, c, d}
  parsed_at DATETIME
);
```

**attempts**
```sql
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  user_answer TEXT NOT NULL,     -- "a", "b", "c", "d"
  correct_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  explanation TEXT,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);
```

**solutions_cache**
```sql
CREATE TABLE solutions_cache (
  question_id TEXT PRIMARY KEY,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  wrong_options TEXT,            -- JSON
  solved_at DATETIME,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);
```

## Integracion Claude

El servicio usa `@anthropic-ai/claude-agent-sdk` para comunicarse con Claude:

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt: "Resuelve esta pregunta...",
  options: { maxTurns: 1 }
});

for await (const message of response) {
  if (message.type === 'assistant') {
    // Procesar respuesta
  }
}
```

### Prompt Template

```
Eres un experto en bases de datos avanzadas (query processing,
optimizacion, transacciones, concurrencia, recuperacion).

Resuelve esta pregunta de examen de tipo test:

[PREGUNTA CON OPCIONES]

Responde en JSON:
{
  "answer": "a|b|c|d",
  "explanation": "Por que es correcta...",
  "wrongOptions": { "b": "Por que es incorrecta...", ... }
}
```

## Atajos de Teclado

| Tecla | Accion |
|-------|--------|
| ← | Pregunta anterior |
| → | Pregunta siguiente |
| a/b/c/d | Seleccionar opcion |
| Enter | Comprobar respuesta |

## Troubleshooting

### "Claude CLI is not available"

```bash
# Verificar instalacion
which claude
claude --version

# Si no esta instalado
npm install -g @anthropic-ai/claude-code
```

### "FOREIGN KEY constraint failed"

La pregunta no existe en la base de datos. Asegurate de cargar primero las preguntas visitando `/api/questions/:topic`.

### Las preguntas no se parsean correctamente

Verifica que:
1. El symlink `data/` apunta a `../Preguntas/`
2. Los archivos tienen formato `Preguntas_TemaX.md`
3. Las preguntas siguen el formato esperado

### El frontend no conecta con el backend

Verifica que:
1. El backend esta corriendo en puerto 3001
2. El proxy de Vite esta configurado en `vite.config.js`

## Estructura de Preguntas (Markdown)

```markdown
## Pregunta 1 (Pagina 5)

**Enunciado 1:** Contexto compartido entre preguntas...

Texto de la pregunta especifica.

a) Opcion A
b) Opcion B
c) Opcion C
d) Opcion D
```

## Licencia

Uso educativo - Bases de Datos Avanzadas
