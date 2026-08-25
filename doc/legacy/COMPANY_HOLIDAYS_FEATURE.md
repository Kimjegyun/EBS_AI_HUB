# Company Holidays Feature

## Overview

This feature implements automatic biweekly Friday holidays and provides user control over company schedule visibility in the calendar.

## Features

### 1. Automatic Biweekly Friday Holidays

- **Start Date**: June 12, 2026 (Friday)
- **Pattern**: Every other Friday (2-week cycle)
- **Auto-generation**: Holidays are automatically generated for all future years and months
- **Display**: Shows as "격주 금요일 휴무" (Biweekly Friday Off) in the calendar

### 2. Admin Holiday Management

Admins can access the holiday management dialog to:
- View all holidays (including auto-generated biweekly Fridays)
- Add custom company holidays
- Edit custom holidays
- Delete custom holidays
- Filter holidays by year

**Note**: Auto-generated biweekly Friday holidays cannot be edited or deleted.

### 3. User Preference for Company Schedule Visibility

Users can control whether they want to see company holidays in their calendar:
- **Default**: Enabled (company holidays are shown)
- **Toggle Location**: Below the calendar in the legend section
- **Button Label**: "회사 일정 공유" (Company Schedule Sharing)
- **Persistence**: Preference is saved to database (with localStorage fallback)

## Implementation Details

### Files Created/Modified

#### New Files:
1. **`src/lib/biweeklyHolidayGenerator.ts`**
   - Utility functions for generating biweekly Friday holidays
   - Functions: `isBiweeklyFriday()`, `generateBiweeklyFridaysForMonth()`, etc.

2. **`src/lib/userPreferenceService.ts`**
   - Service for managing user preferences
   - Handles both Supabase and localStorage storage
   - Default: `show_company_holidays: true`

3. **`supabase/migrations/20260617000000_user_preferences.sql`**
   - Database migration for user_preferences table
   - Includes RLS policies for user data security

#### Modified Files:
1. **`src/lib/holidayService.ts`**
   - Updated to include auto-generated biweekly Fridays
   - `getHolidaysByMonth()` and `getHolidaysByDateRange()` now merge DB holidays with generated ones

2. **`src/lib/eventService.ts`**
   - Added `includeCompanyHolidays` parameter to `getCombinedCalendarEvents()`
   - Respects user preference for showing company holidays

3. **`src/components/EnhancedCalendar.tsx`**
   - Added state for `showCompanyHolidays`
   - Loads user preference on mount
   - Added toggle button in legend section
   - Refreshes calendar when preference changes

4. **`src/components/HolidayManagementDialog.tsx`**
   - Visual distinction for auto-generated holidays
   - Prevents editing/deletion of auto-generated holidays
   - Updated footer with information about biweekly Fridays

## Usage

### For Users

1. **Viewing Company Holidays**:
   - Company holidays appear in red on the calendar
   - Biweekly Fridays are automatically shown

2. **Toggling Company Schedule**:
   - Look for the "회사 일정 공유" button below the calendar
   - Click to toggle visibility of company holidays
   - Your preference is automatically saved

### For Admins

1. **Managing Holidays**:
   - Click the settings icon (⚙️) on the calendar
   - Opens the Holiday Management Dialog
   - Add custom holidays using the form
   - Edit or delete custom holidays (not auto-generated ones)

2. **Understanding Auto-Generated Holidays**:
   - Marked with "자동" (Auto) badge
   - Highlighted with blue background
   - Cannot be edited or deleted
   - Automatically appear for all future dates

## Technical Architecture

### Holiday Generation Logic

```typescript
// Biweekly pattern starting from June 12, 2026
const BIWEEKLY_START_DATE = new Date('2026-06-12');

// Check if a date is a biweekly Friday
function isBiweeklyFriday(date: Date): boolean {
  if (date.getDay() !== 5) return false; // Must be Friday
  
  const weeksDiff = Math.floor(daysDiff / 7);
  return weeksDiff >= 0 && weeksDiff % 2 === 0; // Every 2 weeks
}
```

### User Preference Storage

1. **Primary**: Supabase `user_preferences` table
2. **Fallback**: Browser localStorage
3. **Default**: `show_company_holidays: true`

### Calendar Event Types

- **Personal Events**: User's own events (blue/secondary color)
- **Company Holidays**: Company-wide holidays (red/error color)
  - Custom holidays (added by admin)
  - Auto-generated biweekly Fridays

## Database Schema

### user_preferences Table

```sql
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  show_company_holidays BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Future Enhancements

Potential improvements for this feature:

1. **Customizable Biweekly Pattern**:
   - Allow admins to change the start date
   - Configure different recurring patterns

2. **Holiday Categories**:
   - National holidays
   - Company holidays
   - Department-specific holidays

3. **Holiday Notifications**:
   - Remind users of upcoming holidays
   - Email notifications for new holidays

4. **Export/Import**:
   - Export holiday calendar to iCal format
   - Import holidays from external sources

## Troubleshooting

### Holidays Not Showing

1. Check if "회사 일정 공유" toggle is enabled
2. Verify Supabase connection
3. Check browser console for errors
4. Clear localStorage and refresh

### Auto-Generated Holidays Missing

1. Verify the biweekly calculation logic
2. Check if the date is after June 12, 2026
3. Ensure `holidayService.getHolidaysByMonth()` is being called

### Preference Not Saving

1. Check Supabase connection
2. Verify RLS policies are correctly set
3. Check browser localStorage as fallback
4. Review console for error messages

## Made with Bob