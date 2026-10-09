import {test} from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {preparedPhoneEnvironment,validPhoneApiUrl} from './prepare-client-phone.mjs';
const secret='test-only-private-key-'+'a'.repeat(48);
test('phone configuration preserves existing provider keys and stays disabled',()=>{
  const original='OPENAI_API_KEY=synthetic-not-a-real-key\nTWILIO_AUTH_TOKEN=synthetic-token\n';
  const updated=preparedPhoneEnvironment(original,secret,'http://127.0.0.1:3003'),values=dotenv.parse(updated);
  assert.ok(updated.startsWith(original));assert.equal(values.NOURISH_CLIENT_PHONE_ENABLED,'false');assert.equal(values.OPENAI_API_KEY,'synthetic-not-a-real-key');
  assert.equal(preparedPhoneEnvironment(updated,secret,'http://127.0.0.1:3003'),updated);
});
test('phone configuration refuses mismatched or ingestion-only keys',()=>{
  assert.throws(()=>preparedPhoneEnvironment('NOURISH_AGENT_API_TOKEN=different\n',secret,'http://127.0.0.1:3003'),/differs/);
  assert.throws(()=>preparedPhoneEnvironment('NOURISH_VOICE_API_TOKEN='+secret+'\n',secret,'http://127.0.0.1:3003'),/separate/);
});
test('phone API accepts local origins or HTTPS, never credentials, paths or public HTTP',()=>{
  for(const url of ['http://127.0.0.1:3003','http://localhost:3003','https://nourish.example.invalid'])assert.ok(validPhoneApiUrl(url));
  for(const url of ['http://public.example.invalid','https://key@example.invalid','https://example.invalid/feed','https://example.invalid?key=secret','not a url'])assert.equal(validPhoneApiUrl(url),false);
});
