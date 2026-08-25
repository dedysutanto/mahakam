// Indonesian number-to-words (terbilang) for Rupiah amounts.
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']

function toWords(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n < 12) return SATUAN[n]
  if (n < 20) return toWords(n - 10) + ' belas'
  if (n < 100) return toWords(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + toWords(n % 10) : '')
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + toWords(n % 100) : '')
  if (n < 1000) return toWords(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + toWords(n % 100) : '')
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + toWords(n % 1000) : '')
  if (n < 1_000_000) return toWords(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + toWords(n % 1000) : '')
  if (n < 1_000_000_000) return toWords(Math.floor(n / 1_000_000)) + ' juta' + (n % 1_000_000 ? ' ' + toWords(n % 1_000_000) : '')
  if (n < 1_000_000_000_000) return toWords(Math.floor(n / 1_000_000_000)) + ' miliar' + (n % 1_000_000_000 ? ' ' + toWords(n % 1_000_000_000) : '')
  return toWords(Math.floor(n / 1_000_000_000_000)) + ' triliun' + (n % 1_000_000_000_000 ? ' ' + toWords(n % 1_000_000_000_000) : '')
}

export function terbilang(amount: number): string {
  const whole = Math.floor(Math.abs(amount))
  const cents = Math.round((Math.abs(amount) - whole) * 100)
  let out = whole === 0 ? 'nol' : toWords(whole)
  if (cents > 0) out += ' koma ' + toWords(cents)
  // capitalize first letter
  return out.charAt(0).toUpperCase() + out.slice(1)
}
