// A photo picked on the device, made small enough to keep in the database: the middle square,
// 256 × 256 pixels, as a JPEG data: URL of at most MAX_LENGTH characters (about 20–40 kB).
export const MAX_LENGTH = 90_000;
const SIZE = 256;

export async function squarePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // turned upright by the browser (photo orientation)
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_LENGTH) return data;
    }
    throw Object.assign(new Error('too big'), { code: 'photo/too-big' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
