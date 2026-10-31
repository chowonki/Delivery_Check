import {download} from './download.js';
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  let url;
  try { url = new URL(sender.url); } catch { return; }
  if (sender.id !== chrome.runtime.id || url.origin !== 'https://chowonki.github.io' ||
      !url.pathname.startsWith('/WorkTool/') || sender.frameId !== 0) return;
  if (message?.type === 'HANBIT_PING') { reply({ok:true}); return; }
  if (message?.type !== 'HANBIT_TODAY') return;
  download().then(reply).catch(error => reply({ok:false,code:error.code || 'UNKNOWN',
    message:error.message || '한빛탁송 엑셀을 가져오지 못했습니다.'}));
  return true;
});
