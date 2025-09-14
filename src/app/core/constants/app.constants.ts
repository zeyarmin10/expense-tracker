import { Currency } from '../models/currency.model';

export const AVAILABLE_CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat' },
  { code: 'SGD', symbol: '$', name: 'Singapore Dollar' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'KHR', symbol: '៛', name: 'Cambodia Riel' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'LAK', symbol: '₭', name: 'Lao Kip' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'JPY', symbol: '¥', name: 'Japan Yen' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar' },
  { code: 'GBP', symbol: '£', name: 'Pound Sterling' },
  { code: 'NZD', symbol: '$', name: 'New Zealand Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'United Arab Emirates Dirham' },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
];

export const CURRENCY_SYMBOLS: { [key: string]: string } = {
  USD: '$',
  CNY: '¥',
  MMK: 'K',
  SGD: '$',
  MYR: 'RM',
  THB: '฿',
  IDR: 'Rp',
  KHR: '៛',
  PHP: '₱',
  BDT: '৳',
  VND: '₫',
  LAK: '₭',
  EUR: '€',
  JPY: '¥',
  KRW: '₩',
  AUD: '$',
  GBP: '£',
  NZD: '$',
  INR: '₹',
  AED: 'د.إ',
  CAD: '$',
  RUB: '₽',
  ZAR: 'R',
};

export const BURMESE_MONTH_ABBREVIATIONS = {
  Jan: 'ဇန်',
  Feb: 'ဖေ',
  Mar: 'မတ်',
  Apr: 'ဧ',
  May: 'မေ',
  Jun: 'ဇွန်',
  Jul: 'ဇူ',
  Aug: 'ဩ',
  Sep: 'စက်',
  Oct: 'အောက်',
  Nov: 'နို',
  Dec: 'ဒီ',
};

export const BURMESE_MONTH_FULL_NAMES = {
  January: 'ဇန်နဝါရီ',
  February: 'ဖေဖော်ဝါရီ',
  March: 'မတ်',
  April: 'ဧပြီ',
  May: 'မေ',
  June: 'ဇွန်',
  July: 'ဇူလိုင်',
  August: 'ဩဂုတ်',
  September: 'စက်တင်ဘာ',
  October: 'အောက်တိုဘာ',
  November: 'နိုဝင်ဘာ',
  December: 'ဒီဇင်ဘာ',
};

export const BURMESE_CURRENCY_SYMBOL = 'ကျပ်';
export const MMK_CURRENCY_CODE = 'MMK';
export const BURMESE_LOCALE_CODE = 'my';

export const THAI_CURRENCY_SYMBOL = 'ဘတ်';
export const THB_CURRENCY_CODE = 'THB';
