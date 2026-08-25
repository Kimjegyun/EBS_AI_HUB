import { supabase } from './supabase';
import {
  getUserScopedItem,
  setUserScopedItem,
} from './userScopedStorage';

export interface UserPreferences {
  user_id: string;
  show_company_holidays: boolean;
  created_at: string;
  updated_at: string;
}

const LOCAL_STORAGE_KEY = 'user_preferences';

/**
 * User Preference Service
 * Manages user preferences with localStorage fallback
 */
export const userPreferenceService = {
  /**
   * Get user preferences
   * Falls back to localStorage if Supabase is not available
   */
  async getPreferences(): Promise<UserPreferences | null> {
    // Try Supabase first
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user preferences:', error);
          }

          if (data) {
            // Cache in localStorage
            setUserScopedItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
            return data;
          }
        }
      } catch (err) {
        console.error('Error accessing Supabase:', err);
      }
    }

    // Fallback to localStorage
    const cached = getUserScopedItem(LOCAL_STORAGE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        console.error('Error parsing cached preferences:', err);
      }
    }

    // Return default preferences
    return {
      user_id: 'local',
      show_company_holidays: true, // Default: enabled
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  /**
   * Update user preferences
   */
  async updatePreferences(updates: Partial<Pick<UserPreferences, 'show_company_holidays'>>): Promise<UserPreferences> {
    const currentPrefs = await this.getPreferences();
    const updatedPrefs: UserPreferences = {
      ...currentPrefs!,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Try Supabase first
    if (supabase) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('user_preferences')
            .upsert({
              user_id: user.id,
              show_company_holidays: updatedPrefs.show_company_holidays,
              updated_at: updatedPrefs.updated_at,
            })
            .select()
            .single();

          if (error) {
            console.error('Error updating user preferences:', error);
          } else if (data) {
            // Cache in localStorage
            setUserScopedItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
            return data;
          }
        }
      } catch (err) {
        console.error('Error accessing Supabase:', err);
      }
    }

    // Fallback to localStorage
    setUserScopedItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedPrefs));
    return updatedPrefs;
  },

  /**
   * Toggle company holidays visibility
   */
  async toggleCompanyHolidays(): Promise<boolean> {
    const prefs = await this.getPreferences();
    const newValue = !prefs?.show_company_holidays;
    await this.updatePreferences({ show_company_holidays: newValue });
    return newValue;
  },

  /**
   * Check if company holidays should be shown
   */
  async shouldShowCompanyHolidays(): Promise<boolean> {
    const prefs = await this.getPreferences();
    return prefs?.show_company_holidays ?? true; // Default: enabled
  },
};

// Made with Bob
