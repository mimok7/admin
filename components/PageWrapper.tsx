import React from 'react';

interface PageWrapperProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export default function PageWrapper({
  children,
  title,
  className = '',
}: PageWrapperProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 ${className}`}>
        {title && (
          <div className="mb-4">
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
