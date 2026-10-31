(() => {
  const frame = document.querySelector('iframe');
  let sequence = 0;
  function request(type, timeout) {
    const id = `${Date.now()}-${++sequence}`;
    return new Promise((resolve,reject) => {
      const finish = result => { clearTimeout(timer); window.removeEventListener('message',receive); resolve(result); };
      function receive(event) {
        if (event.source === window && event.origin === location.origin &&
            event.data?.source === 'worktool-hanbit-connector' && event.data.id === id) finish(event.data.result);
      }
      const timer = setTimeout(() => {
        window.removeEventListener('message',receive);
        reject(new Error('한빛탁송 연결 확장기능이 필요합니다. 설치 안내를 확인한 뒤 새로고침해 주세요.'));
      },timeout);
      window.addEventListener('message',receive);
      window.postMessage({source:'worktool-hanbit-page',id,type},location.origin);
    });
  }
  function setup() {
    const doc = frame.contentDocument, app = frame.contentWindow.DispatchApp;
    if (!app || doc.getElementById('hanbitToday')) return;
    const box = doc.createElement('div');
    box.style.cssText = 'padding:12px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center';
    box.innerHTML = '<button type="button" class="button" id="hanbitToday">한빛탁송 오늘 엑셀 자동 가져오기</button><a target="_blank" rel="noopener" href="https://check.hanbitdeli.com/member/login?redirect=/admin">한빛탁송 로그인 ↗</a><a target="_blank" rel="noopener" href="./hanbit-setup.html">연결 설치 안내</a><p id="hanbitStatus" role="status" aria-live="polite" style="width:100%;margin:0;font-size:12px;line-height:1.7">한국 시간 기준 오늘의 시작일·종료일로 가져옵니다.</p>';
    doc.querySelector('.filescard .sectionhint').after(box);
    const button = doc.getElementById('hanbitToday'), status = doc.getElementById('hanbitStatus');
    let fetching = false;
    button.onclick = async () => {
      if (fetching || doc.body.classList.contains('busy')) return;
      fetching = true; button.disabled = true;
      status.textContent = '한빛탁송 연결 확인 중…';
      status.setAttribute('role','status'); status.style.color = '';
      try {
        const ping = await request('HANBIT_PING',2000);
        if (!ping?.ok) throw new Error(ping?.message || '한빛탁송 연결 확인에 실패했습니다.');
        status.textContent = '오늘 한빛탁송 엑셀을 가져오는 중…';
        const result = await request('HANBIT_TODAY',120000);
        if (!result?.ok) throw new Error(result?.code === 'LOGIN_REQUIRED'
          ? '한빛탁송 로그인 필요 — 위의 한빛탁송 로그인에서 로그인한 뒤 다시 가져오기를 눌러 주세요.'
          : result?.message || '한빛탁송 엑셀을 가져오지 못했습니다.');
        if (doc.body.classList.contains('busy')) throw new Error('다른 파일을 처리 중입니다. 처리가 끝난 뒤 다시 가져와 주세요.');
        const bytes = Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
        // Parse before changing attachments. An unexpected workbook must not replace good data.
        const name = result.name;
        const parsed = await app.readFile(bytes.slice().buffer,name,null,false);
        if (!parsed.records.length || parsed.records.some(r=>r.vendor !== 'A'))
          throw new Error('한빛탁송 양식의 기록을 확인하지 못했습니다. 기존 파일은 유지됩니다.');
        if (doc.body.classList.contains('busy')) throw new Error('다른 파일을 처리 중입니다. 처리가 끝난 뒤 다시 가져와 주세요.');
        const before = new Set(app.getFiles());
        const previous = app.getFiles().filter(f=>f.hanbitAuto);
        const file = new frame.contentWindow.File([bytes],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',lastModified:Date.now()});
        await doc.getElementById('fileInput').onchange({target:{files:[file]}});
        const added = app.getFiles().find(f=>!before.has(f)&&f.name===name);
        if (!added) throw new Error('엑셀을 첨부하지 못했습니다. 첨부 결과를 확인해 주세요.');
        added.hanbitAuto = true;
        for (const old of previous) {
          const index = app.getFiles().indexOf(old);
          if (index >= 0) doc.getElementById('fileList').children[index]?.querySelector('.remove')?.click();
        }
        status.textContent = `${result.date} 한빛탁송 ${added.records.length.toLocaleString('ko-KR')}건 자동 첨부 완료. 차량 조회하기를 눌러 주세요.`;
      } catch (error) {
        status.textContent = error.message;
        status.setAttribute('role','alert'); status.style.color = '#b42318';
      } finally { fetching = false; button.disabled = doc.body.classList.contains('busy'); }
    };
  }
  frame.addEventListener('load',setup);
  if (frame.contentDocument?.readyState === 'complete') setup();
})();
