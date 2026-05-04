import { useMemo } from "react";

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

/**
 * ページ番号リストを生成する。
 * 現在ページ前後を表示し、省略記号（0）で中間を省略する。
 * 例: [1, 0, 4, 5, 6, 0, 10]
 */
function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: number[] = [1];

  if (current > 3) {
    pages.push(0);
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push(0);
  }

  pages.push(total);

  return pages;
}

export function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  const pages = useMemo(
    () => getPageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );

  if (totalPages <= 1) return null;

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  return (
    <nav
      aria-label="ページネーション"
      className="flex items-center justify-center gap-1"
    >
      <button
        type="button"
        aria-label="前のページ"
        className={`flex h-9 w-9 items-center justify-center rounded-md text-sm ${
          isFirstPage
            ? "cursor-not-allowed text-gray-600"
            : "cursor-pointer text-gray-300 hover:bg-gray-700"
        }`}
        disabled={isFirstPage}
        onClick={() => onPageChange(currentPage - 1)}
      >
        &lt;
      </button>

      {(() => {
        let ellipsisCount = 0;
        return pages.map((page) =>
          page === 0 ? (
            <span
              key={`ellipsis-${++ellipsisCount}`}
              className="flex h-9 w-9 items-center justify-center text-gray-500 text-sm"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              aria-current={page === currentPage ? "page" : undefined}
              className={`flex h-9 w-9 items-center justify-center rounded-md text-sm ${
                page === currentPage
                  ? "bg-primary font-bold text-black"
                  : "cursor-pointer text-gray-300 hover:bg-gray-700"
              }`}
              onClick={() => onPageChange(page)}
              disabled={page === currentPage}
            >
              {page}
            </button>
          ),
        );
      })()}

      <button
        type="button"
        aria-label="次のページ"
        className={`flex h-9 w-9 items-center justify-center rounded-md text-sm ${
          isLastPage
            ? "cursor-not-allowed text-gray-600"
            : "cursor-pointer text-gray-300 hover:bg-gray-700"
        }`}
        disabled={isLastPage}
        onClick={() => onPageChange(currentPage + 1)}
      >
        &gt;
      </button>
    </nav>
  );
}
