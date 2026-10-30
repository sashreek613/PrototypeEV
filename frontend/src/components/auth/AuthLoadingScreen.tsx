import { BrandMark } from "../common/BrandMark";

export function AuthLoadingScreen({ message = "Checking session…" }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vo-bg text-vo-text">
      <BrandMark size={36} />
      <p className="mt-5 text-[13px] tracking-[0.18em] text-vo-muted">{message.toUpperCase()}</p>
    </div>
  );
}
