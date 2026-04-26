import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../App';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const user = await login(form.username, form.password);
      navigate(user.role === 'reviewer' ? '/reviewer' : '/merchant');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:32,width:'100%',maxWidth:380}}>
        <h1 style={{fontSize:24,fontWeight:700,margin:'0 0 4px'}}>Sign in</h1>
        <p style={{fontSize:13,color:'#64748b',margin:'0 0 24px'}}>Playto KYC Portal</p>
        {error && <div style={{background:'#fef2f2',color:'#b91c1c',fontSize:13,padding:'8px 12px',borderRadius:8,marginBottom:16}}>{error}</div>}
        <form onSubmit={submit}>
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Username</label>
            <input style={{width:'100%',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',fontSize:14,outline:'none',boxSizing:'border-box'}}
              value={form.username} onChange={e => setForm({...form, username: e.target.value})} required />
          </div>
          <div style={{marginBottom:20}}>
            <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Password</label>
            <input type="password" style={{width:'100%',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',fontSize:14,outline:'none',boxSizing:'border-box'}}
              value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          </div>
          <button type="submit" disabled={loading}
            style={{width:'100%',background:'#2563eb',color:'white',border:'none',borderRadius:8,padding:'10px',fontSize:14,fontWeight:500,cursor:'pointer',opacity:loading?0.6:1}}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={{textAlign:'center',fontSize:13,color:'#64748b',marginTop:16}}>
          No account? <Link to="/register" style={{color:'#2563eb'}}>Register as merchant</Link>
        </p>
        <div style={{marginTop:24,padding:12,background:'#f8fafc',borderRadius:8,fontSize:12,color:'#64748b'}}>
          <p style={{fontWeight:600,color:'#374151',margin:'0 0 4px'}}>Seed credentials:</p>
          <p style={{margin:'2px 0'}}>Reviewer: reviewer1 / review123</p>
          <p style={{margin:'2px 0'}}>Merchant 1: merchant1 / merchant123</p>
          <p style={{margin:'2px 0'}}>Merchant 2: merchant2 / merchant456</p>
        </div>
      </div>
    </div>
  );
}
