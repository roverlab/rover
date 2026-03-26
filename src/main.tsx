import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { redirectConsole, setupGlobalErrorHandler } from './services/logger';
import { initI18n } from './i18n';

// 重定向 console.log/error 到 logger
redirectConsole();

// 设置全局错误处理器，捕获未处理的异常
setupGlobalErrorHandler();

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <App />
  );
});
