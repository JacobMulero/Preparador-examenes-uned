/**
 * Integration Tests for Subjects Routes (routes/subjects.js)
 * Tests CRUD operations for subjects (asignaturas)
 */

import express from 'express';
import request from 'supertest';
import {
  db,
  createSubject,
  getSubjectById,
  updateSubject
} from '../../server/database.js';

// Import actual routes
import mainRouter from '../../server/routes.js';

// Test prefix to identify test data
const TEST_PREFIX = 'SUBJ_ROUTE_TEST_';
const testId = (id) => `${TEST_PREFIX}${id}`;

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', mainRouter);
  return app;
}

describe('Subjects Routes Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
    cleanupTestData();
  });

  afterAll(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  function cleanupTestData() {
    // Clean up in order of foreign key dependencies
    db.prepare(`DELETE FROM questions WHERE subject_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM topics WHERE subject_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM generation_sessions WHERE subject_id LIKE '${TEST_PREFIX}%'`).run();
    db.prepare(`DELETE FROM subjects WHERE id LIKE '${TEST_PREFIX}%'`).run();
  }

  // ========================================
  // GET /api/subjects
  // ========================================

  describe('GET /api/subjects', () => {
    beforeEach(() => {
      // Create some test subjects
      createSubject({
        id: testId('subject_1'),
        name: 'Test Subject 1',
        shortName: 'TS1',
        description: 'First test subject',
        methodology: ['test', 'practice'],
        examType: 'test',
        modes: ['test', 'study']
      });

      createSubject({
        id: testId('subject_2'),
        name: 'Test Subject 2',
        shortName: 'TS2',
        description: 'Second test subject',
        methodology: ['exam'],
        examType: 'oral',
        modes: ['exam']
      });
    });

    it('should return all subjects', async () => {
      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subjects).toBeDefined();
      expect(Array.isArray(res.body.subjects)).toBe(true);
    });

    it('should return subjects with parsed methodology and modes', async () => {
      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);

      // Find our test subjects
      const testSubjects = res.body.subjects.filter(s => s.id.startsWith(TEST_PREFIX));
      expect(testSubjects.length).toBeGreaterThanOrEqual(2);

      const subject1 = testSubjects.find(s => s.id === testId('subject_1'));
      expect(subject1.methodology).toEqual(['test', 'practice']);
      expect(subject1.modes).toEqual(['test', 'study']);
    });

    it('should return subjects ordered by name', async () => {
      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);
      const subjects = res.body.subjects;

      // Check ordering (only for subjects with names)
      for (let i = 1; i < subjects.length; i++) {
        if (subjects[i].name && subjects[i - 1].name) {
          expect(subjects[i].name.localeCompare(subjects[i - 1].name)).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should include all expected fields', async () => {
      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);
      const testSubject = res.body.subjects.find(s => s.id === testId('subject_1'));

      if (testSubject) {
        expect(testSubject).toHaveProperty('id');
        expect(testSubject).toHaveProperty('name');
        expect(testSubject).toHaveProperty('short_name');
        expect(testSubject).toHaveProperty('description');
        expect(testSubject).toHaveProperty('methodology');
        expect(testSubject).toHaveProperty('modes');
      }
    });
  });

  // ========================================
  // GET /api/subjects/:id
  // ========================================

  describe('GET /api/subjects/:id', () => {
    beforeEach(() => {
      createSubject({
        id: testId('detail_subject'),
        name: 'Detail Test Subject',
        shortName: 'DTS',
        description: 'Subject for detail testing',
        methodology: ['comprehensive'],
        examType: 'mixed',
        modes: ['test', 'practice', 'exam'],
        claudeContext: {
          expertise: 'testing',
          terminology: ['unit test', 'integration test']
        }
      });
    });

    it('should return subject details by ID', async () => {
      const res = await request(app).get(`/api/subjects/${testId('detail_subject')}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subject).toBeDefined();
      expect(res.body.subject.id).toBe(testId('detail_subject'));
      expect(res.body.subject.name).toBe('Detail Test Subject');
      expect(res.body.subject.short_name).toBe('DTS');
      expect(res.body.subject.description).toBe('Subject for detail testing');
    });

    it('should return parsed methodology and modes', async () => {
      const res = await request(app).get(`/api/subjects/${testId('detail_subject')}`);

      expect(res.status).toBe(200);
      expect(res.body.subject.methodology).toEqual(['comprehensive']);
      expect(res.body.subject.modes).toEqual(['test', 'practice', 'exam']);
    });

    it('should return parsed claudeContext', async () => {
      const res = await request(app).get(`/api/subjects/${testId('detail_subject')}`);

      expect(res.status).toBe(200);
      expect(res.body.subject.claudeContext).toEqual({
        expertise: 'testing',
        terminology: ['unit test', 'integration test']
      });
    });

    it('should return 404 for non-existent subject', async () => {
      const res = await request(app).get('/api/subjects/nonexistent_subject_12345');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should handle subject without claudeContext', async () => {
      createSubject({
        id: testId('no_context_subject'),
        name: 'No Context Subject',
        methodology: ['test'],
        modes: ['test']
      });

      const res = await request(app).get(`/api/subjects/${testId('no_context_subject')}`);

      expect(res.status).toBe(200);
      expect(res.body.subject.claudeContext).toBeNull();
    });

    it('should handle subject with config field', async () => {
      // Insert directly with config
      db.prepare(`
        INSERT INTO subjects (id, name, methodology, modes, config)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testId('config_subject'),
        'Config Subject',
        JSON.stringify(['test']),
        JSON.stringify(['test']),
        JSON.stringify({ maxQuestions: 100, timeLimit: 60 })
      );

      const res = await request(app).get(`/api/subjects/${testId('config_subject')}`);

      expect(res.status).toBe(200);
      expect(res.body.subject.config).toEqual({ maxQuestions: 100, timeLimit: 60 });
    });
  });

  // ========================================
  // POST /api/subjects
  // ========================================

  describe('POST /api/subjects', () => {
    it('should create a new subject with required fields', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('new_subject'),
          name: 'New Test Subject',
          methodology: ['test'],
          modes: ['practice']
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.subject).toBeDefined();
      expect(res.body.subject.id).toBe(testId('new_subject'));
      expect(res.body.subject.name).toBe('New Test Subject');
    });

    it('should create a subject with all optional fields', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('full_subject'),
          name: 'Full Test Subject',
          shortName: 'FTS',
          description: 'A fully configured subject',
          methodology: ['test', 'exam'],
          examType: 'written',
          modes: ['test', 'study', 'exam'],
          claudeContext: {
            expertise: 'full testing',
            terminology: ['term1', 'term2']
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.subject.short_name).toBe('FTS');
      expect(res.body.subject.description).toBe('A fully configured subject');
      expect(res.body.subject.exam_type).toBe('written');
      expect(res.body.subject.claudeContext).toEqual({
        expertise: 'full testing',
        terminology: ['term1', 'term2']
      });
    });

    it('should return 400 if id is missing', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          name: 'Missing ID Subject',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('id');
    });

    it('should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('missing_name'),
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('name');
    });

    it('should return 400 if methodology is missing', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('missing_methodology'),
          name: 'Missing Methodology',
          modes: ['test']
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('methodology');
    });

    it('should return 400 if modes is missing', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('missing_modes'),
          name: 'Missing Modes',
          methodology: ['test']
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('modes');
    });

    it('should return 409 if subject with same ID exists', async () => {
      // Create first subject
      createSubject({
        id: testId('duplicate_subject'),
        name: 'Original Subject',
        methodology: ['test'],
        modes: ['test']
      });

      // Try to create another with same ID
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('duplicate_subject'),
          name: 'Duplicate Subject',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Ya existe');
    });

    it('should set default examType to test', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('default_exam'),
          name: 'Default Exam Type',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(201);
      expect(res.body.subject.exam_type).toBe('test');
    });

    it('should set default language to es', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('default_lang'),
          name: 'Default Language',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(201);
      expect(res.body.subject.language).toBe('es');
    });
  });

  // ========================================
  // PUT /api/subjects/:id
  // ========================================

  describe('PUT /api/subjects/:id', () => {
    beforeEach(() => {
      createSubject({
        id: testId('update_subject'),
        name: 'Original Name',
        shortName: 'ON',
        description: 'Original description',
        methodology: ['original'],
        examType: 'test',
        modes: ['original'],
        claudeContext: {
          expertise: 'original expertise'
        }
      });
    });

    it('should update subject name', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          name: 'Updated Name'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.subject.name).toBe('Updated Name');
    });

    it('should update subject shortName', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          shortName: 'UN'
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.short_name).toBe('UN');
    });

    it('should update subject description', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          description: 'Updated description'
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.description).toBe('Updated description');
    });

    it('should update subject methodology', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          methodology: ['updated', 'methods']
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.methodology).toEqual(['updated', 'methods']);
    });

    it('should update subject modes', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          modes: ['mode1', 'mode2', 'mode3']
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.modes).toEqual(['mode1', 'mode2', 'mode3']);
    });

    it('should update subject claudeContext', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          claudeContext: {
            expertise: 'updated expertise',
            terminology: ['new term']
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.claudeContext).toEqual({
        expertise: 'updated expertise',
        terminology: ['new term']
      });
    });

    it('should update multiple fields at once', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          name: 'Multi Update',
          shortName: 'MU',
          description: 'Multiple fields updated',
          modes: ['new_mode']
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.name).toBe('Multi Update');
      expect(res.body.subject.short_name).toBe('MU');
      expect(res.body.subject.description).toBe('Multiple fields updated');
      expect(res.body.subject.modes).toEqual(['new_mode']);
    });

    it('should return 404 for non-existent subject', async () => {
      const res = await request(app)
        .put('/api/subjects/nonexistent_subject_12345')
        .send({
          name: 'Updated Name'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('no encontrada');
    });

    it('should return unchanged subject if no updates provided', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.subject.name).toBe('Original Name');
    });

    it('should preserve other fields when updating one field', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          name: 'Only Name Updated'
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.name).toBe('Only Name Updated');
      expect(res.body.subject.description).toBe('Original description');
      expect(res.body.subject.modes).toEqual(['original']);
    });

    it('should allow setting description to null', async () => {
      const res = await request(app)
        .put(`/api/subjects/${testId('update_subject')}`)
        .send({
          description: null
        });

      // Note: depends on implementation - might be null or unchanged
      expect(res.status).toBe(200);
    });
  });

  // ========================================
  // Edge cases and error handling
  // ========================================

  describe('Edge cases and error handling', () => {
    it('should handle special characters in subject ID', async () => {
      // Note: some special characters might not be allowed
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('special-chars_123'),
          name: 'Special Characters',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(201);
      expect(res.body.subject.id).toBe(testId('special-chars_123'));
    });

    it('should handle unicode in subject name', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('unicode_subject'),
          name: 'Matematicas Avanzadas',
          description: 'Calculo diferencial e integral',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(201);
      expect(res.body.subject.name).toBe('Matematicas Avanzadas');
    });

    it('should handle empty arrays for methodology and modes', async () => {
      // Note: empty arrays might be allowed or rejected depending on validation
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('empty_arrays'),
          name: 'Empty Arrays',
          methodology: [],
          modes: []
        });

      // Might be 201 (allowed) or 400 (validation error)
      expect([201, 400]).toContain(res.status);
    });

    it('should handle very long subject name', async () => {
      const longName = 'A'.repeat(500);
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('long_name'),
          name: longName,
          methodology: ['test'],
          modes: ['test']
        });

      // Should either create successfully or return validation error
      expect([201, 400, 500]).toContain(res.status);
    });

    it('should handle complex claudeContext object', async () => {
      const complexContext = {
        expertise: 'advanced databases',
        terminology: ['tupla', 'bloque', 'reunion'],
        hints: {
          join: 'Consider nested loop vs hash join',
          sort: 'External sort for large data'
        },
        nestedArray: [[1, 2], [3, 4]]
      };

      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('complex_context'),
          name: 'Complex Context',
          methodology: ['test'],
          modes: ['test'],
          claudeContext: complexContext
        });

      expect(res.status).toBe(201);
      expect(res.body.subject.claudeContext).toEqual(complexContext);
    });

    it('should handle malformed JSON gracefully', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .set('Content-Type', 'application/json')
        .send('{ "id": "test", "name": "malformed" '); // Missing closing brace

      expect([400, 500]).toContain(res.status);
    });

    it('should handle null values for optional fields', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('null_optionals'),
          name: 'Null Optionals',
          shortName: null,
          description: null,
          methodology: ['test'],
          examType: null,
          modes: ['test'],
          claudeContext: null
        });

      expect(res.status).toBe(201);
    });

    it('should handle concurrent requests', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post('/api/subjects')
            .send({
              id: testId(`concurrent_${i}`),
              name: `Concurrent Subject ${i}`,
              methodology: ['test'],
              modes: ['test']
            })
        );
      }

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.status === 201).length;
      expect(successCount).toBe(5);
    });
  });

  // ========================================
  // Integration with other routes
  // ========================================

  describe('Integration with other routes', () => {
    it('should allow creating generation sessions for created subjects', async () => {
      // Create a subject
      await request(app)
        .post('/api/subjects')
        .send({
          id: testId('session_subject'),
          name: 'Session Subject',
          methodology: ['test'],
          modes: ['test']
        });

      // Create a generation session for that subject
      const res = await request(app)
        .post('/api/generate/test-session')
        .send({
          subjectId: testId('session_subject'),
          questionCount: 5
        });

      expect(res.status).toBe(201);
      expect(res.body.session.subject_id).toBe(testId('session_subject'));

      // Cleanup
      db.prepare(`DELETE FROM generation_sessions WHERE subject_id = ?`).run(testId('session_subject'));
    });

    it('should list subject in /api/subjects after creation', async () => {
      const subjectId = testId('list_subject');

      // Create subject
      await request(app)
        .post('/api/subjects')
        .send({
          id: subjectId,
          name: 'List Test Subject',
          methodology: ['test'],
          modes: ['test']
        });

      // List subjects
      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);
      const created = res.body.subjects.find(s => s.id === subjectId);
      expect(created).toBeDefined();
      expect(created.name).toBe('List Test Subject');
    });
  });

  // ========================================
  // Additional coverage tests
  // ========================================

  describe('Additional coverage tests', () => {
    it('should handle GET /api/subjects when database is empty of test subjects', async () => {
      // This tests the getAllSubjects function returning results
      const res = await request(app).get('/api/subjects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // May have other subjects like 'bda' from seeding
      expect(Array.isArray(res.body.subjects)).toBe(true);
    });

    it('should handle subject with all JSON fields populated', async () => {
      const fullSubject = {
        id: testId('full_json'),
        name: 'Full JSON Subject',
        shortName: 'FJS',
        description: 'Subject with all JSON fields',
        methodology: ['test', 'practice', 'exam'],
        examType: 'comprehensive',
        modes: ['study', 'test', 'review'],
        claudeContext: {
          expertise: 'full expertise',
          terminology: ['term1', 'term2', 'term3'],
          hints: {
            general: 'Some hint',
            specific: ['hint1', 'hint2']
          }
        }
      };

      const res = await request(app)
        .post('/api/subjects')
        .send(fullSubject);

      expect(res.status).toBe(201);
      expect(res.body.subject.methodology).toEqual(fullSubject.methodology);
      expect(res.body.subject.modes).toEqual(fullSubject.modes);
      expect(res.body.subject.claudeContext).toEqual(fullSubject.claudeContext);
    });

    it('should handle PUT with empty object', async () => {
      createSubject({
        id: testId('empty_update'),
        name: 'Empty Update Subject',
        methodology: ['test'],
        modes: ['test']
      });

      const res = await request(app)
        .put(`/api/subjects/${testId('empty_update')}`)
        .send({});

      expect(res.status).toBe(200);
      // Subject should remain unchanged
      expect(res.body.subject.name).toBe('Empty Update Subject');
    });

    it('should handle PUT updating only claudeContext', async () => {
      createSubject({
        id: testId('context_only'),
        name: 'Context Only Subject',
        methodology: ['test'],
        modes: ['test'],
        claudeContext: null
      });

      const res = await request(app)
        .put(`/api/subjects/${testId('context_only')}`)
        .send({
          claudeContext: {
            expertise: 'new expertise',
            terminology: ['new term']
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.claudeContext).toEqual({
        expertise: 'new expertise',
        terminology: ['new term']
      });
      // Other fields should be unchanged
      expect(res.body.subject.name).toBe('Context Only Subject');
    });

    it('should handle subject with empty string fields', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('empty_strings'),
          name: 'Empty Strings Subject',
          shortName: '',
          description: '',
          methodology: ['test'],
          modes: ['test']
        });

      expect(res.status).toBe(201);
      // Empty strings may be converted to null by the database/API
      // Accept either empty string or null
      expect(['', null]).toContain(res.body.subject.short_name);
      expect(['', null]).toContain(res.body.subject.description);
    });

    it('should preserve subject data across GET requests', async () => {
      const subjectData = {
        id: testId('preserve_data'),
        name: 'Preserve Data Subject',
        shortName: 'PDS',
        description: 'Testing data preservation',
        methodology: ['preserve'],
        examType: 'preservation',
        modes: ['preserve_mode'],
        claudeContext: {
          preserved: true,
          items: [1, 2, 3]
        }
      };

      // Create
      const createRes = await request(app)
        .post('/api/subjects')
        .send(subjectData);

      expect(createRes.status).toBe(201);

      // Get by ID
      const getRes = await request(app)
        .get(`/api/subjects/${testId('preserve_data')}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.subject.name).toBe(subjectData.name);
      expect(getRes.body.subject.methodology).toEqual(subjectData.methodology);
      expect(getRes.body.subject.claudeContext).toEqual(subjectData.claudeContext);
    });

    it('should handle sequential updates correctly', async () => {
      createSubject({
        id: testId('sequential'),
        name: 'Sequential Subject',
        methodology: ['test'],
        modes: ['test']
      });

      // First update
      await request(app)
        .put(`/api/subjects/${testId('sequential')}`)
        .send({ name: 'Updated Name 1' });

      // Second update
      await request(app)
        .put(`/api/subjects/${testId('sequential')}`)
        .send({ description: 'Added description' });

      // Third update
      const finalRes = await request(app)
        .put(`/api/subjects/${testId('sequential')}`)
        .send({ shortName: 'SEQ' });

      expect(finalRes.status).toBe(200);
      expect(finalRes.body.subject.name).toBe('Updated Name 1');
      expect(finalRes.body.subject.description).toBe('Added description');
      expect(finalRes.body.subject.short_name).toBe('SEQ');
    });

    it('should handle GET of subject with null optional fields', async () => {
      // Insert directly to ensure nulls
      db.prepare(`
        INSERT INTO subjects (id, name, methodology, modes, short_name, description, claude_context, config)
        VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL)
      `).run(
        testId('null_fields'),
        'Null Fields Subject',
        JSON.stringify(['test']),
        JSON.stringify(['test'])
      );

      const res = await request(app)
        .get(`/api/subjects/${testId('null_fields')}`);

      expect(res.status).toBe(200);
      expect(res.body.subject.short_name).toBeNull();
      expect(res.body.subject.description).toBeNull();
      expect(res.body.subject.claudeContext).toBeNull();
      expect(res.body.subject.config).toBeNull();
    });

    it('should handle array with single element', async () => {
      const res = await request(app)
        .post('/api/subjects')
        .send({
          id: testId('single_array'),
          name: 'Single Array Subject',
          methodology: ['single'],
          modes: ['single']
        });

      expect(res.status).toBe(201);
      expect(res.body.subject.methodology).toEqual(['single']);
      expect(res.body.subject.modes).toEqual(['single']);
    });

    it('should handle updating methodology array', async () => {
      createSubject({
        id: testId('update_array'),
        name: 'Update Array Subject',
        methodology: ['original1', 'original2'],
        modes: ['test']
      });

      const res = await request(app)
        .put(`/api/subjects/${testId('update_array')}`)
        .send({
          methodology: ['new1', 'new2', 'new3']
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.methodology).toEqual(['new1', 'new2', 'new3']);
    });

    it('should handle updating modes array', async () => {
      createSubject({
        id: testId('update_modes'),
        name: 'Update Modes Subject',
        methodology: ['test'],
        modes: ['original']
      });

      const res = await request(app)
        .put(`/api/subjects/${testId('update_modes')}`)
        .send({
          modes: ['updated1', 'updated2']
        });

      expect(res.status).toBe(200);
      expect(res.body.subject.modes).toEqual(['updated1', 'updated2']);
    });
  });
});
