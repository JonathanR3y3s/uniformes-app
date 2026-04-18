/**
 * MÓDULO DE CAPTURA DE FIRMA DIGITAL
 * Permite capturar firma táctil en iPad/tablet
 * Optimizado para entorno táctil
 */

let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let signatureData = null;

export function initSignatureCapture(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return false;

  // Crear canvas para firma
  const html = `
    <div class="signature-capture-wrapper">
      <div class="signature-header">
        <h4>Firma del Empleado</h4>
        <p class="text-sm text-muted">Dibuja tu firma en el recuadro</p>
      </div>

      <div class="signature-canvas-wrapper">
        <canvas id="signatureCanvas" width="600" height="200"
          style="border: 2px solid var(--border); border-radius: 8px; background: white; cursor: crosshair; touch-action: none;">
        </canvas>
      </div>

      <div class="signature-actions flex gap-2 mt-3">
        <button id="sigClear" class="btn btn-sm btn-ghost">
          <i class="fas fa-trash"></i> Limpiar
        </button>
        <button id="sigUndo" class="btn btn-sm btn-ghost">
          <i class="fas fa-undo"></i> Deshacer
        </button>
      </div>

      <div class="signature-info text-xs text-muted mt-2">
        <i class="fas fa-check-circle" style="color: var(--success)"></i>
        Firma capturada y lista
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Inicializar canvas
  signatureCanvas = document.getElementById('signatureCanvas');
  if (!signatureCanvas) return false;

  signatureCtx = signatureCanvas.getContext('2d');

  // Configurar para mejor calidad en pantallas Retina
  const rect = signatureCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  signatureCanvas.width = rect.width * dpr;
  signatureCanvas.height = rect.height * dpr;
  signatureCtx.scale(dpr, dpr);

  // Event listeners para mouse
  signatureCanvas.addEventListener('mousedown', startSignature);
  signatureCanvas.addEventListener('mousemove', drawSignature);
  signatureCanvas.addEventListener('mouseup', endSignature);
  signatureCanvas.addEventListener('mouseout', endSignature);

  // Event listeners para táctil (iPad/tablet)
  signatureCanvas.addEventListener('touchstart', handleTouchStart, false);
  signatureCanvas.addEventListener('touchmove', handleTouchMove, false);
  signatureCanvas.addEventListener('touchend', handleTouchEnd, false);

  // Botones
  document.getElementById('sigClear')?.addEventListener('click', clearSignature);
  document.getElementById('sigUndo')?.addEventListener('click', undoSignature);

  return true;
}

function startSignature(e) {
  isDrawing = true;
  const rect = signatureCanvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
}

function drawSignature(e) {
  if (!isDrawing) return;

  const rect = signatureCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  signatureCtx.strokeStyle = '#0f172a';
  signatureCtx.lineWidth = 2;
  signatureCtx.lineCap = 'round';
  signatureCtx.lineJoin = 'round';

  signatureCtx.beginPath();
  signatureCtx.moveTo(lastX, lastY);
  signatureCtx.lineTo(x, y);
  signatureCtx.stroke();

  lastX = x;
  lastY = y;
}

function endSignature() {
  isDrawing = false;
  signatureData = signatureCanvas.toDataURL('image/png');
}

// Manejo táctil para iPad/tablets
function handleTouchStart(e) {
  e.preventDefault();
  isDrawing = true;

  const touch = e.touches[0];
  const rect = signatureCanvas.getBoundingClientRect();
  lastX = touch.clientX - rect.left;
  lastY = touch.clientY - rect.top;
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!isDrawing) return;

  const touch = e.touches[0];
  const rect = signatureCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  signatureCtx.strokeStyle = '#0f172a';
  signatureCtx.lineWidth = 2;
  signatureCtx.lineCap = 'round';
  signatureCtx.lineJoin = 'round';

  signatureCtx.beginPath();
  signatureCtx.moveTo(lastX, lastY);
  signatureCtx.lineTo(x, y);
  signatureCtx.stroke();

  lastX = x;
  lastY = y;
}

function handleTouchEnd(e) {
  e.preventDefault();
  isDrawing = false;
  signatureData = signatureCanvas.toDataURL('image/png');
}

export function clearSignature() {
  if (!signatureCanvas || !signatureCtx) return;

  signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  signatureData = null;
}

export function undoSignature() {
  // Nota: Deshacer completo requeriría almacenar los strokes
  // Por ahora, limpiamos como fallback
  clearSignature();
}

export function getSignatureData() {
  return signatureData;
}

export function hasSignature() {
  return signatureData !== null && signatureData !== undefined;
}

export function isSignatureEmpty() {
  if (!hasSignature()) return true;

  // Detectar si el canvas está prácticamente vacío
  const canvas = document.getElementById('signatureCanvas');
  if (!canvas) return true;

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let hasPixels = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 128) {
      hasPixels = true;
      break;
    }
  }

  return !hasPixels;
}

export function renderSignaturePreview(containerId, signatureDataURL) {
  const container = document.getElementById(containerId);
  if (!container || !signatureDataURL) return;

  container.innerHTML = `
    <div class="signature-preview">
      <img src="${signatureDataURL}" alt="Firma" style="max-width: 100%; border: 1px solid var(--border); border-radius: 8px;">
    </div>
  `;
}
