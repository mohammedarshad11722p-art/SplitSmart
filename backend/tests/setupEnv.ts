// Location: backend/tests/setupEnv.ts
// Gives tests a valid env so config/env.ts doesn't exit. No real DB is used.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.FRONTEND_URL ??= "http://localhost:3000";
