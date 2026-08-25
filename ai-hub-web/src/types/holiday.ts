export interface CompanyHoliday {
  id: string;
  holiday_date: string;
  holiday_name: string;
  description?: string;
  is_recurring: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateHolidayInput {
  holiday_date: string;
  holiday_name: string;
  description?: string;
  is_recurring?: boolean;
}

export interface UpdateHolidayInput {
  holiday_name?: string;
  description?: string;
  is_recurring?: boolean;
}

// Made with Bob
