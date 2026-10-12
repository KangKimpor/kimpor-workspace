import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function requireAccountReadiness(proof) {
  if (proof.project_ref !== 'nlcpjdokfvawlpzyfytx' || proof.otp_length !== 6 || proof.otp_expiry_seconds !== 600 ||
      !['custom_smtp','code_templates_only','google_enabled','google_existing_account_link_verified','email_code_delivery_verified'].every(key => proof[key] === true))
    throw new Error('Account release is pending verified SMTP, code-only templates, email delivery and existing-account Google linking.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireAccountReadiness(JSON.parse(await readFile(new URL('../docs/evidence/account-auth-readiness.json', import.meta.url), 'utf8')));
    if (process.env.KIMPOR_CLOUD_READY === 'false' || !process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
      throw new Error('Production requires an account configuration; unconfigured builds are development fixtures.');
    console.log('Account release readiness passed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
