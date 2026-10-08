import { useEffect, useRef, useState } from 'react';

import { validateUploadFile } from '@/features/upload/index.js';

/** Page queue scheduling; reusable feature lifecycles own transport and processing. */
export function useUploadQueue({ uploads, options, onReady, concurrency = 3 }) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  const tasks = useRef(new Map());
  const mounted = useRef(true);
  const latest = useRef(null);
  latest.current = { uploads, options, onReady };
  const update = (id, patch) => {
    itemsRef.current = itemsRef.current.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    if (mounted.current) setItems(itemsRef.current);
  };
  function pump() {
    if (!mounted.current) return;
    while (tasks.current.size < concurrency) {
      const item = itemsRef.current.find((entry) => entry.status === 'pending');
      if (!item) break;
      run(item);
    }
  }
  function run(item) {
    const controller = new AbortController();
    tasks.current.set(item.id, controller);
    update(item.id, { status: 'running', error: null, canRetry: false });
    const { uploads: lifecycle } = latest.current;
    (async () => {
      let mediaId = item.finalMediaId;
      if (!mediaId)
        mediaId = await (lifecycle.has(item.id)
          ? lifecycle.retry(item.id)
          : lifecycle.upload(item.id, item.file));
      controller.signal.throwIfAborted();
      if (!mediaId) {
        update(item.id, { status: 'skipped', canRetry: false });
        return;
      }
      update(item.id, { status: 'assigning', finalMediaId: mediaId });
      await latest.current.onReady(item, mediaId, controller.signal);
      controller.signal.throwIfAborted();
      update(item.id, { status: 'completed', error: null, canRetry: false });
    })()
      .catch((error) => {
        const current = itemsRef.current.find((entry) => entry.id === item.id);
        update(item.id, {
          status:
            controller.signal.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed',
          error: controller.signal.aborted || error?.name === 'AbortError' ? null : error,
          canRetry:
            Boolean(current?.finalMediaId) ||
            controller.signal.aborted ||
            Boolean(lifecycle.getSnapshot()[item.id]?.canRetry),
        });
      })
      .finally(() => {
        tasks.current.delete(item.id);
        pump();
      });
  }
  useEffect(() => {
    mounted.current = true;
    const activeTasks = tasks.current;
    return () => {
      mounted.current = false;
      activeTasks.forEach((controller) => controller.abort());
    };
  }, []);
  const cancel = (id) => {
    tasks.current.get(id)?.abort();
    latest.current.uploads.cancel(id);
    if (!tasks.current.has(id)) update(id, { status: 'cancelled', canRetry: true, error: null });
  };
  const remove = (id) => {
    if (tasks.current.has(id)) return;
    uploads.remove(id);
    itemsRef.current = itemsRef.current.filter((item) => item.id !== id);
    setItems(itemsRef.current);
  };
  return {
    items: items.map((item) => ({ ...item, upload: uploads.files[item.id] })),
    isBusy: items.some((item) => ['pending', 'running', 'assigning'].includes(item.status)),
    queuedCount: items.filter((item) => item.status === 'queued').length,
    addFiles(selected) {
      const added = Array.from(selected).map((file) => {
        const { error } = validateUploadFile(file);
        return {
          id: crypto.randomUUID(),
          file,
          status: error ? 'invalid' : 'queued',
          error,
          canRetry: false,
          finalMediaId: null,
          assignment: {},
        };
      });
      itemsRef.current = [...itemsRef.current, ...added];
      setItems(itemsRef.current);
    },
    start() {
      const selected = latest.current.options;
      itemsRef.current = itemsRef.current.map((item) =>
        item.status !== 'queued'
          ? item
          : {
              ...item,
              status: 'pending',
              options: {
                albumId: selected.albumId,
                categoryIds: [...selected.categoryIds],
                tagIds: [...selected.tagIds],
              },
            },
      );
      setItems(itemsRef.current);
      pump();
    },
    retry(id) {
      const item = itemsRef.current.find((entry) => entry.id === id);
      if (!item?.canRetry || tasks.current.has(id)) return;
      update(id, {
        status: 'pending',
        options: item.options ?? {
          ...latest.current.options,
          categoryIds: [...latest.current.options.categoryIds],
          tagIds: [...latest.current.options.tagIds],
        },
      });
      pump();
    },
    cancel,
    cancelAll: () =>
      itemsRef.current.forEach((item) => {
        if (['queued', 'pending', 'running', 'assigning'].includes(item.status)) cancel(item.id);
      }),
    remove,
    clearFinished: () =>
      itemsRef.current
        .filter((item) => ['completed', 'skipped', 'cancelled', 'invalid'].includes(item.status))
        .forEach((item) => remove(item.id)),
    async resolveDuplicate(id, action) {
      try {
        await uploads.resolveDuplicate(id, action);
      } catch {
        /* The owning task renders the failure. */
      }
    },
  };
}
