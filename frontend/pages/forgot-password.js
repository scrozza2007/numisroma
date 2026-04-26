import React from 'react';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';

const ForgotPassword = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-12 bg-canvas">
      <Head>
        <title>Forgot Password - NumisRoma</title>
        <meta name="description" content="Reset your NumisRoma account password" />
      </Head>

      <div className="w-full max-w-md rounded-lg p-8 bg-card border border-border shadow-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <Image src="/images/logo.png" alt="NumisRoma" width={200} height={200} priority sizes="200px" />
          </Link>
          <h2 className="font-display font-semibold text-3xl mb-2 text-text-primary">
            Reset your password
          </h2>
        </div>

        <div className="p-5 rounded-lg mb-6 flex items-start gap-3 bg-amber-bg border border-amber">
          <svg className="w-5 h-5 shrink-0 mt-0.5 text-amber-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-sans font-medium mb-1 text-sm text-amber-hover">
              Password reset by email is temporarily unavailable.
            </p>
            <p className="font-sans text-sm text-text-secondary">
              Email us at{' '}
              <a href="mailto:support@numisroma.com" className="font-medium underline hover:no-underline text-amber">
                support@numisroma.com
              </a>{' '}
              with your username and we&apos;ll reset your account within 24 hours.
            </p>
          </div>
        </div>

        <div className="text-center">
          <Link href="/login" className="font-sans font-medium text-sm text-amber hover:text-amber-hover transition-colors duration-200">
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
