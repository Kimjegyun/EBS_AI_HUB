/**
 * Local Server API Client
 * Handles all API calls to the local Express server
 *
 * ngrok 경유 접속 시: window.location.origin이 ngrok URL이므로
 * API 요청도 같은 origin(상대 경로 /api/...)으로 보내야 합니다.
 * VITE_API_URL이 명시된 경우에만 절대 URL 사용, 아니면 상대 경로 사용.
 */

const API_URL = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string)
  : '';  // 상대 경로 — ngrok/LAN 모두 동작

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

class LocalServerApi {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    this.baseUrl = API_URL;
    this.loadToken();
  }

  private loadToken() {
    this.token = localStorage.getItem('auth_token');
  }

  private saveToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  private clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error || 'Request failed' };
      }

      return { data };
    } catch (error) {
      console.error('API request failed:', error);
      return { error: 'Network error' };
    }
  }

  // Auth endpoints
  async login(loginId: string, password: string) {
    const response = await this.request<{ token: string; user: any }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ loginId, password }),
      }
    );

    if (response.data?.token) {
      this.saveToken(response.data.token);
    }

    return response;
  }

  async signup(userData: {
    email: string;
    loginId: string;
    password: string;
    name: string;
    role: 'user' | 'partner';
    company?: string;
    department?: string;
  }) {
    return this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async logout() {
    const response = await this.request('/api/auth/logout', {
      method: 'POST',
    });
    this.clearToken();
    return response;
  }

  async resetPassword(email: string) {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  // User endpoints
  async getUsers() {
    return this.request<any[]>('/api/users');
  }

  async getUserById(id: string) {
    return this.request(`/api/users/${id}`);
  }

  async updateUser(id: string, data: any) {
    return this.request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string) {
    return this.request(`/api/users/${id}`, {
      method: 'DELETE',
    });
  }

  async approveUser(id: string) {
    return this.request(`/api/users/${id}/approve`, {
      method: 'POST',
    });
  }

  async rejectUser(id: string) {
    return this.request(`/api/users/${id}/reject`, {
      method: 'POST',
    });
  }

  // Holiday endpoints
  async getHolidays() {
    return this.request<any[]>('/api/holidays');
  }

  async createHoliday(data: any) {
    return this.request('/api/holidays', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateHoliday(id: string, data: any) {
    return this.request(`/api/holidays/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteHoliday(id: string) {
    return this.request(`/api/holidays/${id}`, {
      method: 'DELETE',
    });
  }

  // Event endpoints
  async getEvents() {
    return this.request<any[]>('/api/events');
  }

  async createEvent(data: any) {
    return this.request('/api/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEvent(id: string, data: any) {
    return this.request(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(id: string) {
    return this.request(`/api/events/${id}`, {
      method: 'DELETE',
    });
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }
}

export const localServerApi = new LocalServerApi();

// Made with Bob
