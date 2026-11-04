const ALLOWED_ORIGINS = new Set([
  'https://koreahistory.mcnorton.com',
  'https://koreahistory-app.vercel.app',
]);
const CATEGORIES = {
  bug: '버그 및 오류 신고',
  feature: '추가 요청',
  case: '활용 사례',
  general: '자유 의견',
};
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NICKNAME_LENGTH = 30;
const MAX_BODY_BYTES = 16 * 1024;

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

// Slack 제어 문법(<!channel>, <@사용자>, 링크)을 글자 그대로 보여 주도록 바꾼다.
function escapeSlack(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const reply = (status, body) => Response.json(body, { status, headers: corsHeaders(origin) });

  if (!ALLOWED_ORIGINS.has(origin)) {
    return reply(403, { error: 'forbidden_origin' });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return reply(413, { error: 'too_large' });
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return reply(400, { error: 'invalid_json' });
  }

  // 사람에게 보이지 않는 칸이 채워져 있으면 자동 입력으로 보고 조용히 버린다.
  if (typeof data?.website === 'string' && data.website !== '') {
    return reply(200, { ok: true });
  }

  const label = Object.hasOwn(CATEGORIES, data?.category) ? CATEGORIES[data.category] : null;
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  if (!label) return reply(400, { error: 'invalid_category' });
  if (!message) return reply(400, { error: 'empty_message' });
  if (message.length > MAX_MESSAGE_LENGTH) return reply(400, { error: 'message_too_long' });

  // 별명은 선택 항목이고, from 줄 하나에 들어가도록 공백과 줄바꿈을 한 칸으로 줄인다.
  const nickname = typeof data?.nickname === 'string' ? data.nickname.replace(/\s+/g, ' ').trim() : '';
  if (nickname.length > MAX_NICKNAME_LENGTH) return reply(400, { error: 'nickname_too_long' });

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.error('SLACK_WEBHOOK_URL is not set');
    return reply(500, { error: 'not_configured' });
  }

  const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const signature = nickname ? `\nfrom. ${escapeSlack(nickname)} 님` : '';
  const text = `*한국역사연표 의견* (${label})\n${escapeSlack(message)}\n_${time}_${signature}`;

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('Slack webhook failed', res.status);
      return reply(502, { error: 'delivery_failed' });
    }
  } catch (err) {
    console.error('Slack webhook error', err.name);
    return reply(502, { error: 'delivery_failed' });
  }

  return reply(200, { ok: true });
}
