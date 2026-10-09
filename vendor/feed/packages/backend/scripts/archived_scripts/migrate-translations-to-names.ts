/**
 * HISTORICAL MIGRATION SCRIPT
 * 
 * This script was used to migrate translations from language codes to full language names.
 * It has already been executed and the migration is complete.
 * This script is kept for historical reference only.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Language code to name mapping
const LANGUAGE_CODE_MAP: { [key: string]: string } = {
  'sq': 'Albanian', 'am': 'Amharic', 'ar': 'Arabic', 'hy': 'Armenian', 'bn': 'Bengali',
  'bs': 'Bosnian', 'bg': 'Bulgarian', 'my': 'Burmese', 'ca': 'Catalan', 'zh': 'Chinese',
  'hr': 'Croatian', 'cs': 'Czech', 'da': 'Danish', 'nl': 'Dutch', 'et': 'Estonian',
  'fi': 'Finnish', 'fr': 'French', 'ka': 'Georgian', 'de': 'German', 'el': 'Greek',
  'gu': 'Gujarati', 'hi': 'Hindi', 'hu': 'Hungarian', 'is': 'Icelandic', 'id': 'Indonesian',
  'it': 'Italian', 'ja': 'Japanese', 'kn': 'Kannada', 'kk': 'Kazakh', 'ko': 'Korean',
  'lv': 'Latvian', 'lt': 'Lithuanian', 'mk': 'Macedonian', 'ms': 'Malay', 'ml': 'Malayalam',
  'mr': 'Marathi', 'mn': 'Mongolian', 'no': 'Norwegian', 'fa': 'Persian', 'pl': 'Polish',
  'pt': 'Portuguese', 'pa': 'Punjabi', 'ro': 'Romanian', 'ru': 'Russian', 'sr': 'Serbian',
  'sk': 'Slovak', 'sl': 'Slovenian', 'so': 'Somali', 'es': 'Spanish', 'sw': 'Swahili',
  'sv': 'Swedish', 'tl': 'Tagalog', 'ta': 'Tamil', 'te': 'Telugu', 'th': 'Thai',
  'tr': 'Turkish', 'uk': 'Ukrainian', 'ur': 'Urdu', 'vi': 'Vietnamese', 'en': 'English'
};

// Backup translations before migration
async function backupTranslations() {
  try {
    console.log('Backing up translations...');
    
    // Create backup directory if it doesn't exist
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Get all translations
    const translations = await prisma.translation.findMany();
    console.log(`Found ${translations.length} translations to backup`);
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `translations-backup-${timestamp}.json`);
    
    // Write to backup file
    fs.writeFileSync(backupPath, JSON.stringify(translations, null, 2));
    console.log(`Translations backed up to ${backupPath}`);
    
    return translations;
  } catch (error) {
    console.error('Error backing up translations:', error);
    throw error;
  }
}

// Main migration function
async function migrateTranslations() {
  try {
    console.log('Starting translation migration to use full language names...');
    
    // Backup translations
    await backupTranslations();
    
    // Get all translations
    const translations = await prisma.translation.findMany();
    console.log(`Found ${translations.length} translations to process`);
    
    // Process translations in batches of 100
    const batchSize = 100;
    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process in batches
    for (let i = 0; i < translations.length; i += batchSize) {
      const batch = translations.slice(i, i + batchSize);
      
      // Process each translation in the batch
      const updates = batch.map(translation => {
        // Skip if the language already looks like a full name (not a 2-3 letter code)
        if (!/^[a-z]{2,3}$/i.test(translation.language)) {
          skippedCount++;
          return null;
        }
        
        // Map language code to full name
        const languageName = LANGUAGE_CODE_MAP[translation.language.toLowerCase()];
        if (!languageName) {
          console.warn(`No mapping found for language code: ${translation.language}`);
          errorCount++;
          return null;
        }
        
        // Return the update operation
        return prisma.translation.update({
          where: { id: translation.id },
          data: { language: languageName }
        });
      }).filter(Boolean);
      
      // Execute updates
      if (updates.length > 0) {
        await Promise.all(updates);
        updatedCount += updates.length;
      }
      
      processedCount += batch.length;
      console.log(`Processed ${processedCount}/${translations.length} translations`);
    }
    
    console.log('Translation migration summary:');
    console.log(`- Total: ${translations.length}`);
    console.log(`- Updated: ${updatedCount}`);
    console.log(`- Skipped (already using names): ${skippedCount}`);
    console.log(`- Errors: ${errorCount}`);
    
    // Also migrate the translated document records
    await migrateTranslatedDocuments();
    
  } catch (error) {
    console.error('Error during translation migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Migrate the TranslatedDocument records
async function migrateTranslatedDocuments() {
  try {
    console.log('\nMigrating TranslatedDocument records...');
    
    // Get all translated documents
    const documents = await prisma.translatedDocument.findMany();
    console.log(`Found ${documents.length} translated documents to process`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process each document
    for (const doc of documents) {
      try {
        // Skip if the languageCode already looks like a full name (not a 2-3 letter code)
        if (!/^[a-z]{2,3}$/i.test(doc.languageCode)) {
          skippedCount++;
          continue;
        }
        
        // Map language code to full name
        const languageName = LANGUAGE_CODE_MAP[doc.languageCode.toLowerCase()];
        if (!languageName) {
          console.warn(`No mapping found for language code: ${doc.languageCode}`);
          errorCount++;
          continue;
        }
        
        // Update the document
        await prisma.translatedDocument.update({
          where: { id: doc.id },
          data: { languageCode: languageName }
        });
        
        updatedCount++;
      } catch (error) {
        console.error(`Error updating document ${doc.id}:`, error);
        errorCount++;
      }
    }
    
    console.log('TranslatedDocument migration summary:');
    console.log(`- Total: ${documents.length}`);
    console.log(`- Updated: ${updatedCount}`);
    console.log(`- Skipped (already using names): ${skippedCount}`);
    console.log(`- Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('Error migrating translated documents:', error);
  }
}

// Run the migration if called directly
if (require.main === module) {
  migrateTranslations()
    .then(() => console.log('Migration completed'))
    .catch(error => console.error('Migration failed:', error));
}
