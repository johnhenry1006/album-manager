import { useState } from 'react';

import styles from '../UploadPage.module.css';

export function UploadDropzone({ accept, onFiles }) {
  const [dragging, setDragging] = useState(false);
  return (
    <section
      role="region"
      aria-label="Upload files"
      className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(event.dataTransfer.files);
      }}
    >
      <h2>Drop photos and videos here</h2>
      <p>Choose multiple files to add to the queue.</p>
      <label htmlFor="upload-files">Files</label>
      <input
        id="upload-files"
        type="file"
        multiple
        accept={accept}
        onChange={(event) => {
          onFiles(event.target.files ?? []);
          event.target.value = '';
        }}
      />
    </section>
  );
}
