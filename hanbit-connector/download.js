export function todayKorea(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function excelUrl(date = todayKorea()) {
  const url = new URL('https://check.hanbitdeli.com/admin/check/check/excel_download');
  url.search = new URLSearchParams({order_field:'',order_value:'',chk_status:'',
    _search_s_date:date,_search_e_date:date,search_text:''});
  return url.href;
}
export class DownloadError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export async function download(fetcher = fetch, now = new Date()) {
  const date = todayKorea(now);
  let response;
  try {
    response = await fetcher(excelUrl(date), {
      credentials: 'include', cache: 'no-store', redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
  } catch {
    throw new DownloadError('NETWORK', '한빛탁송에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }
  if ([401,403].includes(response.status) || /\/member\/login(?:[/?#]|$)/i.test(response.url)) {
    throw new DownloadError('LOGIN_REQUIRED', '한빛탁송 로그인 필요');
  }
  if (!response.ok) throw new DownloadError('HTTP', `한빛탁송 다운로드 오류 (${response.status})`);
  const limit = 40 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new DownloadError('SIZE', '엑셀 파일은 40MB까지 지원합니다.');
  const chunks = []; let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw new DownloadError('SIZE', '엑셀 파일은 40MB까지 지원합니다.'); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DownloadError) throw error;
    throw new DownloadError('NETWORK', '엑셀 수신 중 연결이 끊겼습니다. 다시 시도해 주세요.');
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const text = new TextDecoder().decode(bytes.subarray(0,65536));
  if (/<(?:!doctype|html|form|script)\b/i.test(text) &&
      /member\/login|type\s*=\s*["']?password|로그인\s*(?:필요|해|하|후)/i.test(text)) {
    throw new DownloadError('LOGIN_REQUIRED', '한빛탁송 로그인 필요');
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new DownloadError('FORMAT', '한빛탁송에서 지원되는 .xlsx 엑셀을 받지 못했습니다. 다운로드 파일 형식을 확인해 주세요.');
  }
  let binary = '';
  for (let i=0;i<bytes.length;i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
  return {ok:true,date,name:`한빛탁송_${date}.xlsx`,base64:btoa(binary)};
}
