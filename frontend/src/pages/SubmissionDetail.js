import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../api/client';

const STATE_LABELS = {
  draft:'Draft', submitted:'Submitted', under_review:'Under Review',
  approved:'Approved', rejected:'Rejected', more_info_requested:'More Info Requested',
};

export default function SubmissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => {
    setLoading(true);
    client.get(`/submissions/${id}/`).then(r => setSub(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const transition = async (newState) => {
    setActionLoading(newState); setError('');
    try {
      await client.post(`/submissions/${id}/transition/`, { new_state: newState, reviewer_note: note });
      setSuccess(`Moved to: ${STATE_LABELS[newState]}`);
      setNote('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed');
    } finally { setActionLoading(''); }
  };

  if (loading) return <div style={{padding:32,textAlign:'center',color:'#64748b'}}>Loading...</div>;
  if (!sub) return <div style={{padding:32,color:'#ef4444'}}>Submission not found.</div>;

  const canActOn = sub.state === 'submitted' || sub.state === 'under_review';
  const BASE_URL = process.env.REACT_APP_API_URL || '';

  return (
    <div style={{maxWidth:800,margin:'0 auto',padding:32}}>
      <button onClick={() => navigate('/reviewer')} style={{background:'none',border:'none',color:'#2563eb',cursor:'pointer',fontSize:14,marginBottom:16,padding:0}}>
        ← Back to queue
      </button>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,margin:'0 0 4px'}}>{sub.business_name || 'Unnamed Business'} <span style={{color:'#94a3b8',fontWeight:400,fontSize:16}}>#{sub.id}</span></h1>
          <div style={{fontSize:13,color:'#64748b'}}>Merchant: {sub.merchant_username}</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {sub.is_at_risk && <span style={{background:'#fef2f2',color:'#dc2626',fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:20}}>⚠ AT RISK</span>}
          <span style={{background:'#f1f5f9',color:'#475569',fontSize:13,fontWeight:600,padding:'6px 14px',borderRadius:20}}>{STATE_LABELS[sub.state]}</span>
        </div>
      </div>

      {error && <div style={{background:'#fef2f2',color:'#b91c1c',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>{error}</div>}
      {success && <div style={{background:'#f0fdf4',color:'#166534',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>{success}</div>}

      {/* Details */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20}}>
          <h3 style={{fontSize:13,fontWeight:600,color:'#64748b',margin:'0 0 12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Personal</h3>
          <p style={{margin:'0 0 6px',fontSize:14}}><strong>Name:</strong> {sub.full_name||'—'}</p>
          <p style={{margin:'0 0 6px',fontSize:14}}><strong>Email:</strong> {sub.email||'—'}</p>
          <p style={{margin:0,fontSize:14}}><strong>Phone:</strong> {sub.phone||'—'}</p>
        </div>
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20}}>
          <h3 style={{fontSize:13,fontWeight:600,color:'#64748b',margin:'0 0 12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Business</h3>
          <p style={{margin:'0 0 6px',fontSize:14}}><strong>Name:</strong> {sub.business_name||'—'}</p>
          <p style={{margin:'0 0 6px',fontSize:14}}><strong>Type:</strong> {sub.business_type||'—'}</p>
          <p style={{margin:0,fontSize:14}}><strong>Volume:</strong> ${sub.expected_monthly_volume||'—'}/mo</p>
        </div>
      </div>

      {/* Documents */}
      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20,marginBottom:20}}>
        <h3 style={{fontSize:13,fontWeight:600,color:'#64748b',margin:'0 0 12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Documents</h3>
        <div style={{display:'flex',gap:12}}>
          {[['pan_document','PAN Card'],['aadhaar_document','Aadhaar'],['bank_statement','Bank Statement']].map(([k,label]) => (
            <div key={k} style={{flex:1,textAlign:'center',padding:16,background:'#f8fafc',borderRadius:8,border:'1px solid #e2e8f0'}}>
              <p style={{fontSize:12,fontWeight:500,color:'#374151',margin:'0 0 8px'}}>{label}</p>
              {sub[k] ? (
                <a href={`${BASE_URL}${sub[k]}`} target="_blank" rel="noreferrer"
                  style={{fontSize:12,color:'#2563eb',textDecoration:'none',background:'#eff6ff',padding:'4px 10px',borderRadius:6}}>
                  View ↗
                </a>
              ) : (
                <span style={{fontSize:12,color:'#94a3b8'}}>Not uploaded</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Reviewer action */}
      {canActOn && (
        <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20}}>
          <h3 style={{fontSize:13,fontWeight:600,color:'#64748b',margin:'0 0 12px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Review Decision</h3>
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:6}}>Reviewer Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Add a note for the merchant (required for rejection or more info)"
              style={{width:'100%',border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 12px',fontSize:14,outline:'none',resize:'vertical',boxSizing:'border-box'}} />
          </div>
          <div style={{display:'flex',gap:10}}>
            {sub.state === 'submitted' && (
              <button onClick={() => transition('under_review')} disabled={!!actionLoading}
                style={{background:'#f59e0b',color:'white',border:'none',borderRadius:8,padding:'10px 18px',fontSize:14,fontWeight:500,cursor:'pointer',opacity:actionLoading?0.6:1}}>
                {actionLoading==='under_review' ? '...' : 'Start Review'}
              </button>
            )}
            {sub.state === 'under_review' && (
              <>
                <button onClick={() => transition('approved')} disabled={!!actionLoading}
                  style={{background:'#10b981',color:'white',border:'none',borderRadius:8,padding:'10px 18px',fontSize:14,fontWeight:500,cursor:'pointer',opacity:actionLoading?0.6:1}}>
                  {actionLoading==='approved' ? '...' : '✓ Approve'}
                </button>
                <button onClick={() => transition('rejected')} disabled={!!actionLoading}
                  style={{background:'#ef4444',color:'white',border:'none',borderRadius:8,padding:'10px 18px',fontSize:14,fontWeight:500,cursor:'pointer',opacity:actionLoading?0.6:1}}>
                  {actionLoading==='rejected' ? '...' : '✗ Reject'}
                </button>
                <button onClick={() => transition('more_info_requested')} disabled={!!actionLoading}
                  style={{background:'#8b5cf6',color:'white',border:'none',borderRadius:8,padding:'10px 18px',fontSize:14,fontWeight:500,cursor:'pointer',opacity:actionLoading?0.6:1}}>
                  {actionLoading==='more_info_requested' ? '...' : '? Request Info'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {sub.reviewer_note && (
        <div style={{marginTop:16,background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:12,padding:16}}>
          <p style={{fontSize:12,fontWeight:600,color:'#7c3aed',margin:'0 0 6px'}}>REVIEWER NOTE</p>
          <p style={{fontSize:14,margin:0}}>{sub.reviewer_note}</p>
        </div>
      )}
    </div>
  );
}
