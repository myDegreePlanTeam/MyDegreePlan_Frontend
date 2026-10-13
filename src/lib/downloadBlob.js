// downloadBlob.js
// Hands a Blob to the student as a file download. Nothing is persisted: no snapshot row, no share token, no database write.

export function downloadBlob(blob, filename) {
  const url    = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href     = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on the next tick: Safari cancels the download if the object
  // URL disappears in the same frame as the click.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
