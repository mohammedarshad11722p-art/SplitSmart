// Location: backend/tests/setupEnv.ts
// Gives tests a valid env so config/env.ts doesn't exit.
// AI_PROVIDER=mock means tests never call the real AI (free, fast, offline).
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.FRONTEND_URL ??= "http://localhost:3000";
process.env.AI_PROVIDER = "mock";
delete process.env.CLOUDINARY_CLOUD_NAME;
