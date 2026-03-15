/**
 * 仅 Renderer 配置，用于 dev server（多编译器时 dev server 可能无法正确提供 index.html）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { rspack } from '@rspack/core';
import ReactRefreshRspackPlugin from '@rspack/plugin-react-refresh';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv();

/** @type {import('@rspack/core').Configuration} */
export default {
   cache: false,
  target: 'web',
  experiments: { css: true ,cache: {type: 'memory'}},
  entry: './src/main.tsx',
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name].js',
    chunkFilename: '[name].chunk.js',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
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
                  development: true,
                  refresh: true,
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
      publicPath: '/',
      scriptLoading: 'module',
    }),
    new rspack.CopyRspackPlugin({
      patterns: [{ from: 'public', to: '.', noErrorOnMissing: true }],
    }),
    new rspack.DefinePlugin({
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
      'process.env.BASE_URL': JSON.stringify('/'),
      'process.env.NODE_ENV': JSON.stringify('development'),
    }),
    new ReactRefreshRspackPlugin(),
  ],
  devServer: {
    port: 5173,
    hot: process.env.DISABLE_HMR !== 'true',
    client: {
      overlay: false,
    },
  },
  devtool: 'eval-cheap-module-source-map',
};
