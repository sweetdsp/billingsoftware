import { useParams } from 'react-router-dom';

/** The `:id` route param as a positive integer, or `undefined` when missing/invalid. */
export function useIdParam(): number | undefined {
  const { id } = useParams<{ id: string }>();
  if (!id || !/^\d+$/.test(id)) return undefined;
  const parsed = Number(id);
  return parsed > 0 ? parsed : undefined;
}
