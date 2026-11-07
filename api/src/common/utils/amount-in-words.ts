const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

const under100 = (n: number): string =>
  n < 20
    ? (ONES[n] as string)
    : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
const under1000 = (n: number): string =>
  [
    n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '',
    n % 100 ? under100(n % 100) : '',
  ]
    .filter(Boolean)
    .join(' ');

/** Crore, lakh and thousand, as used in Nepal. Handles whole numbers below 100 crore. */
function whole(n: number): string {
  if (n >= 1_000_000_000)
    throw new RangeError('Amount too large to write in words');
  const parts: string[] = [];
  let rest = n;
  for (const [size, label] of [
    [10_000_000, 'Crore'],
    [100_000, 'Lakh'],
    [1000, 'Thousand'],
  ] as const) {
    const q = Math.floor(rest / size);
    if (q > 0) parts.push(`${under100(q)} ${label}`);
    rest %= size;
  }
  if (rest > 0) parts.push(under1000(rest));
  return parts.join(' ');
}

/** 125050 paisa becomes "Rupees One Thousand Two Hundred Fifty and Fifty Paisa Only". */
export function amountInWords(paisaTotal: number): string {
  const rupees = Math.floor(paisaTotal / 100);
  const paisa = paisaTotal % 100;
  if (rupees === 0 && paisa === 0) return 'Rupees Zero Only';
  if (rupees === 0) return `${under100(paisa)} Paisa Only`;
  return `Rupees ${whole(rupees)}${paisa > 0 ? ` and ${under100(paisa)} Paisa` : ''} Only`;
}
