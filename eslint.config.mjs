/**
 * File: eslint.config.mjs
 * Path: eslint.config.mjs
 * Description: Enforces the process boundaries: main, preload and renderer import
 * nothing from each other; only src/common crosses. Test files are exempt (some
 * check that two sides agree by importing both).
 */
import tseslint from "typescript-eslint";

// Some sources carry `eslint-disable react-hooks/exhaustive-deps` comments from before
// this config existed. The rule is not enforced here; a no-op stand-in keeps those
// comments from being reported as unknown rules.
const reactHooksStandIn = {
  rules: { "exhaustive-deps": { meta: { schema: [] }, create: () => ({}) } },
};

const PROCESSES = ["main", "preload", "renderer"];

/** Patterns that reach into a process folder other than `own`. */
function forbidden(own) {
  const others = PROCESSES.filter((p) => p !== own);
  return [
    {
      group: others.flatMap((p) => [`**/${p}`, `**/${p}/**`]),
      message: `src/${own} must not import src/${others.join(" or src/")}. Share through src/common.`,
    },
  ];
}

export default tseslint.config(
  { ignores: ["dist/**", "out/**", "node_modules/**", "resources/**", "audit/**", "scripts/**", "**/*.cjs"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooksStandIn },
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  ...PROCESSES.map((own) => ({
    files: [`src/${own}/**/*.{ts,tsx}`],
    ignores: ["**/*.test.{ts,tsx}", `src/${own}/**/testSupport/**`],
    rules: { "no-restricted-imports": ["error", { patterns: forbidden(own) }] },
  })),
  {
    files: ["src/common/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: PROCESSES.flatMap((p) => [`**/${p}`, `**/${p}/**`]),
              message: "src/common must not import any process folder.",
            },
          ],
        },
      ],
    },
  },
);
