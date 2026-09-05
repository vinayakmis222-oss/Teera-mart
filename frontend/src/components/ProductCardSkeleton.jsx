export function ProductCardSkeleton() {
  return (
    <div className="bg-white border border-border flex flex-col animate-pulse">
      <div className="aspect-square bg-off-white-alt" />
      <div className="p-3 md:p-4 space-y-2">
        <div className="h-4 bg-off-white-alt w-3/4" />
        <div className="h-3 bg-off-white-alt w-1/3" />
        <div className="h-5 bg-off-white-alt w-1/2" />
      </div>
    </div>
  );
}

export default ProductCardSkeleton;
