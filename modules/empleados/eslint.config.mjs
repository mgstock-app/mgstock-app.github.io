import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "out/**", "coverage/**", "docs/screenshots/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "no-empty": ["error", { allowEmptyCatch: true }] },
  },
  {
    files: ["**/*.tsx", "hooks/**/*.ts"],
    plugins: { "react-hooks": hooks, "jsx-a11y": a11y },
    rules: {
      ...hooks.configs.recommended.rules,
      ...a11y.configs.recommended.rules,
    },
  },
  {
    files: ["features/**/*.js"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { caughtErrors: "none", varsIgnorePattern: "^(tar)$" },
      ],
      "@typescript-eslint/no-this-alias": "off",
      "no-useless-escape": "off",
    },
  },
  {
    files: ["scripts/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
