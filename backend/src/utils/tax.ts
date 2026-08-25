import { prisma } from './db'

// Document-level tax resolution, shared by invoices and purchases.
// Priority: explicit numeric rate > taxId lookup > tenant default tax > 0.
export async function resolveTaxRate(
  tenantId: string,
  taxId?: string | null,
  bodyTaxRate?: unknown
): Promise<number> {
  if (bodyTaxRate != null && bodyTaxRate !== '') {
    const rate = Number(bodyTaxRate)
    if (isNaN(rate) || rate < 0) throw new Error('Tarif pajak tidak valid')
    return rate
  }

  if (taxId) {
    const tax = await prisma.tax.findFirst({ where: { id: taxId, tenantId } })
    if (!tax) throw new Error('Pajak tidak ditemukan')
    return Number(tax.rate)
  }

  const defaultTax = await prisma.tax.findFirst({ where: { tenantId, isDefault: true } })
  return defaultTax ? Number(defaultTax.rate) : 0
}