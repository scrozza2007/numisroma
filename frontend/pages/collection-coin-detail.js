import React, { useState, useEffect, useCallback, useContext } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { AuthContext } from '../context/AuthContext';
import { apiClient } from '../utils/apiClient';
import { semantic } from '../utils/tokens';

const CollectionCoinDetail = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useContext(AuthContext);
  const { id, collectionId, entryId, weight, diameter, grade, notes } = router.query;

  const [coin, setCoin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeImage, setActiveImage] = useState('obverse');
  const [isZoomed, setIsZoomed] = useState(false);
  const [collectionData, setCollectionData] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [editWeight, setEditWeight] = useState('');
  const [editDiameter, setEditDiameter] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [showImageEditModal, setShowImageEditModal] = useState(false);
  const [selectedObverseImage, setSelectedObverseImage] = useState(null);
  const [selectedReverseImage, setSelectedReverseImage] = useState(null);
  const [obversePreview, setObversePreview] = useState(null);
  const [reversePreview, setReversePreview] = useState(null);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [dragActiveObverse, setDragActiveObverse] = useState(false);
  const [dragActiveReverse, setDragActiveReverse] = useState(false);
  const [imageResetLoading, setImageResetLoading] = useState(false);

  const [customImages, setCustomImages] = useState({ obverse: null, reverse: null });
  const [customImagesLoaded, setCustomImagesLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=You must be logged in to access collection features');
    }
  }, [user, authLoading, router]);

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

  const fetchCollectionData = useCallback(async () => {
    try {
      const data = await apiClient.get(`/api/collections/${collectionId}`);
      setCollectionData(data);
    } catch {}
  }, [collectionId]);

  const fetchCustomImages = useCallback(async () => {
    if (!entryId) return;
    try {
      const customImageData = await apiClient.get(`/api/coins/entry/${entryId}/images`);
      if (customImageData) {
        const bust = customImageData.updatedAt ? `?v=${new Date(customImageData.updatedAt).getTime()}` : '';
        setCustomImages({
          obverse: customImageData.obverseImage ? `${process.env.NEXT_PUBLIC_API_URL}${customImageData.obverseImage}${bust}` : null,
          reverse: customImageData.reverseImage ? `${process.env.NEXT_PUBLIC_API_URL}${customImageData.reverseImage}${bust}` : null
        });
      } else {
        setCustomImages({ obverse: null, reverse: null });
      }
    } catch {
      setCustomImages({ obverse: null, reverse: null });
    } finally {
      setCustomImagesLoaded(true);
    }
  }, [entryId]);

  useEffect(() => {
    if (router.query.id && collectionId) {
      setCustomImages({ obverse: null, reverse: null });
      fetchCoinDetails();
      fetchCollectionData();
      if (entryId) fetchCustomImages();
    }
    // fetchCustomImages is excluded intentionally — it changes when entryId changes,
    // which is already in deps, avoiding a double-fire loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.id, collectionId, entryId]);

  const handleEditCoin = () => {
    setEditWeight(weight || '');
    setEditDiameter(diameter || '');
    setEditGrade(grade || '');
    setEditNotes(notes || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!coin || !coin._id) return;
    try {
      await apiClient.put(`/api/collections/${collectionId}/coins/${coin._id}`, {
        weight: editWeight || undefined,
        diameter: editDiameter || undefined,
        grade: editGrade || undefined,
        notes: editNotes || undefined
      });
      setShowEditModal(false);
      await fetchCustomImages();
      setNotification({ type: 'success', message: 'Data updated successfully' });
      router.replace({
        pathname: router.pathname,
        query: { id, collectionId, weight: editWeight || undefined, diameter: editDiameter || undefined, grade: editGrade || undefined, notes: editNotes || undefined }
      }, undefined, { shallow: true });
    } catch {
      setNotification({ type: 'error', message: 'Error while updating' });
    }
  };

  const handleDeleteCoin = async () => {
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/api/collections/${collectionId}/coins/${id}`);
      router.push(`/collection-detail?id=${collectionId}`);
    } catch (err) {
      setNotification({ show: true, message: err.message || 'Error removing coin from collection', type: 'error' });
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
      setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
    }
  };

  const handleImageClick = (side) => {
    const hasCustomImage = side === 'obverse' ? customImages.obverse : customImages.reverse;
    if (hasCustomImage) { setActiveImage(side); setIsZoomed(true); }
  };

  const handleImageChange = (file, type) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotification({ show: true, message: 'File size must be less than 5MB', type: 'error' });
      setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (type === 'obverse') { setSelectedObverseImage(file); setObversePreview(e.target.result); }
      else { setSelectedReverseImage(file); setReversePreview(e.target.result); }
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (type) => {
    if (type === 'obverse') { setSelectedObverseImage(null); setObversePreview(null); }
    else { setSelectedReverseImage(null); setReversePreview(null); }
  };

  const handleImageUpload = async () => {
    if (!selectedObverseImage && !selectedReverseImage) return;
    setImageUploadLoading(true);
    try {
      const formData = new FormData();
      if (selectedObverseImage) formData.append('obverse', selectedObverseImage);
      if (selectedReverseImage) formData.append('reverse', selectedReverseImage);
      await apiClient.postFormData(`/api/coins/entry/${entryId}/images`, formData);
      setNotification({ show: true, message: 'Images uploaded successfully!', type: 'success' });
      setShowImageEditModal(false);
      setSelectedObverseImage(null); setSelectedReverseImage(null);
      setObversePreview(null); setReversePreview(null);
      await fetchCustomImages();
    } catch (err) {
      setNotification({ show: true, message: err.message || 'Error uploading images', type: 'error' });
    } finally {
      setImageUploadLoading(false);
      setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
    }
  };

  const handleImageReset = async () => {
    setImageResetLoading(true);
    try {
      await apiClient.delete(`/api/coins/entry/${entryId}/images`);
      setNotification({ show: true, message: 'Images reset to catalog defaults successfully!', type: 'success' });
      setShowImageEditModal(false);
      setSelectedObverseImage(null); setSelectedReverseImage(null);
      setObversePreview(null); setReversePreview(null);
      await fetchCustomImages();
    } catch (err) {
      setNotification({ show: true, message: err.message || 'Error resetting images', type: 'error' });
    } finally {
      setImageResetLoading(false);
      setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
    }
  };

  const hasValidData = (data) => data && data !== '' && data !== 'N/A' && data !== 'n/a' && data !== null && data !== undefined;

  const renderField = (label, value) => {
    if (!hasValidData(value)) return null;
    return (
      <div key={label} className="p-3 rounded bg-surface-alt border border-border">
        <dt className="font-sans text-xs font-medium mb-0.5 text-text-muted">{label}</dt>
        <dd className="font-sans text-sm font-medium text-text-primary">{value}</dd>
      </div>
    );
  };

  const inputCls = 'w-full px-3 py-2 font-sans text-sm bg-surface border border-border rounded outline-none focus:border-amber transition-colors duration-150 text-text-primary';
  const selectCls = inputCls + ' cursor-pointer';

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  if (error || !coin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="font-display font-semibold text-2xl mb-4 text-text-primary">Coin not found</p>
          <Link href={`/collection-detail?id=${collectionId}`} className="font-sans text-sm text-amber hover:text-amber-hover transition-colors">Back to Collection</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Head>
        <title>{coin.name} — NumisRoma</title>
        <meta name="description" content={`Detailed view of ${coin.name} in your collection`} />
      </Head>

      {notification.show && (
        <div className="fixed top-6 right-6 z-50 p-3.5 flex items-start gap-2 font-sans text-sm rounded"
          style={{ backgroundColor: notification.type === 'success' ? semantic.success.bg : semantic.error.bg, border: `1px solid ${notification.type === 'success' ? semantic.success.border : semantic.error.border}`, color: notification.type === 'success' ? semantic.success.text : semantic.error.text, maxWidth: 320 }}>
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={notification.type === 'success' ? 'M5 13l4 4L19 7' : 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'} />
          </svg>
          {notification.message}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Breadcrumb + actions */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <nav className="flex items-center gap-2 font-sans text-sm text-text-muted">
            <Link href="/" className="text-text-secondary hover:text-amber transition-colors duration-150">Home</Link>
            <span>/</span>
            <Link href={`/profile?id=${user._id}`} className="text-text-secondary hover:text-amber transition-colors duration-150">Collections</Link>
            {collectionData && (
              <>
                <span>/</span>
                <Link href={`/collection-detail?id=${collectionId}`} className="text-text-secondary hover:text-amber transition-colors duration-150">{collectionData.name}</Link>
              </>
            )}
            <span>/</span>
            <span className="text-text-primary">{coin.name}</span>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href={`/collection-detail?id=${collectionId}`}
              className="flex items-center gap-1.5 px-4 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors duration-150"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </Link>
            <button
              onClick={handleEditCoin}
              className="flex items-center gap-1.5 px-3 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-amber transition-colors duration-150"
              title="Edit coin details"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 font-sans text-sm border border-red-200 rounded bg-red-50 text-red-700 hover:bg-red-100 transition-colors duration-150"
              title="Remove from collection"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remove
            </button>
          </div>
        </div>

        {/* Main card */}
        <div className="p-6 mb-6 bg-card border border-border rounded-md">
          <h1 className="font-display font-semibold text-3xl mb-3 text-text-primary">{coin.name}</h1>
          {collectionData && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-sans text-xs px-2 py-0.5 rounded bg-amber-bg text-amber border border-amber-light">
                {collectionData.name}
              </span>
              {hasValidData(coin.description?.date_range) && (
                <span className="font-sans text-xs px-2 py-0.5 rounded bg-surface-alt text-text-secondary border border-border">
                  {coin.description.date_range}
                </span>
              )}
              {hasValidData(coin.description?.material) && (
                <span className="font-sans text-xs px-2 py-0.5 rounded bg-surface-alt text-text-secondary border border-border">
                  {coin.description.material}
                </span>
              )}
              {hasValidData(coin.description?.denomination) && (
                <span className="font-sans text-xs px-2 py-0.5 rounded bg-surface-alt text-text-secondary border border-border">
                  {coin.description.denomination}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Images */}
          <div>
            <div className="p-5 bg-card border border-border rounded-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-xl text-text-primary">Coin Images</h2>
                <button
                  onClick={() => setShowImageEditModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-semibold rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit Images
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['obverse', 'reverse'].map(side => (
                  <div
                    key={side}
                    className="group relative aspect-square overflow-hidden flex items-center justify-center cursor-pointer rounded bg-surface-alt border border-border"
                    onClick={() => handleImageClick(side)}
                  >
                    {customImages[side] ? (
                      <img
                        src={customImages[side]} alt={`${side} - ${coin.name}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-4 text-text-muted">
                        <svg className="w-10 h-10 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="font-sans text-xs">Upload your own image</p>
                      </div>
                    )}
                    {customImages[side] && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[rgba(46,40,32,0.4)]">
                        <span className="font-sans text-xs font-medium text-white">Click to zoom</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 font-sans text-xs text-center text-text-muted">Click images to view larger</p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {(weight || diameter || grade || notes) && (
              <div className="p-5 bg-card border border-border rounded-md">
                <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Your Collection Details</h2>
                <div className="grid grid-cols-2 gap-3">
                  {renderField('Weight', weight ? `${weight} g` : null)}
                  {renderField('Diameter', diameter ? `${diameter} mm` : null)}
                  {renderField('Grade', grade)}
                  {renderField('Personal Notes', notes)}
                </div>
              </div>
            )}

            <div className="p-5 bg-card border border-border rounded-md">
              <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Imperial Information</h2>
              <div className="grid grid-cols-2 gap-3">
                {renderField('Emperor', coin.authority?.emperor)}
                {renderField('Dynasty', coin.authority?.dynasty)}
                {renderField('Period', coin.description?.date_range)}
                {renderField('Mint', coin.description?.mint)}
                {Object.entries(coin.authority || {})
                  .filter(([key, value]) => !['emperor','dynasty'].includes(key) && hasValidData(value) && typeof value !== 'object')
                  .map(([key, value]) => renderField(key.replace(/_/g,' ').replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()).trim(), value))}
              </div>
            </div>

            <div className="p-5 bg-card border border-border rounded-md">
              <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Physical Characteristics</h2>
              <div className="grid grid-cols-2 gap-3">
                {renderField('Denomination', coin.description?.denomination)}
                {renderField('Material', coin.description?.material)}
                {renderField('Weight', coin.description?.weight)}
                {renderField('Diameter', coin.description?.diameter)}
                {renderField('Axis', coin.description?.axis)}
                {renderField('Edge', coin.description?.edge)}
                {renderField('Shape', coin.description?.shape)}
                {Object.entries(coin.description || {})
                  .filter(([key, value]) => !['date_range','mint','denomination','material','weight','diameter','axis','edge','shape','notes'].includes(key) && hasValidData(value) && typeof value !== 'object')
                  .map(([key, value]) => renderField(key.replace(/_/g,' ').replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()).trim(), value))}
              </div>
            </div>
          </div>
        </div>

        {/* Obverse/Reverse details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {[
            { title: 'Obverse Details', data: coin.obverse, coreFields: ['legend','type','portrait','deity'], extraExclude: ['legend','type','portrait','deity','image','license','credits'] },
            { title: 'Reverse Details', data: coin.reverse, coreFields: ['legend','type','portrait','deity','mintmark','officinamark'], extraExclude: ['legend','type','portrait','deity','mintmark','officinamark','image','license','credits'] },
          ].map(({ title, data, coreFields, extraExclude }) => (
            <div key={title} className="p-5 bg-card border border-border rounded-md">
              <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">{title}</h2>
              <div className="space-y-2">
                {coreFields.map(f => renderField(f.charAt(0).toUpperCase() + f.slice(1), data?.[f]))}
                {Object.entries(data || {})
                  .filter(([key, value]) => !extraExclude.includes(key) && hasValidData(value) && typeof value !== 'object')
                  .map(([key, value]) => renderField(key.replace(/_/g,' ').replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()).trim(), value))}
                {renderField('Image Credits', data?.credits)}
                {renderField('Image License', data?.license)}
              </div>
            </div>
          ))}
        </div>

        {/* Additional info */}
        {Object.keys(coin).some(key => !['_id','name','description','authority','obverse','reverse','__v'].includes(key) && hasValidData(coin[key]) && typeof coin[key] !== 'object') && (
          <div className="p-5 mt-6 bg-card border border-border rounded-md">
            <h2 className="font-display font-semibold text-xl mb-4 text-text-primary">Additional Information</h2>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(coin)
                .filter(([key, value]) => !['_id','name','description','authority','obverse','reverse','__v'].includes(key) && hasValidData(value) && typeof coin[key] !== 'object')
                .map(([key, value]) => renderField(key.replace(/_/g,' ').replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()).trim(), value))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(46,40,32,0.6)]">
          <div className="w-full max-w-md bg-card border border-border rounded-md">
            <div className="p-5 border-b border-border">
              <h2 className="font-display font-semibold text-xl text-text-primary">Edit Coin Details</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Weight (g)', value: editWeight, setter: setEditWeight, type: 'number', step: '0.01' },
                  { label: 'Diameter (mm)', value: editDiameter, setter: setEditDiameter, type: 'number', step: '0.1' },
                ].map(({ label, value, setter, type, step }) => (
                  <div key={label}>
                    <label className="block font-sans text-xs font-medium mb-1 text-text-secondary">{label}</label>
                    <input type={type} step={step} value={value} onChange={e => setter(e.target.value)} className={inputCls} />
                  </div>
                ))}
              </div>
              <div>
                <label className="block font-sans text-xs font-medium mb-1 text-text-secondary">Grade</label>
                <select value={editGrade} onChange={e => setEditGrade(e.target.value)} className={selectCls}>
                  <option value="">Select grade…</option>
                  {['Poor (P)','Fair (F)','Very Good (VG)','Fine (F)','Very Fine (VF)','Extremely Fine (EF)','About Uncirculated (AU)','Uncirculated (UNC)'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-sans text-xs font-medium mb-1 text-text-secondary">Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit} disabled={editLoading}
                  className="flex-1 py-2 font-sans text-sm font-semibold rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150 disabled:opacity-50"
                >
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(46,40,32,0.6)]">
          <div className="w-full max-w-md p-6 bg-card border border-border rounded-md">
            <h2 className="font-display font-semibold text-xl mb-3 text-text-primary">Remove from Collection</h2>
            <p className="font-sans text-sm mb-6 text-text-secondary">
              Are you sure you want to remove &quot;{coin.name}&quot; from your collection? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCoin} disabled={deleteLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 font-sans text-sm font-semibold rounded bg-red-700 text-white hover:bg-red-800 transition-colors duration-150 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <><div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-t-transparent border-white" />Removing…</>
                ) : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Edit Modal */}
      {showImageEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-[rgba(46,40,32,0.8)]"
          onClick={e => e.target === e.currentTarget && setShowImageEditModal(false)}
        >
          <div className="relative w-full max-w-2xl my-4 bg-card border border-border rounded-md">
            <button
              onClick={() => setShowImageEditModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-alt text-text-secondary hover:bg-border transition-colors duration-150"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="p-6">
              <h2 className="font-display font-semibold text-2xl mb-1 text-text-primary">Edit Coin Images</h2>
              <p className="font-sans text-sm mb-5 text-text-muted">Upload custom images for this coin in your collection</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                {[
                  { side: 'obverse', label: 'Obverse (Front)', preview: obversePreview, dragActive: dragActiveObverse, setDragActive: setDragActiveObverse },
                  { side: 'reverse', label: 'Reverse (Back)', preview: reversePreview, dragActive: dragActiveReverse, setDragActive: setDragActiveReverse },
                ].map(({ side, label, preview, dragActive: da, setDragActive: sda }) => (
                  <div key={side}>
                    <h3 className="font-sans font-semibold text-sm mb-2 text-text-primary">{label}</h3>
                    <div
                      className="relative p-5 text-center transition-colors duration-150 rounded"
                      style={{
                        border: `2px dashed ${da ? '#b8843a' : '#e8e0d0'}`,
                        backgroundColor: da ? '#f0e8d4' : '#faf4ea',
                      }}
                      onDragEnter={e => { e.preventDefault(); sda(true); }}
                      onDragLeave={e => { e.preventDefault(); sda(false); }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault(); sda(false);
                        if (e.dataTransfer.files.length > 0) handleImageChange(e.dataTransfer.files[0], side);
                      }}
                    >
                      <input
                        type="file" accept="image/*"
                        onChange={e => handleImageChange(e.target.files[0], side)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {preview ? (
                        <div>
                          <img src={preview} alt={`${side} preview`} className="w-full h-28 object-contain mx-auto rounded" />
                          <p className="mt-2 font-sans text-xs font-medium" style={{ color: semantic.success.text }}>Image selected</p>
                        </div>
                      ) : (
                        <div>
                          <svg className="w-10 h-10 mx-auto mb-2 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="font-sans text-xs text-text-muted">Click or drag to upload {side} image</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <button
                  onClick={handleImageReset} disabled={imageUploadLoading || imageResetLoading}
                  className="px-4 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors duration-150 disabled:opacity-50"
                >
                  {imageResetLoading ? 'Resetting…' : 'Reset to Catalog Images'}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowImageEditModal(false)}
                    className="px-4 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-border-strong transition-colors duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImageUpload}
                    disabled={imageUploadLoading || (!selectedObverseImage && !selectedReverseImage)}
                    className="px-5 py-2 font-sans text-sm font-semibold rounded bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {imageUploadLoading ? 'Uploading…' : 'Upload Images'}
                  </button>
                </div>
              </div>
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
          <div className="relative w-full max-w-2xl bg-card border border-border rounded-md p-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-surface-alt text-text-secondary hover:bg-border transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <Image
              src={activeImage === 'obverse' ? (customImages.obverse || '/images/coin-placeholder.svg') : (customImages.reverse || '/images/coin-placeholder.svg')}
              alt={`${activeImage} - ${coin.name}`}
              width={800} height={800}
              className="w-full h-auto object-contain"
              style={{ maxHeight: '80vh' }}
              priority
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionCoinDetail;
