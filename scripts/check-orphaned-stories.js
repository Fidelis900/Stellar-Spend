#!/usr/bin/env node
/**
 * check-orphaned-stories.js
 *
 * Detects Storybook story files whose component no longer exists.
 *
 * Usage:
 *   node scripts/check-orphaned-stories.js
 *   node scripts/check-orphaned-stories.js --fix   # remove orphans automatically
 *
 * A story is considered orphaned when every component import it contains
 * (i.e. every `import { X } from './Y'` or `import X from './Y'` that is
 * NOT a type-only import and NOT from a package path) resolves to a file
 * that does not exist on disk.
 */

const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const STORIES_GLOB_DIRS = [
  path.resolve(__dirname, '../src'),
];

const STORY_EXTENSIONS = ['.stories.ts', '.stories.tsx', '.stories.js', '.stories.jsx'];
const COMPONENT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

const FIX_MODE = process.argv.includes('--fix');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Recursively collect all files in a directory tree. */
function walkDir(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else {
      results.push(full);
    }
  }
  return results;
}

/** Return true if the file path ends with a story extension. */
function isStoryFile(filePath) {
  return STORY_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

/**
 * Extract relative (non-package) import paths from a story file's source.
 * Returns only relative imports (start with '.').
 */
function extractRelativeImports(source) {
  const importRe = /^import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gm;
  const paths = [];
  let match;
  while ((match = importRe.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier.startsWith('.')) {
      paths.push(specifier);
    }
  }
  return paths;
}

/**
 * Given a story file path and one of its relative import specifiers, check
 * whether the referenced module actually exists on disk.
 */
function importExists(storyFile, specifier) {
  const dir = path.dirname(storyFile);
  const candidate = path.resolve(dir, specifier);

  // Exact path
  if (fs.existsSync(candidate)) return true;

  // Try appending each component extension
  for (const ext of COMPONENT_EXTENSIONS) {
    if (fs.existsSync(candidate + ext)) return true;
    // Also try /index.<ext>
    if (fs.existsSync(path.join(candidate, 'index' + ext))) return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

let orphans = [];

for (const rootDir of STORIES_GLOB_DIRS) {
  const allFiles = walkDir(rootDir);

  for (const file of allFiles) {
    if (!isStoryFile(file)) continue;

    const source = fs.readFileSync(file, 'utf8');
    const relativeImports = extractRelativeImports(source);

    // Filter down to only non-type imports that resolve to missing files
    const missingImports = relativeImports.filter(
      (specifier) => !importExists(file, specifier),
    );

    if (missingImports.length > 0) {
      orphans.push({ file, missingImports });
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Report
// ──────────────────────────────────────────────────────────────────────────────

if (orphans.length === 0) {
  console.log('✅  No orphaned Storybook stories found.');
  process.exit(0);
}

console.error(`\n⚠️  Found ${orphans.length} orphaned story file(s):\n`);

for (const { file, missingImports } of orphans) {
  const rel = path.relative(process.cwd(), file);
  console.error(`  ${rel}`);
  for (const imp of missingImports) {
    console.error(`    └─ missing import: ${imp}`);
  }
}

if (FIX_MODE) {
  console.log('\n🗑  Removing orphaned story files...');
  for (const { file } of orphans) {
    fs.unlinkSync(file);
    const rel = path.relative(process.cwd(), file);
    console.log(`  removed: ${rel}`);
  }
  console.log('\n✅  Done.');
  process.exit(0);
} else {
  console.error(
    '\nRun with --fix to remove them automatically:',
    '\n  node scripts/check-orphaned-stories.js --fix\n',
  );
  process.exit(1);
}
