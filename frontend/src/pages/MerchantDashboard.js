import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

const STATE_COLORS = {
  draft: '#94a3b8',
  submitted: '#3b82f6',
  under_review: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  more_info_requested: '#8b5cf6',
};

const STATE_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  more_info_requested: 'More Info Needed',
};

export default function MerchantDashboard() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/submissions/').then(r => setSubmissions(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{padding:32,textAlign:'center',color:'#64748b'}}>Loading...</div>;

  return (
    <div style={{maxWidth:800,margin:'0 auto',padding:32}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,margin:0}}>My KYC Submissions</h1>
          <p style={{fontSize:13,color:'#64748b',margin:'4px 0 0'}}>Track your verification status</p>
        </div>
        <Link to="/kyc" style={{background:'#2563eb',color:'white',borderRadius:8,padding:'10px 18px',fontSize:14,fontWeight:500,textDecoration:'none'}}>
          + New Submission
        </Link>
      </div>

      {submissions.length === 0 ? (
        <div style={{textAlign:'center',padding:48,background:'white',borderRadius:12,border:'1px solid #e2e8f0'}}>
          <p style={{color:'#64748b',margin:'0 0 16px'}}>No KYC submissions yet.</p>
          <Link to="/kyc" style={{color:'#2563eb',fontWeight:500}}>Start your KYC →</Link>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {submissions.map(sub => (
            <div key={sub.id} style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:600,marginBottom:4}}>
                  {sub.business_name || 'Untitled Business'} <span style={{color:'#94a3b8',fontWeight:400,fontSize:13}}>#{sub.id}</span>
                </div>
                <div style={{fontSize:13,color:'#64748b'}}>
                  {sub.full_name || 'No name'} · {sub.business_type || 'No type'} · ${sub.expected_monthly_volume || '—'}/mo
                </div>
                {sub.reviewer_note && (
                  <div style={{marginTop:8,fontSize:12,color:'#7c3aed',background:'#f5f3ff',padding:'4px 8px',borderRadius:6}}>
                    Reviewer note: {sub.reviewer_note}
                  </div>
                )}
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
                <span style={{background:STATE_COLORS[sub.state]+'20',color:STATE_COLORS[sub.state],fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:20}}>
                  {STATE_LABELS[sub.state] || sub.state}
                </span>
                {(sub.state === 'draft' || sub.state === 'more_info_requested') && (
                  <Link to={`/kyc/${sub.id}`} style={{fontSize:12,color:'#2563eb'}}>Edit →</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
