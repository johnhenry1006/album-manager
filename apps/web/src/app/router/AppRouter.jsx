import { Navigate, Route, Routes } from 'react-router';

import { AlbumDetailsPage } from '@/pages/albums/AlbumDetailsPage.jsx';
import { AlbumListPage } from '@/pages/albums/AlbumListPage.jsx';
import { CategoriesPage } from '@/pages/categories/CategoriesPage.jsx';
import { DashboardPage } from '@/pages/dashboard/DashboardPage.jsx';
import { FavoritesPage } from '@/pages/favorites/FavoritesPage.jsx';
import { MediaDetailPage } from '@/pages/media/MediaDetailPage.jsx';
import { MediaLibraryPage } from '@/pages/media/MediaLibraryPage.jsx';
import { NotFoundPage } from '@/pages/NotFoundPage.jsx';
import { SearchPage } from '@/pages/search/SearchPage.jsx';
import { ImageOptimizationPage } from '@/pages/settings/ImageOptimizationPage.jsx';
import { SettingsPage } from '@/pages/settings/SettingsPage.jsx';
import { StoragePage } from '@/pages/settings/StoragePage.jsx';
import { TagsPage } from '@/pages/tags/TagsPage.jsx';
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
        <Route path="albums/:albumId" element={<AlbumDetailsPage />} />
        <Route path="media" element={<MediaLibraryPage />} />
        <Route path="media/:mediaId" element={<MediaDetailPage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="tags" element={<TagsPage />} />
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
