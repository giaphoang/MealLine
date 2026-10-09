const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// System prompt configurations for seeding
const systemPrompts = [
  {
    name: 'Shopping List Auto-Format',
    promptType: 'CLASSIFICATION',
    isActive: true,
    isDefault: false,
    description: 'Customized for William Temple House shopping lists',
    skipTranslation: 'Titles like  "Shopping List", "Client Name", placeholders like "____".',
    includeEnglish: 'Food items names such as "Kidney beans", "Apples", "Beef", "Eggs", or "Chicken Noodle Soup". Hygiene items like "Toothpaste", "Soap", "First Aid Kit", "Hygiene Kit." Exclude categories names like "Hygiene Items" "Beans" "Dairy". Exclude header names "Limit", "Quantity".',
    skipTranslationThreshold: 0.8,
    includeEnglishThreshold: 0.7,
    rememberFormattingChoices: true
  },
  {
    name: 'DOCX - Low Temp',
    promptType: 'BATCH_TRANSLATION',
    isActive: true,
    isDefault: false,
    description: 'Detailed translation instructions for DOCX files. Stable output',
    serviceDescription: 'You are a translator service.',
    translationApproach: 'Translate with the expectations of native speakers in mind, be culturally sensitive, and apply natural language.',
    contextGuidance: 'In the context of a social services agency offering food pantry, emergency clothing, and hygiene.',
    additionalGuidance: 'Do NOT provide any commentary about the translations. Do not request additional feedback. Always make your best guess when in doubt.',
    temperature: 0.3,
    topP: 1
  },
  {
    name: 'Food Items and Categories',
    promptType: 'FOOD_TRANSLATION',
    isActive: true,
    isDefault: false,
    description: 'Customized for William Temple House food inventory',
    serviceDescription: 'You are a translator service.',
    translationApproach: 'Translate with the expectations of native speakers in mind, be culturally sensitive, and apply natural language.',
    contextGuidance: 'In the context of a social services agency offering food pantry, emergency clothing, and hygiene items.',
    additionalGuidance: 'Do NOT provide any commentary about the translations. Do not request additional feedback. Always make your best guess when in doubt.',
    temperature: 1,
    topP: 1,
    rememberFormattingChoices: true
  }
];

async function main() {
  console.log('Starting system prompt seeding...');

  for (const prompt of systemPrompts) {
    console.log(`Seeding system prompt: ${prompt.name}`);
    
    await prisma.systemPrompt.upsert({
      where: { name: prompt.name },
      update: {
        promptType: prompt.promptType,
        isActive: prompt.isActive,
        isDefault: prompt.isDefault,
        description: prompt.description,
        serviceDescription: prompt.serviceDescription || null,
        translationApproach: prompt.translationApproach || null,
        contextGuidance: prompt.contextGuidance || null,
        additionalGuidance: prompt.additionalGuidance || null,
        skipTranslation: prompt.skipTranslation || null,
        includeEnglish: prompt.includeEnglish || null,
        skipTranslationThreshold: prompt.skipTranslationThreshold || null,
        includeEnglishThreshold: prompt.includeEnglishThreshold || null,
        rememberFormattingChoices: prompt.rememberFormattingChoices || true,
        temperature: prompt.temperature || null,
        topP: prompt.topP || null
      },
      create: {
        name: prompt.name,
        promptType: prompt.promptType,
        isActive: prompt.isActive,
        isDefault: prompt.isDefault,
        description: prompt.description,
        serviceDescription: prompt.serviceDescription || null,
        translationApproach: prompt.translationApproach || null,
        contextGuidance: prompt.contextGuidance || null,
        additionalGuidance: prompt.additionalGuidance || null,
        skipTranslation: prompt.skipTranslation || null,
        includeEnglish: prompt.includeEnglish || null,
        skipTranslationThreshold: prompt.skipTranslationThreshold || null,
        includeEnglishThreshold: prompt.includeEnglishThreshold || null,
        rememberFormattingChoices: prompt.rememberFormattingChoices || true,
        temperature: prompt.temperature || null,
        topP: prompt.topP || null
      }
    });
    
    console.log(`✓ Seeded: ${prompt.name} (${prompt.promptType})`);
  }

  console.log('System prompt seeding completed.');
  
  // Verify seeded prompts
  const seededPrompts = await prisma.systemPrompt.findMany({
    where: {
      name: { in: systemPrompts.map(p => p.name) }
    },
    select: {
      name: true,
      promptType: true,
      isActive: true
    }
  });
  
  console.log('Seeded system prompts verification:');
  seededPrompts.forEach(prompt => {
    console.log(`  - ${prompt.name} (${prompt.promptType}) - Active: ${prompt.isActive}`);
  });
  
  // Count total system prompts
  const totalCount = await prisma.systemPrompt.count();
  console.log(`Total system prompts in database: ${totalCount}`);
}

main()
  .catch((e) => {
    console.error('Error seeding system prompts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
