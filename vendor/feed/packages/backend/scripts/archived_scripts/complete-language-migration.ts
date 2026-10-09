/**
 * HISTORICAL MIGRATION SCRIPT
 * 
 * This script was used to complete the migration from language codes to full language names
 * across all database tables. It has already been executed and the migration is complete.
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

// Create backup directory
const createBackupDir = () => {
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
};

// Backup data function
async function backupData(name: string, data: any[]) {
  try {
    const backupDir = createBackupDir();
    console.log(`Backing up ${name}...`);
    
    console.log(`Found ${data.length} ${name} to backup`);
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${name}-backup-${timestamp}.json`);
    
    // Write to backup file
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    console.log(`${name} backed up to ${backupPath}`);
    
    return data;
  } catch (error) {
    console.error(`Error backing up ${name}:`, error);
    throw error;
  }
}

// Process migration in batches with detailed logging
async function processMigration<T extends { id: number, language?: string, languageCode?: string }>(
  items: T[],
  updateFn: (id: number, languageName: string) => Promise<any>,
  itemType: string,
  languageField: 'language' | 'languageCode' = 'language'
) {
  console.log(`Starting migration for ${itemType}...`);
  
  const batchSize = 100;
  let processedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const updates = await Promise.all(batch.map(async (item) => {
      try {
        const langCode = item[languageField];
        
        // Skip if null/undefined
        if (!langCode) {
          console.warn(`${itemType} ID ${item.id} has no ${languageField}`);
          errorCount++;
          return false;
        }
        
        // Skip if already looks like a full name (not a 2-3 letter code)
        if (!/^[a-z]{2,3}$/i.test(langCode)) {
          skippedCount++;
          return false;
        }
        
        // Map language code to full name
        const languageName = LANGUAGE_CODE_MAP[langCode.toLowerCase()];
        if (!languageName) {
          console.warn(`No mapping found for language code: ${langCode}`);
          errorCount++;
          return false;
        }
        
        // Update the item
        await updateFn(item.id, languageName);
        updatedCount++;
        return true;
      } catch (error) {
        console.error(`Error updating ${itemType} ${item.id}:`, error);
        errorCount++;
        return false;
      }
    }));
    
    processedCount += batch.length;
    console.log(`Processed ${processedCount}/${items.length} ${itemType}`);
  }
  
  console.log(`${itemType} migration summary:`);
  console.log(`- Total: ${items.length}`);
  console.log(`- Updated: ${updatedCount}`);
  console.log(`- Skipped (already using names): ${skippedCount}`);
  console.log(`- Errors: ${errorCount}`);
  
  return { updated: updatedCount, skipped: skippedCount, errors: errorCount };
}

// Main migration function
async function completeLanguageMigration() {
  try {
    console.log('Starting complete language migration to use full language names...');
    
    // 1. Migrate Translation table
    const translations = await prisma.translation.findMany();
    await backupData('translations', translations);
    
    await processMigration(
      translations, 
      async (id, languageName) => {
        return prisma.translation.update({
          where: { id },
          data: { language: languageName }
        });
      },
      'translations'
    );
    
    // 2. Migrate FoodItemTranslation table
    const foodItemTranslations = await prisma.foodItemTranslation.findMany();
    await backupData('foodItemTranslations', foodItemTranslations);
    
    await processMigration(
      foodItemTranslations, 
      async (id, languageName) => {
        return prisma.foodItemTranslation.update({
          where: { id },
          data: { language: languageName }
        });
      },
      'food item translations'
    );
    
    // 3. Migrate CategoryTranslation table
    const categoryTranslations = await prisma.categoryTranslation.findMany();
    await backupData('categoryTranslations', categoryTranslations);
    
    await processMigration(
      categoryTranslations, 
      async (id, languageName) => {
        return prisma.categoryTranslation.update({
          where: { id },
          data: { language: languageName }
        });
      },
      'category translations'
    );
    
    // 4. Migrate TranslatedDocument table
    const translatedDocuments = await prisma.translatedDocument.findMany();
    await backupData('translatedDocuments', translatedDocuments);
    
    await processMigration(
      translatedDocuments, 
      async (id, languageName) => {
        return prisma.translatedDocument.update({
          where: { id },
          data: { languageCode: languageName }
        });
      },
      'translated documents',
      'languageCode'
    );
    
    console.log('Complete language migration finished successfully');
    
  } catch (error) {
    console.error('Error during complete language migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration if called directly
if (require.main === module) {
  completeLanguageMigration()
    .then(() => console.log('Migration completed successfully'))
    .catch(error => console.error('Migration failed:', error));
}

export { completeLanguageMigration };
