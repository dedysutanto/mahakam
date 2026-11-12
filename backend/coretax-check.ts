import assert from 'assert'

const invoices: any[] = [
  {
    id: 'inv1', invoiceNumber: 'INV/0001/XI/2026',
    issueDate: new Date('2026-11-05'), taxRate: 11, taxAmount: 14190000,
    customerName: 'PT Maju Jaya', customerAddress: 'Jl. Jakarta 1',
    customerEmail: 'a@b.com', customerTaxId: '02.345.678.9-012.000', // 15-digit badan
    items: [
      { description: 'Barang ABC', unit: 'pcs', quantity: 10, unitPrice: 12000000, discount: 0, lineTotal: 120000000 },
      { description: 'Barang EFG', unit: 'unit', quantity: 5, unitPrice: 2000000, discount: 10, lineTotal: 9000000 },
    ],
  },
  {
    id: 'inv2', invoiceNumber: 'INV/0002/XI/2026',
    issueDate: new Date('2026-11-07'), taxRate: 11, taxAmount: 110000,
    customerName: 'Budi Santoso', customerAddress: null,
    customerEmail: null, customerTaxId: null, // no tax id at all
    items: [
      { description: 'Jasa <konsultasi> & "co"', unit: 'kg', quantity: 1, unitPrice: 1000000, discount: 0, lineTotal: 1000000 },
    ],
  },
]

const { buildCoretaxXml } = await import('./src/utils/coretax.js')

// Seller stored in the 15-digit legacy form -> 16 digits by leading zero.
const xml = buildCoretaxXml('01.234.567.8-901.000', invoices)
assert(xml.includes('<TIN>0012345678901000</TIN>'), '15-digit seller -> 0-prefixed 16')
assert(xml.includes('<SellerIDTKU>0012345678901000000000</SellerIDTKU>'), 'NITKU = NPWP16 + 000000')

// A seller already stored as 16 digits must pass through unchanged.
const xml16 = buildCoretaxXml('0012345678901000', invoices)
assert(xml16.includes('<TIN>0012345678901000</TIN>'), '16-digit seller unchanged')

assert.strictEqual((xml.match(/<TaxInvoice>/g) || []).length, 2)
assert.strictEqual((xml.match(/<GoodService>/g) || []).length, 3)

// Buyer: 15-digit badan -> 0-prefixed 16-digit TIN.
assert(xml.includes('<BuyerTin>0023456789012000</BuyerTin>'), '15-digit buyer -> 16')
assert(xml.includes('<BuyerDocument>TIN</BuyerDocument>'))

// Buyer with no tax id: NIK branch, never a fabricated all-zero TIN.
const budi = xml.split('INV/0002/XI/2026')[1].split('</TaxInvoice>')[0]
assert(budi.includes('<BuyerDocument>NIK</BuyerDocument>'), 'no-id buyer -> NIK branch')
assert(budi.includes('<BuyerTin></BuyerTin>'), 'no-id buyer has empty BuyerTin')
assert(!xml.includes('<BuyerTin>0000000000000000</BuyerTin>'), 'no fabricated zero TIN')

assert(xml.includes('<Unit>UM.0021</Unit>'), 'pcs -> UM.0021')
assert(xml.includes('<Unit>UM.0018</Unit>'), 'unit -> UM.0018')
assert(xml.includes('<Unit>UM.0003</Unit>'), 'kg -> UM.0003')
assert(xml.includes('<TotalDiscount>1000000</TotalDiscount>'), '10% of 10jt as amount')
assert(xml.includes('Jasa &lt;konsultasi&gt; &amp; &quot;co&quot;'), 'XML escaping')

const vats = [...xml.matchAll(/<VAT>(\d+)<\/VAT>/g)].map((m) => Number(m[1]))
const inv1Vat = vats.slice(0, 2).reduce((a, b) => a + b, 0)
assert.strictEqual(inv1Vat, 14190000, `inv1 VAT sum ${inv1Vat} != 14190000`)

assert.throws(() => buildCoretaxXml('', invoices), /NPWP perusahaan belum diisi/)
assert.throws(() => buildCoretaxXml(null, invoices), /NPWP perusahaan belum diisi/)
assert.throws(() => buildCoretaxXml('123', invoices), /NPWP perusahaan belum diisi/, 'junk NPWP refused')

console.log('ALL CORETAX CHECKS PASSED')
console.log('VAT split inv1:', vats.slice(0, 2), 'sum =', inv1Vat)
