import logoUrl from '../assets/SRMRMP_LOGO.png';

let cached = null;

/**
 * The SRM logo as a JPEG `{ bytes, width, height }` for the PDF writer, which
 * embeds JPEG directly (a PNG would need decoding). Flattened onto white.
 * Resolves to null if the image can't be loaded, so the PDF still downloads
 * (without the logo) rather than failing.
 */
export function loadLogoJpeg() {
  if (!cached) {
    cached = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const binary = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          resolve({ bytes, width: canvas.width, height: canvas.height });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    });
  }
  return cached;
}
