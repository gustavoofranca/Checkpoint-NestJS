import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { SignInPage, SignUpPage } from './pages/AuthPages';
import { CatalogPage } from './pages/CatalogPage';
import { GamePage } from './pages/GamePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { RouteErrorPage } from './pages/RouteErrorPage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <CatalogPage /> },
      { path: 'games/:slug', element: <GamePage /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'sign-up', element: <SignUpPage /> },
      { path: 'u/:username', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
