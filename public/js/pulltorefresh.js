// =========================================
// PULL TO REFRESH - iOS PWA v1.0
// Solo activa en iOS standalone mode
// =========================================
(function() {
  'use strict';
  
  // ✅ CRÍTICO: SOLO iOS standalone (no Android, no Safari browser)
  const isIOSStandalone = ('standalone' in window.navigator) && 
                          (window.navigator.standalone === true);
  
  if (!isIOSStandalone) {
    console.log('[PTR] Disabled - not iOS standalone mode');
    return;
  }

  window.addEventListener('load', function() {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pulltorefreshjs/0.1.22/index.umd.min.js';
    script.crossOrigin = 'anonymous';
    
    script.onload = function() {
      if (typeof PullToRefresh === 'undefined') {
        console.error('[PTR] Library failed to load');
        return;
      }

      const iconCircle = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round">
          <circle cx="12" cy="12" r="10" opacity="0.25"/>
          <path d="M12 2 A10 10 0 0 1 22 12" style="animation: ptr-spin 0.8s linear infinite;"/>
        </svg>
      `;

      PullToRefresh.init({
        mainElement: 'body',
        
        // ✅ CRÍTICO: Solo permitir refresh cuando scroll está en top
        shouldPullToRefresh: function() {
          return !window.scrollY;
        },
        
        // ✅ Thresholds altos para evitar activación accidental
        distThreshold: 70,      // Requiere 70px de pull
        distMax: 100,           // Máximo 100px
        distReload: 55,         // Confirma tras 55px
        
        iconArrow: iconCircle,
        iconRefreshing: iconCircle,
        instructionsPullToRefresh: '',
        instructionsReleaseToRefresh: '',
        instructionsRefreshing: '',
        refreshTimeout: 200,
        
        // Resistencia alta = pull más difícil
        resistanceFunction: t => Math.min(1, t / 3.5),
        
        getStyles: () => '',
        
        onRefresh() {
          document.body.classList.add('refreshing');
          setTimeout(() => {
            window.location.reload();
          }, 300);
        }
      });
      
      console.log('[PTR] ✓ Initialized for iOS PWA');
    };
    
    script.onerror = function() {
      console.error('[PTR] ✗ Failed to load pulltorefresh.js CDN');
    };
    
    document.head.appendChild(script);
  });
})();