const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * This script migrates all "Food Item" translations to "FoodItem"
 * to standardize the type format and eliminate technical debt.
 */
async function migrateTranslationTypes() {
  console.log('Starting translation type migration...');

  try {
    // First, find all translations with legacy "Food Item" type
    const legacyTranslations = await prisma.translation.findMany({
      where: {
        type: 'Food Item'
      }
    });

    console.log(`Found ${legacyTranslations.length} translations with legacy "Food Item" type`);

    if (legacyTranslations.length === 0) {
      console.log('No legacy translations found. Migration complete.');
      return;
    }

    // Update all legacy translations to use "FoodItem" type
    const updateResult = await prisma.translation.updateMany({
      where: {
        type: 'Food Item'
      },
      data: {
        type: 'FoodItem'
      }
    });

    console.log(`Updated ${updateResult.count} translations from "Food Item" to "FoodItem"`);
    console.log('Migration complete!');
  } catch (error) {
    console.error('Error migrating translation types:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute the migration
migrateTranslationTypes();
