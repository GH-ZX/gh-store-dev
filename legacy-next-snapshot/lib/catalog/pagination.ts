import { pageCount, pageRange } from "@/lib/paging";

/** Keep public catalog documents bounded on mobile and desktop. */
export const CATALOG_PAGE_SIZE = 12;

export type CatalogPage<T> = {
  items: T[];
  page: number;
  pages: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export function toCatalogPage<T>(items: T[], page: number, total: number): CatalogPage<T> {
  const pages = pageCount(total, CATALOG_PAGE_SIZE);

  return {
    items,
    page,
    pages,
    total,
    hasPrevious: page > 1,
    hasNext: page < pages,
  };
}

export function catalogPageRange(page: number) {
  return pageRange(page, CATALOG_PAGE_SIZE);
}
