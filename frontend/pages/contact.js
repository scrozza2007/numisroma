import React, { useState } from 'react';
import Head from 'next/head';
import { semantic } from '../utils/tokens';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const Contact = () => {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const validateField = (name, value) => {
    switch (name) {
      case 'name':    return value.length < 2  ? 'Name must be at least 2 characters' : '';
      case 'email':   return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Please enter a valid email address' : '';
      case 'subject': return value.length < 5  ? 'Subject must be at least 5 characters' : '';
      case 'message': return value.length < 20 ? 'Message must be at least 20 characters' : '';
      default: return '';
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    Object.keys(formData).forEach(key => { const err = validateField(key, formData[key]); if (err) newErrors[key] = err; });
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setIsLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          const ve = {};
          data.details.forEach(e => { ve[e.field] = e.message; });
          setErrors(ve);
        } else throw new Error(data.message || 'Something went wrong');
        return;
      }
      setFormData({ name: '', email: '', subject: '', message: '' });
      setErrors({});
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fieldCls = (hasError) =>
    `w-full px-3.5 py-2.5 font-sans text-sm bg-card rounded-md outline-none focus:border-amber transition-colors duration-150 text-text-primary ${hasError ? 'border border-[#fecaca]' : 'border border-border'}`;

  return (
    <div className="min-h-screen bg-canvas">
      <Head>
        <title>Contact — NumisRoma</title>
        <meta name="description" content="Contact the NumisRoma team for questions and support" />
      </Head>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="font-sans text-xs font-medium tracking-widest uppercase mb-3 text-amber">Get in Touch</p>
          <h1 className="font-display font-semibold text-4xl mb-2 text-text-primary">Contact Us</h1>
          <p className="font-sans text-sm text-text-muted">Have questions or feedback? We&apos;d love to hear from you.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Contact info */}
          <div className="md:col-span-2">
            <div className="p-6 space-y-6 bg-card border border-border rounded-lg">
              <h2 className="font-display font-semibold text-xl text-text-primary">Contact Information</h2>
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-amber-bg">
                    <svg className="w-4 h-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-sans text-sm font-medium text-text-primary">Email</p>
                    <p className="font-sans text-sm text-text-muted">info@numisroma.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-amber-bg">
                    <svg className="w-4 h-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-sans text-sm font-medium text-text-primary">Phone</p>
                    <p className="font-sans text-sm text-text-muted">+39 0783 515 123</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="md:col-span-3">
            <div className="p-6 bg-card border border-border rounded-lg">
              <h2 className="font-display font-semibold text-xl mb-6 text-text-primary">Send a Message</h2>

              {success && (
                <div className="mb-5 p-3.5 rounded-md flex items-start gap-3 text-sm animate-fade-in" style={{ backgroundColor: semantic.success.bg, border: '1px solid #bbf7d0', color: semantic.success.text }}>
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span className="font-sans">Message sent! We&apos;ll get back to you soon.</span>
                </div>
              )}

              {error && (
                <div className="mb-5 p-3.5 rounded-md flex items-start gap-3 text-sm" style={{ backgroundColor: semantic.error.bg, border: '1px solid #fecaca', color: semantic.error.text }}>
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span className="font-sans">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {[
                  { id: 'name',    label: 'Name',    type: 'text',  placeholder: 'Your name' },
                  { id: 'email',   label: 'Email',   type: 'email', placeholder: 'you@example.com' },
                  { id: 'subject', label: 'Subject', type: 'text',  placeholder: 'What is this about?' },
                ].map(({ id, label, type, placeholder }) => (
                  <div key={id}>
                    <label htmlFor={id} className="block font-sans text-sm font-medium mb-1.5 text-text-primary">{label}</label>
                    <input
                      type={type} id={id} name={id} value={formData[id]} onChange={handleChange} placeholder={placeholder}
                      className={fieldCls(errors[id])}
                    />
                    {errors[id] && <p className="mt-1 font-sans text-xs" style={{ color: semantic.error.border }}>{errors[id]}</p>}
                  </div>
                ))}

                <div>
                  <label htmlFor="message" className="block font-sans text-sm font-medium mb-1.5 text-text-primary">Message</label>
                  <textarea
                    id="message" name="message" rows={4} value={formData.message} onChange={handleChange}
                    placeholder="Your message (min. 20 characters)…"
                    className={`${fieldCls(errors.message)} resize-none`}
                  />
                  {errors.message && <p className="mt-1 font-sans text-xs" style={{ color: semantic.error.border }}>{errors.message}</p>}
                </div>

                <button
                  type="submit" disabled={isLoading}
                  className="w-full py-2.5 font-sans text-sm font-semibold flex items-center justify-center gap-2 rounded-md bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending…</>
                  ) : 'Send Message'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
