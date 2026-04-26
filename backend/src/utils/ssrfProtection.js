/**
 * SSRF Protection Utilities for NumisRoma
 * Prevents Server-Side Request Forgery attacks
 */

const dns = require('dns').promises;
const { URL } = require('url');
const logger = require('./logger');

/**
 * Check if hostname is a private or reserved IP address
 * @param {string} hostname - Hostname or IP to check
 * @returns {boolean} - True if private/reserved, false otherwise
 */
const isPrivateOrReservedIP = (hostname) => {
  // Patterns for blocking private and reserved IPs
  const blockedPatterns = [
    // IPv4 Private ranges
    /^127\./,                    // Loopback
    /^192\.168\./,               // Private Class C
    /^10\./,                     // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
    /^169\.254\./,               // Link-local
    /^0\./,                      // Reserved
    /^224\./,                    // Multicast
    /^240\./,                    // Reserved
    
    // IPv6
    /^::1$/,                     // Loopback
    /^\[?::1\]?$/,              // Loopback with brackets
    /^fe80:/i,                   // Link-local
    /^fc00:/i,                   // Unique local
    /^fd00:/i,                   // Unique local
    
    // Special hostnames
    /^localhost$/i,
    /^0x/,                       // Hex notation
    
    // Cloud metadata endpoints
    /^169\.254\.169\.254$/,      // AWS, Azure, GCP metadata
    /^fd00:ec2::254$/,           // AWS IPv6 metadata
  ];
  
  return blockedPatterns.some(pattern => pattern.test(hostname));
};

/**
 * Validate URL for SSRF protection
 * @param {string} urlString - URL to validate
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} - { valid: boolean, error?: string, url?: URL }
 */
const validateUrl = async (urlString, options = {}) => {
  const {
    allowedProtocols = ['http:', 'https:'],
    performDnsCheck = true,
    timeout = 5000
  } = options;
  
  try {
    // Parse URL
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      return { valid: false, error: 'Invalid URL format' };
    }
    
    // Check protocol
    if (!allowedProtocols.includes(url.protocol)) {
      return { 
        valid: false, 
        error: `Protocol ${url.protocol} not allowed. Allowed: ${allowedProtocols.join(', ')}` 
      };
    }
    
    // Extract hostname
    const hostname = url.hostname;
    
    // Check for obvious private IPs in hostname
    if (isPrivateOrReservedIP(hostname)) {
      logger.security.suspiciousActivity('Attempted SSRF to private IP', {
        url: urlString,
        hostname
      });
      return { 
        valid: false, 
        error: 'Access to private, reserved, or metadata IP addresses is not allowed' 
      };
    }
    
    // DNS resolution check to prevent DNS rebinding
    if (performDnsCheck) {
      try {
        // Resolve with timeout
        const resolvePromise = dns.resolve4(hostname);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DNS resolution timeout')), timeout)
        );
        
        const addresses = await Promise.race([resolvePromise, timeoutPromise]);
        
        // Check each resolved address
        for (const addr of addresses) {
          if (isPrivateOrReservedIP(addr)) {
            logger.security.suspiciousActivity('URL resolves to private IP (DNS rebinding attempt)', {
              url: urlString,
              hostname,
              resolvedTo: addr
            });
            return { 
              valid: false, 
              error: 'URL resolves to a private or reserved IP address' 
            };
          }
        }
        
        logger.debug('URL passed SSRF validation', { url: urlString, resolvedTo: addresses });
      } catch (dnsError) {
        // DNS resolution failed - for security, reject
        logger.warn('DNS resolution failed during SSRF check', {
          url: urlString,
          hostname,
          error: dnsError.message
        });
        return { 
          valid: false, 
          error: 'Unable to verify URL safety - DNS resolution failed' 
        };
      }
    }
    
    return { valid: true, url };
  } catch (error) {
    logger.error('Error in SSRF validation', { 
      url: urlString, 
      error: error.message 
    });
    return { 
      valid: false, 
      error: 'Error validating URL' 
    };
  }
};

/**
 * Express validator custom function for SSRF-safe URLs
 * @param {Object} options - Validation options
 * @returns {Function} - Express validator custom function
 */
const createSsrfValidator = (options = {}) => {
  return async (value) => {
    if (!value || value.trim() === '') {
      return true; // Let other validators handle empty values
    }
    
    const result = await validateUrl(value, options);
    if (!result.valid) {
      throw new Error(result.error);
    }
    
    return true;
  };
};

module.exports = {
  isPrivateOrReservedIP,
  validateUrl,
  createSsrfValidator
};
