type Scale = [value: number, unit: string, unitBeforeRemainder?: string];

const LAKH = 100_000;

interface NumberWords {
  digits: readonly string[];
  tens: readonly string[];
  scales: readonly Scale[];
  separator: string;
  point: string;
  minus: string;
  teens?: readonly string[];
  tensJoiner?: string;
  tensBeforeRemainder?: readonly string[];
  omitOneThrough?: number;
  trailingOne?: string;
}

const ENGLISH: NumberWords = {
  digits: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  tens: ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'],
  teens: ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'],
  scales: [[1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1000, 'thousand'], [100, 'hundred']],
  separator: ' ',
  tensJoiner: '-',
  point: 'point',
  minus: 'minus',
};

const BURMESE_TENS = ['', 'ဆယ်', 'နှစ်ဆယ်', 'သုံးဆယ်', 'လေးဆယ်', 'ငါးဆယ်', 'ခြောက်ဆယ်', 'ခုနစ်ဆယ်', 'ရှစ်ဆယ်', 'ကိုးဆယ်'];

const WORDS_BY_LANGUAGE: Partial<Record<string, NumberWords>> = {
  en: ENGLISH,
  my: {
    digits: ['သုည', 'တစ်', 'နှစ်', 'သုံး', 'လေး', 'ငါး', 'ခြောက်', 'ခုနစ်', 'ရှစ်', 'ကိုး'],
    tens: BURMESE_TENS,
    tensBeforeRemainder: BURMESE_TENS.map(word => word.replace(/ယ်$/, 'ယ့်')),
    scales: [[1e14, 'ကောဋိ'], [1e7, 'ကုဋေ'], [1e6, 'သန်း'], [1e5, 'သိန်း'], [1e4, 'သောင်း'], [1000, 'ထောင်', 'ထောင့်'], [100, 'ရာ', 'ရာ့']],
    separator: '',
    point: 'ဒသမ',
    minus: 'အနုတ်',
  },
  th: {
    digits: ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'],
    tens: ['', 'สิบ', 'ยี่สิบ', 'สามสิบ', 'สี่สิบ', 'ห้าสิบ', 'หกสิบ', 'เจ็ดสิบ', 'แปดสิบ', 'เก้าสิบ'],
    scales: [[1e6, 'ล้าน'], [1e5, 'แสน'], [1e4, 'หมื่น'], [1000, 'พัน'], [100, 'ร้อย']],
    separator: '',
    trailingOne: 'เอ็ด',
    point: 'จุด',
    minus: 'ลบ',
  },
  km: {
    digits: ['សូន្យ', 'មួយ', 'ពីរ', 'បី', 'បួន', 'ប្រាំ', 'ប្រាំមួយ', 'ប្រាំពីរ', 'ប្រាំបី', 'ប្រាំបួន'],
    tens: ['', 'ដប់', 'ម្ភៃ', 'សាមសិប', 'សែសិប', 'ហាសិប', 'ហុកសិប', 'ចិតសិប', 'ប៉ែតសិប', 'កៅសិប'],
    scales: [[1e10, 'ពាន់​កោដិ'], [1e6, 'លាន'], [1e5, 'សែន'], [1e4, 'ម៉ឺន'], [1000, 'ពាន់'], [100, 'រយ']],
    separator: '\u200b',
    point: 'ចុច',
    minus: 'ដក',
  },
  ja: {
    digits: ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'],
    tens: ['', '十', '二十', '三十', '四十', '五十', '六十', '七十', '八十', '九十'],
    scales: [[1e12, '兆'], [1e8, '億'], [1e4, '万'], [1000, '千'], [100, '百']],
    separator: '',
    omitOneThrough: 1000,
    point: '点',
    minus: 'マイナス',
  },
};

function spellInteger(value: number, words: NumberWords, afterScale = false): string {
  if (value < 10) {
    return value === 1 && afterScale && words.trailingOne ? words.trailingOne : words.digits[value];
  }
  if (value < 20 && words.teens) return words.teens[value - 10];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    if (!ones) return words.tens[tens];
    const prefix = words.tensBeforeRemainder?.[tens] ?? words.tens[tens];
    return `${prefix}${words.tensJoiner ?? words.separator}${spellInteger(ones, words, true)}`;
  }

  const [scale, unit, unitBeforeRemainder = unit] = words.scales.find(([size]) => value >= size)!;
  const count = Math.floor(value / scale);
  const remainder = value % scale;
  const prefix = count === 1 && scale <= (words.omitOneThrough ?? 0)
    ? ''
    : `${spellInteger(count, words)}${words.separator}`;
  return remainder
    ? `${prefix}${unitBeforeRemainder}${words.separator}${spellInteger(remainder, words, true)}`
    : `${prefix}${unit}`;
}

function spellBurmeseLakhCount(lakhs: number, words: NumberWords): string {
  const count = spellInteger(lakhs, words).replace(/တစ်(?=ရာ|ထောင်|ထောင့်)/g, 'တ');
  const remainder = lakhs % 1000;
  const hasThousands = lakhs % 10_000 >= 1000;
  if (!hasThousands || remainder < 10 || remainder >= 20) return count;

  // Keep ထောင့် and the explicit တ before the teens, as in တထောင့်တဆယ်.
  const teens = spellInteger(remainder, words);
  return `${count.slice(0, -teens.length)}တ${teens}`;
}

function spellLakhAmount(value: number, words: NumberWords, language: string, unit: string): string {
  const lakhs = Math.floor(value / LAKH);
  const remainder = value % LAKH;
  const count = language === 'my' ? spellBurmeseLakhCount(lakhs, words) : spellInteger(lakhs, words);
  const amount = language === 'my' && lakhs >= 20
    ? `${unit}${count}`
    : `${count}${words.separator}${unit}`;

  return remainder ? `${amount} ${spellInteger(remainder, words)}` : amount;
}

/** Spell the digits of a rounded, display-ready amount, including any fractional portion. */
export function spellNumberParts(parts: Intl.NumberFormatPart[], language: string, lakhUnit?: string): string | null {
  const integer = Number(parts.find(part => part.type === 'integer')?.value);
  if (!Number.isSafeInteger(integer)) return null;

  const words = WORDS_BY_LANGUAGE[language] ?? ENGLISH;
  const result = [lakhUnit && integer >= 10 * LAKH
    ? spellLakhAmount(integer, words, language, lakhUnit)
    : spellInteger(integer, words)];
  const fraction = parts.find(part => part.type === 'fraction')?.value.replace(/0+$/, '');
  if (fraction) result.push(words.point, ...Array.from(fraction, digit => words.digits[Number(digit)]));
  if (parts.some(part => part.type === 'minusSign')) result.unshift(words.minus);
  return result.join(words.separator);
}
