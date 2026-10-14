/**
 * ARIA API Service — Centralized Axios Instance
 * All backend API calls go through this module.
 * JWT is automatically attached via request interceptor.
 */

import axios, { type AxiosError } from 'axios';
import { getRefreshToken, getToken, logout, setRefreshToken, setToken } from './auth';

const getApiBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim()) {
    return import.meta.env.VITE_API_URL.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://aria-backend-2e96.onrender.com';
  }
  return 'http://localhost:5000';
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = 'Bearer ' + token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean } | undefined;
    const isAuthRequest = originalRequest?.url?.includes('/api/auth/');
    const canRefresh = !!getRefreshToken() && !!originalRequest && !isAuthRequest && !originalRequest._retry;

    if ((error.response?.status === 401 || error.response?.status === 403) && canRefresh) {
      originalRequest._retry = true;
      return api.post('/api/auth/refresh', { refreshToken: getRefreshToken() })
        .then((response) => {
          setToken(response.data.token);
          setRefreshToken(response.data.refreshToken);
          originalRequest.headers.Authorization = 'Bearer ' + response.data.token;
          return api(originalRequest);
        })
        .catch((refreshError) => {
          logout();
          window.dispatchEvent(new CustomEvent('aria:unauthorized'));
          return Promise.reject(refreshError);
        });
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      logout();
      window.dispatchEvent(new CustomEvent('aria:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  register: (
    name: string,
    email: string,
    phone: string,
    password: string,
    emergencyContacts?: { name: string; phone: string }[]
  ) =>
    api.post('/api/auth/register', {
      name,
      email,
      phone,
      password,
      emergencyContacts: emergencyContacts || [],
    }),
  refresh: (refreshToken: string) =>
    api.post('/api/auth/refresh', { refreshToken }),
  logout: () => api.post('/api/auth/logout'),
  logoutAll: () => api.post('/api/auth/logout-all'),
};

export const profileService = {
  getProfile: () => api.get('/api/user/profile'),
  updateProfile: (data: {
    name?: string;
    phone?: string;
    emergencyContacts?: Array<{ name: string; phone: string }>;
  }) => api.put('/api/user/profile', data),
};

export const monitoringService = {
  health: () => api.get('/api/health', {
    params: { _healthCheck: Date.now() },
    timeout: 6000,
  }),
  startSession: () => api.post('/api/monitoring/start'),
  uploadChunk: (formData: FormData) =>
    api.post('/api/monitoring/chunk', formData, {
      timeout: 20000, // 20s allows sufficient headroom for cloud network latency and audio analysis without artificial timeouts
    }),
  stopSession: (sessionId: string) =>
    api.post('/api/monitoring/stop', { sessionId }),
  getStatus: (sessionId: string) =>
    api.get(`/api/monitoring/status/${sessionId}`),
};

export const incidentService = {
  create: (formData: FormData) =>
    api.post('/api/incidents/create', formData),
  getAll: () => api.get('/api/incidents'),
  getById: (id: string) => api.get(`/api/incidents/${id}`),
  delete: (id: string) => api.delete(`/api/incidents/${id}`),
  resolve: (id: string) => api.put(`/api/incidents/${id}/resolve`),
};

export const reportService = {
  generate: (incidentId: string) =>
    api.post('/api/incidents/report/generate', { incidentId }),
};

export const healthService = {
  check: async () => {
    try {
      return await api.get('/api/health', {
        params: { _t: Date.now() },
        timeout: 6000,
      });
    } catch (err: any) {
      // Fallback: If /api/health is blocked or timing out, check lightweight /api/ping or root /
      return await api.get('/api/ping', {
        params: { _t: Date.now() },
        timeout: 4000,
      });
    }
  },
};

export default api;
