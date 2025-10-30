// =========================================
// PULL TO REFRESH - iOS PWA v2.0 FIXED
// Custom implementation sin libreria bugueada
// =========================================
(function() {
  'use strict';
  
  const isIOSStandalone = ('standalone' in window.navigator) && 
                          (window.navigator.standalone === true);
  
  if (!isIOSStandalone) {
    console.log('[PTR] Disabled - not iOS standalone');
    return;
  }

  let startY = 0;
  let isPulling = false;
  let ptrElement = null;

  function createPTR() {
    const div = document.createElement('div');
    div.id = 'ptr-custom';
    div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:0;display:flex;justify-content:center;align-items:flex-start;pointer-events:none;z-index:9999;opacity:0;transition:opacity 0.2s ease;';
    div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="3" style="margin-top:15px"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2 A10 10 0 0 1 22 12" style="animation:ptr-spin 0.8s linear infinite"/></svg>';
    document.body.appendChild(div);
    return div;
  }

  window.addEventListener('load', function() {
    ptrElement = createPTR();

    document.addEventListener('touchstart', (e) => {
      if (window.scrollY !== 0) return;
      startY = e.touches[0].clientY;
      isPulling = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (window.scrollY !== 0 || startY === 0) return;
      
      const currentY = e.touches[0].clientY;
      const distance = currentY - startY;

      if (distance < 20) {
        ptrElement.style.opacity = '0';
        ptrElement.style.height = '0px';
        return;
      }

      if (distance > 70) {
        isPulling = true;
        const height = Math.min(distance * 0.5, 70);
        ptrElement.style.opacity = '1';
        ptrElement.style.height = height + 'px';
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (isPulling) {
        document.body.style.opacity = '0';
        setTimeout(() => window.location.reload(), 300);
      } else {
        ptrElement.style.opacity = '0';
        ptrElement.style.height = '0px';
      }
      startY = 0;
      isPulling = false;
    }, { passive: true });

    const style = document.createElement('style');
    style.textContent = '@keyframes ptr-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    console.log('[PTR] Custom implementation loaded');
  });
})();