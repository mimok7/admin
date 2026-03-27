'use client';

import React from 'react';

export default function SectionBox({
  title,
  icon,
  children,
}: {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 bg-gray-25 border rounded mb-4">
      {(title || icon) && (
        <h3 className="font-medium text-sm mb-2 flex items-center gap-1">
          {icon}
          {title}
        </h3>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
