import { Navigate, Route, Routes } from 'react-router';

import { RequireAuth } from '@/features/auth/index.js';
import { AlbumDetailPage } from '@/pages/albums/AlbumDetailPage.jsx';
import { AlbumListPage } from '@/pages/albums/AlbumListPage.jsx';
import { LoginPage } from '@/pages/auth/LoginPage.jsx';
import { CategoryListPage } from '@/pages/categories/CategoryListPage.jsx';
import { DashboardPage } from '@/pages/dashboard/DashboardPage.jsx';
import { FavoritesPage } from '@/pages/favorites/FavoritesPage.jsx';
import { MediaDetailPage } from '@/pages/media/MediaDetailPage.jsx';
import { MediaLibraryPage } from '@/pages/media/MediaLibraryPage.jsx';
import { NotFoundPage } from '@/pages/NotFoundPage.jsx';
import { SearchPage } from '@/pages/search/SearchPage.jsx';
import { ImageOptimizationSettingsPage } from '@/pages/settings/ImageOptimizationSettingsPage.jsx';
import { SettingsPage } from '@/pages/settings/SettingsPage.jsx';
import { StorageSettingsPage } from '@/pages/settings/StorageSettingsPage.jsx';
import { TagListPage } from '@/pages/tags/TagListPage.jsx';
import { TrashPage } from '@/pages/trash/TrashPage.jsx';
import { UploadPage } from '@/pages/upload/UploadPage.jsx';

import { AppLayout } from '../layouts/AppLayout.jsx';

export function AppRouter() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="albums" element={<AlbumListPage />} />
          <Route path="albums/:albumId" element={<AlbumDetailPage />} />
          <Route path="media" element={<MediaLibraryPage />} />
          <Route path="media/:mediaId" element={<MediaDetailPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="categories" element={<CategoryListPage />} />
          <Route path="tags" element={<TagListPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/storage" element={<StorageSettingsPage />} />
          <Route path="settings/image-optimization" element={<ImageOptimizationSettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
