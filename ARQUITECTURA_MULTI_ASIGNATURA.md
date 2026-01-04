# Arquitectura Multi-Asignatura - Study Platform

> Documento maestro de arquitectura para la extension multi-asignatura de exam-app

---

## Resumen Ejecutivo

Extension de exam-app para soportar multiples asignaturas con metodologias diferenciadas:

| Asignatura | ID | Metodologia | Tipo Examen | Modos | Estado |
|------------|-----|-------------|-------------|-------|--------|
| Bases de Datos Avanzadas | `bda` | Test | Tipo test (a/b/c/d) | Test | **Implementado** |
| Fundamentos Fisicos Informatica | `ffi` | Test/Practica | Tipo test (a/b/c/d) | Test | Pendiente |
| Diseno de Software | `ds` | Practica | Verificacion autoria | Test + Verificacion | Pendiente |

---

## Fases de Implementacion

La implementacion esta dividida en **6 fases atomicas y testables**. Cada fase tiene su propio documento con:

- Schema de base de datos
- Database helpers
- API routes
- Servicios backend
- Componentes frontend
- Tests
- Criterios de aceptacion

### Indice de Fases

| Fase | Documento | Descripcion | Prerequisitos | Entregable |
|------|-----------|-------------|---------------|------------|
| **0** | [FASE_0_MULTISUBJECT_FOUNDATION.md](docs/FASE_0_MULTISUBJECT_FOUNDATION.md) | Infraestructura base multi-asignatura | exam-app funcionando | Selector de asignaturas |
| **1** | [FASE_1_SUBJECT_AWARE_QUESTIONS.md](docs/FASE_1_SUBJECT_AWARE_QUESTIONS.md) | Preguntas conscientes de asignatura | Fase 0 | Flujo de examen por subject |
| **2** | [FASE_2_DELIVERABLE_UPLOAD.md](docs/FASE_2_DELIVERABLE_UPLOAD.md) | Subida y analisis de trabajos | Fase 0, 1 | Upload + analisis Claude |
| **3** | [FASE_3_TEST_QUESTION_GENERATION.md](docs/FASE_3_TEST_QUESTION_GENERATION.md) | Generacion de preguntas tipo test | Fase 2 | Preguntas personalizadas |
| **4** | [FASE_4_VERIFICATION_MODE.md](docs/FASE_4_VERIFICATION_MODE.md) | Modo verificacion de autoria | Fase 2 | Simulador examen autoria |
| **5** | [FASE_5_PDF_PIPELINE.md](docs/FASE_5_PDF_PIPELINE.md) | Pipeline de procesamiento PDF | Fase 0, 1 | Extraccion preguntas de PDFs |

---

## Diagrama de Dependencias

```
                    ┌─────────────┐
                    │   Fase 0    │
                    │ Multi-Subj  │
                    │ Foundation  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Fase 1    │
                    │  Subject-   │
                    │   Aware     │
                    │  Questions  │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │   Fase 2    │  │   Fase 5    │  │             │
   │ Deliverable │  │    PDF      │  │   BDA ya    │
   │   Upload    │  │  Pipeline   │  │  funciona   │
   └──────┬──────┘  └─────────────┘  └─────────────┘
          │
     ┌────┴────┐
     │         │
┌────▼────┐ ┌──▼─────┐
│ Fase 3  │ │ Fase 4 │
│ Test    │ │ Verif  │
│ Gen     │ │ Mode   │
└─────────┘ └────────┘
```

---

## Resumen por Fase

### Fase 0: Fundacion Multi-Asignatura
**Objetivo:** Crear infraestructura base para multiples asignaturas

**Componentes principales:**
- Tablas `subjects`, `topics`
- Ruta `/api/subjects`
- `SubjectSelector.jsx`, `SubjectCard.jsx`

**Criterio de exito:** Poder seleccionar BDA desde la pagina principal

---

### Fase 1: Preguntas Conscientes de Asignatura
**Objetivo:** Refactorizar sistema de preguntas para ser multi-subject

