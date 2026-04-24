/**
 * FIRMA DIGITAL — coordenadas corregidas para iPad/Retina
 * El bug anterior: canvas.width se cambiaba ANTES de recalcular rect → offset
 * Fix: canvas interno fijo (900×300), escalar coordenadas con ratio CSS/interno
 */
let signatureCanvas=null;
let signatureCtx=null;
let isDrawing=false;
let lastX=0;
let lastY=0;
let signatureData=null;
let strokes=[];   // para "deshacer"
let currentStroke=[];

export function initSignatureCapture(containerId){
  const container=document.getElementById(containerId);
  if(!container)return false;
  container.innerHTML=`
    <div style="border:2px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;user-select:none">
      <div style="padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;font-weight:600;color:var(--text-muted)"><i class="fas fa-pen-fancy mr-1"></i>Firma del empleado — dibuja con el dedo</span>
        <div style="display:flex;gap:6px">
          <button id="sigUndo" class="btn btn-sm btn-ghost" style="padding:4px 10px;font-size:11px"><i class="fas fa-undo"></i></button>
          <button id="sigClear" class="btn btn-sm btn-ghost" style="padding:4px 10px;font-size:11px"><i class="fas fa-trash"></i> Limpiar</button>
        </div>
      </div>
      <canvas id="signatureCanvas" style="display:block;width:100%;height:180px;cursor:crosshair;touch-action:none"></canvas>
    </div>`;

  signatureCanvas=document.getElementById('signatureCanvas');
  if(!signatureCanvas)return false;

  // Tamaño interno fijo en alta resolución — NO cambiar después
  signatureCanvas.width=1200;
  signatureCanvas.height=360;
  signatureCtx=signatureCanvas.getContext('2d');
  signatureCtx.strokeStyle='#0f172a';
  signatureCtx.lineWidth=3;
  signatureCtx.lineCap='round';
  signatureCtx.lineJoin='round';
  strokes=[];currentStroke=[];signatureData=null;

  signatureCanvas.addEventListener('mousedown',onDown);
  signatureCanvas.addEventListener('mousemove',onMove);
  signatureCanvas.addEventListener('mouseup',onUp);
  signatureCanvas.addEventListener('mouseleave',onUp);
  signatureCanvas.addEventListener('touchstart',onTouchStart,{passive:false});
  signatureCanvas.addEventListener('touchmove',onTouchMove,{passive:false});
  signatureCanvas.addEventListener('touchend',onTouchEnd,{passive:false});

  document.getElementById('sigClear')?.addEventListener('click',clearSignature);
  document.getElementById('sigUndo')?.addEventListener('click',undoSignature);
  return true;
}

// Convierte coordenadas de pantalla → coordenadas internas del canvas
function toCanvas(clientX,clientY){
  const rect=signatureCanvas.getBoundingClientRect();
  return{
    x:(clientX-rect.left)*(signatureCanvas.width/rect.width),
    y:(clientY-rect.top)*(signatureCanvas.height/rect.height)
  };
}

function onDown(e){isDrawing=true;const p=toCanvas(e.clientX,e.clientY);lastX=p.x;lastY=p.y;currentStroke=[[p.x,p.y]];}
function onMove(e){
  if(!isDrawing)return;
  const p=toCanvas(e.clientX,e.clientY);
  drawLine(lastX,lastY,p.x,p.y);
  lastX=p.x;lastY=p.y;
  currentStroke.push([p.x,p.y]);
}
function onUp(){if(!isDrawing)return;isDrawing=false;if(currentStroke.length>1)strokes.push([...currentStroke]);currentStroke=[];signatureData=signatureCanvas.toDataURL('image/png');}

function onTouchStart(e){e.preventDefault();if(!e.touches[0])return;isDrawing=true;const p=toCanvas(e.touches[0].clientX,e.touches[0].clientY);lastX=p.x;lastY=p.y;currentStroke=[[p.x,p.y]];}
function onTouchMove(e){e.preventDefault();if(!isDrawing||!e.touches[0])return;const p=toCanvas(e.touches[0].clientX,e.touches[0].clientY);drawLine(lastX,lastY,p.x,p.y);lastX=p.x;lastY=p.y;currentStroke.push([p.x,p.y]);}
function onTouchEnd(e){e.preventDefault();onUp();}

function drawLine(x1,y1,x2,y2){
  signatureCtx.beginPath();
  signatureCtx.moveTo(x1,y1);
  signatureCtx.lineTo(x2,y2);
  signatureCtx.stroke();
}

export function clearSignature(){
  if(!signatureCanvas||!signatureCtx)return;
  signatureCtx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height);
  strokes=[];currentStroke=[];signatureData=null;
}

export function undoSignature(){
  if(!strokes.length){clearSignature();return;}
  strokes.pop();
  signatureCtx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height);
  strokes.forEach(stroke=>{
    if(stroke.length<2)return;
    for(let i=1;i<stroke.length;i++)drawLine(stroke[i-1][0],stroke[i-1][1],stroke[i][0],stroke[i][1]);
  });
  signatureData=strokes.length?signatureCanvas.toDataURL('image/png'):null;
}

export function getSignatureData(){return signatureData;}
export function hasSignature(){return!!signatureData;}
export function isSignatureEmpty(){
  if(!signatureData)return true;
  if(!signatureCanvas)return true;
  const d=signatureCtx.getImageData(0,0,signatureCanvas.width,signatureCanvas.height).data;
  for(let i=3;i<d.length;i+=4)if(d[i]>10)return false;
  return true;
}
export function renderSignaturePreview(containerId,dataURL){
  const c=document.getElementById(containerId);
  if(c&&dataURL)c.innerHTML='<img src="'+dataURL+'" style="max-width:100%;border:1px solid var(--border);border-radius:8px">';
}
