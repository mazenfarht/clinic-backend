process.env.NODE_ENV = "test";

process.env.DATABASE_URL =
  "postgresql://clinic:mazen%401710@localhost:5432/clinic_test_db?schema=public";

process.env.JWT_SECRET =
  "test-jwt-secret-key-for-automated-tests-only-0123456789";

process.env.JWT_REFRESH_SECRET =
  "test-jwt-refresh-secret-key-for-automated-tests-only-9876543210";

process.env.JWT_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.BCRYPT_SALT_ROUNDS = "4";
process.env.CORS_ORIGIN = "http://localhost:3000";
process.env.RATE_LIMIT_MAX = "100000";
