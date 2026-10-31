(() => {
  if (window !== window.top) return;
  let pending = false;
  window.addEventListener('message', async event => {
    const m = event.data;
    if (event.source !== window || event.origin !== location.origin ||
        m?.source !== 'worktool-hanbit-page' || typeof m.id !== 'string' || m.id.length > 100 ||
        !['HANBIT_PING','HANBIT_TODAY'].includes(m.type)) return;
    if (pending && m.type === 'HANBIT_TODAY') return;
    if (m.type === 'HANBIT_TODAY') pending = true;
    let result;
    try { result = await chrome.runtime.sendMessage({type:m.type}); }
    catch { result = {ok:false,code:'CONNECTOR',message:'한빛 연결 확장기능을 다시 켜고 새로고침해 주세요.'}; }
    finally { if (m.type === 'HANBIT_TODAY') pending = false; }
    window.postMessage({source:'worktool-hanbit-connector',id:m.id,result},location.origin);
  });
})();
