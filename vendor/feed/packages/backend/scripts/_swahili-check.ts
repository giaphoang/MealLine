/// <reference path="../src/types/express.d.ts" />
import prisma from '../src/db';
import { createFlowingTablePlan, refreshInventoryBackedTemplate } from '../src/routes/shopping-list-builder';

(async () => {
  const saved = await prisma.shoppingListBuilderTemplate.findFirst({ where: { name: 'New density test' }, orderBy: { updatedAt: 'desc' } });
  if (!saved) throw new Error('no template');
  const tpl = await refreshInventoryBackedTemplate(saved.templateData as any);

  // Pull all Swahili inventory translations
  const categoryIds = Array.from(new Set(tpl.components.filter((c: any) => c.type==='section-table' && c.inventorySource?.categoryId).map((c: any) => c.inventorySource!.categoryId)));
  const foodItemIds = Array.from(new Set(tpl.components.filter((c: any) => c.type==='section-table').flatMap((c: any) => (c.rows||[]).map((r: any) => r.foodItemId).filter(Boolean))));
  const [cats, foods, generic] = await Promise.all([
    prisma.categoryTranslation.findMany({ where: { categoryId: { in: categoryIds as number[] }, language: 'Swahili' } }),
    prisma.foodItemTranslation.findMany({ where: { foodItemId: { in: foodItemIds as number[] }, language: 'Swahili' } }),
    prisma.translation.findMany({ where: { language: 'Swahili', type: 'Generated (List)', status: 'completed' } }),
  ]);
  const inventoryTranslations = {
    categories: Object.fromEntries(cats.map(c => [c.categoryId, c.name])),
    foodItems: Object.fromEntries(foods.map(f => [f.foodItemId, f.name])),
  };
  const translations = Object.fromEntries(generic.filter(g => g.translatedText).map(g => [g.originalText, g.translatedText as string]));

  const plan = createFlowingTablePlan(tpl, { language: 'Swahili', translations, inventoryTranslations });

  for (const seg of plan.segments) {
    if (seg.component.title !== 'Frozen') continue;
    console.log(`Frozen segment pg${seg.pageIndex} ${seg.lane} y=${seg.y} h=${seg.height} headerH=${seg.height - seg.rowHeights.reduce((a,b)=>a+b,0)}pt`);
    for (let i = 0; i < seg.rows.length; i++) {
      const r = seg.rows[i] as any;
      const t = r.foodItemId ? inventoryTranslations.foodItems[r.foodItemId] : undefined;
      console.log(`  [${seg.rowHeights[i]}pt] ${r.item} -> ${t || '(no swahili)'}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
