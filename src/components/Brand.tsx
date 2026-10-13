export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="8" fill="#14171a" />
      <path className="brand-roof" fillRule="evenodd" d="M9 39V19L24 7L39 19V27L30 33L39 41H28L19 32V39H9ZM19 19V26H28L30 24V20L24 15Z" fill="#ffffff" />
      <path className="brand-fold" d="M22 32H30L39 41H28Z" fill="#f26a1b" />
    </svg>
  );
}

export function Brand({ heading = false }: { heading?: boolean }) {
  const Wordmark = heading ? "h1" : "strong";

  return (
    <>
      <BrandMark />
      <Wordmark className="brand-wordmark">Roof <span>Signal</span></Wordmark>
    </>
  );
}
