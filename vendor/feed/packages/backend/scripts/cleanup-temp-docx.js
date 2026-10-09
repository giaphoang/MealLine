#!/usr/bin/env node

// Make this script executable with: chmod +x ./scripts/cleanup-temp-docx.js

/**
 * Script to clean up temporary docx files in the backend directory
 * 
 * This script searches for and removes DOCX files in the current directory
 * that match the pattern of temporary translation files.
 * 
 * Usage:
 * node cleanup-temp-docx.js
 */

const fs = require('fs');
const path = require('path');

// Get current directory
const currentDir = process.cwd();
console.log(`Scanning directory: ${currentDir}`);

// Find all docx files with timestamp filenames (e.g., 1740989541529.docx)
const files = fs.readdirSync(currentDir).filter(file => 
  file.endsWith('.docx') && 
  /^\d+\.docx$/.test(file) && // Match timestamp filenames
  !file.includes('package-lock') && 
  !file.includes('node_modules')
);

if (files.length === 0) {
  console.log('No temporary DOCX files found.');
} else {
  console.log(`Found ${files.length} temporary DOCX files:`);
  
  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
    
    // Get file stats
    const stats = fs.statSync(path.join(currentDir, file));
    console.log(`   - Size: ${Math.round(stats.size / 1024)} KB`);
    console.log(`   - Created: ${stats.birthtime.toLocaleString()}`);
    
    // Remove the file
    fs.unlinkSync(path.join(currentDir, file));
    console.log(`   - REMOVED`);
  });
  
  console.log('All temporary DOCX files have been removed.');
}
