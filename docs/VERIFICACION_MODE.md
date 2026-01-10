# Modo Verificacion

## Proposito

Verificar que el alumno ha hecho su propio trabajo mediante preguntas orales personalizadas. Las preguntas se generan a partir del contenido REAL del entregable del alumno.

## Diferencia con Modo Test

| Aspecto | Test (BDA) | Verificacion (DS, FFI) |
|---------|------------|------------------------|
| Tipo pregunta | Multiple choice a/b/c/d | Abierta/oral |
| Input | Ninguno | Entregable PDF del alumno |
| Evaluacion | Automatica | Manual por profesor |
| Puntuacion | Correcto/Incorrecto | 0-10 escala |
| Proposito | Practicar examen | Verificar autoria |

## Flujo Completo

### 1. Subir Entregable (via Pipeline)

El profesor sube el PDF del entregable usando el Pipeline existente, marcando la casilla "Marcar como entregable de alumno".

```
POST /api/pipeline/upload
Content-Type: multipart/form-data
file: [archivo.pdf]
subjectId: ds
isDeliverable: true
```

El sistema:
1. Extrae las paginas del PDF
2. Procesa cada pagina con Claude Vision
3. Almacena el contenido extraido en `exam_pages`

### 2. Crear Sesion

```
POST /api/verification/sessions
{
  "subjectId": "ds",
  "studentName": "Juan Garcia",
  "focusAreas": ["casos_uso", "modelo_dominio", "grasp"],
  "questionCount": 5,
  "deliverableId": "uuid-del-pdf-procesado"  // ID del PDF en exam_pdfs
}
```

### 3. Generar Preguntas

```
POST /api/verification/sessions/:id/generate
```

Claude genera preguntas ESPECIFICAS al trabajo:

**Ejemplo con entregable GesRAE:**
- "En tu modelo de dominio, ¿por que Reserva tiene asociacion con Apartamento?"
- "Explica el flujo alternativo 2a del CU ReservarApartamento"
- "¿Por que usaste el patron Creator para instanciar Reserva?"
- "¿Que pasaria si el Edificio tuviera la responsabilidad de validar disponibilidad?"

**NO genera preguntas genericas como:**
- "Explica que es un diagrama de clases"
- "¿Para que sirve el patron Creator?"

### 4. Sesion de Verificacion

El profesor:
1. Lee cada pregunta al alumno
2. Escucha la respuesta oral
3. Transcribe respuesta (opcional)
4. Puntua 0-10
5. Añade feedback

```
POST /api/verification/questions/:id/score
{
  "score": 7.5,
  "actualAnswer": "El alumno explico que...",
  "feedback": "Buena comprension pero falta..."
}
```

### 5. Resultados

```
POST /api/verification/sessions/:id/complete
```

Muestra:
- Puntuacion media
- Desglose por pregunta
- Notas del profesor

## Componentes Frontend

| Componente | Funcion |
|------------|---------|
| `VerificationSetupPage.jsx` | Wrapper con carga de subject |
| `VerificationSetup.jsx` | Formulario: subir entregable, config sesion |
| `VerificationSession.jsx` | Interfaz de evaluacion para profesor |
| `VerificationResults.jsx` | Resultados finales |

## Servicios Backend

### Pipeline (pdfService.js + visionService.js)

El contenido del entregable se extrae usando el pipeline de PDFs existente:

1. `pdfService.js` - Extrae paginas del PDF como imagenes
2. `visionService.js` - Procesa cada pagina con Claude Vision para extraer texto

El contenido procesado se almacena en `exam_pages.processed_markdown`.

### verificationGenerator.js

Genera preguntas con Claude usando el contenido del entregable:

```javascript
function buildVerificationPrompt(subject, session, deliverableContent, sampleExams) {
  return `
=== TRABAJO DEL ALUMNO A VERIFICAR ===
${deliverableContent.content}
=== FIN DEL TRABAJO ===

GENERA preguntas que SOLO puede responder quien hizo este trabajo.
Las preguntas DEBEN hacer referencia a elementos CONCRETOS del documento.
...
`;
}
```

El servicio `getDeliverableContent(deliverableId)` obtiene el contenido de todas las paginas procesadas del PDF.

## Areas de Enfoque

Para DS (Diseño de Software):

| ID | Nombre |
|----|--------|
| casos_uso | Casos de Uso |
| modelo_dominio | Modelo de Dominio |
| diagramas_interaccion | Diagramas de Interaccion |
| dcd | DCD |
| grasp | Principios GRASP |
| gof | Patrones GoF |
| arquitectura | Arquitectura |
| codigo | Codigo |

## Base de Datos

```sql
-- PDFs de entregables (reutiliza tabla de pipeline)
exam_pdfs (
  id, subject_id, filename, original_path, page_count,
  status, is_deliverable,  -- is_deliverable=1 para entregables
  uploaded_at, processed_at
)

-- Contenido extraido de cada pagina
exam_pages (
  id, exam_id, page_number, image_path,
  raw_markdown, processed_markdown, status
)

-- Sesiones de verificacion
verification_sessions (
  id, subject_id, deliverable_id,  -- FK a exam_pdfs.id
  student_name, focus_areas, question_count,
  status, score, notes, created_at, completed_at
)

-- Preguntas de verificacion
verification_questions (
  id, session_id, question_number, content,
  expected_answer, evaluation_criteria, related_section,
  difficulty, actual_answer, score, feedback, answered_at
)
```

## Estados de Sesion

```
pending → generating → ready → in_progress → completed
                  ↓
                error
```
