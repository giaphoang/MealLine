import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugDatabase() {
  console.log('🔍 DEBUG: Investigating database contents...');
  console.log('='.repeat(60));
  
  try {
    // Check current time
    console.log('📅 Current server time:', {
      iso: new Date().toISOString(),
      local: new Date().toString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    console.log('');
    
    // Check UsageRecord table
    const usageRecordCount = await prisma.usageRecord.count();
    console.log(`📊 UsageRecord table: ${usageRecordCount} records`);
    
    if (usageRecordCount > 0) {
      const allUsageRecords = await prisma.usageRecord.findMany({
        select: {
          id: true,
          timestamp: true,
          serviceProvider: true,
          promptTokens: true,
          completionTokens: true,
          totalCost: true,
          operationType: true
        },
        orderBy: { timestamp: 'desc' },
        take: 10
      });
      
      console.log('Recent UsageRecord entries:');
      allUsageRecords.forEach((record, i) => {
        console.log(`  ${i + 1}. ${record.timestamp.toISOString()} (${record.timestamp.toString()}) - ${record.serviceProvider} - ${record.operationType} - Tokens: ${record.promptTokens + record.completionTokens} - Cost: $${record.totalCost}`);
      });
      
      // Get unique dates
      const uniqueDates = await prisma.usageRecord.findMany({
        select: {
          timestamp: true
        },
        distinct: ['timestamp'],
        orderBy: { timestamp: 'desc' }
      });
      
      const dateGroups = new Map<string, number>();
      uniqueDates.forEach(record => {
        const dateKey = record.timestamp.toISOString().split('T')[0];
        dateGroups.set(dateKey, (dateGroups.get(dateKey) || 0) + 1);
      });
      
      console.log('\nUsage records by date:');
      Array.from(dateGroups.entries()).forEach(([date, count]) => {
        console.log(`  ${date}: ${count} records`);
      });
    }
    console.log('');
    
    // Check Translation table
    const translationCount = await prisma.translation.count();
    console.log(`📝 Translation table: ${translationCount} records`);
    
    if (translationCount > 0) {
      const recentTranslations = await prisma.translation.findMany({
        select: {
          id: true,
          createdAt: true,
          status: true,
          originalText: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
      
      console.log('Recent Translation entries:');
      recentTranslations.forEach((translation, i) => {
        console.log(`  ${i + 1}. ${translation.createdAt.toISOString()} - ${translation.status} - "${translation.originalText?.substring(0, 30)}..."`);
      });
    }
    console.log('');
    
    // Check AIConfiguration table
    const aiConfigCount = await prisma.aIConfiguration.count();
    console.log(`🤖 AIConfiguration table: ${aiConfigCount} records`);
    
    if (aiConfigCount > 0) {
      const aiConfigs = await prisma.aIConfiguration.findMany({
        select: {
          id: true,
          name: true,
          serviceType: true,
          isActive: true,
          createdAt: true
        }
      });
      
      console.log('AI Configurations:');
      aiConfigs.forEach((config, i) => {
        console.log(`  ${i + 1}. ${config.name} (${config.serviceType}) - Active: ${config.isActive} - Created: ${config.createdAt.toISOString()}`);
      });
    }
    console.log('');
    
    // Check for any test data patterns
    console.log('🧪 Checking for test data patterns...');
    
    // Look for records with July 20th timestamps
    const july20Records = await prisma.usageRecord.findMany({
      where: {
        timestamp: {
          gte: new Date('2025-07-20T00:00:00.000Z'),
          lt: new Date('2025-07-21T00:00:00.000Z')
        }
      },
      select: {
        id: true,
        timestamp: true,
        serviceProvider: true,
        totalCost: true
      }
    });
    
    console.log(`July 20th 2025 records: ${july20Records.length}`);
    july20Records.forEach((record, i) => {
      console.log(`  ${i + 1}. ${record.timestamp.toISOString()} - ${record.serviceProvider} - $${record.totalCost}`);
    });
    
    // Look for records with July 21st timestamps  
    const july21Records = await prisma.usageRecord.findMany({
      where: {
        timestamp: {
          gte: new Date('2025-07-21T00:00:00.000Z'),
          lt: new Date('2025-07-22T00:00:00.000Z')
        }
      },
      select: {
        id: true,
        timestamp: true,
        serviceProvider: true,
        totalCost: true
      }
    });
    
    console.log(`July 21st 2025 records: ${july21Records.length}`);
    july21Records.forEach((record, i) => {
      console.log(`  ${i + 1}. ${record.timestamp.toISOString()} - ${record.serviceProvider} - $${record.totalCost}`);
    });
    
  } catch (error) {
    console.error('❌ Error debugging database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugDatabase();
