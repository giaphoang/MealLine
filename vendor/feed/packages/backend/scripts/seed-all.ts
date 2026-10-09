const { PrismaClient } = require('@prisma/client');
const { SeedService } = require('../src/services/seed/seed-service');

const prisma = new PrismaClient();

/**
 * Development seed.
 *
 * The structural and reference layers — global limit, the 59 supported
 * languages, and the AI system prompts — are **not** defined here. They live in
 * `src/services/seed/`, which backs the user-facing "Reset to clean slate"
 * action, and this script calls the same code. Keeping a second copy here is
 * how the two drifted apart in the first place: a language added to one list
 * silently never reached the other.
 *
 * What stays is the development *inventory*: eight categories and ~70 food
 * items. That is deliberately richer than the three categories and nine items a
 * clean slate seeds, because development wants enough data to exercise
 * analytics, procurement, and shopping lists, while a first-run instance wants
 * an example small enough to read and easy to delete.
 *
 * So: shared where it is the same thing, separate where it is not.
 */

const categories = [
  { name: 'Canned Goods', limit: 10, icon: 'cylinder' },
  { name: 'Beans', limit: 10, icon: 'bean' },
  { name: 'Produce', limit: 100, icon: 'apple' },
  { name: 'Meats', limit: 1, limitType: 'household', icon: 'drumstick' },
  { name: 'Frozen', limit: 3, icon: 'snowflake' },
  { name: 'Dry Goods', limit: 10, icon: 'package-2' },
  { name: 'Dairy', limit: 3, icon: 'glass-water' },
  { name: 'Hygiene Items', limit: 5, icon: 'bath' }
];

