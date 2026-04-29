export function isImageFile(file) {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/');
}
