import { useState, useEffect, useCallback } from 'react';
import client from '@/shared/api/client';
import type { Product } from '../api/products.api';

export interface UseProductsResult {
  products: Product[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (payload: Partial<Product>) => Promise<Product | null>;
  update: (id: number, payload: Partial<Product>) => Promise<Product | null>;
  deactivate: (id: number) => Promise<Product | null>;
}

/**
 * Con `ambito` (#218: «Todos» o una empresa), el catálogo de todos los campus de
 * quien mira, por `/products/ambito`. Crear sigue siendo de UN campus; editar y
 * desactivar van con el campus del propio producto.
 */
export function useProducts(
  projectId: number | null | undefined,
  includeInactive = false,
  ambito: Record<string, string | number> | null = null,
): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!projectId && !ambito) return;
    setLoading(true);
    setError(null);
    try {
      const res = ambito
        ? await client.get('/products/ambito', { params: { ...ambito, ...(includeInactive ? { includeInactive: 'true' } : {}) } })
        : await client.get(`/products?projectId=${projectId}${includeInactive ? '&includeInactive=true' : ''}`);
      if (res.success) {
        setProducts((res.data as Product[]) || []);
      }
    } catch (err: any) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, includeInactive, ambito]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // CRUD: el middleware projectAccess lee projectId desde body o query
  const create = useCallback(async (payload: Partial<Product>): Promise<Product | null> => {
    if (!projectId || ambito) return null;
    const res = await client.post('/products', { ...payload, projectId });
    if (res.success) {
      await fetchProducts();
      return (res.data as Product) || null;
    }
    return null;
  }, [projectId, ambito, fetchProducts]);

  // El campus de un producto: el suyo (en la vista general hay varios) o el de arriba.
  const campusDe = useCallback(
    (id: number) => products.find((p) => p.id === id)?.project_id ?? projectId,
    [products, projectId],
  );

  const update = useCallback(async (id: number, payload: Partial<Product>): Promise<Product | null> => {
    const res = await client.patch(`/products/${id}?projectId=${campusDe(id)}`, payload);
    if (res.success) {
      await fetchProducts();
      return (res.data as Product) || null;
    }
    return null;
  }, [campusDe, fetchProducts]);

  const deactivate = useCallback(async (id: number): Promise<Product | null> => {
    const res = await client.delete(`/products/${id}?projectId=${campusDe(id)}`);
    if (res.success) {
      await fetchProducts();
      return (res.data as Product) || null;
    }
    return null;
  }, [campusDe, fetchProducts]);

  return { products, loading, error, refetch: fetchProducts, create, update, deactivate };
}
