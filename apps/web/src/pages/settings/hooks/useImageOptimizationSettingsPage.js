import { useRef, useState } from 'react';

import {
  useImageOptimizationSettings,
  useUpdateImageOptimizationSettings,
} from '@/features/settings/index.js';

import {
  createImageOptimizationDraft,
  createImageOptimizationPatch,
  hasImageOptimizationChanges,
} from '../utils/imageOptimizationForm.js';

export function useImageOptimizationSettingsPage() {
  const settings = useImageOptimizationSettings();
  const update = useUpdateImageOptimizationSettings();
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const busy = useRef(false);
  const currentDraft = settings.data ? createImageOptimizationDraft(settings.data) : null;
  const draft = editor?.draft ?? currentDraft;
  const baseDraft = editor ? createImageOptimizationDraft(editor.base) : currentDraft;
  const isDirty = Boolean(editor && hasImageOptimizationChanges(draft, baseDraft));

  function setField(field, value) {
    if (busy.current || !draft || !Object.hasOwn(draft, field)) return;
    setEditor((current) => ({
      base: current?.base ?? settings.data,
      draft: { ...(current?.draft ?? currentDraft), [field]: value },
    }));
    setError('');
    setNotice('');
  }
  function reset() {
    if (busy.current) return;
    setEditor(null);
    setError('');
    setNotice('');
  }
  async function submit(event) {
    event.preventDefault();
    if (busy.current || !editor || !isDirty) return;
    setError('');
    setNotice('');
    let patch;
    try {
      patch = createImageOptimizationPatch(draft, editor.base);
    } catch (failure) {
      setError(failure.message);
      return;
    }
    if (Object.keys(patch).length === 0) {
      reset();
      return;
    }
    busy.current = true;
    setIsSaving(true);
    try {
      await update.mutateAsync(patch);
      setEditor(null);
      setNotice('Image optimization settings saved.');
    } catch (failure) {
      setError(failure.message || 'Could not save settings. Please try again.');
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }
  return { settings, form: { draft, isDirty, isSaving, error, notice, setField, reset, submit } };
}
