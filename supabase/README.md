# Backend boundary

Phase 0 contains architectural and callback/CORS studies. No live project has
been changed; production tables/migrations are not implemented. Phase 1 must
implement ADR 0006, local migration/RLS tests and authenticated outbox transport.
Identify a dedicated Free project before deployment; do not reuse an unrelated
project. Keepalive/backup workflows require a real backend and a private encrypted
destination. Do not create empty success jobs for unimplemented features.
