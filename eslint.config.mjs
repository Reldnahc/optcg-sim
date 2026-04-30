import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import vitest from "eslint-plugin-vitest";

const nodeGlobals = {
  ...globals.node,
};

const typedConfigs = [
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
].map((config) => ({
  ...config,
  files: ["**/*.{ts,mts,cts}"],
  languageOptions: {
    ...config.languageOptions,
    globals: nodeGlobals,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "tests/fixtures/eslint/**",
      "tests/fixtures/prettier/ignored/**",
    ],
  },
  js.configs.recommended,
  ...typedConfigs,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 5,
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: [
      "packages/**/*.{ts,mts,cts,js,mjs,cjs}",
      "tests/fixtures/eslint/production-smells.ts",
      "tests/fixtures/eslint/packages/**/*.{ts,mts,cts,js,mjs,cjs}",
    ],
    rules: {
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Use named exports instead of default exports.",
        },
      ],
    },
  },
  {
    files: [
      "packages/engine-core/**/*.{ts,mts,cts,js,mjs,cjs}",
      "tests/fixtures/eslint/packages/engine-core/**/*.{ts,mts,cts,js,mjs,cjs}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "redis", "pg"],
          patterns: ["**/client/**", "**/server/**", "**/view-engine/**"],
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,mts,cts,js,mjs,cjs}"],
    plugins: {
      vitest,
    },
    rules: {
      "vitest/no-focused-tests": "error",
    },
  },
];
