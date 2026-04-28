import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import CustomDropdown from '../components/CustomDropdown';
import AutocompleteDropdown from '../components/AutocompleteDropdown';
import PeriodRangeSlider from '../components/PeriodRangeSlider';
import Image from 'next/image';

const Browse = () => {
  const router = useRouter();
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    keyword: '', material: '', emperor: '', dynasty: '',
    denomination: '', mint: '', date_range: '', portrait: '', deity: '',
    startYear: undefined, endYear: undefined, sortBy: 'name', order: 'asc'
  });
  const [filterOptions, setFilterOptions] = useState({ materials: [], emperors: [], dynasties: [], denominations: [], mints: [], deities: [] });
  const [periodRange, setPeriodRange] = useState({ minYear: -31, maxYear: 491 });
  const isFirstLoadRef = useRef(true);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [optionsRes, dateRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/coins/filter-options`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/coins/date-ranges`)
      ]);
      if (optionsRes.ok) setFilterOptions(await optionsRes.json());
      if (dateRes.ok) {
        const d = await dateRes.json();
        setPeriodRange({ minYear: d.minYear, maxYear: d.maxYear });
      }
    } catch {}
  }, []);

  const fetchCoins = useCallback(async (page = 1, filterParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/coins?page=${page}&limit=12`;
      Object.keys(filterParams).forEach(key => {
        if (filterParams[key] && key !== 'sortBy' && key !== 'order') {
          const value = key === 'material' ? filterParams[key].trim() : filterParams[key];
          url += `&${key}=${encodeURIComponent(value)}`;
        }
      });
      if (filterParams.sortBy) url += `&sortBy=${encodeURIComponent(filterParams.sortBy)}`;
      if (filterParams.order) url += `&order=${encodeURIComponent(filterParams.order)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCoins(data.results);
      setTotalPages(data.pages);
      setCurrentPage(data.page);
    } catch {
      setError('An error occurred while loading the coins. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);

  useEffect(() => {
    const handleRouteChange = (url) => {
      if (url.startsWith('/coin-detail')) {
        localStorage.setItem('lastVisitedPage', 'coin-detail');
      } else if (url !== '/browse') {
        localStorage.removeItem('coinFilters');
        localStorage.removeItem('coinCurrentPage');
        localStorage.removeItem('lastVisitedPage');
      }
    };
    router.events.on('routeChangeStart', handleRouteChange);
    return () => router.events.off('routeChangeStart', handleRouteChange);
  }, [router]);

  useEffect(() => {
    const loadSavedFilters = async () => {
      try {
        const lastVisitedPage = localStorage.getItem('lastVisitedPage');
        const savedFilters = localStorage.getItem('coinFilters');
        const savedPage = localStorage.getItem('coinCurrentPage');
        if (lastVisitedPage === 'coin-detail' && savedFilters) {
          const parsedFilters = JSON.parse(savedFilters);
          setFilters(parsedFilters);
          await fetchCoins(savedPage ? parseInt(savedPage, 10) : 1, parsedFilters);
        } else {
          localStorage.removeItem('coinFilters');
          localStorage.removeItem('coinCurrentPage');
          await fetchCoins(1, {});
        }
        localStorage.removeItem('lastVisitedPage');
      } catch {
        await fetchCoins(1, {});
      }
      isFirstLoadRef.current = false;
    };
    loadSavedFilters();
  }, [fetchCoins]);

  useEffect(() => {
    if (!isFirstLoadRef.current) {
      localStorage.setItem('coinCurrentPage', currentPage.toString());
      fetchCoins(currentPage, filters);
    }
  }, [currentPage, fetchCoins]);

  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 50);
    return () => clearTimeout(timer);
  }, [filters]);
  useEffect(() => {
    if (!isFirstLoadRef.current) {
      localStorage.setItem('coinFilters', JSON.stringify(debouncedFilters));
      setCurrentPage(1);
      fetchCoins(1, debouncedFilters);
    }
  }, [debouncedFilters, fetchCoins, filters]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFilterChange = (name, value) => setFilters(prev => ({ ...prev, [name]: value }));
  const handleSortChange   = (name, value) => setFilters(prev => ({ ...prev, [name]: value }));
  const handlePeriodRangeChange = ({ startYear, endYear }) => setFilters(prev => ({ ...prev, startYear, endYear }));

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    localStorage.setItem('coinFilters', JSON.stringify(filters));
    localStorage.setItem('coinCurrentPage', '1');
    setCurrentPage(1);
    fetchCoins(1, filters);
  };

  const handleFilterReset = () => {
    const reset = { keyword: '', material: '', emperor: '', dynasty: '', denomination: '', mint: '', date_range: '', portrait: '', deity: '', startYear: undefined, endYear: undefined, sortBy: 'name', order: 'asc' };
    setFilters(reset);
    setCurrentPage(1);
    localStorage.removeItem('coinFilters');
    localStorage.setItem('coinCurrentPage', '1');
    fetchCoins(1, {});
  };

  return (
    <div className="bg-canvas min-h-screen">
      <Head>
        <title>Browse Coins — NumisRoma</title>
        <meta name="description" content="Browse the comprehensive catalog of Roman Imperial coins" />
      </Head>

      <div className="max-w-7xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
        {/* Page header */}
        <div className="mb-10">
          <p className="font-sans text-xs font-medium tracking-widest uppercase mb-3 text-amber">
            The Catalog
          </p>
          <h1 className="font-display font-semibold text-3xl sm:text-4xl mb-2 text-text-primary">
            Roman Imperial Coins
          </h1>
          <p className="font-sans text-sm text-text-muted">
            Search and filter across 40,000+ documented coins
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar filters */}
          <div className="lg:col-span-1">
            {/* Mobile toggle — hidden on desktop */}
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className="lg:hidden w-full flex items-center justify-between px-4 py-3 mb-3 font-sans text-sm font-semibold bg-card border border-border rounded-md text-text-secondary hover:border-amber transition-colors duration-150"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {filtersOpen ? 'Hide Filters' : 'Show Filters'}
              </span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div className={`bg-card border border-border rounded-md overflow-hidden lg:block ${filtersOpen ? 'block' : 'hidden'}`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display font-semibold text-xl text-text-primary">Filters</h2>
                <button
                  onClick={handleFilterReset}
                  className="font-sans text-xs text-text-muted hover:text-amber transition-colors duration-150 flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset all
                </button>
              </div>

              <form onSubmit={handleFilterSubmit} className="space-y-5">
                {/* Keyword */}
                <div>
                  <label className="font-sans text-sm font-medium text-text-primary block mb-1.5">Keyword</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={filters.keyword}
                      onChange={(e) => handleFilterChange('keyword', e.target.value)}
                      placeholder="Search all fields…"
                      className="w-full font-sans text-sm bg-card text-text-primary border border-border rounded px-3 py-2 pl-9 outline-none focus:border-amber transition-colors"
                    />
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="font-sans text-xs mt-1 text-text-muted">Name, emperor, dynasty, mint, material, deity…</p>
                </div>

                <AutocompleteDropdown value={filters.material}     onChange={v => handleFilterChange('material', v)}     options={filterOptions.materials}     label="Material"      placeholder="Type material…" />
                <AutocompleteDropdown value={filters.emperor}      onChange={v => handleFilterChange('emperor', v)}      options={filterOptions.emperors}      label="Emperor"       placeholder="Type emperor…" />
                <AutocompleteDropdown value={filters.dynasty}      onChange={v => handleFilterChange('dynasty', v)}      options={filterOptions.dynasties}     label="Dynasty"       placeholder="Type dynasty…" />

                <div className="border-t border-border pt-5">
                  <PeriodRangeSlider
                    startYear={filters.startYear}
                    endYear={filters.endYear}
                    onRangeChange={handlePeriodRangeChange}
                    minYear={periodRange.minYear}
                    maxYear={periodRange.maxYear}
                    label="Period Range"
                  />
                </div>

                <AutocompleteDropdown value={filters.denomination} onChange={v => handleFilterChange('denomination', v)} options={filterOptions.denominations} label="Denomination"  placeholder="Type denomination…" />
                <AutocompleteDropdown value={filters.mint}         onChange={v => handleFilterChange('mint', v)}         options={filterOptions.mints}         label="Mint"          placeholder="Type mint…" />
                <AutocompleteDropdown value={filters.deity}        onChange={v => handleFilterChange('deity', v)}        options={filterOptions.deities}       label="Deity"         placeholder="Type deity…" />

                {/* Sort */}
                <div className="border-t border-border pt-5 grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-sans text-sm font-medium text-text-primary block mb-1.5">Sort by</label>
                    <CustomDropdown
                      value={filters.sortBy}
                      onChange={v => handleSortChange('sortBy', v)}
                      options={[
                        { value: 'name',          label: 'Name' },
                        { value: 'emperor',       label: 'Emperor' },
                        { value: 'dynasty',       label: 'Dynasty' },
                        { value: 'chronological', label: 'Chronological' },
                        { value: 'denomination',  label: 'Denomination' },
                        { value: 'mint',          label: 'Mint' },
                        { value: 'material',      label: 'Material' },
                      ]}
                      placeholder="Sort by"
                    />
                  </div>
                  <div>
                    <label className="font-sans text-sm font-medium text-text-primary block mb-1.5">Order</label>
                    <CustomDropdown
                      value={filters.order}
                      onChange={v => handleSortChange('order', v)}
                      options={[
                        { value: 'asc',  label: 'A → Z' },
                        { value: 'desc', label: 'Z → A' },
                      ]}
                      placeholder="Order"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 font-sans text-sm font-semibold flex items-center justify-center gap-2 bg-amber text-[#fdf8f0] hover:bg-amber-hover rounded transition-colors duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Apply Filters
                </button>
              </form>
            </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber border-t-transparent" />
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 p-4 rounded bg-red-50 border border-red-200 text-red-700">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-sans text-sm">{error}</span>
              </div>
            ) : coins.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <p className="font-display font-semibold text-2xl mb-2 text-text-primary">No coins found</p>
                <p className="font-sans text-sm text-text-muted">Try adjusting your filters or clearing the search.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {coins.map((coin) => (
                    <Link
                      key={coin._id}
                      href={`/coin-detail?id=${coin._id}`}
                      className="group rounded-md overflow-hidden border border-border bg-card hover:shadow-md transition-shadow duration-200 flex flex-col"
                    >
                      <div className="aspect-square relative bg-surface">
                        <Image
                          src={coin.obverse?.image || '/images/coin-placeholder.jpg'}
                          alt={coin.name}
                          fill
                          className="object-contain p-4 mix-blend-multiply"
                        />
                      </div>
                      <div className="p-4 flex flex-col flex-1 border-t border-border">
                        <p className="font-sans text-xs font-medium uppercase tracking-wide mb-1 text-text-muted">{coin.authority?.emperor}</p>
                        <h3 className="font-display font-semibold text-base leading-tight mb-1 line-clamp-2 flex-1 text-text-primary">{coin.name}</h3>
                        <p className="font-sans text-xs text-text-muted">{coin.description?.date_range}</p>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-10 flex justify-center items-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-amber transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Previous
                    </button>
                    <span className="font-sans text-sm px-4 text-text-muted">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 font-sans text-sm border border-border rounded bg-card text-text-secondary hover:border-amber transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Browse;