**Componentes principales:**
- Columna `subject_id` en `questions`
- Rutas `/api/subjects/:id/topics`, `/api/subjects/:id/questions/:topic`
- `SubjectDashboard.jsx`

**Criterio de exito:** Flujo completo de examen funcionando para BDA

---

### Fase 2: Subida y Analisis de Entregables
**Objetivo:** Permitir subir trabajos de DS y analizarlos

**Componentes principales:**
- Tablas `deliverables`, `deliverable_files`, `deliverable_analysis`
- Servicio `deliverableAnalyzer.js`
- `DeliverableUploader.jsx`, `AnalysisResults.jsx`

**Criterio de exito:** Subir trabajo y ver fortalezas/debilidades

---

### Fase 3: Generacion de Preguntas Tipo Test
**Objetivo:** Generar preguntas a/b/c/d personalizadas

**Componentes principales:**
- Tablas `generation_sessions`, `generated_test_questions`
- Servicio `questionGenerator.js`
- `PracticeSetup.jsx`, `GeneratedTestQuestions.jsx`

**Criterio de exito:** Sesion de estudio con preguntas atacando debilidades

---

### Fase 4: Modo Verificacion de Autoria
**Objetivo:** Simular examen de verificacion con preguntas abiertas

**Componentes principales:**
- Tablas `extracted_data`, `verification_sessions`, `verification_answers`
- Servicio `verificationExtractor.js`
- `VerificationSession.jsx`, `OpenQuestionCard.jsx`, `VerificationFeedback.jsx`

**Criterio de exito:** Responder preguntas y ver comparacion vs trabajo

---

### Fase 5: Pipeline de Procesamiento PDF
**Objetivo:** Extraer preguntas de PDFs con Claude Vision

**Componentes principales:**
- Tablas `exam_pdfs`, `exam_pages`, `parsed_questions`
- Servicios `pdfService.js`, `visionService.js`
- `PipelineDashboard.jsx`, `QuestionEditor.jsx`

**Criterio de exito:** Subir PDF, extraer, revisar, aprobar preguntas

---

## Estructura de Carpetas Final

```
exam-app/
├── docs/                                 # Documentacion de fases
│   ├── FASE_0_MULTISUBJECT_FOUNDATION.md
│   ├── FASE_1_SUBJECT_AWARE_QUESTIONS.md
│   ├── FASE_2_DELIVERABLE_UPLOAD.md
│   ├── FASE_3_TEST_QUESTION_GENERATION.md
│   ├── FASE_4_VERIFICATION_MODE.md
│   └── FASE_5_PDF_PIPELINE.md
│
├── subjects/                             # Contenido por asignatura
│   ├── bda/
│   │   ├── config.json
│   │   └── questions/
│   ├── ffi/
│   └── ds/
│
├── uploads/                              # Archivos subidos
│   ├── deliverables/
│   └── pdfs/
│
├── server/
│   ├── routes/
│   │   ├── questions.js                  # Existente (extendido)
│   │   ├── solving.js                    # Existente
│   │   ├── stats.js                      # Existente (extendido)
│   │   ├── subjects.js                   # Fase 0
│   │   ├── deliverables.js               # Fase 2
│   │   ├── generation.js                 # Fase 3
│   │   ├── verification.js               # Fase 4
│   │   └── pipeline.js                   # Fase 5
│   │
│   ├── services/
│   │   ├── claudeService.js              # Existente (extendido)
│   │   ├── deliverableAnalyzer.js        # Fase 2
│   │   ├── questionGenerator.js          # Fase 3
│   │   ├── verificationExtractor.js      # Fase 4
│   │   ├── pdfService.js                 # Fase 5
│   │   └── visionService.js              # Fase 5
│   │
│   ├── database.js                       # Extendido cada fase
│   └── db/schema.sql                     # Extendido cada fase
│
├── src/
│   ├── subjects/                         # Fase 0
│   │   ├── SubjectSelector.jsx
│   │   ├── SubjectCard.jsx
│   │   └── SubjectDashboard.jsx          # Fase 1
│   │
│   ├── questions/                        # Existente (modificado Fase 1)
│   ├── solving/                          # Existente
│   ├── progress/                         # Existente (modificado)
│   │
│   ├── practice/                         # Fase 2-3
│   │   ├── DeliverableUploader.jsx
│   │   ├── AnalysisResults.jsx
│   │   ├── PracticeSetup.jsx
│   │   └── GeneratedTestQuestions.jsx
│   │
│   ├── verification/                     # Fase 4
│   │   ├── VerificationSession.jsx
│   │   ├── OpenQuestionCard.jsx
│   │   ├── FreeTextAnswer.jsx
│   │   ├── VerificationFeedback.jsx
│   │   └── VerificationResults.jsx
│   │
│   ├── pipeline/                         # Fase 5
│   │   ├── PipelineDashboard.jsx
│   │   ├── PdfUploader.jsx
│   │   ├── ExamList.jsx
│   │   ├── ExamDetail.jsx
│   │   └── QuestionEditor.jsx
│   │
│   └── shared/
│       ├── api.js                        # Extendido cada fase
│       └── Layout.jsx
│
└── tests/
    └── backend/
        ├── subjects.test.js              # Fase 0
        ├── questionsSubject.test.js      # Fase 1
        ├── deliverables.test.js          # Fase 2
        ├── generation.test.js            # Fase 3
        ├── verification.test.js          # Fase 4
        └── pipeline.test.js              # Fase 5
```

