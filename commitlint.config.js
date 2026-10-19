export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow long trailer lines (Co-Authored-By, Claude-Session URLs).
    'footer-max-line-length': [0],
    'body-max-line-length': [0],
    'footer-leading-blank': [1, 'always'],
  },
};
