import { getClient } from './supabase-client.js';

const BUCKET = 'evidencias';
const PUBLIC_BASE_URL = 'https://zyopidigmaftnzwwesmr.supabase.co/storage/v1/object/public/' + BUCKET + '/';

function cleanSegment(value, fallback) {
  return String(value || fallback || 'sin-id')
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback || 'sin-id';
}

function parseBase64(input) {
  if (!input || typeof input !== 'string') return null;
  const match = input.match(/^data:([^;]+);base64,(.*)$/);
  if (match) return { contentType: match[1], data: match[2], dataUrl: input };
  return { contentType: 'image/jpeg', data: input, dataUrl: 'data:image/jpeg;base64,' + input };
}

function base64ToBlob(data, contentType) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType || 'application/octet-stream' });
}

function fallbackEvidence(parsed, tipo, reason) {
  const fecha = new Date().toISOString();
  if (reason) console.warn('[EVIDENCE] Fallback local/base64:', reason);
  return {
    storage: 'base64',
    url: '',
    path: '',
    base64: parsed?.dataUrl || '',
    tipo,
    fecha,
  };
}

function buildPath({ tipo, entidad, entidadId, filename }) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTipo = cleanSegment(tipo, 'evidencia');
  const safeEntidad = cleanSegment(entidad, 'general');
  const safeEntidadId = cleanSegment(entidadId, 'sin-id');
  const safeFilename = cleanSegment(filename, 'evidencia.jpg');
  return `${safeTipo}/${safeEntidad}/${safeEntidadId}/${ts}-${safeFilename}`;
}

export async function saveEvidence({ base64, tipo = 'evidencia', entidad = 'general', entidadId = 'sin-id', filename = 'evidencia.jpg' } = {}) {
  const parsed = parseBase64(base64);
  if (!parsed) return fallbackEvidence(parsed, tipo, 'base64 vacío o inválido');

  try {
    const client = await getClient();
    if (!client?.storage?.from) return fallbackEvidence(parsed, tipo, 'Supabase Storage no disponible');

    const path = buildPath({ tipo, entidad, entidadId, filename });
    const blob = base64ToBlob(parsed.data, parsed.contentType);
    const { error } = await client.storage.from(BUCKET).upload(path, blob, {
      contentType: parsed.contentType,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;

    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return {
      storage: 'supabase',
      url: data?.publicUrl || '',
      path,
      tipo,
      fecha: new Date().toISOString(),
    };
  } catch (err) {
    return fallbackEvidence(parsed, tipo, err?.message || err);
  }
}

export function getEvidenceSrc(evidence) {
  if (!evidence) return null;
  if (typeof evidence === 'string') {
    if (evidence.startsWith('data:') || evidence.startsWith('http://') || evidence.startsWith('https://')) return evidence;
    return 'data:image/jpeg;base64,' + evidence;
  }
  if (evidence.url) return evidence.url;
  if (evidence.path) return PUBLIC_BASE_URL + String(evidence.path).split('/').map(encodeURIComponent).join('/');
  if (evidence.base64) return getEvidenceSrc(evidence.base64);
  return null;
}
