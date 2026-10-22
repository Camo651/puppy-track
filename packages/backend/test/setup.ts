// Run tests in a fixed timezone and the test environment. NODE_ENV=test makes
// the db client use a throwaway in-memory database with a clean, migrated schema
// per run, so tests never touch the real data file.
process.env.TZ = "UTC";
process.env.NODE_ENV = "test";
