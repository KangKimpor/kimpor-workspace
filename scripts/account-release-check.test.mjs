import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAccountReadiness } from './account-release-check.mjs';
const proof = { project_ref:'nlcpjdokfvawlpzyfytx', otp_length:6, otp_expiry_seconds:600,
  custom_smtp:true, code_templates_only:true, google_enabled:true, google_existing_account_link_verified:true, email_code_delivery_verified:true };
test('release remains blocked when any real account prerequisite is missing', () => {
  for(const key of ['custom_smtp','code_templates_only','google_enabled','google_existing_account_link_verified','email_code_delivery_verified'])
    assert.throws(()=>requireAccountReadiness({...proof,[key]:false}), /pending verified/);
  assert.throws(()=>requireAccountReadiness({...proof,project_ref:'another-project'}), /pending verified/);
  assert.throws(()=>requireAccountReadiness({...proof,otp_expiry_seconds:3600}), /pending verified/);
  assert.doesNotThrow(()=>requireAccountReadiness(proof));
});
