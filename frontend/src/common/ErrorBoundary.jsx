

import { Component } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import styles from './ErrorBoundary.module.css';

/**
 * Error boundary component that catches JavaScript errors in child components
 * and displays a fallback UI instead of crashing the entire application.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error boundary caught error:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={styles.container}>
          <div className={styles.flexWrapper}>
            <ExclamationTriangleIcon className={styles.icon} />
            <div className={styles.content}>
              <p className={styles.title}>
                {this.props.sectionName ? `Failed to load ${this.props.sectionName}` : 'Something went wrong'}
              </p>
              {this.state.error && (
                <p className={styles.errorMessage}>
                  {this.state.error.message}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional component wrapper for sections that may fail to load
 */
export function SectionErrorBoundary({ children, sectionName, error, onRetry }) {
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.flexWrapper}>
          <ExclamationTriangleIcon className={styles.icon} />
          <div className={styles.content}>
            <p className={styles.title}>
              Failed to load {sectionName}
            </p>
            <p className={styles.errorMessage}>{error}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className={styles.retryBtn}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <ErrorBoundary sectionName={sectionName}>{children}</ErrorBoundary>;
}
