// Full-window drop overlay for case-detail file ingestion.
//
// Listens at window level so the user can drop a file ANYWHERE on the case
// page, not just on a specific dropzone. While files are being dragged,
// renders a soft cream overlay with a serif headline so the affordance is
// visible and unmistakable. On drop, calls onFiles() with absolute paths
// (Electron exposes file.path on drop targets, unlike browsers).
//
// `enabled` lets the parent disable the overlay during processing so a
// second drop doesn't double-fire while the first batch is mid-flight.

import React, { useEffect, useRef, useState } from 'react';

export default function DropOverlay({ onFiles, enabled = true, hint }) {
  const [active, setActive] = useState(false);
  // Counter so dragenter/leave from child elements don't flicker the overlay.
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const onDragEnter = (e) => {
      // Only show overlay for FILES (not text drags etc.)
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      dragDepth.current += 1;
      setActive(true);
    };
    const onDragOver = (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e) => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setActive(false);
    };
    const onDrop = (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      dragDepth.current = 0;
      setActive(false);
      const paths = Array.from(e.dataTransfer.files || [])
        .map(f => f.path)
        .filter(Boolean);
      if (paths.length && onFiles) onFiles(paths);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled, onFiles]);

  if (!active) return null;

  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-inner">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <polyline points="9 14 12 11 15 14" />
        </svg>
        <h3 className="drop-overlay-title">Drop files to ingest</h3>
        <p className="drop-overlay-sub">
          {hint || 'Tabula will detect the document type, extract the data, and populate this case automatically.'}
        </p>
      </div>
    </div>
  );
}
