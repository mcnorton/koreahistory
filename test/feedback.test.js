import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { POST, OPTIONS } from '../api/feedback.js';

const ORIGIN = 'https://koreahistory.mcnorton.com';
const realFetch = globalThis.fetch;
let sent;
let slackStatus;

function req(body, origin = ORIGIN) {
  return new Request('https://x.test/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  sent = [];
  slackStatus = 200;
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.example.test/fake';
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response('ok', { status: slackStatus });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

test('정상 의견을 Slack으로 보낸다', async () => {
  const res = await POST(req({ category: 'bug', message: '  3.1운동 날짜 확인 부탁드려요  ' }));
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /버그 및 오류 신고/);
  assert.match(sent[0].body.text, /3\.1운동 날짜 확인 부탁드려요/);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('Slack 멘션과 링크 문법을 무력화한다', async () => {
  await POST(req({ category: 'general', message: '<!channel> <http://evil.test|클릭> & 끝' }));
  const t = sent[0].body.text;
  assert.ok(!t.includes('<!channel>'));
  assert.ok(!t.includes('<http://'));
  assert.ok(t.includes('&lt;!channel&gt;'));
  assert.ok(t.includes('&amp; 끝'));
});

test('다른 출처와 출처 없는 요청을 막는다', async () => {
  for (const o of ['https://evil.test', null]) {
    const res = await POST(req({ category: 'bug', message: 'x' }, o));
    assert.equal(res.status, 403);
  }
  assert.equal(sent.length, 0);
});

test('잘못된 입력을 거절한다', async () => {
  const cases = [
    [{ category: 'nope', message: 'x' }, 'invalid_category'],
    [{ category: 'constructor', message: 'x' }, 'invalid_category'],
    [{ category: 'bug', message: '   ' }, 'empty_message'],
    [{ category: 'bug', message: 123 }, 'empty_message'],
    [{ category: 'bug', message: 'a'.repeat(2001) }, 'message_too_long'],
    ['{not json', 'invalid_json'],
    ['null', 'invalid_category'],
  ];
  for (const [body, error] of cases) {
    const res = await POST(req(body));
    assert.equal(res.status, 400, error);
    assert.equal((await res.json()).error, error);
  }
  assert.equal(sent.length, 0);
});

test('너무 큰 요청을 거절한다', async () => {
  const res = await POST(req({ category: 'bug', message: 'a'.repeat(20000) }));
  assert.equal(res.status, 413);
});

test('숨은 칸이 채워진 요청은 성공처럼 답하고 보내지 않는다', async () => {
  const res = await POST(req({ category: 'bug', message: 'spam', website: 'http://spam' }));
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test('Slack 실패와 설정 누락을 성공으로 답하지 않는다', async () => {
  slackStatus = 500;
  assert.equal((await POST(req({ category: 'bug', message: 'x' }))).status, 502);
  globalThis.fetch = async () => { throw new Error('network'); };
  assert.equal((await POST(req({ category: 'bug', message: 'x' }))).status, 502);
  delete process.env.SLACK_WEBHOOK_URL;
  assert.equal((await POST(req({ category: 'bug', message: 'x' }))).status, 500);
});

test('사전 요청은 허용한 출처에만 CORS 헤더로 답한다', () => {
  const pre = (origin) => OPTIONS(new Request('https://x.test/api/feedback', { method: 'OPTIONS', headers: { Origin: origin } }));
  for (const o of [ORIGIN, 'https://koreahistory-app.vercel.app']) {
    const res = pre(o);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), o);
    assert.match(res.headers.get('access-control-allow-methods'), /POST/);
  }
  assert.equal(pre('https://evil.test').headers.get('access-control-allow-origin'), null);
});

test('Vercel 주소에서 보낸 의견도 받는다', async () => {
  const res = await POST(req({ category: 'case', message: '활용 사례' }, 'https://koreahistory-app.vercel.app'));
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://koreahistory-app.vercel.app');
});

test('별명이 있으면 메시지 마지막 줄에 보여 준다', async () => {
  const res = await POST(req({ category: 'general', message: '좋아요', nickname: '  역사 선생님  ' }));
  assert.equal(res.status, 200);
  assert.equal(sent[0].body.text.split('\n').at(-1), 'from. 역사 선생님 님');
});

test('별명이 없거나 비어 있으면 from 줄을 넣지 않는다', async () => {
  for (const nickname of [undefined, '', '   ', null, 123]) {
    const res = await POST(req({ category: 'general', message: '좋아요', nickname }));
    assert.equal(res.status, 200);
  }
  assert.equal(sent.length, 5);
  for (const s of sent) assert.ok(!s.body.text.includes('from.'));
});

test('별명의 Slack 문법과 줄바꿈을 무력화한다', async () => {
  await POST(req({ category: 'general', message: 'x', nickname: '<!channel>\n*가짜*\t줄' }));
  const last = sent[0].body.text.split('\n').at(-1);
  assert.equal(last, 'from. &lt;!channel&gt; *가짜* 줄 님');
});

test('너무 긴 별명을 거절한다', async () => {
  assert.equal((await POST(req({ category: 'general', message: 'x', nickname: 'a'.repeat(30) }))).status, 200);
  const res = await POST(req({ category: 'general', message: 'x', nickname: 'a'.repeat(31) }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'nickname_too_long');
  assert.equal(sent.length, 1);
});
