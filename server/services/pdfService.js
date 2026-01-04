/**
 * PDF Service (Fase 2)
 * Handles PDF upload and page extraction to images
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PDFDocument } from 'pdf-lib';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage paths
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'subjects');
const TEMP_DIR = path.join(__dirname, '..', '..', '.tmp');

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get storage paths for a subject
 */
function getSubjectPaths(subjectId) {
  const subjectDir = path.join(UPLOADS_DIR, subjectId);
  const examsDir = path.join(subjectDir, 'exams');
  const originalsDir = path.join(examsDir, 'originals');
  const imagesDir = path.join(examsDir, 'images');
  const parsedDir = path.join(examsDir, 'parsed');

  return { subjectDir, examsDir, originalsDir, imagesDir, parsedDir };
}

/**
 * Initialize storage directories for a subject
 */
export function initSubjectStorage(subjectId) {
  const paths = getSubjectPaths(subjectId);
  Object.values(paths).forEach(ensureDir);
  return paths;
}

/**
 * Save uploaded PDF file
 * @param {string} subjectId - Subject ID
 * @param {string} examId - Exam ID
 * @param {Buffer} fileBuffer - PDF file buffer
 * @param {string} originalFilename - Original filename
 */
export async function savePdfFile(subjectId, examId, fileBuffer, originalFilename) {
  const paths = initSubjectStorage(subjectId);
  const safeFilename = `${examId}_${originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(paths.originalsDir, safeFilename);

  fs.writeFileSync(filePath, fileBuffer);

  return {
    filePath,
    filename: safeFilename
  };
}

/**
 * Get PDF page count
 * @param {string} pdfPath - Path to PDF file
 */
export async function getPdfPageCount(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error('[pdfService] Error getting page count:', error.message);
    throw new Error('Failed to read PDF file');
  }
}

/**
 * Check if pdftoppm (poppler-utils) is available
 */
async function checkPdftoppm() {
  try {
    await execAsync('which pdftoppm');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if sips (macOS built-in) is available
 */
async function checkSips() {
  try {
    await execAsync('which sips');
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract pages from PDF to PNG images using pdftoppm
 * @param {string} pdfPath - Path to PDF file
 * @param {string} outputDir - Output directory for images
 * @param {string} prefix - Prefix for output files
 */
async function extractWithPdftoppm(pdfPath, outputDir, prefix) {
  ensureDir(outputDir);

  // pdftoppm -png input.pdf output_prefix
  // Creates output_prefix-1.png, output_prefix-2.png, etc.
  const cmd = `pdftoppm -png -r 150 "${pdfPath}" "${path.join(outputDir, prefix)}"`;

  try {
    await execAsync(cmd, { timeout: 120000 });

    // Find generated files
    const files = fs.readdirSync(outputDir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
      .sort();

    return files.map((f, i) => ({
      pageNumber: i + 1,
      imagePath: path.join(outputDir, f),
      filename: f
    }));
  } catch (error) {
    console.error('[pdfService] pdftoppm error:', error.message);
    throw error;
  }
}

/**
 * Extract pages from PDF to PNG images using ImageMagick convert
 */
async function extractWithConvert(pdfPath, outputDir, prefix) {
  ensureDir(outputDir);

  // Check if convert (ImageMagick) is available
  try {
    await execAsync('which convert');
  } catch {
    throw new Error('ImageMagick convert not available');
  }

  // convert -density 150 input.pdf output_%d.png
  const outputPattern = path.join(outputDir, `${prefix}-%d.png`);
  const cmd = `convert -density 150 "${pdfPath}" "${outputPattern}"`;

  try {
    await execAsync(cmd, { timeout: 120000 });

    // Find generated files
    const files = fs.readdirSync(outputDir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] || '0');
        const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] || '0');
        return numA - numB;
      });

    return files.map((f, i) => ({
      pageNumber: i + 1,
      imagePath: path.join(outputDir, f),
      filename: f
    }));
  } catch (error) {
    console.error('[pdfService] ImageMagick error:', error.message);
    throw error;
  }
}

/**
 * Extract pages from PDF to images
 * Tries multiple methods in order of preference
 * @param {string} subjectId - Subject ID
 * @param {string} examId - Exam ID
 * @param {string} pdfPath - Path to PDF file
 */
export async function extractPdfPages(subjectId, examId, pdfPath) {
  const paths = getSubjectPaths(subjectId);
  const outputDir = path.join(paths.imagesDir, examId);
  const prefix = 'page';

  // Try pdftoppm first (best quality, most reliable)
  if (await checkPdftoppm()) {
    console.log('[pdfService] Using pdftoppm for extraction');
    return await extractWithPdftoppm(pdfPath, outputDir, prefix);
  }

  // Try ImageMagick convert
  try {
    console.log('[pdfService] Trying ImageMagick convert');
    return await extractWithConvert(pdfPath, outputDir, prefix);
  } catch {
    // Fall through to error
  }

  // No conversion tool available
  throw new Error(
    'No PDF conversion tool available. Please install poppler-utils (pdftoppm) or ImageMagick. ' +
    'On macOS: brew install poppler'
  );
}

/**
 * Delete exam files (PDF and images)
 * @param {string} subjectId - Subject ID
 * @param {string} examId - Exam ID
 * @param {string} pdfFilename - PDF filename
 */
export function deleteExamFiles(subjectId, examId, pdfFilename) {
  const paths = getSubjectPaths(subjectId);

  // Delete original PDF
  const pdfPath = path.join(paths.originalsDir, pdfFilename);
  if (fs.existsSync(pdfPath)) {
    fs.unlinkSync(pdfPath);
  }

  // Delete images directory
  const imagesDir = path.join(paths.imagesDir, examId);
  if (fs.existsSync(imagesDir)) {
    fs.rmSync(imagesDir, { recursive: true });
  }

  // Delete parsed markdown
  const parsedDir = path.join(paths.parsedDir, examId);
  if (fs.existsSync(parsedDir)) {
    fs.rmSync(parsedDir, { recursive: true });
  }
}

/**
 * Get image as base64
 * @param {string} imagePath - Path to image file
 */
export function getImageBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Get image media type from extension
 * @param {string} imagePath - Path to image file
 */
export function getImageMediaType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mediaTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mediaTypes[ext] || 'image/png';
}

export default {
  initSubjectStorage,
  savePdfFile,
  getPdfPageCount,
  extractPdfPages,
  deleteExamFiles,
  getImageBase64,
  getImageMediaType
};
