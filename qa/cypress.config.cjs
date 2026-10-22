/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
module.exports = {
  video: false,
  screenshotOnRunFailure: true,
  e2e: {
    baseUrl: "http://127.0.0.1:3100",
    supportFile: false,
    specPattern: "cypress/e2e/**/*.cy.js",
    defaultCommandTimeout: 10000,
    setupNodeEvents(on) {
      on("task", {
        mockSupabase() {
          return readFileSync(resolve(__dirname, "../tests/mock_supabase.js"), "utf8");
        },
      });
    },
  },
};
