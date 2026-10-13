export function Brand({ heading = false }: { heading?: boolean }) {
  const Wordmark = heading ? "h1" : "strong";

  return (
    <>
      <img className="brand-mark" src="/brand-mark.svg" width="40" height="40" alt="" aria-hidden="true" />
      <Wordmark className="brand-wordmark">Roof <span>Signal</span></Wordmark>
    </>
  );
}
