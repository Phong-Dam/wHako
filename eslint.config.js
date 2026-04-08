// ============================================================
// ESLint Flat Config for wHako
// ============================================================
import globals from 'globals';

export default [
    // Ignore patterns
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'release/**',
            '.electron/**',
            'out/**',
            'scripts/generate-icons.js'
        ]
    },

    // Main process files (Node.js)
    {
        files: ['src/main/**/*.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'indent': ['warn', 4],
            'linebreak-style': ['warn', 'unix'],
            'quotes': ['warn', 'single'],
            'semi': ['warn', 'always'],
            'no-console': 'off',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'eqeqeq': ['warn', 'always'],
            'prefer-const': 'warn',
            'no-var': 'error'
        }
    },

    // Preload files (Node.js in Electron context)
    {
        files: ['src/preload/**/*.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'indent': ['warn', 4],
            'quotes': ['warn', 'single'],
            'semi': ['warn', 'always'],
            'no-console': 'off',
            'no-var': 'error'
        }
    },

    // Renderer files (Browser environment)
    {
        files: ['src/renderer/**/*.js'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2021
            }
        },
        rules: {
            'indent': ['warn', 4],
            'linebreak-style': ['warn', 'unix'],
            'quotes': ['warn', 'single'],
            'semi': ['warn', 'always'],
            'no-console': 'off',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'eqeqeq': ['warn', 'always'],
            'prefer-const': 'warn',
            'no-var': 'error',
            'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }],
            'no-trailing-spaces': 'warn',
            'arrow-spacing': 'warn',
            'keyword-spacing': 'warn'
        }
    }
];
