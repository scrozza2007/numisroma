import React, { useState, useEffect, useCallback, useContext } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { AuthContext } from '../context/AuthContext';
import { apiClient } from '../utils/apiClient';
import { semantic } from '../utils/tokens';

const CoinDetail = () => {
  const router = useRouter();
  const { user } = useContext(AuthContext);
  const { id } = router.query;

  const [coin, setCoin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState('obverse');
  const [isZoomed, setIsZoomed] = useState(false);
  const [hasFilters, setHasFilters] = useState(false);

  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [userCollections, setUserCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [coinWeight, setCoinWeight] = useState('');
  const [coinDiameter, setCoinDiameter] = useState('');
  const [coinGrade, setCoinGrade] = useState('');
  const [coinNotes, setCoinNotes] = useState('');
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  useEffect(() => {
    document.body.style.overflow = showAddToCollection ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [showAddToCollection]);

  const fetchCoinDetails = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get(`/api/coins/${id}`);
      setCoin(data);
    } catch {
      setError('An error occurred while loading the coin. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchUserCollections = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiClient.get(`/api/collections/user/${user._id}`);
      setUserCollections(data);
    } catch {}
  }, [user]);

  useEffect(() => {
    if (router.query.id) {
      fetchCoinDetails();
    }
    setHasFilters(!!localStorage.getItem('coinFilters'));
    if (user) fetchUserCollections();
  }, [router.query.id, fetchCoinDetails, fetchUserCollections, user]);

  const handleAddToCollection = async () => {
    setAddingToCollection(true);
    try {
      await apiClient.post(`/api/collections/${selectedCollection}/coins`, {
        coin: id,
        weight: coinWeight || undefined,
        diameter: coinDiameter || undefined,
        grade: coinGrade || undefined,
        notes: coinNotes || undefined
      });
      setNotification({ show: true, message: 'Coin added to collection successfully!', type: 'success' });
      setShowAddToCollection(false);
      setSelectedCollection(''); setCoinWeight(''); setCoinDiameter(''); setCoinGrade(''); setCoinNotes('');
    } catch (err) {
      setNotification({ show: true, message: err.message || 'Error adding coin to collection', type: 'error' });
    } finally {
      setAddingToCollection(false);
      setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
    }
  };

  const handleBackToResults = (e) => {
    e.preventDefault();
    const savedPage = localStorage.getItem('coinCurrentPage');
    router.push(savedPage ? `/browse?page=${savedPage}` : '/browse');
  };

  const hasValidData = (data) => data && data !== '' && data !== 'N/A' && data !== 'n/a' && data !== null && data !== undefined;

  const renderField = (label, value) => {
    if (!hasValidData(value)) return null;
    return (
      <div key={label} className="p-3 rounded bg-surface-alt border border-border">
        <dt className="font-sans text-xs font-medium mb-0.5 text-amber">{label}</dt>
        <dd className="font-sans text-sm text-text-primary">{value}</dd>
      </div>
    );
  };

  const formatKey = (key) => key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();

  const inputCls = 'w-full px-3 py-2 font-sans text-sm bg-card text-text-primary border border-border rounded outline-none focus:border-amber transition-colors duration-150';
  const selectCls = inputCls + ' cursor-pointer';

  return (
    <div className="min-h-screen bg-canvas">
      <Head>
        <title>{coin ? `${coin.name} — NumisRoma` : 'Coin Detail — NumisRoma'}</title>
        <meta name="description" content={coin ? `Detailed information about ${coin.name}` : 'Coin detail page'} />
      </Head>

      {/* Inline notification */}
      {notification.show && (
        <div
          className="fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded animate-fade-in"
          style={{
            backgroundColor: notification.type === 'success' ? semantic.success.bg : semantic.error.bg,
            border: `1px solid ${notification.type === 'success' ? semantic.success.border : semantic.error.border}`,
            color: notification.type === 'success' ? semantic.success.text : semantic.error.text,
            borderRadius: 6, boxShadow: '0 4px 12px rgba(46,40,32,0.10)',
          }}
        >
          {notification.type === 'success'
            ? <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
            : <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
          }
          <span className="font-sans text-sm">{notification.message}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto py-10 px-6">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 p-4 rounded bg-red-50 border border-red-200 text-red-700">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span className="font-sans text-sm">{error}</span>
          </div>
        ) : coin ? (
          <>
            {/* Top bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
              <nav className="flex items-center gap-2 font-sans text-sm text-text-muted">
                <Link href="/" className="text-text-muted hover:text-amber transition-colors duration-150">Home</Link>
                <span>/</span>
                <Link href="/browse" className="text-text-muted hover:text-amber transition-colors duration-150">Browse</Link>
                <span>/</span>
                <span className="text-text-primary">{coin.name}</span>
              </nav>
              <div className="flex items-center gap-3">
                {hasFilters && (
                  <button
                    onClick={handleBackToResults}
                    className="flex items-center gap-1.5 px-4 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors duration-150"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                    Back to results
                  </button>
                )}
                {user && (
                  <button
                    onClick={() => setShowAddToCollection(true)}
                    className="flex items-center gap-1.5 px-4 py-2 font-sans text-sm font-semibold rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                    Add to Collection
                  </button>
                )}
              </div>
            </div>

            {/* Main card */}
            <div className="bg-card border border-border rounded-md">
              {/* Header */}
              <div className="p-6 sm:p-8 border-b border-border">
                <h1 className="font-display font-semibold text-3xl sm:text-4xl mb-3 text-text-primary">{coin.name}</h1>
                <div className="flex flex-wrap gap-2">
                  {hasValidData(coin.description?.date_range) && (
                    <span className="font-sans text-xs px-3 py-1 rounded-full bg-surface-alt border border-border text-text-secondary">{coin.description.date_range}</span>
                  )}
                  {hasValidData(coin.description?.material) && (
                    <span className="font-sans text-xs px-3 py-1 rounded-full bg-surface-alt border border-border text-text-secondary">{coin.description.material}</span>
                  )}
                  {hasValidData(coin.description?.denomination) && (
                    <span className="font-sans text-xs px-3 py-1 rounded-full bg-surface-alt border border-border text-text-secondary">{coin.description.denomination}</span>
                  )}
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Images */}
                  <div>
                    <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Coin Images</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {['obverse', 'reverse'].map((side) => (
                        <div
                          key={side}
                          className="group relative aspect-square cursor-pointer rounded-md overflow-hidden flex items-center justify-center bg-surface border border-border"
                          onClick={() => { setActiveImage(side); setIsZoomed(true); }}
                        >
                          <Image
                            src={coin[side]?.image ? (coin[side].image.startsWith('http') ? coin[side].image : `${process.env.NEXT_PUBLIC_API_URL}${coin[side].image}`) : '/images/coin-placeholder.jpg'}
                            alt={`${side === 'obverse' ? 'Obverse' : 'Reverse'} — ${coin.name}`}
                            width={400} height={400}
                            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                            priority
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[rgba(46,40,32,0.5)]">
                            <span className="font-sans text-xs text-white px-3 py-1 rounded-full border border-[rgba(255,255,240,0.4)]">Click to zoom</span>
                          </div>
                          <div className="absolute bottom-2 left-0 right-0 text-center">
                            <span className="font-sans text-xs capitalize text-text-muted">{side}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Imperial & Physical info */}
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Imperial Information</h2>
                      <div className="grid grid-cols-2 gap-2">
                        {renderField('Emperor', coin.authority?.emperor)}
                        {renderField('Dynasty', coin.authority?.dynasty)}
                        {renderField('Period', coin.description?.date_range)}
                        {renderField('Mint', coin.description?.mint)}
                        {Object.entries(coin.authority || {})
                          .filter(([key, val]) => !['emperor', 'dynasty'].includes(key) && hasValidData(val) && typeof val !== 'object')
                          .map(([key, val]) => renderField(formatKey(key), val))}
                      </div>
                    </div>

                    <div>
                      <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Physical Characteristics</h2>
                      <div className="grid grid-cols-2 gap-2">
                        {renderField('Denomination', coin.description?.denomination)}
                        {renderField('Material', coin.description?.material)}
                        {renderField('Weight', coin.description?.weight)}
                        {renderField('Diameter', coin.description?.diameter)}
                        {renderField('Axis', coin.description?.axis)}
                        {renderField('Edge', coin.description?.edge)}
                        {renderField('Shape', coin.description?.shape)}
                        {Object.entries(coin.description || {})
                          .filter(([key, val]) => !['date_range','mint','denomination','material','weight','diameter','axis','edge','shape','notes'].includes(key) && hasValidData(val) && typeof val !== 'object')
                          .map(([key, val]) => renderField(formatKey(key), val))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Obverse & Reverse Details */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                  {['obverse', 'reverse'].map((side) => (
                    <div key={side}>
                      <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">{side === 'obverse' ? 'Obverse' : 'Reverse'} Details</h2>
                      <div className="space-y-2">
                        {renderField('Legend', coin[side]?.legend)}
                        {renderField('Type', coin[side]?.type)}
                        {renderField('Portrait', coin[side]?.portrait)}
                        {renderField('Deity', coin[side]?.deity)}
                        {side === 'reverse' && renderField('Mintmark', coin.reverse?.mintmark)}
                        {side === 'reverse' && renderField('Officina Mark', coin.reverse?.officinamark)}
                        {Object.entries(coin[side] || {})
                          .filter(([key, val]) => !['legend','type','portrait','deity','mintmark','officinamark','image','license','credits'].includes(key) && hasValidData(val) && typeof val !== 'object')
                          .map(([key, val]) => renderField(formatKey(key), val))}
                        {renderField('Image Credits', coin[side]?.credits)}
                        {renderField('Image License', coin[side]?.license)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Additional top-level fields */}
                {Object.keys(coin).some(key => !['_id','name','description','authority','obverse','reverse','__v'].includes(key) && hasValidData(coin[key]) && typeof coin[key] !== 'object') && (
                  <div className="bg-card border border-border rounded-md p-6 mt-6">
                    <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Additional Information</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(coin)
                        .filter(([key, val]) => !['_id','name','description','authority','obverse','reverse','__v'].includes(key) && hasValidData(val) && typeof val !== 'object')
                        .map(([key, val]) => renderField(formatKey(key), val))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Add to Collection Modal */}
            {showAddToCollection && user && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(46,40,32,0.6)]"
                onClick={(e) => { if (e.target === e.currentTarget) setShowAddToCollection(false); }}
              >
                <div className="w-full max-w-md animate-fade-in bg-card border border-border rounded-md shadow-xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-6 border-b border-border">
                    <div>
                      <h2 className="font-display font-semibold text-xl text-text-primary">Add to Collection</h2>
                      <p className="font-sans text-sm mt-1 text-text-muted">&ldquo;{coin?.name}&rdquo;</p>
                    </div>
                    <button onClick={() => setShowAddToCollection(false)} className="text-text-muted hover:text-text-primary transition-colors duration-150">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>

                  <div className="p-6">
                    {userCollections.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-amber-bg">
                          <svg className="w-6 h-6 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                        </div>
                        <h3 className="font-display font-semibold text-lg mb-2 text-text-primary">No Collections Yet</h3>
                        <p className="font-sans text-sm mb-6 text-text-muted">Create your first collection to start adding coins.</p>
                        <Link
                          href={`/new-collection?coinId=${coin._id}`}
                          className="inline-flex items-center gap-2 px-5 py-2.5 font-sans text-sm font-semibold rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                          Create First Collection
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block font-sans text-sm font-medium mb-1.5 text-text-primary">Select Collection</label>
                          <select value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)} className={selectCls}>
                            <option value="">Choose a collection…</option>
                            {userCollections.map((col) => (
                              <option key={col._id} value={col._id}>{col.name} ({col.coins?.length || 0} coins)</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block font-sans text-sm font-medium mb-1.5 text-text-primary">Weight (g)</label>
                            <input type="number" step="0.01" value={coinWeight} onChange={e => setCoinWeight(e.target.value)} placeholder="e.g. 3.2" className={inputCls} />
                          </div>
                          <div>
                            <label className="block font-sans text-sm font-medium mb-1.5 text-text-primary">Diameter (mm)</label>
                            <input type="number" step="0.1" value={coinDiameter} onChange={e => setCoinDiameter(e.target.value)} placeholder="e.g. 19.5" className={inputCls} />
                          </div>
                        </div>
                        <div>
                          <label className="block font-sans text-sm font-medium mb-1.5 text-text-primary">Condition Grade</label>
                          <select value={coinGrade} onChange={e => setCoinGrade(e.target.value)} className={selectCls}>
                            <option value="">Select grade…</option>
                            {['Poor (P)','Fair (F)','Very Good (VG)','Fine (F)','Very Fine (VF)','Extremely Fine (EF)','About Uncirculated (AU)','Uncirculated (UNC)'].map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block font-sans text-sm font-medium mb-1.5 text-text-primary">Personal Notes</label>
                          <textarea value={coinNotes} onChange={e => setCoinNotes(e.target.value)} placeholder="Provenance, condition notes…" rows={3} className={inputCls + ' resize-none'} />
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button
                            onClick={() => setShowAddToCollection(false)}
                            className="flex-1 py-2.5 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors duration-150"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddToCollection}
                            disabled={addingToCollection || !selectedCollection}
                            className="flex-1 py-2.5 font-sans text-sm font-semibold flex items-center justify-center gap-2 rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {addingToCollection ? (
                              <><div className="animate-spin rounded-full h-4 w-4 border-2 border-[#fdf8f0] border-t-transparent" />Adding…</>
                            ) : 'Add to Collection'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Zoom Modal */}
            {isZoomed && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(46,40,32,0.9)]"
                onClick={() => setIsZoomed(false)}
              >
                <div className="relative max-w-3xl w-full animate-fade-in bg-card rounded-md" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setIsZoomed(false)}
                    className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center rounded-full bg-card border border-border text-text-secondary hover:bg-surface-alt transition-colors duration-150"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  <div className="p-6">
                    <Image
                      src={coin[activeImage]?.image ? (coin[activeImage].image.startsWith('http') ? coin[activeImage].image : `${process.env.NEXT_PUBLIC_API_URL}${coin[activeImage].image}`) : '/images/coin-placeholder.jpg'}
                      alt={`${activeImage} — ${coin.name}`}
                      width={800} height={800}
                      className="w-full h-auto object-contain"
                      style={{ maxHeight: '75vh' }}
                      priority
                    />
                  </div>
                  <div className="px-6 pb-4 text-center font-sans text-sm capitalize text-text-muted">
                    {activeImage} view — {coin.name}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default CoinDetail;
