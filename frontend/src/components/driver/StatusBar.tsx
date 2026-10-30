export function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 text-[12px] font-medium text-driver-ink">
      <span>9:41</span>
      <span className="flex items-center gap-1.5 text-[11px]">
        <span className="inline-block h-2 w-4 rounded-[1px] border border-current" />
        <span className="inline-block h-2 w-3 rounded-sm bg-current" />
        <span className="inline-block h-2.5 w-5 rounded-sm border border-current">
          <span className="ml-[1px] mt-[1px] inline-block h-1.5 w-3.5 bg-current" />
        </span>
      </span>
    </div>
  );
}
