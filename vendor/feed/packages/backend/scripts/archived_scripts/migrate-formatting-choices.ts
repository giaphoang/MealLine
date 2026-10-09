import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

/**
 * Generates a hash for text for faster lookups
 */
function generateTextHash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').substring(0, 16);
}

/**
 * Migrates classification data from Translation table to FormattingChoice table
 */
async function migrateFormattingChoices() {
  console.log('🔄 Starting FormattingChoice migration...');

  try {
    // Find all classification entries in Translation table
    const classificationEntries = await prisma.translation.findMany({
      where: {
        classificationAction: { not: null },
        classificationPromptId: { not: null },
        language: 'classification'
      },
      select: {
        originalText: true,
        classificationAction: true,
        classificationPromptId: true,
        documentId: true,
        createdAt: true
      }
    });

    console.log(`📊 Found ${classificationEntries.length} classification entries to migrate`);

    if (classificationEntries.length === 0) {
      console.log('✅ No classification entries found - migration not needed');
      return;
    }

    // Transform entries for FormattingChoice table
    const formattingChoices = classificationEntries.map(entry => ({
      originalText: entry.originalText,
      classificationAction: entry.classificationAction!,
      confidence: null,
      textHash: generateTextHash(entry.originalText),
      systemPromptId: entry.classificationPromptId!,
      documentId: entry.documentId,
      createdAt: entry.createdAt
    }));

    // Check for existing entries to avoid duplicates
    const existingChoices = await prisma.formattingChoice.findMany({
      where: {
        systemPromptId: { in: formattingChoices.map(fc => fc.systemPromptId) }
      },
      select: {
        originalText: true,
        systemPromptId: true
      }
    });

    const existingKeys = new Set(
      existingChoices.map(choice => `${choice.originalText}-${choice.systemPromptId}`)
    );

    // Filter out duplicates
    const newChoices = formattingChoices.filter(choice => 
      !existingKeys.has(`${choice.originalText}-${choice.systemPromptId}`)
    );

    console.log(`📝 Migrating ${newChoices.length} new entries (${formattingChoices.length - newChoices.length} duplicates skipped)`);

    if (newChoices.length > 0) {
      // Insert in batches to avoid transaction limits
      const batchSize = 100;
      let migrated = 0;

      for (let i = 0; i < newChoices.length; i += batchSize) {
        const batch = newChoices.slice(i, i + batchSize);
        
        await prisma.formattingChoice.createMany({
          data: batch,
          skipDuplicates: true
        });

        migrated += batch.length;
        console.log(`📦 Migrated batch: ${migrated}/${newChoices.length} entries`);
      }
    }

    // Verify migration
    const formattingChoiceCount = await prisma.formattingChoice.count();
    console.log(`✅ Migration completed! Total FormattingChoice entries: ${formattingChoiceCount}`);

    // Show statistics by SystemPrompt
    const statsByPrompt = await prisma.formattingChoice.groupBy({
      by: ['systemPromptId'],
      _count: {
        id: true
      }
    });

    console.log('\n📊 Cache entries by SystemPrompt:');
    for (const stat of statsByPrompt) {
      const prompt = await prisma.systemPrompt.findUnique({
        where: { id: stat.systemPromptId },
        select: { name: true }
      });
      console.log(`  - ${prompt?.name || `ID ${stat.systemPromptId}`}: ${stat._count.id} entries`);
    }

    console.log('\n⚠️  Note: Classification entries still exist in Translation table');
    console.log('    Run cleanup script separately if you want to remove them');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Cleanup old classification entries from Translation table (optional)
 */
async function cleanupOldClassificationEntries() {
  console.log('\n🧹 Starting cleanup of old classification entries...');

  try {
    const deleteResult = await prisma.translation.deleteMany({
      where: {
        classificationAction: { not: null },
        classificationPromptId: { not: null },
        language: 'classification'
      }
    });

    console.log(`✅ Cleanup completed! Removed ${deleteResult.count} old classification entries from Translation table`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 FormattingChoice Migration Script');
  console.log('===================================\n');

  try {
    await migrateFormattingChoices();

    // Ask for cleanup confirmation in production
    const shouldCleanup = process.env.NODE_ENV !== 'production' || 
                         process.argv.includes('--cleanup');

    if (shouldCleanup) {
      await cleanupOldClassificationEntries();
    } else {
      console.log('\n💡 To cleanup old Translation table entries, run with --cleanup flag');
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
if (require.main === module) {
  main();
}

export { migrateFormattingChoices, cleanupOldClassificationEntries };
