/** Save a Blob as a file download (used for authenticated PDF downloads). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a tick to start the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
