import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import client from './api/client';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MerchantDashboard from './pages/MerchantDashboard';
import KYCForm from './pages/KYCForm';
import ReviewerDashboard from './pages/ReviewerDashboard';
import SubmissionDetail from './pages/SubmissionDetail';

export const AuthContext = createContext(null);

export function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      client.get('/auth/me/')
        .then(r => setUser(r.data))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const r = await client.post('/auth/login/', { username, password });
    localStorage.setItem('token', r.data.token);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>;

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-bold text-blue-600 text-lg">Playto KYC</span>
        {user.role === 'merchant' && (
          <>
            <Link to="/merchant" className="text-sm text-gray-600 hover:text-blue-600">My KYC</Link>
            <Link to="/kyc" className="text-sm text-gray-600 hover:text-blue-600">Submit KYC</Link>
          </>
        )}
        {user.role === 'reviewer' && (
          <Link to="/reviewer" className="text-sm text-gray-600 hover:text-blue-600">Review Queue</Link>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{user.username} ({user.role})</span>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-sm text-red-500 hover:text-red-700">Logout</button>
      </div>
    </nav>
  );
}

function RequireAuth({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to={user.role === 'reviewer' ? '/reviewer' : '/merchant'} />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/merchant" element={<RequireAuth role="merchant"><MerchantDashboard /></RequireAuth>} />
          <Route path="/kyc" element={<RequireAuth role="merchant"><KYCForm /></RequireAuth>} />
          <Route path="/kyc/:id" element={<RequireAuth role="merchant"><KYCForm /></RequireAuth>} />
          <Route path="/reviewer" element={<RequireAuth role="reviewer"><ReviewerDashboard /></RequireAuth>} />
          <Route path="/reviewer/submission/:id" element={<RequireAuth role="reviewer"><SubmissionDetail /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
