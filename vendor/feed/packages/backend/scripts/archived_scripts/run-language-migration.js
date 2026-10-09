#!/usr/bin/env node

/**
 * Language System Migration Script
 * 
 * This script orchestrates the complete migration from language codes to full names:
 * 1. Creates all supported languages (59 OpenAI languages)
 * 2. Migrates existing translations to use full names
 * 
 * Usage:
 *  node run-language-migration.js
 */

// Import path for better file management
const path = require('path');
const { execSync } = require('child_process');

// Define script paths
const CREATE_LANGUAGES_SCRIPT = path.join(__dirname, 'create-supported-languages.ts');
const MIGRATE_TRANSLATIONS_SCRIPT = path.join(__dirname, 'migrate-translations-to-names.ts');

// Function to execute a script with ts-node
function runScript(scriptPath) {
  console.log(`Running script: ${scriptPath}`);
  try {
    execSync(`npx ts-node ${scriptPath}`, { stdio: 'inherit' });
    console.log(`Successfully completed: ${scriptPath}`);
    return true;
  } catch (error) {
    console.error(`Error running script ${scriptPath}:`, error);
    return false;
  }
}

// Main execution function
async function migrateLanguageSystem() {
  console.log("=== Language System Migration ===");
  console.log("This script will migrate the language system from codes to full names.");
  console.log("This operation modifies data in the database - ensure you have a backup.\n");
  
  // Run each migration step
  console.log("Step 1: Creating supported language entries...");
  const step1Success = runScript(CREATE_LANGUAGES_SCRIPT);
  if (!step1Success) {
    console.error("Language creation failed. Stopping migration.");
    process.exit(1);
  }
  
  console.log("\nStep 2: Migrating translations to use full language names...");
  const step2Success = runScript(MIGRATE_TRANSLATIONS_SCRIPT);
  if (!step2Success) {
    console.error("Translation migration failed. Manual inspection required.");
    process.exit(1);
  }
  
  console.log("\nLanguage system migration completed successfully!");
  console.log("Please restart the application for changes to take effect.");
}

// Execute migration
migrateLanguageSystem().catch(error => {
  console.error("Migration failed with error:", error);
  process.exit(1);
});
