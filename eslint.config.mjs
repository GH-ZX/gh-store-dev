import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  {
    ignores: [
      ".next/**",
      "storefront/node_modules/**",
      "storefront/build/**",
      "storefront/.react-router/**",
      "storefront/.wrangler/**",
      "storefront/worker-configuration.d.ts",
      "out/**",
      "build/**",
      ".open-next/**",
      ".wrangler/**",
      "next-env.d.ts",
      "supabase/functions/**",
      "legacy-next-snapshot/**",
    ],
  }
);
