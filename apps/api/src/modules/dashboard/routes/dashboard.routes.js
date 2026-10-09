import { createDashboardController } from '../controllers/dashboard.controller.js';

export default async function dashboardRoutes(app, { service }) {
    app.get('/dashboard', createDashboardController(service));
}
