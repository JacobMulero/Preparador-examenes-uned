/**
 * Question Parser for Exam App
 *
 * Parses markdown question files from the Preguntas directory.
 * Handles:
 * - Question headers: "## Pregunta X" or "## Pregunta X (Pagina Y)"
 * - Shared statements: "**Enunciado N:**" that apply to multiple questions
 * - Options: a), b), c), d) or A., B., C., D. on separate lines or in single line
 * - Math symbols (kept as-is)
 * - Multi-line content
 */

import fs from 'fs';
import path from 'path';

/**
 * Parse a single question file and extract all questions
 * @param {string} filePath - Absolute path to the markdown file
 * @returns {Array} - Array of question objects
 */
export function parseQuestionFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath, '.md');

  // Extract topic from filename (e.g., "Preguntas_Tema1" -> "Tema1")
  const topicMatch = fileName.match(/Preguntas_(Tema\d+|SinTema)/);
  const topic = topicMatch ? topicMatch[1] : 'Unknown';

  const questions = [];

  // Split content by question headers
  // Match: ## Pregunta X or ## Pregunta X (Pagina Y) or ## Pregunta X (Pagina Y-Z)
  const questionPattern = /^## Pregunta (\d+)(?:\s*\(Pagina\s*[\d\-]+\))?/gm;

  // Find all question positions
  const questionMatches = [];
  let match;
  while ((match = questionPattern.exec(content)) !== null) {
    questionMatches.push({
      index: match.index,
      questionNumber: parseInt(match[1], 10),
      fullMatch: match[0]
    });
  }

  // Track shared statements (Enunciados) - they can appear in any question
  // and apply to subsequent questions until a new Enunciado is defined
  const sharedStatements = {};

  // First pass: collect all shared statements from the entire document
  const enunciadoPattern = /\*\*Enunciado\s*(\d+):\*\*\s*([\s\S]*?)(?=\n\n[a-dA-D][\.\)]\s|$)/g;
  let enunciadoMatch;
  while ((enunciadoMatch = enunciadoPattern.exec(content)) !== null) {
    const statementNum = enunciadoMatch[1];
    const statementText = enunciadoMatch[2].trim();
    // Store the most recent version of each statement
    sharedStatements[statementNum] = statementText;
  }

  // Process each question
  for (let i = 0; i < questionMatches.length; i++) {
    const currentMatch = questionMatches[i];
    const nextMatch = questionMatches[i + 1];

    // Extract question content (from current header to next header or end)
    const startIndex = currentMatch.index + currentMatch.fullMatch.length;
    const endIndex = nextMatch ? nextMatch.index : content.length;
    let questionContent = content.slice(startIndex, endIndex).trim();

    // Remove trailing --- separator if present
    questionContent = questionContent.replace(/\n---\s*$/, '').trim();

    // Parse the question
    const parsedQuestion = parseQuestionContent(
      questionContent,
      currentMatch.questionNumber,
      topic,
      sharedStatements
    );

    if (parsedQuestion) {
      questions.push(parsedQuestion);
    }
  }

  return questions;
}

/**
 * Parse the content of a single question
 * @param {string} content - Raw question content (without header)
 * @param {number} questionNumber - Question number
 * @param {string} topic - Topic name
 * @param {Object} sharedStatements - Map of shared statement numbers to their text
 * @returns {Object|null} - Question object or null if parsing fails
 */
function parseQuestionContent(content, questionNumber, topic, sharedStatements) {
  // Remove any leading question number that may appear (e.g., "7. Cual de las...")
  let cleanContent = content.replace(/^\d+\.\s*/, '').trim();

  // Check if this question references a shared statement
  let sharedStatement = null;

  // Look for "En las condiciones del enunciado X" pattern
  const refPattern = /[Ee]n\s+las\s+condiciones\s+del\s+enunciado\s+(\d+)/i;
  const refMatch = cleanContent.match(refPattern);
  if (refMatch && sharedStatements[refMatch[1]]) {
    sharedStatement = sharedStatements[refMatch[1]];
  }

  // Check if there's an inline Enunciado in this question
  const inlineEnunciadoPattern = /\*\*Enunciado\s*(\d+):\*\*\s*([\s\S]*?)(?=\n\n[a-dA-D][\.\)]\s|\n[a-dA-D][\.\)]\s)/;
  const inlineMatch = cleanContent.match(inlineEnunciadoPattern);
  if (inlineMatch) {
    sharedStatement = inlineMatch[2].trim();
    // Remove the inline enunciado from the content for cleaner question text
    // But keep it in sharedStatement
  }

  // Extract options
  const options = extractOptions(cleanContent);

  // Extract the question text (everything before options)
  let questionText = extractQuestionText(cleanContent);

  // Clean up question text - remove inline enunciado if present
  if (inlineMatch) {
    questionText = questionText.replace(inlineEnunciadoPattern, '').trim();
  }

  // Generate unique ID
  const id = `${topic.toLowerCase()}_pregunta${questionNumber}`;

  return {
    id,
    topic,
    question_number: questionNumber,
    shared_statement: sharedStatement,
    content: questionText,
    options
  };
}

/**
 * Extract the main question text (before options)
 * @param {string} content - Full question content
 * @returns {string} - Question text
 */
