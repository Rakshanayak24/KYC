import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../App';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await client.post('/auth/register/', { ...form, role: 'merchant' });
      await login(form.username, form.password);
      navigate('/merchant');
    } catch (err) {
      const d = err.response?.data;
      setError(typeof d === 'object' ? JSON.stringify(d) : 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f8fafc'}}>
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:32,width:'100%',maxWidth:380}}>
        <h1 style={{fontSize:24,fontWeight:700,margin:'0 0 4px'}}>Create account</h1>
        <p style={{fontSize:13,color:'#64748b',margin:'0 0 24px'}}>Register as a merchant</p>
        {error && <div style={{background:'#fef2f2',color:'#b91c1c',fontSize:13,padding:'8px 12px',borderRadius:8,marginBottom:16}}>{error}</div>}
        <form onSubmit={submit}>
          {['username','email','password'].map(field => (
            <div key={field} style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4,textTransform:'capitalize'}}>{field}</label>
              <input type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                style={{width:'100%',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',fontSize:14,outline:'none',boxSizing:'border-box'}}
                value={form[field]} onChange={e => setForm({...form, [field]: e.target.value})} required />
            </div>
          ))}
          <button type="submit" disabled={loading}
            style={{width:'100%',background:'#2563eb',color:'white',border:'none',borderRadius:8,padding:10,fontSize:14,fontWeight:500,cursor:'pointer',opacity:loading?0.6:1}}>
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>
        <p style={{textAlign:'center',fontSize:13,color:'#64748b',marginTop:16}}>
          Already have an account? <Link to="/login" style={{color:'#2563eb'}}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
