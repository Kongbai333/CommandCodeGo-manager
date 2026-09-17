// 应用入口路由(H1:管理界面已取消登录,直接进入外壳)。
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastHost } from './ui';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Logs } from './pages/Logs';
import { Usage } from './pages/Usage';
import { Models } from './pages/Models';
import { Keys } from './pages/Keys';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/models" element={<Models />} />
          <Route path="/keys" element={<Keys />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
    </BrowserRouter>
  );
}
