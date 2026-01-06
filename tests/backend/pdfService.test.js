/**
 * Tests for PDF Service
 * Tests PDF upload, page extraction, and file management
 */

import { jest } from '@jest/globals';
import path from 'path';

// Mock fs module
const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  rmSync: jest.fn()
};

jest.unstable_mockModule('fs', () => ({
  default: mockFs,
  ...mockFs
}));

// Mock child_process
const mockExecAsync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  exec: jest.fn()
}));

// Mock util.promisify to return our mock
jest.unstable_mockModule('util', () => ({
  promisify: () => mockExecAsync
}));

// Mock pdf-lib
const mockPdfDocument = {
  getPageCount: jest.fn()
};
const mockPDFDocument = {
  load: jest.fn().mockResolvedValue(mockPdfDocument)
};
jest.unstable_mockModule('pdf-lib', () => ({
  PDFDocument: mockPDFDocument
}));

// Import after mocking
const pdfService = await import('../../server/services/pdfService.js');
const {
  initSubjectStorage,
  savePdfFile,
  getPdfPageCount,
  extractPdfPages,
  deleteExamFiles,
  getImageBase64,
  getImageMediaType
} = pdfService;

describe('pdfService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockReturnValue(undefined);
  });

  describe('initSubjectStorage', () => {
    it('should create all necessary directories for a subject', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = initSubjectStorage('bda');

      expect(mockFs.mkdirSync).toHaveBeenCalled();
      expect(result).toHaveProperty('subjectDir');
      expect(result).toHaveProperty('examsDir');
      expect(result).toHaveProperty('originalsDir');
      expect(result).toHaveProperty('imagesDir');
      expect(result).toHaveProperty('parsedDir');
    });

    it('should not create directories that already exist', () => {
      mockFs.existsSync.mockReturnValue(true);

      initSubjectStorage('existing-subject');

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle different subject IDs', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result1 = initSubjectStorage('math');
      const result2 = initSubjectStorage('physics');

      expect(result1.subjectDir).toContain('math');
      expect(result2.subjectDir).toContain('physics');
    });
  });

  describe('savePdfFile', () => {
    it('should save PDF file with sanitized filename', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const fileBuffer = Buffer.from('test pdf content');
      const result = await savePdfFile('bda', 'exam123', fileBuffer, 'Test Exam.pdf');

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(result.filename).toBe('exam123_Test_Exam.pdf');
      expect(result.filePath).toContain('originals');
    });

    it('should sanitize special characters in filename', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const fileBuffer = Buffer.from('test');
      const result = await savePdfFile('bda', 'exam456', fileBuffer, 'Test@#$%.pdf');

      expect(result.filename).toBe('exam456_Test____.pdf');
    });

    it('should initialize storage directories before saving', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await savePdfFile('new-subject', 'exam1', Buffer.from('test'), 'file.pdf');

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getPdfPageCount', () => {
    it('should return page count from PDF', async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from('pdf content'));
      mockPdfDocument.getPageCount.mockReturnValue(5);

      const count = await getPdfPageCount('/path/to/test.pdf');

      expect(count).toBe(5);
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/test.pdf');
      expect(mockPDFDocument.load).toHaveBeenCalled();
    });

    it('should throw error when PDF cannot be read', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(getPdfPageCount('/nonexistent.pdf')).rejects.toThrow('Failed to read PDF file');
    });

    it('should throw error when PDFDocument.load fails', async () => {
      mockFs.readFileSync.mockReturnValue(Buffer.from('invalid pdf'));
      mockPDFDocument.load.mockRejectedValue(new Error('Invalid PDF'));

      await expect(getPdfPageCount('/invalid.pdf')).rejects.toThrow('Failed to read PDF file');
    });
  });

  describe('extractPdfPages', () => {
    describe('with pdftoppm available', () => {
      beforeEach(() => {
        // First call to 'which pdftoppm' succeeds
        mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/bin/pdftoppm' });
      });

      it('should extract pages using pdftoppm', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockExecAsync.mockResolvedValueOnce({ stdout: '' }); // pdftoppm execution
        mockFs.readdirSync.mockReturnValue(['page-1.png', 'page-2.png', 'page-3.png']);

        const result = await extractPdfPages('bda', 'exam123', '/path/test.pdf');

        expect(result).toHaveLength(3);
        expect(result[0].pageNumber).toBe(1);
        expect(result[0].filename).toBe('page-1.png');
        expect(result[1].pageNumber).toBe(2);
        expect(result[2].pageNumber).toBe(3);
      });

      it('should create output directory if it does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);
        mockExecAsync.mockResolvedValueOnce({ stdout: '' });
        mockFs.readdirSync.mockReturnValue(['page-1.png']);

        await extractPdfPages('bda', 'exam1', '/test.pdf');

        expect(mockFs.mkdirSync).toHaveBeenCalled();
      });

      it('should throw error when pdftoppm fails', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockExecAsync.mockRejectedValueOnce(new Error('pdftoppm error'));

        await expect(extractPdfPages('bda', 'exam1', '/test.pdf')).rejects.toThrow('pdftoppm error');
      });
    });

    describe('with pdftoppm unavailable but ImageMagick available', () => {
      beforeEach(() => {
        // 'which pdftoppm' fails
        mockExecAsync.mockRejectedValueOnce(new Error('not found'));
        // 'which convert' succeeds
        mockExecAsync.mockResolvedValueOnce({ stdout: '/usr/bin/convert' });
      });

      it('should fall back to ImageMagick convert', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockExecAsync.mockResolvedValueOnce({ stdout: '' }); // convert execution
        mockFs.readdirSync.mockReturnValue(['page-0.png', 'page-1.png']);

        const result = await extractPdfPages('bda', 'exam123', '/test.pdf');

        expect(result).toHaveLength(2);
        expect(result[0].pageNumber).toBe(1);
        expect(result[1].pageNumber).toBe(2);
      });

      it('should sort ImageMagick output files correctly', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockExecAsync.mockResolvedValueOnce({ stdout: '' });
        mockFs.readdirSync.mockReturnValue(['page-10.png', 'page-2.png', 'page-1.png']);

        const result = await extractPdfPages('bda', 'exam1', '/test.pdf');

        expect(result[0].filename).toBe('page-1.png');
        expect(result[1].filename).toBe('page-2.png');
        expect(result[2].filename).toBe('page-10.png');
      });

      it('should throw error when ImageMagick convert fails', async () => {
        mockFs.existsSync.mockReturnValue(true);
        mockExecAsync.mockRejectedValueOnce(new Error('convert error'));

        await expect(extractPdfPages('bda', 'exam1', '/test.pdf')).rejects.toThrow(
          'No PDF conversion tool available'
        );
      });
    });

    describe('with no conversion tools available', () => {
      it('should throw informative error', async () => {
        // Both 'which pdftoppm' and 'which convert' fail
        mockExecAsync.mockRejectedValueOnce(new Error('not found'));
        mockExecAsync.mockRejectedValueOnce(new Error('not found'));

        await expect(extractPdfPages('bda', 'exam1', '/test.pdf')).rejects.toThrow(
          'No PDF conversion tool available'
        );
      });
    });
  });

  describe('deleteExamFiles', () => {
    it('should delete PDF file if it exists', () => {
      mockFs.existsSync.mockImplementation(p => p.includes('originals'));

      deleteExamFiles('bda', 'exam123', 'exam123_test.pdf');

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should delete images directory if it exists', () => {
      mockFs.existsSync.mockImplementation(p => p.includes('images'));

      deleteExamFiles('bda', 'exam123', 'exam123_test.pdf');

      expect(mockFs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('images'),
        { recursive: true }
      );
    });

    it('should delete parsed directory if it exists', () => {
      mockFs.existsSync.mockImplementation(p => p.includes('parsed'));

      deleteExamFiles('bda', 'exam123', 'exam123_test.pdf');

      expect(mockFs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('parsed'),
        { recursive: true }
      );
    });

    it('should not throw when files do not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => deleteExamFiles('bda', 'exam123', 'nonexistent.pdf')).not.toThrow();
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });

    it('should delete all existing files and directories', () => {
      mockFs.existsSync.mockReturnValue(true);

      deleteExamFiles('bda', 'exam123', 'test.pdf');

      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(mockFs.rmSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('getImageBase64', () => {
    it('should return base64 encoded image', () => {
      const imageBuffer = Buffer.from('fake image data');
      mockFs.readFileSync.mockReturnValue(imageBuffer);

      const result = getImageBase64('/path/to/image.png');

      expect(result).toBe(imageBuffer.toString('base64'));
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/image.png');
    });

    it('should handle different image contents', () => {
      const imageBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      mockFs.readFileSync.mockReturnValue(imageBuffer);

      const result = getImageBase64('/test.png');

      expect(result).toBe('iVBORw==');
    });
  });

  describe('getImageMediaType', () => {
    it('should return correct media type for PNG', () => {
      expect(getImageMediaType('/path/image.png')).toBe('image/png');
      expect(getImageMediaType('/path/image.PNG')).toBe('image/png');
    });

    it('should return correct media type for JPG', () => {
      expect(getImageMediaType('/path/image.jpg')).toBe('image/jpeg');
      expect(getImageMediaType('/path/image.JPG')).toBe('image/jpeg');
    });

    it('should return correct media type for JPEG', () => {
      expect(getImageMediaType('/path/image.jpeg')).toBe('image/jpeg');
      expect(getImageMediaType('/path/image.JPEG')).toBe('image/jpeg');
    });

    it('should return correct media type for GIF', () => {
      expect(getImageMediaType('/path/image.gif')).toBe('image/gif');
    });

    it('should return correct media type for WebP', () => {
      expect(getImageMediaType('/path/image.webp')).toBe('image/webp');
    });

    it('should return default image/png for unknown extension', () => {
      expect(getImageMediaType('/path/image.bmp')).toBe('image/png');
      expect(getImageMediaType('/path/image.tiff')).toBe('image/png');
      expect(getImageMediaType('/path/file.unknown')).toBe('image/png');
    });

    it('should handle paths with multiple dots', () => {
      expect(getImageMediaType('/path/my.image.file.jpg')).toBe('image/jpeg');
    });
  });

  describe('default export', () => {
    it('should export all functions', () => {
      const defaultExport = pdfService.default;

      expect(defaultExport.initSubjectStorage).toBeDefined();
      expect(defaultExport.savePdfFile).toBeDefined();
      expect(defaultExport.getPdfPageCount).toBeDefined();
      expect(defaultExport.extractPdfPages).toBeDefined();
      expect(defaultExport.deleteExamFiles).toBeDefined();
      expect(defaultExport.getImageBase64).toBeDefined();
      expect(defaultExport.getImageMediaType).toBeDefined();
    });
  });
});
