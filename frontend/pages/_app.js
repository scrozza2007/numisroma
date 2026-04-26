import '../styles/globals.css';
import { AuthProvider } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Layout from '../components/Layout';
import ErrorBoundary from '../components/ErrorBoundary';

function MyApp({ Component, pageProps }) {
  // Use the page-specific layout when provided
  if (Component.getLayout) {
    return (
      <ErrorBoundary>
        <AuthProvider>
          {Component.getLayout(<Component {...pageProps} />)}
        </AuthProvider>
      </ErrorBoundary>
    );
  }

  // Default layout wraps the page with the navbar
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default MyApp;