function extractQuestionText(content) {
  // Find where options start
  // Options can be:
  // 1. Each on separate line: "\na) ..." or "\nA. ..."
  // 2. All on same line: "a) ... b) ... c) ... d) ..."

  // Try to find the first option pattern (lowercase a) or A.)
  const optionPatterns = [
    /\n\s*a\)\s/i,           // Option a) on new line (case insensitive)
    /\n\s*A\.\s/,            // Option A. on new line
    /^a\)\s/im,              // Option at line start
    /^A\.\s/m,               // Option A. at line start
  ];

  let firstOptionIndex = content.length;

  for (const pattern of optionPatterns) {
    const match = content.match(pattern);
    if (match && match.index < firstOptionIndex) {
      firstOptionIndex = match.index;
    }
  }

  // Get text before options
  let questionText = content.slice(0, firstOptionIndex).trim();

  return questionText;
}

/**
 * Extract options from question content
 * @param {string} content - Full question content
 * @returns {Object} - Options object { a: "...", b: "...", c: "...", d: "..." }
 */
function extractOptions(content) {
  const options = { a: null, b: null, c: null, d: null };

  // First, try to find options that are on separate lines or clearly delimited
  const lines = content.split('\n');
  let currentOption = null;
  let currentText = [];
  let foundOptions = 0;

  for (const line of lines) {
    // Check if this line starts a new option
    // Match both "a) text" and "A. text" formats
    const optionStart = line.match(/^\s*([a-dA-D])[\.\)]\s*(.*)/);

    if (optionStart) {
      // Save previous option if any
      if (currentOption) {
        options[currentOption] = currentText.join('\n').trim();
        foundOptions++;
      }

      // Normalize to lowercase
      currentOption = optionStart[1].toLowerCase();
      currentText = [optionStart[2]];
    } else if (currentOption) {
      // Continue current option (multi-line option)
      // But stop if we hit a separator or new section
      if (line.trim() === '---' || line.startsWith('##')) {
        break;
      }
      currentText.push(line);
    }
  }

  // Save last option
  if (currentOption) {
    options[currentOption] = currentText.join('\n').trim();
    foundOptions++;
  }

  // If we didn't find enough options with separate lines, try inline pattern
  if (foundOptions < 2) {
    // Reset options
    options.a = null;
    options.b = null;
    options.c = null;
    options.d = null;

    // Look for inline options format: "a) text b) text c) text d) text"
    // Find a line that contains multiple options on the same line
    for (const line of lines) {
      // Check if this line has inline options (a) followed later by b), c), d))
      // Must have at least a) and b) with space before b)
      const hasInlineOptions = /(?:^|\s)a\)\s/.test(line) && /\sb\)\s/.test(line);

      if (hasInlineOptions) {
        // Parse by splitting on the pattern " b) ", " c) ", " d) "
        // First extract a)
        const aMatch = line.match(/(?:^|\s)a\)\s+(.+?)(?=\s+b\))/);
        if (aMatch) options.a = aMatch[1].trim();

        const bMatch = line.match(/\sb\)\s+(.+?)(?=\s+c\)|$)/);
        if (bMatch) options.b = bMatch[1].trim();

        const cMatch = line.match(/\sc\)\s+(.+?)(?=\s+d\)|$)/);
        if (cMatch) options.c = cMatch[1].trim();

        const dMatch = line.match(/\sd\)\s+(.+?)$/);
        if (dMatch) options.d = dMatch[1].trim();

        if (options.a || options.b) {
          break;
        }
      }
    }

    // If still no options, try matching A. B. C. D. format
    if (!options.a && !options.b) {
      for (const line of lines) {
        const hasInlineOptionsUppercase = /(?:^|\s)A\.\s/.test(line) && /\sB\.\s/.test(line);

        if (hasInlineOptionsUppercase) {
          const aMatch = line.match(/(?:^|\s)A\.\s+(.+?)(?=\s+B\.)/);
          if (aMatch) options.a = aMatch[1].trim();

          const bMatch = line.match(/\sB\.\s+(.+?)(?=\s+C\.|$)/);
          if (bMatch) options.b = bMatch[1].trim();

          const cMatch = line.match(/\sC\.\s+(.+?)(?=\s+D\.|$)/);
          if (cMatch) options.c = cMatch[1].trim();

          const dMatch = line.match(/\sD\.\s+(.+?)$/);
          if (dMatch) options.d = dMatch[1].trim();

          if (options.a || options.b) {
            break;
          }
        }
      }
    }
  }

  // Clean up options - remove trailing whitespace and separators
  for (const key of Object.keys(options)) {
    if (options[key]) {
      options[key] = options[key]
        .replace(/\s*---\s*$/, '')
        .replace(/\n+$/, '')
        .trim();
    }
  }

  return options;
}

/**
 * Parse all question files from a directory
 * @param {string} dataDir - Path to the Preguntas directory
 * @returns {Array} - All questions from all files
 */
export function parseAllTopics(dataDir) {
  const allQuestions = [];

  // Get all markdown files in the directory
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('Preguntas_') && f.endsWith('.md'))
    .sort();

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    try {
      const questions = parseQuestionFile(filePath);
      allQuestions.push(...questions);
    } catch (error) {
      console.error(`Error parsing ${file}:`, error.message);
    }
  }

  return allQuestions;
}

/**
 * Get list of available topics
 * @param {string} dataDir - Path to the Preguntas directory
 * @returns {Array} - List of topic names
 */
export function getAvailableTopics(dataDir) {
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('Preguntas_') && f.endsWith('.md'))
    .sort();

  const topics = files.map(f => {
    const match = f.match(/Preguntas_(Tema\d+|SinTema)/);
    return match ? match[1] : null;
  }).filter(Boolean);

  return topics;
}
