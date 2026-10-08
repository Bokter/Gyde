export default {
  '*.{ts,tsx,js,mjs,cjs}': ['eslint --fix', 'prettier --write --ignore-unknown'],
  '*.{json,yaml,yml,css}': ['prettier --write --ignore-unknown'],
};
