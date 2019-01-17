/**
 * @jest-environment node
 */

/* global describe beforeAll it expect */

// eslint-disable-next-line strict,lines-around-directive
'use strict';

const path = require('path');
const glob = require('glob');
const { rollup } = require('rollup');
const commonjs = require('rollup-plugin-commonjs');
const resolve = require('rollup-plugin-node-resolve');
const replace = require('rollup-plugin-replace');
const uglify = require('rollup-plugin-uglify');
const virtual = require('rollup-plugin-virtual');

const cwd = path.resolve(__dirname, '../es');
const files = glob.sync('**/*.js', {
  cwd,
  ignore: [
    'bundle.js',
    'index.js',
    'globals/js/boot.js',
    'globals/js/components.js',
    'globals/js/watch.js',
    '**/*.config.js',
    // TODO: Make Flatpickr tree-shakable
    '**/date-picker.js',
  ],
});

describe('ES modules', () => {
  let lodashOutput;
  let emptyOutput;
  const entry = '__entry_module__';

  beforeAll(async () => {
    const [lodashBundle, emptyBundle] = await Promise.all([
      rollup({
        input: entry,
        plugins: [
          virtual({
            [entry]: `
              import debounce from 'lodash.debounce';
              /*#__PURE__*/
              (function () { console.log(debounce); })();
            `,
          }),
          commonjs({
            include: 'node_modules/**',
            sourceMap: false,
          }),
          resolve(),
          uglify(),
        ],
        onwarn: (warning, handle) => {
          if (warning.code !== 'EMPTY_BUNDLE') handle(warning);
        },
      }),
      rollup({
        input: entry,
        plugins: [
          virtual({
            [entry]: `
              /*#__PURE__*/
              (function () { console.log(0); })();
            `,
          }),
          uglify(),
        ],
        onwarn: (warning, handle) => {
          if (warning.code !== 'EMPTY_BUNDLE') handle(warning);
        },
      }),
    ]);
    [lodashOutput, emptyOutput] = await Promise.all([
      lodashBundle.generate({ format: 'iife' }),
      emptyBundle.generate({ format: 'iife' }),
    ]);
  });

  it.each(files)('%s should be tree-shakable', async relativeFilePath => {
    const filepath = path.join(cwd, relativeFilePath);
    const bundle = await rollup({
      input: entry,
      plugins: [
        virtual({
          [entry]: `import ${JSON.stringify(filepath)}`,
        }),
        commonjs({
          include: ['node_modules/**', 'src/globals/js/settings.js', 'src/globals/js/feature-flags.js'],
          sourceMap: false,
        }),
        resolve(),
        replace({
          'process.env.NODE_ENV': JSON.stringify('production'),
        }),
        uglify(),
      ],
      onwarn: (warning, handle) => {
        if (warning.code !== 'EMPTY_BUNDLE') handle(warning);
      },
    });
    const output = await bundle.generate({ format: 'iife' });
    // lo-dash seems to remain small chunk of code after tree-shaken
    const code = output.code
      .trim()
      .replace(lodashOutput.code.trim(), '')
      .replace(emptyOutput.code.trim(), '');
    expect(code).toBe('');
  });
});