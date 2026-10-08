import { createTaxonomyController } from '../controllers/taxonomy.controller.js';
import { serializeCategoryList } from '../mappers/categoryTree.mapper.js';

export default async function taxonomyRoutes(app, { service }) {
    for (const kind of ['categories', 'tags']) {
        if (!service[kind]) continue;
        const controller = createTaxonomyController(service[kind], {
            serializeList: kind === 'categories' ? serializeCategoryList : undefined,
        });
        app.get(`/${kind}`, controller.list);
        app.post(`/${kind}`, controller.create);
        app.patch(`/${kind}/:id`, controller.update);
        app.delete(`/${kind}/:id`, controller.remove);
        app.post(`/media/:mediaId/${kind}`, controller.assignMedia);
        app.post(`/media/${kind}`, controller.assignBatch);
    }
}
