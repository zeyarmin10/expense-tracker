import { Injectable } from '@angular/core';
import { DatePipe } from '@angular/common';

// Define the shape of the date range object
export interface DateRange {
  start: string;
  end: string;
}

@Injectable({
  providedIn: 'root',
})
export class DateFilterService {
  /**
   * Calculates a date range based on a predefined filter.
   * @param datePipe The DatePipe instance provided by the calling component.
   * @param filter The filter type ('currentMonth', etc.).
   * @param customStartDate Optional start date for 'custom' filter.
   * @param customEndDate Optional end date for 'custom' filter.
   * @returns An object with formatted start and end dates.
   */
  public getDateRange(
    datePipe: DatePipe, // ✅ Accept DatePipe as a parameter
    filter: string,
    customStartDate?: string | null,
    customEndDate?: string | null
  ): DateRange {
    let startDate: Date;
    let endDate: Date;
    const now = new Date();

    switch (filter) {
      case 'currentWeek':
        // Week starting Monday. (If you want Sunday as start, use `const daysSinceSunday = now.getDay();`)
        const dayOfWeek = now.getDay(); // 0 (Sun) .. 6 (Sat)
        const daysSinceMonday = (dayOfWeek + 6) % 7; // converts Sunday(0)->6, Monday(1)->0, etc.
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - daysSinceMonday
        );
        startDate.setHours(0, 0, 0, 0);
        endDate = now;
        break;
      case 'currentMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'last30Days':
        const thirtyDaysAgo = new Date(now);
        startDate = new Date(thirtyDaysAgo.setDate(now.getDate() - 30));
        endDate = new Date();
        break;
      case 'lastMonth':
        // Calculate the start of the previous month
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        // Calculate the end of the previous month
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'lastSixMonths':
        // Calculate the date six months ago
        startDate = new Date(
          now.getFullYear(),
          now.getMonth() - 6,
          now.getDate()
        );
        endDate = now;
        break;
      case 'currentYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        break;
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'custom':
      default:
        if (!customStartDate || !customEndDate) {
          const oneYearAgo = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate()
          );
          startDate = oneYearAgo;
          endDate = now;
        } else {
          startDate = new Date(customStartDate);
          endDate = new Date(customEndDate);
        }
        break;
    }

    endDate.setHours(23, 59, 59, 999);

    return {
      start: datePipe.transform(startDate, 'yyyy-MM-dd') || '',
      end: datePipe.transform(endDate, 'yyyy-MM-dd') || '',
    };
  }
}
