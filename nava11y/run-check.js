#!/usr/bin/env node

import { run } from './explorer/runner.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HELP_TEXT = `
Dynamic Accessibility Testing Tool
Performs WCAG 2.4.7 (Focus Visible) checks on web pages

Usage:
  node run-check.js <url>               Test a live URL (direct)
  node run-check.js --url <url>         Test a live URL (explicit)
  node run-check.js --file <path>       Test a local HTML file
  node run-check.js --help              Show this help message

Options:
  --url <url>       URL to test (e.g., https://example.com)
  --file <path>     Path to local HTML file (e.g., ./test.html)
  --help            Display help information

Examples:
  node run-check.js https://example.com
  node run-check.js --url https://example.com
  node run-check.js --file ./fixtures/test-page.html

Output:
  Reports are generated in the reports/ directory:
  - index.html     Human-readable HTML report
  - results.json   Machine-readable JSON results
`;

function showHelp() {
  console.log(HELP_TEXT);
  process.exit(0);
}

function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function validateFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    return null;
  }
  if (!fs.statSync(absolutePath).isFile()) {
    console.error(`Error: Path is not a file: ${absolutePath}`);
    return null;
  }
  return absolutePath;
}

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
  }

  const urlIndex = args.indexOf('--url');
  const fileIndex = args.indexOf('--file');

  if (urlIndex !== -1 && fileIndex !== -1) {
    console.error('Error: Cannot specify both --url and --file');
    process.exit(1);
  }

  if (urlIndex !== -1) {
    const url = args[urlIndex + 1];
    if (!url) {
      console.error('Error: --url requires a URL argument');
      process.exit(1);
    }
    if (!validateUrl(url)) {
      console.error(`Error: Invalid URL format: ${url}`);
      process.exit(1);
    }
    return { type: 'url', value: url };
  }

  if (fileIndex !== -1) {
    const filePath = args[fileIndex + 1];
    if (!filePath) {
      console.error('Error: --file requires a file path argument');
      process.exit(1);
    }
    const absolutePath = validateFile(filePath);
    if (!absolutePath) {
      process.exit(1);
    }
    // Convert to file:// URL
    const fileUrl = `file://${absolutePath}`;
    return { type: 'file', value: fileUrl };
  }

  // Backward compatibility: Support direct URL argument (without --url flag)
  // e.g., node run-check.js https://example.com
  if (args.length === 1 && !args[0].startsWith('--')) {
    const input = args[0];

    // Check if it's a URL
    if (validateUrl(input)) {
      return { type: 'url', value: input };
    }

    // Check if it's a file path
    const absolutePath = validateFile(input);
    if (absolutePath) {
      const fileUrl = `file://${absolutePath}`;
      return { type: 'file', value: fileUrl };
    }

    console.error(`Error: Invalid URL or file path: ${input}`);
    process.exit(1);
  }

  console.error('Error: Must specify either a URL, --url <url>, or --file <path>');
  console.log('Run with --help for usage information');
  process.exit(1);
}

async function main() {
  const input = parseArgs();

  console.log(`\n🔍 Dynamic Accessibility Testing`);
  console.log(`Testing: ${input.value}\n`);

  try {
    await run(input.value);
  } catch (error) {
    console.error(`\n❌ Error during testing:`);
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