---

## Dependencias Acumulativas

```json
{
  "dependencies": {
    // Existentes
    "express": "^4.x",
    "better-sqlite3": "^9.x",
    "@anthropic-ai/sdk": "^0.x",
    "react": "^18.x",
    "react-router-dom": "^6.x",
    "axios": "^1.x",

    // Fase 2+
    "multer": "^1.4.x",
    "uuid": "^9.x",

    // Fase 5
    "pdf-lib": "^1.17.x",
    "sharp": "^0.33.x"
  }
}
```

---

## Esquema de Base de Datos Consolidado

El esquema completo se construye incrementalmente:

| Fase | Tablas Nuevas |
|------|---------------|
| 0 | `subjects`, `topics` |
| 1 | (modifica `questions` con `subject_id`) |
| 2 | `deliverables`, `deliverable_files`, `deliverable_analysis` |
| 3 | `generation_sessions`, `generated_test_questions`, `generated_question_attempts` |
| 4 | `extracted_data`, `verification_sessions`, `verification_questions`, `verification_answers` |
| 5 | `exam_pdfs`, `exam_pages`, `parsed_questions` |

---

## Orden de Implementacion Recomendado

1. **Sprint 1:** Fase 0 + Fase 1 (2-3 dias)
   - Resultado: BDA funciona con nueva arquitectura

2. **Sprint 2:** Fase 5 (2-3 dias)
   - Resultado: Puede extraer preguntas de PDFs existentes

3. **Sprint 3:** Fase 2 (2 dias)
   - Resultado: Puede subir y analizar trabajos de DS

4. **Sprint 4:** Fase 3 (2 dias)
   - Resultado: Genera preguntas personalizadas

5. **Sprint 5:** Fase 4 (2-3 dias)
   - Resultado: Simulador de examen de verificacion

---

## Notas Importantes

### Compatibilidad hacia atras
- Las rutas legacy (`/api/topics`, `/api/questions/:topic`) siguen funcionando
- Redirigen internamente a BDA

### Costos de API
- Claude Vision: ~$3/1000 imagenes
- Claude para analisis: ~$0.015/request
- Optimizar con cache agresivo

### Testing
- Cada fase tiene tests independientes
- Coverage minimo: 90% branches, 95% lines
- Integration tests con mocks de Claude

---

## Referencias

- [CLAUDE.md](CLAUDE.md) - Instrucciones del proyecto
- [README.md](README.md) - Documentacion de uso
- [docs/](docs/) - Documentacion detallada por fase
