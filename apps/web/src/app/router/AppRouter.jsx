import { Navigate, Route, Routes } from 'react-router';

import { AlbumDetailPage } from '@/pages/albums/AlbumDetailPage.jsx';
import { AlbumListPage } from '@/pages/albums/AlbumListPage.jsx';
import { CategoryListPage } from '@/pages/categories/CategoryListPage.jsx';
import { DashboardPage } from '@/pages/dashboard/DashboardPage.jsx';
import { FavoritesPage } from '@/pages/favorites/FavoritesPage.jsx';
import { MediaDetailPage } from '@/pages/media/MediaDetailPage.jsx';
import { MediaLibraryPage } from '@/pages/media/MediaLibraryPage.jsx';
import { NotFoundPage } from '@/pages/NotFoundPage.jsx';
import { SearchPage } from '@/pages/search/SearchPage.jsx';
import { ImageOptimizationPage } from '@/pages/settings/ImageOptimizationPage.jsx';
import { SettingsPage } from '@/pages/settings/SettingsPage.jsx';
import { StoragePage } from '@/pages/settings/StoragePage.jsx';
import { TagListPage } from '@/pages/tags/TagListPage.jsx';
import { TrashPage } from '@/pages/trash/TrashPage.jsx';
import { UploadPage } from '@/pages/upload/UploadPage.jsx';

import { AppLayout } from '../layouts/AppLayout.jsx';

export function AppRouter() {
  return (
    <Routes>
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
        <Route path="settings/storage" element={<StoragePage />} />
        <Route path="settings/image-optimization" element={<ImageOptimizationPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
