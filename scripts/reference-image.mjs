export async function readReferenceImage(file, size = { w: 1193, h: 593 }) {
  if (!file || file.size > 20 * 1024 * 1024)
    throw new Error('Изображение должно быть меньше 20 МБ.');
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type))
    throw new Error('Выбери PNG, JPG или WebP.');
  const url = URL.createObjectURL(file),
    img = new Image();
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Не удалось открыть изображение.'));
      img.src = url;
    });
    if (img.naturalWidth * img.naturalHeight > 60000000)
      throw new Error('Уменьши изображение до 60 мегапикселей.');
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const src = canvas.toDataURL('image/webp', 0.8);
    if (src.length > 2500000)
      throw new Error('Фон слишком большой для проекта. Уменьши изображение.');
    const fit = Math.min(size.w / img.naturalWidth, size.h / img.naturalHeight),
      w = img.naturalWidth * fit,
      h = img.naturalHeight * fit;
    return {
      src,
      name: file.name.slice(0, 200),
      x: (size.w - w) / 2,
      y: (size.h - h) / 2,
      w,
      h,
      opacity: 0.1,
      visible: true
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
