import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function generateTestData() {
  console.log('Generating test data...')
  
  try {
    // Create test categories
    const categories = await Promise.all([
      prisma.category.create({
        data: {
          name: 'Canned Goods',
          nameSearch: 'canned goods',
          limit: 10
        }
      }),
      prisma.category.create({
        data: {
          name: 'Fresh Produce',
          nameSearch: 'fresh produce',
          limit: 100
        }
      }),
      prisma.category.create({
        data: {
          name: 'Dairy',
          nameSearch: 'dairy',
          limit: 5
        }
      })
    ])

    // Create test food items
    const foodItems = await Promise.all(categories.map(category =>
      prisma.foodItem.create({
        data: {
          name: `Test Item - ${category.name}`,
          nameSearch: `test item - ${category.name}`.toLowerCase(),
          limit: category.limit,
          categoryId: category.id,
          status: 'in_stock',
          isInStock: true,
          isLimited: false,
          isClearance: false,
          vegan: category.name === 'Fresh Produce',
          vegetarian: category.name === 'Fresh Produce',
          glutenFree: category.name !== 'Dairy',
          organic: category.name === 'Fresh Produce',
          halal: true,
          kosher: true,
          readyToEat: category.name === 'Canned Goods'
        }
      })
    ))

    console.log('\nTest data generated successfully!')
    console.log('Categories created:', categories.length)
    console.log('Food items created:', foodItems.length)

  } catch (error) {
    console.error('Error generating test data:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

generateTestData()