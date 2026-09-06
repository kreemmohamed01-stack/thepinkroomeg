/* ============================================================
   THE PINK ROOM — lightweight visitor analytics
   Loaded on every customer-facing page (not the dashboard itself).
   Sends a pageview on load, a heartbeat every ~25s while the tab is
   open and visible (powers "active right now" in the dashboard), and
   exposes trackEvent() for pages to report product/category views and
   add-to-cart actions. Nothing here is tied to any real identity —
   `sessionId` is a random id kept in this browser's localStorage,
   purely to count unique visitors instead of raw hits.
   ============================================================ */
(function(){
  const KEY = 'tpr_session_id';

  function getSessionId(){
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('sid-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch(e){
      return 'sid-' + Date.now();
    }
  }
  const sessionId = getSessionId();

  function send(type, extra){
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          type, sessionId, path: location.pathname + location.search
        }, extra || {})),
        keepalive: true // lets the request finish even if the tab closes right after
      }).catch(()=>{});
    } catch(e){}
  }

  send('pageview');

  /* Heartbeat interval. Each beat is a serverless invocation plus a DB write,
     so this is the single biggest driver of function usage on the site — at
     25s a ten-minute visit cost 24 calls. 60s keeps "active right now"
     accurate (the dashboard treats a session as live for a few minutes after
     its last beat) while costing well under half as much. */
  const HEARTBEAT_MS = 60000;

  let heartbeatTimer;
  function startHeartbeat(){
    stopHeartbeat();
    heartbeatTimer = setInterval(()=> send('heartbeat'), HEARTBEAT_MS);
  }
  function stopHeartbeat(){ if (heartbeatTimer) clearInterval(heartbeatTimer); }
  startHeartbeat();

  // pause heartbeats on a hidden/backgrounded tab so "active now" doesn't
  // count tabs nobody is actually looking at
  document.addEventListener('visibilitychange', ()=>{
    if (document.hidden) stopHeartbeat();
    else { send('heartbeat'); startHeartbeat(); }
  });

  window.TPRAnalytics = { trackEvent: send, sessionId };
})();
