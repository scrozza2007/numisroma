import React from 'react';
import Link from 'next/link';
import { semantic } from '../../utils/tokens';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const CollectionsTab = ({ collections, profile, isOwnProfile }) => (
  <div className="mt-8 pb-16">
    <div className="flex justify-between items-center mb-6">
      <div>
        <h2 className="font-display font-semibold text-2xl text-text-primary">Collections</h2>
        <p className="font-sans text-sm mt-0.5 text-text-muted">Explore numismatic collections</p>
      </div>
      {isOwnProfile && (
        <Link
          href="/new-collection"
          className="flex items-center gap-1.5 px-4 py-2 font-sans text-sm font-semibold rounded-md bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          New Collection
        </Link>
      )}
    </div>

    {collections.length > 0 ? (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {collections.map(col => (
          <Link
            key={col._id}
            href={`/collection-detail?id=${col._id}`}
            className="flex flex-col overflow-hidden transition-all duration-200 bg-card border border-border rounded-lg hover:border-amber"
          >
            <div className="relative h-44 overflow-hidden bg-surface-alt">
              {col.image ? (
                <img
                  src={col.image.startsWith('http') ? col.image : `${API_URL}${col.image}`}
                  alt={col.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  width={400} height={176}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-16 h-16 flex items-center justify-center rounded-full bg-amber-bg">
                    <svg className="w-9 h-9 text-amber" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="3" />
                      <circle cx="32" cy="32" r="16" stroke="currentColor" strokeWidth="2" opacity="0.65" />
                      <path d="M24 34c2.5 3 6 5 8 5s5.5-2 8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M26 26h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              )}
              <div className="absolute top-3 left-3">
                <span className="font-sans text-xs px-2 py-0.5 rounded" style={{
                  backgroundColor: col.isPublic ? semantic.success.bg : 'var(--color-surface-alt)',
                  color: col.isPublic ? semantic.success.text : 'var(--color-text-muted)',
                  border: `1px solid ${col.isPublic ? semantic.success.border : 'var(--color-border)'}`,
                }}>
                  {col.isPublic ? 'Public' : 'Private'}
                </span>
              </div>
            </div>

            <div className="p-4 flex flex-col flex-1">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-display font-semibold text-base line-clamp-1 text-text-primary">{col.name}</h3>
                <svg className="w-4 h-4 shrink-0 ml-2 mt-0.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p className="font-sans text-xs leading-relaxed line-clamp-2 mb-3 flex-1 text-text-secondary">
                {col.description || 'A collection of ancient Roman coins'}
              </p>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex items-center gap-1.5 font-sans text-xs text-text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber" />
                  {col.coins?.length || 0} {col.coins?.length === 1 ? 'coin' : 'coins'}
                </div>
                <span className="font-sans text-xs text-text-muted">
                  {new Date(col.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    ) : (
      <div className="p-12 text-center bg-card border border-border rounded-lg">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-amber-bg">
          <svg className="w-8 h-8 text-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>

        <div className="flex justify-center gap-8 mb-6">
          {[
            { label: 'Collections', value: '0' },
            { label: 'Coins', value: '0' },
            { label: 'Member since', value: new Date(profile.createdAt).getFullYear() },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="font-display font-semibold text-xl text-amber">{value}</div>
              <div className="font-sans text-xs uppercase tracking-wide mt-0.5 text-text-muted">{label}</div>
            </div>
          ))}
        </div>

        <h3 className="font-display font-semibold text-xl mb-2 text-text-primary">No Collections</h3>
        <p className="font-sans text-sm mb-6 max-w-md mx-auto text-text-muted">
          {isOwnProfile
            ? 'Start your numismatic journey by creating your first Roman coin collection!'
            : "This user hasn't created any collections yet."}
        </p>
        {isOwnProfile && (
          <Link
            href="/new-collection"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 font-sans text-sm font-semibold rounded-md bg-amber text-[#fdf8f0] hover:bg-amber-hover transition-colors duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Collection
          </Link>
        )}
      </div>
    )}
  </div>
);

export default CollectionsTab;
