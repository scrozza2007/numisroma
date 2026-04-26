import React, { useState, useMemo, useEffect, useRef } from 'react';

const AutocompleteDropdown = ({
  value,
  onChange,
  options = [],
  placeholder = 'Type to search...',
  label,
  emptyMessage = 'No options found'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const filteredOptions = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return options;
    const lower = term.toLowerCase();
    return options
      .filter(o => o.toLowerCase().includes(lower))
      .sort((a, b) => {
        const aL = a.toLowerCase(), bL = b.toLowerCase();
        if (aL === lower && bL !== lower) return -1;
        if (bL === lower && aL !== lower) return 1;
        const aS = aL.startsWith(lower), bS = bL.startsWith(lower);
        if (aS && !bS) return -1;
        if (bS && !aS) return 1;
        return aL.localeCompare(bL);
      });
  }, [searchTerm, options]);

  useEffect(() => { setHighlightedIndex(-1); }, [filteredOptions]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSearchTerm(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (e) => {
    const v = e.target.value;
    setSearchTerm(v);
    setIsOpen(true);
    onChange(v);
  };

  const handleOptionSelect = (option) => {
    setSearchTerm(option);
    setIsOpen(false);
    onChange(option);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setIsOpen(true); return; }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1)); break;
      case 'ArrowUp':   e.preventDefault(); setHighlightedIndex(prev => Math.max(prev - 1, 0)); break;
      case 'Enter':     e.preventDefault(); if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) handleOptionSelect(filteredOptions[highlightedIndex]); break;
      case 'Escape':    setIsOpen(false); inputRef.current?.blur(); break;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block font-sans text-sm font-medium mb-1.5 text-text-primary">{label}</label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full font-sans text-sm bg-card text-text-primary outline-none px-3 py-2 pr-9 transition-colors duration-150"
          style={{
            border: `1px solid ${isOpen ? '#b8843a' : '#e8e0d0'}`,
            borderRadius: 6,
          }}
        />
        {searchTerm ? (
          <button
            onClick={() => { setSearchTerm(''); onChange(''); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity text-text-muted"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
      </div>

      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 overflow-y-auto bg-card border border-border rounded"
          style={{ boxShadow: '0 8px 16px rgba(46,40,32,0.08)', maxHeight: 240 }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <div
                key={option}
                onClick={() => handleOptionSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className="px-3 py-2 cursor-pointer font-sans text-sm text-text-secondary transition-colors duration-100 border-b border-border last:border-0"
                style={{ backgroundColor: index === highlightedIndex ? '#f0e8d4' : 'transparent' }}
              >
                {option}
              </div>
            ))
          ) : (
            <div className="px-3 py-3 font-sans text-sm text-center text-text-muted">{emptyMessage}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutocompleteDropdown;
