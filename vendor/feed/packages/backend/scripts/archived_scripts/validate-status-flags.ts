import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function validateStatusFlags() {
  console.log('Starting status flags validation...')
  
  try {
    // Get all food items
    const foodItems = await prisma.foodItem.findMany()
    console.log(`Found ${foodItems.length} food items to validate`)

    let hasErrors = false
    let flagsMissing = 0
    let statusMismatch = 0

    // Validate each food item
    for (const item of foodItems) {
      let errors = []

      // Check if at least one flag is set
      if (!item.isInStock && !item.isLimited && !item.isClearance) {
        errors.push('No status flag is set')
        flagsMissing++
      }

      // Check if status matches flags
      const derivedStatus = 
        item.isInStock ? 'in_stock' :
        item.isLimited ? 'limited' :
        item.isClearance ? 'clearance' :
        'in_stock'

      if (item.status !== derivedStatus) {
        errors.push(`Status mismatch: status=${item.status}, derived=${derivedStatus}`)
        statusMismatch++
      }

      // Report any errors for this item
      if (errors.length > 0) {
        hasErrors = true
        console.error(`\nErrors for food item ${item.id} (${item.name}):`)
        errors.forEach(error => console.error(`  - ${error}`))
      }
    }

    // Summary report
    console.log('\nValidation Summary:')
    console.log('-----------------')
    console.log(`Total items checked: ${foodItems.length}`)
    console.log(`Items with missing flags: ${flagsMissing}`)
    console.log(`Items with status mismatch: ${statusMismatch}`)

    if (hasErrors) {
      console.error('\nValidation failed! Please check the errors above.')
      process.exit(1)
    } else {
      console.log('\nValidation successful! All status flags are correctly set.')
    }

  } catch (error) {
    console.error('Error during validation:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

validateStatusFlags()