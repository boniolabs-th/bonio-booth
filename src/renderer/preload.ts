let lastPointerType: 'mouse' | 'touch' | null = null;

window.addEventListener('pointerdown', e => {
  lastPointerType = e.pointerType as any;
});

window.addEventListener(
  'contextmenu',
  e => {
    if (lastPointerType === 'touch') e.preventDefault();
  },
  true
);

window.addEventListener(
  'touchstart',
  e => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
