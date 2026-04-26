import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

const STATE_COLORS = {
  submitted: '#3b82f6', under_review: '#f59e0b',
};

export default function ReviewerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/dashboard/').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{padding:32,textAlign:'center',color:'#64748b'}}>Loading dashboard...</div>;
  if (!data) return <div style={{padding:32,color:'#ef4444'}}>Failed to load dashboard.</div>;

  const { metrics, queue } = data;

  return (
    <div style={{maxWidth:1000,margin:'0 auto',padding:32}}>
      <h1 style={{fontSize:22,fontWeight:700,margin:'0 0 4px'}}>Review Queue</h1>
      <p style={{fontSize:13,color:'#64748b',margin:'0 0 24px'}}>Submissions awaiting review, oldest first</p>

      {/* Metrics */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:32}}>
        {[
          { label: 'In Queue', value: metrics.total_in_queue, color: '#3b82f6' },
          { label: 'Avg Time (hours)', value: metrics.avg_time_in_queue_hours, color: '#f59e0b' },
          { label: 'Approval Rate (7d)', value: metrics.approval_rate_last_7_days != null ? `${metrics.approval_rate_last_7_days}%` : 'N/A', color: '#10b981' },
        ].map(m => (
          <div key={m.label} style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:20}}>
            <p style={{fontSize:12,color:'#64748b',margin:'0 0 6px'}}>{m.label}</p>
            <p style={{fontSize:28,fontWeight:700,color:m.color,margin:0}}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Queue */}
      {queue.length === 0 ? (
        <div style={{textAlign:'center',padding:48,background:'white',borderRadius:12,border:'1px solid #e2e8f0'}}>
          <p style={{color:'#10b981',fontWeight:600,fontSize:16}}>✓ Queue is empty — all caught up!</p>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {queue.map(sub => (
            <Link key={sub.id} to={`/reviewer/submission/${sub.id}`}
              style={{background:'white',borderRadius:12,border:`1px solid ${sub.is_at_risk ? '#fca5a5' : '#e2e8f0'}`,padding:20,display:'flex',justifyContent:'space-between',alignItems:'center',textDecoration:'none',color:'inherit'}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontWeight:600}}>{sub.business_name || 'Unnamed Business'}</span>
                  <span style={{fontSize:12,color:'#94a3b8'}}>#{sub.id}</span>
                  {sub.is_at_risk && (
                    <span style={{background:'#fef2f2',color:'#dc2626',fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:20}}>
                      ⚠ AT RISK (24h+)
                    </span>
                  )}
                </div>
                <div style={{fontSize:13,color:'#64748b'}}>
                  {sub.merchant_username} · {sub.full_name || 'No name'} · ${sub.expected_monthly_volume || '—'}/mo
                </div>
                {sub.submitted_at && (
                  <div style={{fontSize:12,color:'#94a3b8',marginTop:4}}>
                    Submitted: {new Date(sub.submitted_at).toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{background:STATE_COLORS[sub.state]+'20',color:STATE_COLORS[sub.state],fontSize:12,fontWeight:600,padding:'4px 10px',borderRadius:20}}>
                  {sub.state.replace('_',' ')}
                </span>
                <span style={{color:'#94a3b8',fontSize:18}}>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
