import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AVAILABLE_CURRENCIES,
  BURMESE_CURRENCY_SYMBOL,
  BURMESE_LOCALE_CODE,
  BURMESE_MONTH_ABBREVIATIONS,
  CURRENCY_SYMBOLS,
  MMK_CURRENCY_CODE,
  THAI_CURRENCY_SYMBOL,
  THB_CURRENCY_CODE,
} from '../core/constants/app.constants';

@Injectable({
  providedIn: 'root',
})
export class FormatService {
  private translate = inject(TranslateService);

  /**
   * Formats the amount with the correct symbol and decimal points.
   * Removes decimals for MMK currency and adds thousands separators.
   */
  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const locale = this.translate.currentLang;
    const currency = currencyCode.toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    // Set fraction digits to 0 for MMK and THB, and 2 for all others
    const minimumFractionDigits =
      currency === 'MMK' || currency === 'THB' ? 0 : 2;

    let formattedAmount: string;

    // ✅ REVISED: Check for Burmese language and format numbers accordingly
    if (locale === 'my') {
      formattedAmount = new Intl.NumberFormat('my-MM', {
        style: 'decimal',
        minimumFractionDigits: minimumFractionDigits,
        maximumFractionDigits: minimumFractionDigits,
        numberingSystem: 'mymr', // This will convert numbers to Burmese numerals
      }).format(amount);
    } else {
      // Use standard formatting for other languages
      formattedAmount = new Intl.NumberFormat(locale, {
        style: 'decimal',
        minimumFractionDigits: minimumFractionDigits,
        maximumFractionDigits: minimumFractionDigits,
      }).format(amount);
    }

    // // Place the symbol after the amount for MMK and THB
    // if (currency === 'MMK' || currency === 'THB') {
    //   return `${formattedAmount} ${symbol}`;
    // } else {
    //   // Place the symbol before the amount for all other currencies
    //   return `${symbol}${formattedAmount}`;
    // }

    if (locale === BURMESE_LOCALE_CODE && currency === MMK_CURRENCY_CODE) {
      return `${formattedAmount} ${BURMESE_CURRENCY_SYMBOL}`;
    } else if (locale === BURMESE_LOCALE_CODE) {
      return `${formattedAmount}${symbol}`;
    }

    return `${symbol}${formattedAmount}`;
  }
}
