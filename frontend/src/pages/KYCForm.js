import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';

const STEPS = ['Personal', 'Business', 'Documents', 'Review'];

export default function KYCForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submissionId, setSubmissionId] = useState(id || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [personal, setPersonal] = useState({ full_name: '', email: '', phone: '' });
  const [business, setBusiness] = useState({ business_name: '', business_type: '', expected_monthly_volume: '' });
  const [docs, setDocs] = useState({ pan_document: null, aadhaar_document: null, bank_statement: null });
  const [submission, setSubmission] = useState(null);

  useEffect(() => {
    if (id) {
      client.get(`/submissions/${id}/`).then(r => {
        const s = r.data;
        setSubmission(s);
        setPersonal({ full_name: s.full_name||'', email: s.email||'', phone: s.phone||'' });
        setBusiness({ business_name: s.business_name||'', business_type: s.business_type||'', expected_monthly_volume: s.expected_monthly_volume||'' });
      });
    }
  }, [id]);

  const canEdit = !submission || submission.state === 'draft' || submission.state === 'more_info_requested';

  const save = async (finalSubmit = false) => {
    setLoading(true); setError('');
    try {
      const formData = new FormData();
      Object.entries(personal).forEach(([k,v]) => formData.append(k, v));
      Object.entries(business).forEach(([k,v]) => { if(v) formData.append(k, v); });
      Object.entries(docs).forEach(([k,v]) => { if(v) formData.append(k, v); });

      let resp;
      if (submissionId) {
        resp = await client.patch(`/submissions/${submissionId}/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        resp = await client.post('/submissions/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setSubmissionId(resp.data.id);
      }

      if (finalSubmit) {
        await client.post(`/submissions/${resp.data.id}/transition/`, { new_state: 'submitted' });
        setSuccess('KYC submitted successfully! We will review it shortly.');
        setTimeout(() => navigate('/merchant'), 2000);
      } else {
        setSuccess('Progress saved!');
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch (err) {
      const d = err.response?.data;
      setError(d?.error || (typeof d === 'object' ? JSON.stringify(d) : 'Save failed'));
    } finally { setLoading(false); }
  };

  const inp = (style={}) => ({
    width:'100%', border:'1px solid #cbd5e1', borderRadius:8, padding:'8px 12px',
    fontSize:14, outline:'none', boxSizing:'border-box', ...style
  });

  return (
    <div style={{maxWidth:640,margin:'0 auto',padding:32}}>
      <h1 style={{fontSize:22,fontWeight:700,margin:'0 0 4px'}}>KYC Verification</h1>
      <p style={{fontSize:13,color:'#64748b',margin:'0 0 24px'}}>Complete all steps to submit for review</p>

      {/* Step indicator */}
      <div style={{display:'flex',gap:8,marginBottom:32}}>
        {STEPS.map((s,i) => (
          <div key={s} onClick={() => canEdit && setStep(i)} style={{flex:1,textAlign:'center',cursor:canEdit?'pointer':'default'}}>
            <div style={{height:4,borderRadius:4,background:i<=step?'#2563eb':'#e2e8f0',marginBottom:6}} />
            <span style={{fontSize:11,color:i===step?'#2563eb':'#94a3b8',fontWeight:i===step?600:400}}>{s}</span>
          </div>
        ))}
      </div>

      {!canEdit && (
        <div style={{background:'#fef3c7',color:'#92400e',padding:'10px 14px',borderRadius:8,marginBottom:20,fontSize:13}}>
          This submission is in <strong>{submission?.state}</strong> state and cannot be edited.
        </div>
      )}

      {error && <div style={{background:'#fef2f2',color:'#b91c1c',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>{error}</div>}
      {success && <div style={{background:'#f0fdf4',color:'#166534',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>{success}</div>}

      <div style={{background:'white',borderRadius:12,border:'1px solid #e2e8f0',padding:24}}>
        {step === 0 && (
          <div>
            <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 16px'}}>Personal Details</h2>
            {[['full_name','Full Name','text'],['email','Email','email'],['phone','Phone Number','tel']].map(([k,label,type]) => (
              <div key={k} style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>{label}</label>
                <input type={type} style={inp()} value={personal[k]} disabled={!canEdit}
                  onChange={e => setPersonal({...personal,[k]:e.target.value})} />
              </div>
            ))}
          </div>
        )}
        {step === 1 && (
          <div>
            <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 16px'}}>Business Details</h2>
            <div style={{marginBottom:14}}>
              <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Business Name</label>
              <input style={inp()} value={business.business_name} disabled={!canEdit}
                onChange={e => setBusiness({...business,business_name:e.target.value})} />
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Business Type</label>
              <select style={inp()} value={business.business_type} disabled={!canEdit}
                onChange={e => setBusiness({...business,business_type:e.target.value})}>
                <option value="">Select type</option>
                {['Freelancer','Agency','E-commerce','SaaS','Consulting','Other'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>Expected Monthly Volume (USD)</label>
              <input type="number" style={inp()} value={business.expected_monthly_volume} disabled={!canEdit}
                onChange={e => setBusiness({...business,expected_monthly_volume:e.target.value})} />
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 4px'}}>Documents</h2>
            <p style={{fontSize:12,color:'#64748b',margin:'0 0 16px'}}>PDF, JPG, or PNG only. Max 5 MB each.</p>
            {[['pan_document','PAN Card'],['aadhaar_document','Aadhaar Card'],['bank_statement','Bank Statement']].map(([k,label]) => (
              <div key={k} style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:4}}>{label}</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={!canEdit}
                  style={{fontSize:13,color:'#374151'}}
                  onChange={e => setDocs({...docs,[k]:e.target.files[0]||null})} />
                {submission?.[k] && !docs[k] && (
                  <p style={{fontSize:12,color:'#10b981',marginTop:4}}>✓ Document already uploaded</p>
                )}
              </div>
            ))}
          </div>
        )}
        {step === 3 && (
          <div>
            <h2 style={{fontSize:16,fontWeight:600,margin:'0 0 16px'}}>Review & Submit</h2>
            <div style={{background:'#f8fafc',borderRadius:8,padding:16,fontSize:13,marginBottom:16}}>
              <p><strong>Name:</strong> {personal.full_name || '—'}</p>
              <p><strong>Email:</strong> {personal.email || '—'}</p>
              <p><strong>Phone:</strong> {personal.phone || '—'}</p>
              <p><strong>Business:</strong> {business.business_name || '—'} ({business.business_type || '—'})</p>
              <p><strong>Volume:</strong> ${business.expected_monthly_volume || '—'}/month</p>
            </div>
            <p style={{fontSize:13,color:'#64748b'}}>
              By submitting, you confirm all information is accurate. You can save as draft to continue later.
            </p>
          </div>
        )}
      </div>

      <div style={{display:'flex',justifyContent:'space-between',marginTop:20}}>
        <button onClick={() => step > 0 ? setStep(step-1) : navigate('/merchant')}
          style={{background:'white',border:'1px solid #cbd5e1',borderRadius:8,padding:'9px 18px',fontSize:14,cursor:'pointer'}}>
          {step === 0 ? 'Cancel' : '← Back'}
        </button>
        <div style={{display:'flex',gap:10}}>
          {canEdit && (
            <button onClick={() => save(false)} disabled={loading}
              style={{background:'white',border:'1px solid #2563eb',color:'#2563eb',borderRadius:8,padding:'9px 18px',fontSize:14,cursor:'pointer',opacity:loading?0.6:1}}>
              Save Draft
            </button>
          )}
          {step < 3 ? (
            <button onClick={() => setStep(step+1)}
              style={{background:'#2563eb',color:'white',border:'none',borderRadius:8,padding:'9px 18px',fontSize:14,fontWeight:500,cursor:'pointer'}}>
              Next →
            </button>
          ) : canEdit ? (
            <button onClick={() => save(true)} disabled={loading}
              style={{background:'#10b981',color:'white',border:'none',borderRadius:8,padding:'9px 18px',fontSize:14,fontWeight:500,cursor:'pointer',opacity:loading?0.6:1}}>
              {loading ? 'Submitting...' : 'Submit KYC'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
