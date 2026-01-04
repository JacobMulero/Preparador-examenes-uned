/**
 * Subjects Routes (Fase 0)
 * CRUD operations for subjects (asignaturas)
 */

import { Router } from 'express';
import {
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  getTopicsBySubject
} from '../database.js';

const router = Router();

/**
 * GET /api/subjects
 * List all subjects
 */
router.get('/', (req, res) => {
  try {
    const subjects = getAllSubjects();
    res.json({
      success: true,
      subjects
    });
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener asignaturas'
    });
  }
});

/**
 * GET /api/subjects/:id
 * Get subject details
 */
router.get('/:id', (req, res) => {
  try {
    const subject = getSubjectById(req.params.id);

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    res.json({
      success: true,
      subject
    });
  } catch (error) {
    console.error('Error fetching subject:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener asignatura'
    });
  }
});

/**
 * POST /api/subjects
 * Create a new subject
 */
router.post('/', (req, res) => {
  try {
    const { id, name, shortName, description, methodology, examType, modes, claudeContext } = req.body;

    if (!id || !name || !methodology || !modes) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: id, name, methodology, modes'
      });
    }

    // Check if already exists
    const existing = getSubjectById(id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Ya existe una asignatura con ese ID'
      });
    }

    const subject = createSubject({
      id,
      name,
      shortName,
      description,
      methodology,
      examType,
      modes,
      claudeContext
    });

    res.status(201).json({
      success: true,
      subject
    });
  } catch (error) {
    console.error('Error creating subject:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear asignatura'
    });
  }
});

/**
 * PUT /api/subjects/:id
 * Update a subject
 */
router.put('/:id', (req, res) => {
  try {
    const existing = getSubjectById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Asignatura no encontrada'
      });
    }

    const subject = updateSubject(req.params.id, req.body);

    res.json({
      success: true,
      subject
    });
  } catch (error) {
    console.error('Error updating subject:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar asignatura'
    });
  }
});

// NOTE: Topics route moved to questions.js for subject-aware handling (Fase 1)
// GET /api/subjects/:id/topics is now handled in questions.js

export default router;
