const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function enableRussian() {
  console.log('Starting Russian language enablement...');

  try {
    // First, check if Russian exists
    const russian = await prisma.language.findUnique({
      where: { name: 'Russian' }
    });

    if (!russian) {
      console.log('Russian language not found. Creating it...');
      await prisma.language.create({
        data: {
          name: 'Russian',
          sortOrder: 8,
          isEnabled: true
        }
      });
    } else {
      console.log('Russian language found. Current status:', {
        name: russian.name,
        isEnabled: russian.isEnabled,
        id: russian.id
      });

      // Update Russian to be enabled
      await prisma.language.update({
        where: { name: 'Russian' },
        data: { isEnabled: true }
      });
    }

    // Verify the update worked
    const updatedRussian = await prisma.language.findUnique({
      where: { name: 'Russian' }
    });

    console.log('Russian language status after update:', {
      name: updatedRussian?.name,
      isEnabled: updatedRussian?.isEnabled,
      id: updatedRussian?.id
    });

    // Count enabled languages
    const enabledCount = await prisma.language.count({
      where: { isEnabled: true }
    });
    
    console.log(`Total enabled languages: ${enabledCount}`);
    
    // List enabled languages
    const enabledLanguages = await prisma.language.findMany({
      where: { isEnabled: true },
      select: { name: true }
    });
    
    console.log('Enabled languages:', enabledLanguages);
  } catch (error) {
    console.error('Error updating Russian language:', error);
  } finally {
    await prisma.$disconnect();
  }
}

enableRussian();
