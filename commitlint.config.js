export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot writes "Bump x from a to b" (sentence case); accept its bump commits.
  ignores: [(message) => /^\w+(\([^)]*\))?: Bump /.test(message)],
  rules: {
    'footer-max-line-length': [0],
    'body-max-line-length': [0],
    'footer-leading-blank': [1, 'always'],
  },
};
