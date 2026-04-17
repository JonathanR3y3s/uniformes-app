// Generates PNG icons via canvas for the PWA manifest
// Called by index.html on first load
(function(){
  var sizes=[72,96,128,144,152,192,384,512];
  function gen(s){var c=document.createElement('canvas');c.width=s;c.height=s;var x=c.getContext('2d');var r=s*.16;x.fillStyle='#0f172a';x.beginPath();x.moveTo(r,0);x.lineTo(s-r,0);x.quadraticCurveTo(s,0,s,r);x.lineTo(s,s-r);x.quadraticCurveTo(s,s,s-r,s);x.lineTo(r,s);x.quadraticCurveTo(0,s,0,s-r);x.lineTo(0,r);x.quadraticCurveTo(0,0,r,0);x.closePath();x.fill();x.fillStyle='#2563eb';x.font='900 '+Math.round(s*.5)+'px "Arial Black",Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('AA',s/2,s/2+s*.04);return c;}
  sizes.forEach(function(s){var c=gen(s);c.toBlob(function(b){if(!b)return;var u=URL.createObjectURL(b);var l=document.createElement('link');l.rel='icon';l.type='image/png';l.sizes=s+'x'+s;l.href=u;document.head.appendChild(l);},'image/png');});
})();
