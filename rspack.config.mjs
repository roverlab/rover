import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { rspack } from '@rspack/core';
import ReactRefreshRspackPlugin from '@rspack/plugin-react-refresh';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载 .env
loadDotenv();

const isDev = process.env.NODE_ENV !== 'production';

/** @type {import('@rspack/core').Configuration[]} */
export default [
  // Renderer 进程 (React + Tailwind)
  {
    name: 'renderer',
    target: 'web',
    experiments: { css: true,cache: {type: 'memory'} },
    entry: './src/main.tsx',
    output: {
      path: path.join(__dirname, 'dist'),
      filename: isDev ? '[name].js' : '[name].[contenthash:8].js',
      chunkFilename: isDev ? '[name].chunk.js' : '[name].[contenthash:8].chunk.js',
      publicPath: './',
      clean: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: isDev,
                    refresh: isDev,
                  },
                },
              },
            },
          },
        },
        {
          test: /\.css$/,
          use: ['postcss-loader'],
          type: 'css',
        },
      ],
    },
    plugins: [
      new rspack.HtmlRspackPlugin({
        template: './index.html',
        title: 'Rover',
        publicPath: './',
        scriptLoading: 'module',
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          { from: 'public', to: '.', noErrorOnMissing: true },
        ],
      }),
      new rspack.DefinePlugin({
        'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
        'process.env.BASE_URL': JSON.stringify('./'),
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      }),
      isDev && new ReactRefreshRspackPlugin(),
    ].filter(Boolean),
    devServer: isDev
      ? {
          port: 5173,
          hot: process.env.DISABLE_HMR !== 'true',
              client: {
      overlay: false,
    },
        }
      : undefined,
    devtool: isDev ? 'eval-cheap-module-source-map' : 'source-map',
  },
  // Main 进程
  {
    name: 'main',
    target: 'electron-main',
    node: { __dirname: true, __filename: true },
    entry: './electron/main.ts',
    output: {
      path: path.join(__dirname, 'dist-electron'),
      filename: 'main.cjs',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
              },
            },
          },
        },
      ],
    },
    externalsPresets: { electronMain: true },
    plugins: [new rspack.electron.ElectronTargetPlugin()],
    devtool: isDev ? 'eval-source-map' : 'source-map',
  },
  // Preload 脚本
  {
    name: 'preload',
    target: 'electron-preload',
    entry: './electron/preload.ts',
    output: {
      path: path.join(__dirname, 'dist-electron'),
      filename: 'preload.mjs',
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
              },
            },
          },
        },
      ],
    },
    externalsPresets: { electronPreload: true },
    plugins: [new rspack.electron.ElectronTargetPlugin()],
    devtool: isDev ? 'eval-source-map' : 'source-map',
  },
];
