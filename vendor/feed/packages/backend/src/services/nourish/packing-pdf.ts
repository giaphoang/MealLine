import type { ShoppingListItem } from '@mealline/core';
import prisma from '../../db';
import { operationError } from './index';
import { escapeHtml, getReportFontCss, renderHtmlToPdf } from '../pdf/chromium';
import { NOURISH_BRAND_CONFIG } from '../brand-config/presets';

export async function packingPdf(id: number) {
  const basket = await prisma.nourishBasket.findUnique({ where: { id }, include: { intake: true } });
  if (!basket) throw operationError('This household basket was not found.', 404);
  const brand = await prisma.brandConfiguration.findFirst({ where: { isActive: true } });
  const organization = (brand?.payload as unknown as typeof NOURISH_BRAND_CONFIG)?.identity?.organizationName ?? 'MealLine';
  const needs = basket.intake;
  const items = basket.items as unknown as ShoppingListItem[];
  const fonts = await getReportFontCss();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${fonts}
    @page { size: Letter; margin: 0.6in; }
    body { font-family: 'Noto Sans', sans-serif; color: #17251d; font-size: 11pt; }
    h1 { font-size: 22pt; margin-bottom: 8pt; } h2 { font-size: 14pt; }
    .meta { padding: 12pt; background: #f0f5f1; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 18pt; }
    th, td { padding: 9pt 6pt; border-bottom: 1px solid #cbd5ce; text-align: left; }
    th { font-size: 10pt; background: #f0f5f1; } tr { break-inside: avoid; }
    .qty { text-align: right; } .check { width: 28pt; } .footer { margin-top: 18pt; font-size: 9pt; color: #4b6051; }
  </style></head><body><h2>${escapeHtml(organization)}</h2><h1>${escapeHtml(basket.title)}</h1>
  <div class="meta">Case: ${escapeHtml(needs?.caseNumber ?? '—')} · Household: ${escapeHtml(needs?.householdSize ?? 'Not recorded')} · Language: ${escapeHtml(needs?.language ?? 'en')}<br>
  Status: ${escapeHtml(basket.status)} · Dietary needs: ${escapeHtml(((needs?.dietaryAvoid ?? []) as string[]).join(', ') || 'None recorded')}<br>
  Stove: ${needs?.hasStove === null || !needs ? 'Not recorded' : needs.hasStove ? 'Yes' : 'No'} · Refrigerator: ${needs?.hasFridge === null || !needs ? 'Not recorded' : needs.hasFridge ? 'Yes' : 'No'}
  ${needs?.dietaryNotes ? `<br>Notes: ${escapeHtml(needs.dietaryNotes)}` : ''}</div>
  <table><thead><tr><th class="check">Pack</th><th>Food item</th><th class="qty">Quantity</th><th>Unit</th><th>Notes</th></tr></thead><tbody>${items.map((item) => `<tr><td>□</td><td>${escapeHtml(item.name)}</td><td class="qty">${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit)}</td><td>${escapeHtml(item.notes)}</td></tr>`).join('')}</tbody></table>
  <p class="footer">Review labels and household notes before packing. This PDF does not reserve stock or deduct inventory; use “Mark packed” in MealLine. Household contact information is intentionally omitted.</p></body></html>`;
  return renderHtmlToPdf(html);
}
