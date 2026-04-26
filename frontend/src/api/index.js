import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || '/api/v1';

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Token ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register/', data),
  login: (data) => api.post('/auth/login/', data),
  me: () => api.get('/auth/me/'),
};

export const merchantApi = {
  listSubmissions: () => api.get('/submissions/'),
  createSubmission: (data) => api.post('/submissions/', data),
  getSubmission: (id) => api.get(`/submissions/${id}/`),
  updateSubmission: (id, data) => api.patch(`/submissions/${id}/`, data),
  submitKYC: (id) => api.post(`/submissions/${id}/submit/`),
  uploadDocument: (id, formData) => api.post(`/submissions/${id}/documents/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getDocuments: (id) => api.get(`/submissions/${id}/documents/`),
};

export const reviewerApi = {
  getQueue: (state) => api.get('/reviewer/queue/', { params: state ? { state } : {} }),
  getSubmission: (id) => api.get(`/reviewer/submissions/${id}/`),
  transition: (id, data) => api.post(`/reviewer/submissions/${id}/transition/`, data),
  getStats: () => api.get('/reviewer/stats/'),
};

export default api;
