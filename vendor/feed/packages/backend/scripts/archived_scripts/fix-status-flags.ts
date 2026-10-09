import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixStatusFlags() {
  console.log('Starting status flags repair...')
  
  try {
    // Get all food items
    const foodItems = await prisma.foodItem.findMany()
    console.log(`Found ${foodItems.length} food items to check`)

    let fixedItems = 0

    // Process each food item
    for (const item of foodItems) {
      let needsUpdate = false
      let updateData: any = {}

      // Fix missing flags based on status
      if (!item.isInStock && !item.isLimited && !item.isClearance) {
        needsUpdate = true
        switch (item.status) {
          case 'in_stock':
            updateData.isInStock = true
            break
          case 'limited':
            updateData.isLimited = true
            break
          case 'clearance':
            updateData.isClearance = true
            break
          default:
            updateData.isInStock = true // Default to in_stock
        }
      }

      // Fix status if it doesn't match flags
      const derivedStatus = 
        item.isInStock ? 'in_stock' :
        item.isLimited ? 'limited' :
        item.isClearance ? 'clearance' :
        'in_stock'

      if (item.status !== derivedStatus) {
        needsUpdate = true
        updateData.status = derivedStatus
      }

      // Update the item if needed
      if (needsUpdate) {
        await prisma.foodItem.update({
          where: { id: item.id },
          data: updateData
        })
        fixedItems++
        console.log(`Fixed food item ${item.id} (${item.name})`)
      }
    }

    // Summary report
    console.log('\nRepair Summary:')
    console.log('--------------')
    console.log(`Total items checked: ${foodItems.length}`)
    console.log(`Items fixed: ${fixedItems}`)
    console.log('\nRepair completed successfully!')

  } catch (error) {
    console.error('Error during repair:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

fixStatusFlags()