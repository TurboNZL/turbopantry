import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { RecipesPage } from './pages/RecipesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { ShoppingPage } from './pages/ShoppingPage.tsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RecipesPage />} />
          <Route path="shopping" element={<ShoppingPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<RecipesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
