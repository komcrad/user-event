export default {
  input: 'src/index.js',
  external: ['@testing-library/dom'],
  output: {
    file: 'umd/bundle.js',
    format: 'umd',
    name: 'TestingLibraryUserEvent',
    globals: {
      '@testing-library/dom': 'TestingLibraryDom',
    }
  }
}
