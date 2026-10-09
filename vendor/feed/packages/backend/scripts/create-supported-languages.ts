import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// The supported languages based on OpenAI's documentation
const SUPPORTED_LANGUAGES = [
  'Albanian', 'Amharic', 'Arabic', 'Armenian', 'Bengali', 'Bosnian', 'Bulgarian', 'Burmese',
  'Catalan', 'Chinese', 'Croatian', 'Czech', 'Danish', 'Dutch', 'Estonian', 'Finnish', 'French',
  'Georgian', 'German', 'Greek', 'Gujarati', 'Hindi', 'Hungarian', 'Icelandic', 'Indonesian',
  'Italian', 'Japanese', 'Kannada', 'Kazakh', 'Korean', 'Latvian', 'Lithuanian', 'Macedonian',
  'Malay', 'Malayalam', 'Marathi', 'Mongolian', 'Norwegian', 'Persian', 'Polish', 'Portuguese',
  'Punjabi', 'Romanian', 'Russian', 'Serbian', 'Slovak', 'Slovenian', 'Somali', 'Spanish',
  'Swahili', 'Swedish', 'Tagalog', 'Tamil', 'Telugu', 'Thai', 'Turkish', 'Ukrainian', 'Urdu',
  'Vietnamese', 'English'
];

// Legacy code mapping for transition
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

// Create a backup of current languages table
async function backupLanguages() {
  try {
    const languages = await prisma.language.findMany();
    const backupDir = path.join(__dirname, '../backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `languages-backup-${timestamp}.json`);
    
    fs.writeFileSync(backupPath, JSON.stringify(languages, null, 2));
    console.log(`Backed up ${languages.length} languages to ${backupPath}`);
    
    return languages;
  } catch (error) {
    console.error('Error backing up languages:', error);
    throw error;
  }
}

// Update or create language entries for all supported languages
async function createSupportedLanguages() {
  try {
    console.log('Creating or updating supported languages...');
    
    // Backup current languages
    const existingLanguages = await backupLanguages();
    const existingLanguageMap = new Map();
    existingLanguages.forEach(lang => {
      existingLanguageMap.set(lang.code, lang);
    });
    
    // Create or update each supported language
    for (let i = 0; i < SUPPORTED_LANGUAGES.length; i++) {
      const languageName = SUPPORTED_LANGUAGES[i];
      
      // Find language code for this name (for backward compatibility)
      const code = Object.keys(LANGUAGE_CODE_MAP).find(
        key => LANGUAGE_CODE_MAP[key] === languageName
      ) || languageName.substring(0, 2).toLowerCase();
      
      // Check if this language already exists
      const existingLanguage = existingLanguageMap.get(code);
      const isEnabled = existingLanguage ? existingLanguage.isEnabled : false;
      
      try {
        // Upsert the language
        await prisma.language.upsert({
          where: { code },
          update: {
            name: languageName,
            isEnabled
          },
          create: {
            code,
            name: languageName,
            isEnabled: false,
            sortOrder: i + 1
          }
        });
        console.log(`Upserted language: ${languageName} (${code})`);
      } catch (error) {
        console.error(`Error upserting language ${languageName}:`, error);
      }
    }
    
    console.log('Language setup completed successfully');
  } catch (error) {
    console.error('Error creating supported languages:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  createSupportedLanguages()
    .then(() => console.log('Script completed'))
    .catch(error => console.error('Script failed:', error));
}
