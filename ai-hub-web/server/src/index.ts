import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { initDatabase } from './config/database';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { aiProxyLimiter, rateLimiter, tencentTokenLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import holidayRoutes from './routes/holiday.routes';
import eventRoutes from './routes/event.routes';
import environmentRoutes from './routes/environment.routes';
import appRoutes from './routes/app.routes';
import aiRoutes from './routes/ai.routes';
import ioLogRoutes from './routes/ioLog.routes';
import tencentRoutes from './routes/tencent.routes';
import inventoryRoutes from './routes/inventory.routes';

dotenv.config();

// ── Startup: 필수 환경변수 누락 시 즉시 종료 ────────────────────────────────
const JWT_SECRET_VALUE = process.env.JWT_SECRET?.trim();
if (!JWT_SECRET_VALUE || JWT_SECRET_VALUE === 'default-secret') {
  console.error('[FATAL] JWT_SECRET is not configured or uses default value. Set a strong secret in server/.env');
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT || 3001);

const SERVE_STATIC = process.env.SERVE_STATIC === 'true' || process.env.NODE_ENV === 'production';
// 항상 0.0.0.0으로 바인딩 — 폰이 http://[PC-IP]:3001/install 로 CA 설치 페이지에 접근해야 함
const HOST = process.env.HOST || '0.0.0.0';

// /install, /rootCA.pem 은 CSP 없이 서빙해야 inline script와 다운로드가 동작함
// 그 외 모든 경로는 CSP 포함 helmet 적용 (SERVE_STATIC 모드에서도 CSP 활성화)
// ngrok 경유 Vite 앱 요청(/inventory.html, /src/*, /@vite/* 등)도 CSP를 끕니다.
//   Vite dev가 HTML에 삽입하는 inline React Refresh preamble이 helmet 기본
//   script-src 'self'에 막히면 @vitejs/plugin-react가 초기화되지 못해 화면이
//   빈 채로 남습니다. 대상은 개발용 Vite dev 서버뿐이며, SERVE_STATIC(빌드 결과
//   서빙) 모드에는 inline preamble이 없으므로 CSP를 그대로 유지합니다.
const helmetWithCsp = helmet();
const helmetNoCsp = helmet({ contentSecurityPolicy: false });

app.use((req, res, next) => {
  if (req.path === '/install' || req.path === '/rootCA.pem') return next();
  const isNgrokViteReq =
    !SERVE_STATIC &&
    (req.headers.host ?? '').includes('ngrok') &&
    !req.path.startsWith('/api/') &&
    req.path !== '/health';
  return isNgrokViteReq ? helmetNoCsp(req, res, next) : helmetWithCsp(req, res, next);
});
app.use(compression());

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:5175,https://localhost:5173,https://localhost:5174,https://localhost:5175')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const allow = () => callback(null, { origin: true, credentials: true });

  // 정적 서빙 모드: origin 없음(직접 접근) 또는 허용 목록
  if (!origin || allowedOrigins.includes(origin)) {
    allow();
    return;
  }
  // 터널(ngrok) 경유 same-origin — 브라우저는 <script type="module">을 CORS 모드로
  // 요청하므로 자기 자신 origin을 Origin 헤더에 실어 보냅니다. 이 origin이 요청
  // Host와 같으면 실질적 same-origin이므로 허용합니다. (허용하지 않으면 앱 번들
  // 요청이 500으로 떨어져 화면이 빈 채로 남습니다)
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
    allow();
    return;
  }
  // PUBLIC_URL이 설정된 경우 해당 origin도 허용
  const publicUrl = process.env.PUBLIC_URL?.trim();
  if (publicUrl) {
    try {
      const pub = new URL(publicUrl);
      if (origin === pub.origin) { allow(); return; }
    } catch { /* ignore */ }
  }
  callback(new Error(`CORS origin not allowed: ${origin}`));
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/tencent')) {
    next()
    return
  }
  logger.info(`${req.method} ${req.path}`)
  next()
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── /rootCA.pem — HTTP로 CA 인증서 직접 다운로드 ────────────────────────────
app.get('/rootCA.pem', (_req, res) => {
  const caPath = path.join(require('os').homedir(), '.vite-plugin-mkcert', 'rootCA.pem');
  if (fs.existsSync(caPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="rootCA.pem"');
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.sendFile(caPath);
  } else {
    res.status(404).json({ error: 'CA 인증서를 찾을 수 없습니다.' });
  }
});

// ── ngrok 경유 시 Vite(5173) 앱 프록시 ────────────────────────────────────────
// ngrok은 3001만 터널링하므로, /inventory.html 및 앱 번들 요청을 Vite로 중계합니다.
// /api/*, /health, /install, /rootCA.pem 은 서버가 직접 처리하므로 제외합니다.
const VITE_PORT = Number(process.env.VITE_PORT || 5173);
const VITE_PROXY_PATHS = /^\/(?!api\/|health|install|rootCA\.pem)(.*)$/;

app.use((req, res, next) => {
  const isNgrokReq = (req.headers.host ?? '').includes('ngrok');
  if (!isNgrokReq || !VITE_PROXY_PATHS.test(req.path)) return next();

  // HTML 문서 요청은 절대 304로 돌려주지 않습니다.
  // 304에는 본문도 헤더도 거의 없어서, 브라우저는 예전에 저장해 둔 응답 헤더를
  // 그대로 재사용합니다(RFC 9111 §4.3.4 — 304에 없는 헤더는 지워지지 않음).
  // 그래서 서버에서 CSP를 고쳐도 예전 CSP가 붙은 캐시 항목이 계속 살아남아
  // inline 스크립트가 차단되고 화면이 빈 채로 남습니다. 조건부 요청 헤더를
  // 떼어 항상 200을 받게 하고, 응답도 캐시에 남기지 않습니다.
  const wantsHtml = (req.headers.accept ?? '').includes('text/html');
  const relayHeaders = { ...req.headers, host: `localhost:${VITE_PORT}` };
  if (wantsHtml) {
    delete relayHeaders['if-none-match'];
    delete relayHeaders['if-modified-since'];
  }

  const options = {
    hostname: 'localhost',
    port: VITE_PORT,
    path: req.url,
    method: req.method,
    headers: relayHeaders,
    rejectUnauthorized: false, // mkcert 자체 서명 인증서 허용
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const resHeaders = { ...proxyRes.headers };
    if (wantsHtml) {
      resHeaders['cache-control'] = 'no-store';
      delete resHeaders['etag'];
      delete resHeaders['last-modified'];
    }
    res.writeHead(proxyRes.statusCode ?? 200, resHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', () => next()); // 프록시 실패 시 다음 핸들러로
  req.pipe(proxyReq, { end: true });
});

// ── 재물조사 앱 설치 안내 페이지 ──────────────────────────────────────────────
app.get('/install', (req, res) => {
  const reqHost = req.headers.host ?? '10.103.140.76:3001';
  const isNgrok = reqHost.includes('ngrok');
  const host = reqHost.split(':')[0];

  // ngrok: CA 설치 불필요, 앱도 ngrok origin 그대로 사용
  // LAN:   CA 설치 필요, 앱은 Vite(5173)
  const caUrl  = isNgrok ? `https://${reqHost}/rootCA.pem` : `http://${host}:3001/rootCA.pem`;
  const appUrl = isNgrok ? `https://${reqHost}/inventory.html` : `https://${host}:5173/inventory.html`;

  // ngrok 시 단계 번호 (CA 단계 없음 → 앱 설치가 1번)
  const appStepNum = isNgrok ? 1 : 2;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>재물조사 앱 설치</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans KR',system-ui,sans-serif;background:#f5f5f7;color:#1d1d1f;padding:24px 16px;max-width:480px;margin:0 auto}
h1{font-size:22px;font-weight:700;margin-bottom:4px}
.sub{color:#6e6e73;font-size:14px;margin-bottom:24px}
.card{background:#fff;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.card.done{border:1.5px solid #34c759;background:#f0faf4}
.step-badge{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#7e14ff;color:#fff;font-size:12px;font-weight:700;margin-right:8px;flex-shrink:0}
.step-title{display:flex;align-items:center;font-size:16px;font-weight:600;margin-bottom:12px}
.note{font-size:12px;color:#6e6e73;margin-top:8px;line-height:1.6}
.btn{display:block;width:100%;padding:14px;border-radius:12px;font-size:15px;font-weight:600;text-align:center;text-decoration:none;margin-top:12px;cursor:pointer;border:none;color:#fff}
.btn-primary{background:#7e14ff}
.btn-green{background:#34c759}
.badge-ok{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#34c759;font-weight:600;margin-bottom:4px}
.os-tab{display:flex;gap:8px;margin-bottom:10px;margin-top:12px}
.os-btn{flex:1;padding:8px;border-radius:8px;font-size:13px;font-weight:500;text-align:center;cursor:pointer;border:1.5px solid #e0e0e0;background:#fff;color:#1d1d1f}
.os-btn.active{border-color:#7e14ff;background:#f3e8ff;color:#7e14ff}
.steps{padding-left:18px;margin-top:10px}
.steps li{font-size:13px;color:#3a3a3c;margin-bottom:6px;line-height:1.5}
details summary{font-size:12px;color:#7e14ff;cursor:pointer;margin-top:8px;list-style:none}
details p{font-size:12px;color:#6e6e73;margin-top:4px;line-height:1.5;padding-left:4px}
</style>
</head>
<body>
<h1>재물조사 앱 설치</h1>
<p class="sub">아래 순서대로 진행하면 앱을 설치할 수 있습니다.</p>

${isNgrok ? `
<!-- ngrok 접속: CA 설치 불필요 -->
<div class="card done">
  <div class="step-title">
    <span class="step-badge" style="background:#34c759">✓</span>
    보안 인증서 설치
  </div>
  <p class="badge-ok">✓ 이미 안전한 연결입니다 — 인증서 설치가 필요하지 않습니다.</p>
  <p style="font-size:12px;color:#6e6e73;margin-top:4px">ngrok 보안 연결을 통해 접속 중입니다.</p>
</div>
` : `
<!-- LAN 접속: CA 설치 필요 -->
<div class="card">
  <div class="step-title"><span class="step-badge">1</span>보안 인증서 설치<span style="font-size:11px;color:#6e6e73;margin-left:6px;font-weight:400">(처음 한 번만)</span></div>
  <p style="font-size:13px;color:#3a3a3c;line-height:1.6">앱이 암호화된 연결(HTTPS)을 사용하므로<br>먼저 보안 인증서를 폰에 설치해야 합니다.</p>
  <div class="os-tab">
    <button class="os-btn active" data-os="android">Android</button>
    <button class="os-btn" data-os="ios">iPhone (iOS)</button>
  </div>
  <div id="tab-android">
    <a href="${caUrl}" class="btn btn-primary" download="rootCA.pem">인증서 다운로드 (rootCA.pem)</a>
    <ol class="steps">
      <li>위 버튼으로 <b>rootCA.pem</b> 다운로드</li>
      <li>설정 앱 → <b>보안 및 개인정보 보호</b></li>
      <li>→ <b>기타 보안 설정</b> → <b>기기 인증서 설치</b></li>
      <li>→ <b>CA 인증서</b> 선택 → 다운로드한 파일 선택</li>
      <li>이름 입력 후 <b>확인</b></li>
    </ol>
    <details><summary>▶ 삼성/갤럭시 경로가 다른 경우</summary>
    <p>설정 → 생체인식 및 보안 → 기타 보안 설정 → 기기 인증서 설치 → CA 인증서</p></details>
  </div>
  <div id="tab-ios" style="display:none">
    <a href="${caUrl}" class="btn btn-primary">인증서 다운로드 (rootCA.pem)</a>
    <ol class="steps">
      <li>위 버튼으로 <b>rootCA.pem</b> 다운로드</li>
      <li>팝업에서 <b>"허용"</b> 선택</li>
      <li>설정 앱 → <b>일반</b> → <b>VPN 및 기기 관리</b></li>
      <li>다운로드된 프로파일 선택 → <b>설치</b></li>
      <li>설정 → 일반 → 정보 → <b>인증서 신뢰 설정</b></li>
      <li>설치한 인증서 옆 토글 → <b>신뢰</b></li>
    </ol>
  </div>
</div>
`}

<div class="card">
  <div class="step-title"><span class="step-badge">${appStepNum}</span>재물조사 앱 열기 및 설치</div>
  <p style="font-size:13px;color:#3a3a3c;line-height:1.6">${isNgrok ? '아래 버튼을 눌러 앱을 여세요.' : '인증서 설치 후 아래 버튼을 눌러 앱을 여세요.'}</p>
  <a href="${appUrl}" class="btn btn-primary" style="margin-top:12px">재물조사 앱 열기</a>
  <p class="note">앱이 열리면 브라우저 메뉴에서 <b>"홈 화면에 추가"</b>를 선택하세요.<br>설치 후에는 Wi-Fi 없이도 앱이 실행됩니다.</p>
</div>

<script>
(function(){
  // OS 탭 전환 — onclick 대신 addEventListener (CSP script-src-attr 'none' 우회)
  var tabs = document.querySelectorAll('.os-btn');
  tabs.forEach(function(btn){
    btn.addEventListener('click', function(){
      var os = btn.getAttribute('data-os');
      document.getElementById('tab-android').style.display = os==='android' ? '' : 'none';
      document.getElementById('tab-ios').style.display     = os==='ios'     ? '' : 'none';
      tabs.forEach(function(b){ b.className = 'os-btn' + (b.getAttribute('data-os')===os ? ' active' : ''); });
    });
  });
  // 기기 자동 감지
  if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){
    document.querySelector('[data-os="ios"]').click();
  }
})();
</script>
</body>
</html>`);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/environment', environmentRoutes);
app.use('/api/apps', appRoutes);
app.use('/api/ai', aiProxyLimiter, aiRoutes);
app.use('/api/tencent', tencentTokenLimiter, tencentRoutes);
app.use('/api/io-log', ioLogRoutes);
app.use('/api/inventory', inventoryRoutes);

// ── 정적 파일 서빙 (프로덕션/SERVE_STATIC 모드) ───────────────────────────────
// 빌드된 React 앱(../dist)을 API 뒤에 serve.
// 모든 미매칭 GET 요청은 index.html로 fallback → SPA 라우팅 지원.
if (SERVE_STATIC) {
  // 서버 src/에서 두 단계 위가 프로젝트 루트, dist는 그 아래
  const distDir = path.resolve(__dirname, '../../dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { maxAge: '1h', etag: true }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
    logger.info(`Serving static files from ${distDir}`);
  } else {
    logger.warn(`SERVE_STATIC=true but dist/ not found at ${distDir}. Run: npm run build`);
    app.use((_req, res) => {
      res.status(404).send('Frontend not built. Run: cd ai-hub-web && npm run build');
    });
  }
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });
}

app.use(errorHandler);

const startServer = async () => {
  try {
    await initDatabase();
    logger.info('Database initialized');
    app.listen(PORT, HOST, () => {
      logger.info(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start:', error);
    process.exit(1);
  }
};

startServer();