const foodItems = [
  // Canned Goods
  { name: 'Tuna', limit: 1, categoryName: 'Canned Goods', isLimited: true, vegan: false, vegetarian: false, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Sweet Potato Pie Mix', limit: 3, categoryName: 'Canned Goods', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Tomato Sauce/Diced Tomato', limit: 1, categoryName: 'Canned Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'White Hominy', limit: 1, categoryName: 'Canned Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Tomato Paste', limit: 3, categoryName: 'Canned Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Collard Greens', limit: 3, categoryName: 'Canned Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Organic Pumpkin Pie Mix', limit: 5, categoryName: 'Canned Goods', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: true, halal: true, kosher: true, readyToEat: false },
  { name: 'Pumpkin Puree', limit: 5, categoryName: 'Canned Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Evaporated Milk', limit: 1, categoryName: 'Canned Goods', isLimited: true, vegan: false, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },

  // Beans
  { name: 'Pinto Beans (dried)', limit: 1, categoryName: 'Beans', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Lentils (dried)', limit: 1, categoryName: 'Beans', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Black Turtle Beans (canned)', limit: 2, categoryName: 'Beans', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Navy Beans (dried)', limit: 1, categoryName: 'Beans', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },

  // Produce
  { name: 'Fresh Herbs', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Green Grapes', limit: 1, categoryName: 'Produce', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Carrots', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Kale', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: true, halal: true, kosher: true, readyToEat: true },
  { name: 'Apples', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Yellow Squash', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Salad Greens', limit: 2, categoryName: 'Produce', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Rutabaga', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Tomatoes', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Asian Pears', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Avocado', limit: 100, categoryName: 'Produce', isLimited: false, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },

  // Meats
  { name: 'Chicken', limit: 1, categoryName: 'Meats', isLimited: true, limitType: 'household', vegan: false, vegetarian: false, glutenFree: true, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Ham Steak (precooked)', limit: 1, categoryName: 'Meats', isLimited: true, limitType: 'household', vegan: false, vegetarian: false, glutenFree: true, organic: false, halal: false, kosher: false, readyToEat: true },

  // Frozen
  { name: 'Frozen Carrots', limit: 2, categoryName: 'Frozen', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Multigrain Rolls', limit: 1, categoryName: 'Frozen', isLimited: true, vegan: false, vegetarian: true, glutenFree: false, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Frozen Pasta Dinner', limit: 1, categoryName: 'Frozen', isLimited: true, vegan: false, vegetarian: true, glutenFree: false, organic: false, halal: true, kosher: true, readyToEat: true },

  // Dry Goods
  { name: 'Masa (Corn Flour)', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Tomato & Red Pepper Soup', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Rice', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Chips', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: false, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Mac n Cheese', limit: 5, categoryName: 'Dry Goods', isLimited: true, vegan: false, vegetarian: true, glutenFree: false, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Peanut Butter', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Bread', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: false, vegetarian: true, glutenFree: false, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Cooking Oil', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Powdered Sugar', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Picante Hot Sauce', limit: 4, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Potato Flakes', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },
  { name: 'Shelf Stable Milk', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: false, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Raisin Snack Pack', limit: 5, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Mini Toast Crackers', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: false, vegetarian: true, glutenFree: false, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Coca-Cola', limit: 1, categoryName: 'Dry Goods', isLimited: true, limitType: 'person', vegan: true, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Flax Meal', limit: 1, categoryName: 'Dry Goods', isLimited: true, vegan: true, vegetarian: true, glutenFree: true, organic: true, halal: true, kosher: true, readyToEat: false },

  // Dairy
  { name: 'Coffee Creamer', limit: 1, categoryName: 'Dairy', isLimited: true, vegan: false, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: true },
  { name: 'Eggs', limit: 1, categoryName: 'Dairy', isLimited: true, vegan: false, vegetarian: true, glutenFree: true, organic: false, halal: true, kosher: true, readyToEat: false },

  // Hygiene Items
  { name: 'Baby Formula', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Laxative', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Deodorant', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Sleep Aid/Unisom', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Hygiene Kit', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Tampons/Pads', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Toilet Paper', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Laundry Soap', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'First Aid Kit', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Bar Soap', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Razor', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Wet Cat Food', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: true },
  { name: 'Toothbrush', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false },
  { name: 'Toothpaste', limit: 1, categoryName: 'Hygiene Items', isLimited: true, vegan: false, vegetarian: false, glutenFree: false, organic: false, halal: false, kosher: false, readyToEat: false }
];

// Category seeding function
async function seedCategories() {
  console.log('Starting category seeding...');
  
  const createdCategories = [];
  
  for (const category of categories) {
    const normalizedName = category.name.trim().replace(/\\s+/g, ' ');
    const nameSearch = normalizedName.toLowerCase();
    
    const created = await prisma.category.upsert({
      where: { nameSearch },
      update: {
        name: normalizedName,
        limit: category.limit,
        limitType: category.limitType || 'household',
        icon: category.icon
      },
      create: {
        name: normalizedName,
        nameSearch,
        limit: category.limit,
        limitType: category.limitType || 'household',
        icon: category.icon
      }
    });
    
    createdCategories.push(created);
    console.log(`✓ Seeded category: ${created.name} (limit: ${created.limit})`);
  }
  
  console.log(`Category seeding completed. Total categories: ${createdCategories.length}`);
  return createdCategories;
}

// Food item seeding function
async function seedFoodItems(categories: any[]) {
  console.log('Starting food item seeding...');
  
  // Create a map of category names to IDs
  const categoryMap = new Map();
  for (const category of categories) {
    categoryMap.set(category.name, category.id);
  }
  
  const createdFoodItems = [];
  
  for (const item of foodItems) {
    const normalizedName = item.name.trim().replace(/\\s+/g, ' ');
    const nameSearch = normalizedName.toLowerCase();
    const categoryId = categoryMap.get(item.categoryName);
    
    if (!categoryId) {
      console.warn(`Warning: Category '${item.categoryName}' not found for item '${item.name}'`);
      continue;
    }
    
    const created = await prisma.foodItem.upsert({
      where: { nameSearch },
      update: {
        name: normalizedName,
        limit: item.limit,
        limitType: item.limitType || 'household',
        categoryId,
        isInStock: true,
        isLimited: item.isLimited || false,
        isClearance: false,
        vegan: item.vegan || false,
        vegetarian: item.vegetarian || false,
        glutenFree: item.glutenFree || false,
        organic: item.organic || false,
        halal: item.halal || false,
        kosher: item.kosher || false,
        readyToEat: item.readyToEat || false
      },
      create: {
        name: normalizedName,
        nameSearch,
        limit: item.limit,
        limitType: item.limitType || 'household',
        categoryId,
        isInStock: true,
        isLimited: item.isLimited || false,
        isClearance: false,
        vegan: item.vegan || false,
        vegetarian: item.vegetarian || false,
        glutenFree: item.glutenFree || false,
        organic: item.organic || false,
        halal: item.halal || false,
        kosher: item.kosher || false,
        readyToEat: item.readyToEat || false
      }
    });
    
    createdFoodItems.push(created);
  }
  
  console.log(`Food item seeding completed. Total food items: ${createdFoodItems.length}`);
  
  // Summary by category
  const categoryStats = new Map();
  for (const item of createdFoodItems) {
    const categoryName = categories.find(c => c.id === item.categoryId)?.name;
    if (categoryName) {
      categoryStats.set(categoryName, (categoryStats.get(categoryName) || 0) + 1);
    }
  }
  
  console.log('Items by category:');
  for (const [categoryName, count] of categoryStats.entries()) {
    console.log(`  - ${categoryName}: ${count} items`);
  }
  
  return createdFoodItems;
}

// Master seeding function
async function main() {
  console.log('🌱 Starting database seeding...');
  console.log('=====================================');

  try {
    // Structural + reference, from the same source the clean slate uses.
    // `withExamples: false` leaves the illustrative layer out — this script
    // seeds its own, larger development inventory below.
    const shared = await SeedService.apply(prisma, { withExamples: false });
    console.log(
      `Seeded ${shared.languages} languages (${shared.enabledLanguages} enabled), ` +
      `${shared.systemPrompts} system prompts, global limit ${shared.globalLimit}.`
    );
    console.log('');
    
    // Seed categories
    const categories = await seedCategories();
    console.log('');
    
    // Seed food items (depends on categories)
    await seedFoodItems(categories);
    console.log('');
    
    console.log('=====================================');
    console.log('✅ Database seeding completed successfully!');
    
    // Final summary
    const finalCounts = await Promise.all([
      prisma.language.count(),
      prisma.systemPrompt.count(),
      prisma.category.count(),
      prisma.foodItem.count(),
      prisma.globalLimit.count()
    ]);
    
    console.log('Final database summary:');
    console.log(`  - Languages: ${finalCounts[0]}`);
    console.log(`  - System Prompts: ${finalCounts[1]}`);
    console.log(`  - Categories: ${finalCounts[2]}`);
    console.log(`  - Food Items: ${finalCounts[3]}`);
    console.log(`  - Global Limits: ${finalCounts[4]}`);
  } catch (error) {
    console.error('❌ Error during database seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
