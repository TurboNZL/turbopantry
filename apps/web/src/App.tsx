import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { RecipePage } from './pages/RecipePage.tsx';
import { EditRecipePage, ImportPage, NewRecipePage } from './pages/RecipeEditPages.tsx';
import { RecipesPage } from './pages/RecipesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { ShoppingPage } from './pages/ShoppingPage.tsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/recipes" replace />} />
          <Route path="recipes" element={<RecipesPage />} />
          <Route path="recipes/import" element={<ImportPage />} />
          <Route path="recipes/new" element={<NewRecipePage />} />
          <Route path="recipes/:id" element={<RecipePage />} />
          <Route path="recipes/:id/edit" element={<EditRecipePage />} />
          <Route path="shopping" element={<ShoppingPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/recipes" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
