import { createBrowserRouter, type RouteObject } from 'react-router';
import { LoginPage } from './pages/LoginPage.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { AppLayout } from './components/AppLayout.tsx';
import { InvitePage } from './pages/InvitePage.tsx';
import { SetupPage } from './pages/SetupPage.tsx';
import { JoinPage } from './pages/JoinPage.tsx';
import { RecoverPage } from './pages/RecoverPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { AgentEditorPage } from './pages/AgentEditorPage.tsx';
import { PlannerPage } from './pages/PlannerPage.tsx';
import { RequireAuth } from './auth/RequireAuth.tsx';
import { PushOpenPage } from './pages/PushOpenPage.tsx';
import { ImportPage } from './pages/ImportPage.tsx';

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/invite',
    element: <InvitePage />,
  },
  {
    path: '/join',
    element: <JoinPage />,
  },
  {
    path: '/setup',
    element: <SetupPage />,
  },
  {
    path: '/recover',
    element: <RecoverPage />,
  },
  {
    path: '/import',
    element: (
      <RequireAuth>
        <ImportPage />
      </RequireAuth>
    ),
  },
  {
    path: '/push-open',
    element: (
      <RequireAuth>
        <PushOpenPage />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <ChatPage />,
      },
      {
        path: 'chats/:chatId',
        element: <ChatPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'daily',
        element: <ChatPage />,
      },
      {
        path: 'planner',
        element: <PlannerPage />,
      },
      {
        path: 'agents/new',
        element: <AgentEditorPage />,
      },
      {
        path: 'agents/:agentId',
        element: <AgentEditorPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
