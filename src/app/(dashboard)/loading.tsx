export default function DashboardLoading() {
  return (
    <div className="space-y-5 max-w-5xl mx-auto animate-pulse" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-gray-200 rounded-lg" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-28 bg-gray-100 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card space-y-2">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-7 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      <div className="card space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gray-100 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
