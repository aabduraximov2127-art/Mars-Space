import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import { fieldMessage, get, parseApiError, type Paginated } from "./api";

type Params = Record<string, string | number | boolean | null | undefined>;

/** Paginated list query with local page/filter state. */
export function usePagedList<T>(key: string, url: string, initial: Params = {}, pageSize = 20) {
  const [page, setPage] = useState(1);
  const [filters, setFiltersState] = useState<Params>(initial);
  const params = { ...filters, page, page_size: pageSize };
  const query = useQuery({
    queryKey: [key, url, params],
    queryFn: () => get<Paginated<T>>(url, params),
    placeholderData: keepPreviousData,
  });
  const setFilter = useCallback((name: string, value: string | number | boolean | null | undefined) => {
    setFiltersState((f) => ({ ...f, [name]: value }));
    setPage(1);
  }, []);
  const resetFilters = useCallback(() => {
    setFiltersState(initial);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    ...query,
    rows: query.data?.results,
    count: query.data?.count ?? 0,
    page,
    setPage,
    pageSize,
    filters,
    setFilter,
    resetFilters,
  };
}

/** Fetch every page of a (small) list, e.g. for select options. */
export function useOptions<T>(key: QueryKey, url: string, params: Params = {}, enabled = true) {
  return useQuery({
    queryKey: [...(key as unknown[]), params],
    queryFn: async () => (await get<Paginated<T>>(url, { ...params, page_size: 100 })).results,
    enabled,
    staleTime: 60_000,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback((...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))), [qc]);
}

/** Show backend validation errors on form fields and the generic message as a toast. */
export function applyApiErrors<T extends FieldValues>(err: unknown, setError?: UseFormSetError<T>) {
  const info = parseApiError(err);
  let assigned = false;
  if (setError) {
    for (const [field, value] of Object.entries(info.errors)) {
      const message = fieldMessage(value);
      if (message && field !== "non_field_errors") {
        setError(field as Path<T>, { type: "server", message });
        assigned = true;
      }
    }
  }
  if (!assigned || info.code !== "validation_error") toast.error(info.detail);
  return info;
}

/** Mutation with success toast, error toast and query invalidation. */
export function useAction<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); invalidate?: string[]; onSuccess?: (r: TResult) => void } = {},
) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(result) : opts.success);
      if (opts.invalidate?.length) await invalidate(...opts.invalidate);
      opts.onSuccess?.(result);
    },
    onError: (err) => {
      toast.error(parseApiError(err).detail);
    },
  });
}
