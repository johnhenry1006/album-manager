import { createStorageSettingsController } from '../controllers/storageSettings.controller.js';

export default async function storageSettingsRoutes(app, { service }) {
    app.get('/settings/storage', createStorageSettingsController(service).get);
}
